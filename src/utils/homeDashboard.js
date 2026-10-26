// Pure helpers for the admin home cards (hiring, increments, schedule, feed).
// Web sources: components/home/homeDashboardUtils.js (scheduleEventsForDay, buildFeed, shortDate,
// feedDayLabel, announcementPreview), components/home/adminInsights.js (countByLabel) and
// components/alerts/systemAlertUtils.js (isAlertLive).
import { calendarDateKey, dateKey, employeeDateKey, formatClock, parseActivityTime } from "./dates";
import { clean, fullName, lower, plainText } from "./records";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-10-23" → "23 Oct". */
export const shortDate = (key) => `${Number(key.slice(8, 10))} ${MONTHS[Number(key.slice(5, 7)) - 1]}`;

/** Local "YYYY-MM-DD" `days` after `key`. */
export function addDaysToKey(key, days) {
  const [year, month, day] = key.split("-").map(Number);
  return dateKey(new Date(year, month - 1, day + days));
}

export const weekdayOf = (key) => {
  const [year, month, day] = key.split("-").map(Number);
  return WEEKDAYS[new Date(year, month - 1, day).getDay()];
};

/** "Mon, 5 Jan · 10:00 AM" in the phone's local time (interview datetimes are UTC Dates). */
export const friendlyDateTime = (date) =>
  `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]} · ${formatClock(date.getHours() * 60 + date.getMinutes())}`;

/** "Today", "Yesterday" or "12 Oct" for a wall-clock UTC stamp. */
export function feedDayLabel(stamp, today) {
  const key = new Date(stamp).toISOString().slice(0, 10);
  if (key === today) return "Today";
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return key === yesterday.toISOString().slice(0, 10) ? "Yesterday" : shortDate(key);
}

/** One line of readable text from an announcement's (possibly entity-encoded) HTML. */
export const announcementPreview = (value) => plainText(value).replace(/\s+/g, " ").trim();

