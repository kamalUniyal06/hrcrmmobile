// Attendance limits (web: components/employement/attendanceLimits.js).
import { gateway } from "../services/api";
import { activeRecords, assertSuccess, clean, fetchAllPages } from "../utils/records";
import { DEFAULT_LIMITS } from "../utils/attendance";

const positiveNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
};

const normalizeTime = (value, fallback) => {
  const match = clean(value).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 1 || hour > 12 || minute > 59) return fallback;
  return `${hour}:${String(minute).padStart(2, "0")} ${match[3].toUpperCase()}`;
};

export const fetchAttendanceLimits = async () => {
  const response = assertSuccess(
    await gateway({ action: "fetch", module: "hrc_limit_management", page: 1, per_page: 100 }),
    "Could not load attendance limits.",
  );
  const byName = new Map(activeRecords(response).map((record) => [clean(record.name).toLowerCase(), record]));
  const loginDelay = byName.get("login delay");
  const lunchOut = byName.get("lunch out");
  return {
    actualLoginTime: normalizeTime(loginDelay?.actual_time, DEFAULT_LIMITS.actualLoginTime),
    loginDelayMinutes: positiveNumber(loginDelay?.minutes, DEFAULT_LIMITS.loginDelayMinutes),
    lunchOutMinutes: positiveNumber(lunchOut?.minutes, DEFAULT_LIMITS.lunchOutMinutes),
  };
};

// Limit management admin page (web: pages/LimitManagementPage.jsx).
export const limitListKey = ["limit-management", "list"];

/** Every hrc_limit_management record, all pages (web: fetchAllRecords("hrc_limit_management")). */
export const fetchLimitRecords = async () => (await fetchAllPages(gateway, { action: "fetch", module: "hrc_limit_management" })).records;

/** Saves only the changed fields, exactly like the web editor. */
export const updateLimitRecord = async (id, data) =>
  assertSuccess(await gateway({ action: "update", module: "hrc_limit_management", id, data }), "Could not save this limit record.");
