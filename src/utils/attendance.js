// Attendance maths ported from the web app (adminAttendanceUtils + homeDashboardUtils).
import { clean, isDeleted } from "./records";
import { calendarDateKey, eachDay, isWeekend, parseActivityTime } from "./dates";

export const DEFAULT_LIMITS = Object.freeze({ actualLoginTime: "9:30 AM", loginDelayMinutes: 30, lunchOutMinutes: 40 });

export function timeToMinutes(value) {
  const match = clean(value).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + Number(match[2]);
}

export function sessionSummary(record) {
  const login = parseActivityTime(record.login);
  const logout = parseActivityTime(record.logout);
  const lunchIn = parseActivityTime(record.lunch_in);
  const lunchOut = parseActivityTime(record.lunch_out);
  const gross = login && logout && logout.stamp >= login.stamp ? (logout.stamp - login.stamp) / 60000 : null;
  const noLunch = !clean(record.lunch_in) && !clean(record.lunch_out);
  const validLunch = lunchIn && lunchOut && lunchOut.stamp >= lunchIn.stamp && login && logout && lunchIn.stamp >= login.stamp && lunchOut.stamp <= logout.stamp;
  return {
    login,
    logout,
    lunchIn,
    lunchOut,
    breakMinutes: validLunch ? (lunchOut.stamp - lunchIn.stamp) / 60000 : noLunch ? 0 : null,
    inOffice: gross,
    worked: gross,
  };
}

/** status: onTime | late | incomplete | leave | upcoming | missing */
export function daySummary(records = [], day, today, onLeave = false, lateAfter = 600) {
  const sessions = records.map(sessionSummary);
  const logins = sessions.map((s) => s.login).filter(Boolean).sort((a, b) => a.stamp - b.stamp);
  const first = logins[0];
  const status = first
    ? first.minutes > lateAfter ? "late" : "onTime"
    : records.length ? "incomplete" : onLeave ? "leave" : day > today ? "upcoming" : "missing";
  const complete = sessions.length > 0 && sessions.every((s) => s.worked !== null);
  return {
    status,
    first,
    sessions,
    worked: complete ? sessions.reduce((sum, s) => sum + s.worked, 0) : null,
    lastLogout: sessions.map((s) => s.logout).filter(Boolean).sort((a, b) => b.stamp - a.stamp)[0] || null,
  };
}

export const activityDate = (record) => parseActivityTime(record.login)?.date || parseActivityTime(record.date_entered)?.date;

export function groupActivityByDay(records = []) {
  const byDay = {};
  for (const record of records) {
    if (isDeleted(record)) continue;
    const day = activityDate(record);
    if (day) (byDay[day] ||= []).push(record);
  }
  return byDay;
}

/** Accepted leaves expanded into a Set of "YYYY-MM-DD" keys (for one employee). */
export function leaveDaysOf(leaves = []) {
  const days = new Set();
  for (const leave of leaves) {
    if (isDeleted(leave) || clean(leave.status).toLowerCase() !== "accepted") continue;
    const from = calendarDateKey(leave.leave_from);
    const to = calendarDateKey(leave.leave_to) || from;
    if (!from || !to) continue;
    for (const day of eachDay(from, to)) days.add(day);
  }
  return days;
}

export function holidayMapOf(holidays = []) {
  const map = {};
  for (const holiday of holidays) {
    if (isDeleted(holiday)) continue;
    const key = calendarDateKey(holiday.holiday_date);
    if (key) map[key] = clean(holiday.name) || "Public holiday";
  }
  return map;
}

const mean = (values) => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null);

export function employeeAttendanceStats({ records = [], from, to, today, lateAfter = 600, leaveDays = new Set(), holidays = new Set() }) {
  const byDay = groupActivityByDay(records);
  const counts = { present: 0, late: 0, leave: 0, absent: 0 };
  const checkIns = [];
  const worked = [];
  const last = to < today ? to : today;
  for (const day of from <= last ? eachDay(from, last) : []) {
    const summary = daySummary(byDay[day], day, today, leaveDays.has(day), lateAfter);
    if (summary.status === "onTime") counts.present += 1;
    else if (summary.status === "late") counts.late += 1;
    else if (summary.status === "leave") counts.leave += 1;
    else if (summary.status === "missing" && day < today && !isWeekend(day) && !holidays.has(day)) counts.absent += 1;
    if (summary.first) checkIns.push(summary.first.minutes);
    if (summary.worked) worked.push(summary.worked);
  }
  const attended = counts.present + counts.late;
  return {
    counts,
    total: counts.present + counts.late + counts.leave + counts.absent,
    avgCheckIn: mean(checkIns),
    avgWorked: mean(worked),
    onTimeRate: attended ? Math.round((counts.present / attended) * 100) : null,
  };
}
