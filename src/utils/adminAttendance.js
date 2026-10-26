// Admin attendance maths ported from the web app (employement/components/attendance/adminAttendanceUtils.js).
import { clean, isDeleted } from "./records";
import { calendarDateKey, dateKey, eachDay } from "./dates";
import { activityDate, daySummary } from "./attendance";

const employeeLink = "hrc_employees_hrc_daily_activity_1hrc_employees_ida";
const employeeLabel = "hrc_employees_hrc_daily_activity_1_name";

// Logins from the office network are reported as "Office", everything else as "Remote".
export const OFFICE_IP = "122.176.54.204";

/** "40m" under an hour, "8h 05m" otherwise. */
export function formatMinutes(minutes) {
  if (minutes === null || minutes === undefined) return "—";
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded}m`;
  return `${Math.floor(rounded / 60)}h ${String(rounded % 60).padStart(2, "0")}m`;
}

/** One row per active employee, plus rows for activity that matches no employee. `days` maps "YYYY-MM-DD" → records. */
export function buildAttendanceRows(employees = [], activity = []) {
  const rows = new Map();
  const byId = new Map();
  const byEmail = new Map();
  const excludedIds = new Set();
  const excludedEmails = new Set();
  for (const employee of employees) {
    if (isDeleted(employee)) continue;
    const email = clean(employee.email1).toLowerCase();
    const id = clean(employee.id);
    if (clean(employee.stage_id_name) === "Ex Employee" && clean(employee.hrc_phase_id_name) === "Exit") {
      if (id) excludedIds.add(id);
      if (email) excludedEmails.add(email);
      continue;
    }
    const key = id ? `employee:${id}` : email ? `email:${email}` : null;
    if (!key) continue;
    const row = {
      key,
      id,
      name: [employee.first_name, employee.last_name].map(clean).filter(Boolean).join(" ") || clean(employee.name) || email || "Unnamed employee",
      email,
      designation: clean(employee.current_designation) || clean(employee.title),
      days: {},
      matched: true,
    };
    rows.set(key, row);
    if (id) byId.set(id, row);
    if (email) byEmail.set(email, byEmail.has(email) ? null : row);
  }
  const seen = new Set();
  for (const record of activity) {
    if (isDeleted(record) || (record.id && seen.has(record.id))) continue;
    if (record.id) seen.add(record.id);
    const date = activityDate(record);
    if (!date) continue;
    const linkedId = clean(record[employeeLink]);
    const email = clean(record.name).toLowerCase();
    // Don't recreate excluded employees as unlinked attendance rows.
    if (linkedId ? excludedIds.has(linkedId) : excludedEmails.has(email)) continue;
    // A populated relationship is authoritative; don't attach an unknown ID to another employee by email.
    let row = linkedId ? byId.get(linkedId) : byEmail.get(email);
    if (!row) {
      const key = linkedId ? `unmatched:${linkedId}` : email ? `activity:${email}` : `record:${record.id || rows.size}`;
      row = rows.get(key);
      if (!row) {
        row = { key, id: "", name: clean(record[employeeLabel]) || clean(record.name) || "Unlinked activity", email: email.includes("@") ? email : "", designation: "Employee not linked", days: {}, matched: false };
        rows.set(key, row);
      }
    }
    (row.days[date] ||= []).push(record);
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const leaveEmployeeId = (leave) => clean(leave.employee_id || leave.hrc_employees_hrc_leaves_1hrc_employees_ida);
const isAccepted = (leave) => !isDeleted(leave) && clean(leave.status).toLowerCase() === "accepted";

/** Accepted leaves expanded into "employee:<id>|YYYY-MM-DD" and "email:<email>|YYYY-MM-DD" keys. */
export function buildLeaveDays(leaves = []) {
  const result = new Set();
  for (const leave of leaves) {
    if (!isAccepted(leave)) continue;
    const id = leaveEmployeeId(leave);
    const email = clean(leave.email).toLowerCase();
    const from = calendarDateKey(leave.leave_from);
    const to = calendarDateKey(leave.leave_to) || from;
    if ((!id && !email) || !from || !to) continue;
    for (const day of eachDay(from, to)) {
      if (id) result.add(`employee:${id}|${day}`);
      if (email) result.add(`email:${email}|${day}`);
    }
  }
  return result;
}

export const isRowOnLeave = (leaveDays, row, day) => leaveDays.has(`${row.key}|${day}`) || leaveDays.has(`email:${row.email}|${day}`);

/** The accepted leave that covers this row's employee on `day`, so its details can be opened. */
export function leaveForRow(leaves = [], row, day) {
  return (
    leaves.find((leave) => {
      if (!isAccepted(leave)) return false;
      const email = clean(leave.email).toLowerCase();
      if (!((row?.id && leaveEmployeeId(leave) === row.id) || (row?.email && email === row.email))) return false;
      const from = calendarDateKey(leave.leave_from);
      const to = calendarDateKey(leave.leave_to) || from;
      return Boolean(from && from <= day && to >= day);
    }) || null
  );
}

/** Accepted leaves of one employee expanded to { "YYYY-MM-DD": leave record }. */
export function leaveRecordsByDay(leaves = []) {
  const byDay = {};
  for (const leave of leaves) {
    if (!isAccepted(leave)) continue;
    const from = calendarDateKey(leave.leave_from);
    const to = calendarDateKey(leave.leave_to) || from;
    if (!from || !to) continue;
    for (const day of eachDay(from, to)) byDay[day] = leave;
  }
  return byDay;
}

// Half-day leave shows up as leave_type "half_day" (or "^half_day^"), a "Half Day …" leave type, or 0.5 leave days.
export const isHalfDayLeave = (leave) => /half/i.test(`${clean(leave.leave_type)} ${clean(leave.type_of_leave)}`) || Number(clean(leave.leave_days)) === 0.5;

const addDays = (day, count) => {
  const [year, month, date] = day.split("-").map(Number);
  return dateKey(new Date(year, month - 1, date + count));
};

// The gateway filters on one date field per request, so a day's leaves take two:
// leaves ending on or after the day (up to a year later), and leaves starting on it
// (this catches records saved without an end date). leavesCoveringDay merges them.
export function leaveDayRequests(day) {
  return [
    { dateField: "leave_to", from: `${day} 00:00:00`, to: `${addDays(day, 366)} 23:59:59` },
    { dateField: "leave_from", from: `${day} 00:00:00`, to: `${day} 23:59:59` },
  ];
}

/** Merges leave lists, drops repeated ids and keeps the leaves whose dates include `day`. */
export function leavesCoveringDay(lists, day) {
  const seen = new Set();
  const result = [];
  for (const leave of lists.flat()) {
    const id = clean(leave.id);
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    const from = calendarDateKey(leave.leave_from);
    const to = calendarDateKey(leave.leave_to) || from;
    if (from && from <= day && to >= day) result.push(leave);
  }
  return result;
}

// Whether a row belongs in an overview list for one day. The leave and check-in lists
// overlap on purpose: someone on leave who still logged in appears in both.
export function matchesOverviewFilter(filter, { records = [], matched, onLeave, halfDay, day, today, lateAfter }) {
  if (filter === "all") return true;
  const loggedIn = records.some((record) => clean(record.login));
  if (filter === "missing") return matched && !onLeave && !loggedIn;
  // Half-day leave applies whether or not the employee also checked in for the other half.
  if (filter === "halfDay") return matched && halfDay;
  if (filter === "leave") return onLeave && !halfDay;
  const status = daySummary(records, day, today, onLeave, lateAfter).status;
  if (filter === "checkedIn") return status === "onTime" || status === "late";
  if (filter === "onTime") return status === "onTime";
  if (filter === "late") return status === "late";
  return true;
}

/** Clock-in/out of a day: first login, last logout and whether a session is still open. */
export function clockSpan(summary) {
  const lastLogout = summary.sessions.map((session) => session.logout).filter(Boolean).sort((a, b) => a.stamp - b.stamp).at(-1);
  const stillIn = summary.sessions.some((session) => session.login && !session.logout);
  return { first: summary.first, lastLogout, closed: Boolean(lastLogout && !stillIn), stillIn };
}

/** First lunch in, last lunch out and the total break across the day's sessions. */
export function lunchSpan(sessions = []) {
  const lunches = sessions.filter((session) => session.lunchIn || session.lunchOut);
  if (!lunches.length) return null;
  const lunchIns = lunches.map((session) => session.lunchIn).filter(Boolean).sort((a, b) => a.stamp - b.stamp);
  const lunchOuts = lunches.map((session) => session.lunchOut).filter(Boolean).sort((a, b) => a.stamp - b.stamp);
  const onLunch = lunches.some((session) => session.lunchIn && !session.lunchOut);
  const totalBreak = lunches.reduce(
    (sum, session) => (session.lunchIn && session.lunchOut && session.lunchOut.stamp >= session.lunchIn.stamp ? sum + (session.lunchOut.stamp - session.lunchIn.stamp) / 60000 : sum),
    0,
  );
  return { start: lunchIns[0] || null, end: lunchOuts.at(-1) || null, onLunch, totalBreak };
}

// Employees in this phase (exited) are left out of every attendance total.
const EXCLUDED_EMPLOYEE_PHASE_ID = "4b140dcd-270a-3080-b367-6a9fa21e3ea4";
export const ATTENDANCE_TIMEZONE = "Asia/Kolkata";
const ATTENDANCE_UTC_OFFSET_MINUTES = 330;
const utcStamp = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

/** Start and end of a YYYY-MM-DD attendance day (Asia/Kolkata) as UTC "YYYY-MM-DD HH:mm:ss". */
export function attendanceDayBounds(day) {
  const [year, month, date] = day.split("-").map(Number);
  const start = Date.UTC(year, month - 1, date) - ATTENDANCE_UTC_OFFSET_MINUTES * 60000;
  return { from: utcStamp(start), to: utcStamp(start + 86400000 - 1000) };
}

/** smart_gateway get_stats queries for the admin attendance overview of one day. */
export function buildAttendanceStatsQueries(day) {
  const base = { ignore_email: true, exclude_employee_phase_id: EXCLUDED_EMPLOYEE_PHASE_ID };
  const { from, to } = attendanceDayBounds(day);
  const loginRange = { date_field: "login", date_range: "custom", date_from: from, date_to: to };
  const leave = (duration) => ({ ...base, module: "hrc_leaves", filters: { status: "Accepted" }, leave_on: day, leave_duration: duration });
  return [
    { key: "employees_shown", module: "hrc_employees", ...base },
    { key: "checked_in", module: "hrc_daily_activity", ...base, ...loginRange },
    { key: "late_check_ins", module: "hrc_daily_activity", ...base, filters: { late_login: 1 }, ...loginRange },
    { key: "not_checked_in", module: "hrc_employees", ...base, not_checked_in_on: day, attendance_timezone: ATTENDANCE_TIMEZONE },
    { key: "on_leave_full", ...leave("full") },
    { key: "on_leave_half", ...leave("half") },
  ];
}

/** Turns a get_stats response into overview counts; throws if any requested stat is missing. */
export function readAttendanceStats(response) {
  if (response?.success !== true) throw new Error(response?.message || "Could not load attendance totals.");
  const count = (key) => {
    const entry = response.stats?.[key];
    const value = Number(entry?.count);
    if (!entry || entry.error || !Number.isFinite(value)) throw new Error(entry?.error || `Attendance total "${key}" is missing.`);
    return value;
  };
  const checkedIn = count("checked_in");
  const late = count("late_check_ins");
  return {
    all: count("employees_shown"),
    notCheckedIn: count("not_checked_in"),
    // Half-day leave has its own tile, so "On leave" counts full days only.
    leave: count("on_leave_full"),
    late,
    onTime: Math.max(checkedIn - late, 0),
  };
}
