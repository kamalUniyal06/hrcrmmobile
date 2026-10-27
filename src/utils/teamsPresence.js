// Teams presence helpers (web: employement/components/attendance/teamsPresenceUtils.js).
// API timestamps are UTC; its dates and our display are Asia/Kolkata (UTC+5:30, no DST).
import { colors } from "../theme";
import { clean } from "./records";

const IST_OFFSET_MINUTES = 330;

// Microsoft availability -> the API's bucket, as listed in the Teams Presence API reference.
const BUCKETS = {
  Available: "available",
  Busy: "busy",
  DoNotDisturb: "busy",
  Away: "away",
  BeRightBack: "away",
  AvailableIdle: "away",
  BusyIdle: "away",
  Offline: "offline",
  PresenceUnknown: "unknown",
  NotTracked: "untracked",
};

export const presenceBucket = (availability) => BUCKETS[clean(availability)] || "unknown";

// Same meaning as the web's attendance-present / -absent / -late tokens.
export const PRESENCE_COLORS = {
  available: "#10B981",
  busy: "#EF4444",
  away: "#F59E0B",
  offline: colors.mutedForeground,
  unknown: colors.mutedForeground,
  untracked: colors.border,
};

export const PRESENCE_LEGEND = [
  ["available", "Available"],
  ["busy", "Busy"],
  ["away", "Away"],
  ["offline", "Offline"],
  ["untracked", "Not tracked"],
];

export const TEAMS_NO_ACCESS = "Teams activity is hidden for your role. An admin can grant read access to the Teams Activity module.";

/** "InAMeeting" -> "In a meeting", "DoNotDisturb" -> "Do not disturb". */
export function presenceLabel(value) {
  const words = clean(value)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
  return words ? words.charAt(0) + words.slice(1).toLowerCase() : "";
}

/** The activity ("In a call") when it adds detail, otherwise the availability ("Away"). */
export function presenceStatus(record = {}) {
  const activity = clean(record?.activity);
  const availability = clean(record?.availability);
  return presenceLabel(activity && activity !== availability ? activity : availability) || "Unknown";
}

/** Teams records keyed like attendance rows ("employee:<id>") and by email as a fallback. */
export function indexPresence(records = []) {
  const index = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const id = clean(record?.employee_id);
    const email = clean(record?.email).toLowerCase();
    if (id) index.set(`employee:${id}`, record);
    if (email && !index.has(`email:${email}`)) index.set(`email:${email}`, record);
  }
  return index;
}

export const presenceForRow = (index, row) =>
  index.get(row?.key) || (row?.email ? index.get(`email:${row.email}`) : undefined);

/** "5:41 PM" in IST for a UTC ISO timestamp; empty when missing. (Manual offset: Hermes' Intl time zones vary by build.) */
export function teamsClock(iso) {
  const time = Date.parse(clean(iso));
  if (!clean(iso) || Number.isNaN(time)) return "";
  const ist = new Date(time + IST_OFFSET_MINUTES * 60000);
  const hours = ist.getUTCHours();
  const minutes = String(ist.getUTCMinutes()).padStart(2, "0");
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
}

/** Minutes after IST midnight of `day` (YYYY-MM-DD) for a UTC ISO timestamp. */
export const istMinutes = (iso, day) => (Date.parse(clean(iso)) - Date.parse(`${day}T00:00:00+05:30`)) / 60000;

/** Whole-hour window for a day bar: at least 09:00–19:00, widened to fit every period. */
export function timelineWindow(periods = [], day) {
  const minutes = periods
    .flatMap((period) => [istMinutes(period.started_at, day), istMinutes(period.ended_at, day)])
    .filter(Number.isFinite);
  return {
    start: Math.max(0, Math.floor(Math.min(9 * 60, ...minutes) / 60) * 60),
    end: Math.min(24 * 60, Math.ceil(Math.max(19 * 60, ...minutes) / 60) * 60),
  };
}

/** Number of employees online at all on a past day (the report summary line). */
export const onlineThatDay = (employees = []) => employees.filter((record) => Number(record?.online_minutes) > 0).length;

/** Teams error text for a failed query: the no-access message for a 403, otherwise the error. */
export const teamsErrorText = (error) =>
  error?.status === 403 ? TEAMS_NO_ACCESS : `Couldn't load Teams activity. ${clean(error?.message)}`.trim();