/** Count records per label, largest first; anything past `limit` is folded into "Other". */
export function countByLabel(records = [], labelOf, limit = 5) {
  const counts = new Map();
  for (const record of records) {
    const label = clean(labelOf(record)) || "Unassigned";
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  const sorted = [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  if (sorted.length <= limit) return sorted;
  const rest = sorted.slice(limit - 1).reduce((sum, item) => sum + item.count, 0);
  return [...sorted.slice(0, limit - 1), { label: "Other", count: rest }];
}

/** Chip tone for a candidate stage name (shared with the Candidates tab). */
export function candidateStageTone(stage) {
  const value = lower(stage);
  if (/short/.test(value)) return "lime";
  if (/join|hired|select/.test(value)) return "success";
  if (/reject/.test(value)) return "closed";
  if (/interview/.test(value)) return "progress";
  return "neutral";
}

const recordStamp = (value) => parseActivityTime(value)?.stamp ?? (Date.parse(clean(value)) || 0);

/** This month's candidates: totals, shortlisted, stage breakdown and the newest few. */
export function hiringSummary(records = [], { stageOf, nameOf, recent = 4 }) {
  const items = records
    .map((record) => ({ record, stage: stageOf(record), at: recordStamp(record.date_entered_uni_format || record.date_entered) }))
    .sort((a, b) => b.at - a.at);
  return {
    total: items.length,
    shortlisted: items.filter((item) => /shortlist/i.test(item.stage)).length,
    stages: countByLabel(items, (item) => item.stage),
    recent: items.slice(0, recent).map(({ record, stage }) => ({
      id: record.id,
      name: nameOf(record),
      designation: clean(record.current_designation || record.department),
      stage,
      record,
    })),
  };
}

// ─── System alerts ───────────────────────────────────────────────────────────

// Alerts saved before the active field existed have no value, and count as active.
export const isAlertActive = (alert) => !["0", "false", "off", "no"].includes(lower(alert?.active));
const endOfDay = (year, month, day) => new Date(year, month - 1, day, 23, 59, 59);

/** hrc "YYYY-MM-DD HH:MM:SS" strings are UTC. */
function parseUtc(value) {
  const match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const [year, month, day, hour, minute, second = "0"] = match.slice(1);
  const date = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** expires_on: a date (end of that day), a gateway "MM/DD/YYYY HH:mm" (local) or an hrc UTC timestamp. */
export function alertExpiresAt(alert) {
  const text = clean(alert?.expires_on);
  if (!text) return null;
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (slash) {
    let [month, day] = [+slash[1], +slash[2]];
    if (month > 12) [month, day] = [day, month];
    return slash[4] === undefined ? endOfDay(+slash[3], month, day) : new Date(+slash[3], month - 1, day, +slash[4], +slash[5]);
  }
  const utc = parseUtc(text);
  if (utc) return utc;
  const key = calendarDateKey(text);
  if (!key) return null;
  const [year, month, day] = key.split("-").map(Number);
  return endOfDay(year, month, day);
}

/** "Live" = active, not deleted, and not past its expiry time. */
export function isAlertLive(alert, now = new Date()) {
  if (String(alert?.deleted) === "1" || !isAlertActive(alert)) return false;
  const at = alertExpiresAt(alert);
  return !(at && at < now);
}

// ─── Leave names ─────────────────────────────────────────────────────────────

/** Web leaveAdminUtils.employeeDisplayName: the directory name, else the names stored on the leave. */
export function leaveEmployeeName(leave, employee) {
  return (
    (employee && fullName(employee, "")) ||
    [leave.hrc_employees_hrc_leaves_1_name, leave.hrc_candidates_hrc_leaves_1_name, leave.assigned_user_name, leave.name].map(clean).find(Boolean) ||
    "Employee"
  );
}

// ─── Schedule ────────────────────────────────────────────────────────────────

const birthDate = (employee) => employeeDateKey(employee.dob || employee.birthdate || employee.date_of_birth);

/**
 * Events on a day: public holidays, birthdays, work anniversaries and accepted leave.
 * `leaveLabel` maps an accepted leave record to the title shown for it.
 */
export function scheduleEventsForDay(day, { employees = [], holidays = [], leaves = [], leaveLabel = () => "Leave" } = {}) {
  const events = [];
  const monthDay = day.slice(5);
  const year = Number(day.slice(0, 4));
  for (const holiday of holidays) {
    if (String(holiday.deleted) === "1") continue;
    if (calendarDateKey(holiday.holiday_date) === day) {
      events.push({ id: `holiday:${holiday.id}`, type: "holiday", title: clean(holiday.name) || "Public holiday", detail: "Public holiday" });
    }
  }
  for (const employee of employees) {
    if (String(employee.deleted) === "1") continue;
    const birth = birthDate(employee);
    if (birth && birth.slice(5) === monthDay) {
      events.push({ id: `birthday:${employee.id}`, type: "birthday", title: fullName(employee, "Employee"), detail: "Birthday", employeeId: employee.id });
    }
    const joined = employeeDateKey(employee.joining_date);
    const years = joined ? year - Number(joined.slice(0, 4)) : 0;
    if (joined && joined.slice(5) === monthDay && years > 0) {
      events.push({ id: `anniversary:${employee.id}`, type: "anniversary", title: fullName(employee, "Employee"), detail: `${years} year${years === 1 ? "" : "s"} completed`, employeeId: employee.id });
    }
  }
  for (const leave of leaves) {
    if (lower(leave.status) !== "accepted") continue;
    const from = calendarDateKey(leave.leave_from);
    const to = calendarDateKey(leave.leave_to) || from;
    if (from && from <= day && day <= to) {
      events.push({ id: `leave:${leave.id}`, type: "leave", title: leaveLabel(leave), detail: clean(leave.type_of_leave || leave.leave_type) || "Approved leave", leaveId: leave.id });
    }
  }
  return events;
}

/** The next `limit` events after `day`, looking up to `horizon` days ahead. `eventsFor(key)` returns a day's events. */
export function upcomingScheduleEvents(day, eventsFor, { horizon = 45, limit = 4 } = {}) {
  const items = [];
  for (let offset = 1; offset <= horizon && items.length < limit; offset += 1) {
    const key = addDaysToKey(day, offset);
    for (const event of eventsFor(key)) items.push({ event, key });
  }
  return items.slice(0, limit);
}

// ─── Feed ────────────────────────────────────────────────────────────────────

const stampOf = (value) => parseActivityTime(value)?.stamp ?? (calendarDateKey(value) ? Date.parse(`${calendarDateKey(value)}T00:00:00Z`) : null);
const leaveStatusText = { accepted: "approved", rejected: "rejected", applied: "submitted" };
const ACTIVITY_STEPS = [
  ["login", "checkin", "checked in"],
  ["lunch_in", "lunch", "started lunch"],
  ["lunch_out", "lunch", "returned from lunch"],
  ["logout", "checkout", "checked out"],
];

/**
 * Activity feed: attendance events, leave updates and announcements, newest first.
 * Items carry `email`, `leaveId` or `alertId` so a tap can open the matching record.
 */
export function buildFeed({ activity = [], leaves = [], alerts = [], personLabel = () => "You", leaveLabel = () => "Your", limit = 12 }) {
  const items = [];
  for (const record of activity) {
    if (String(record.deleted) === "1") continue;
    for (const [field, kind, verb] of ACTIVITY_STEPS) {
      const time = parseActivityTime(record[field]);
      if (time) items.push({ id: `${record.id}:${field}`, type: kind, at: time.stamp, title: `${personLabel(record)} ${verb}`, detail: time.time, email: lower(record.name) });
    }
  }
  for (const leave of leaves) {
    if (String(leave.deleted) === "1") continue;
    const status = lower(leave.status);
    const at = stampOf(status === "applied" ? leave.date_entered : leave.date_modified || leave.date_entered);
    if (at === null) continue;
    const from = calendarDateKey(leave.leave_from);
    const to = calendarDateKey(leave.leave_to);
    const range = from ? (to && to !== from ? `${shortDate(from)} – ${shortDate(to)}` : shortDate(from)) : "";
    items.push({
      id: `leave:${leave.id}`,
      type: status === "rejected" ? "leaveRejected" : status === "accepted" ? "leaveApproved" : "leave",
      at,
      title: `${leaveLabel(leave)} ${lower(leave.type_of_leave || leave.leave_type) || "leave"} request ${leaveStatusText[status] || status || "updated"}`,
      detail: range,
      leaveId: leave.id,
    });
  }
  for (const alert of alerts) {
    const at = stampOf(alert.date_entered);
    if (at !== null) items.push({ id: `alert:${alert.id}`, type: "announcement", at, title: plainText(alert.name) || "Announcement", detail: "Announcement", alertId: alert.id });
  }
  return items.sort((a, b) => b.at - a.at).slice(0, limit);
}
