// Date helpers ported from the web app's attendance utilities.
// CRM timestamps are "MM/DD/YYYY HH:mm"; the wall-clock time is kept as displayed.
import { clean } from "./records";

export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export const todayKey = () => dateKey(new Date());

export function todayInIndia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** "Now" expressed in the same convention as parseActivityTime stamps (IST wall clock as UTC). */
export function nowStampInIndia() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date())
      .map((part) => [part.type, Number(part.value)]),
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

export function currentMinutesInIndia() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  return Number(parts.find((part) => part.type === "hour")?.value) * 60 + Number(parts.find((part) => part.type === "minute")?.value);
}

/** Parse "MM/DD/YYYY HH:mm[:ss]" or "YYYY-MM-DD HH:mm[:ss]" into { date, minutes, stamp, time }. */
export function parseActivityTime(value) {
  const text = clean(value);
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::\d{2})?$/);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match && !iso) return null;
  const [year, month, day, hour, minute] = match
    ? [match[3], match[1], match[2], match[4], match[5]].map(Number)
    : iso.slice(1).map(Number);
  const stamp = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (stamp.getUTCFullYear() !== year || stamp.getUTCMonth() !== month - 1 || stamp.getUTCDate() !== day || hour > 23 || minute > 59) return null;
  return {
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    minutes: hour * 60 + minute,
    stamp: stamp.getTime(),
    time: formatClock(hour * 60 + minute),
  };
}

/** "YYYY-MM-DD..." or CRM "MM/DD/YYYY..." → "YYYY-MM-DD". */
export function calendarDateKey(value) {
  const text = clean(value);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const crm = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : crm ? `${crm[3]}-${crm[1].padStart(2, "0")}-${crm[2].padStart(2, "0")}` : null;
}

/** Employee dates are saved as DD/MM/YYYY; ISO values are also accepted. */
export function employeeDateKey(value) {
  const text = clean(value);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : dmy ? `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}` : null;
}

export function formatClock(minutes) {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return "—";
  const hour = Math.floor(minutes / 60) % 24;
  const minute = Math.round(minutes % 60);
  return `${String(hour % 12 || 12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

export function formatHours(minutes) {
  if (minutes === null || minutes === undefined) return "—";
  return `${Math.floor(minutes / 60)}h ${String(Math.round(minutes % 60)).padStart(2, "0")}m`;
}

export function formatDuration(totalSeconds) {
  const safe = Math.max(Math.floor(Number(totalSeconds) || 0), 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** "2026-10-19" → "19 Oct 2026". Accepts CRM dates too. Falls back to the raw text. */
export function formatDate(value, { weekday = false, year = true } = {}) {
  const key = calendarDateKey(value);
  if (!key) return clean(value) || "—";
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const parts = [`${d} ${MONTHS[m - 1]}`];
  if (year) parts.push(String(y));
  const text = parts.join(" ");
  return weekday ? `${WEEKDAYS[date.getDay()]}, ${text}` : text;
}

export function formatDateTime(value) {
  const time = parseActivityTime(value);
  if (time) return `${formatDate(time.date)} · ${time.time}`;
  const date = interviewDate(value);
  if (date) return date.toLocaleString();
  return clean(value) || "—";
}

export function monthLabel(year, monthIndex) {
  return `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][monthIndex]} ${year}`;
}

export function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthRange(date = new Date()) {
  return {
    from: dateKey(new Date(date.getFullYear(), date.getMonth(), 1)),
    to: dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
  };
}

export function eachDay(from, to) {
  const days = [];
  const cursor = new Date(`${from}T00:00:00`);
  const last = new Date(`${to}T00:00:00`);
  while (cursor <= last) {
    days.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export const isWeekend = (key) => [0, 6].includes(new Date(`${key}T00:00:00`).getDay());

/** Interview datetimes are UTC; also accepts "MM/DD/YYYY HH:mm". */
export function interviewDate(value) {
  const raw = clean(value);
  if (!raw) return null;
  let iso = raw.replace(" ", "T");
  if (!/^\d{4}-\d{2}-\d{2}T/.test(iso)) {
    const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}(?::\d{2})?)$/);
    if (!match) return null;
    iso = `${match[3]}-${match[1]}-${match[2]}T${match[4]}`;
  }
  const date = new Date(iso + (/Z$|[+-]\d{2}:?\d{2}$/.test(iso) ? "" : "Z"));
  return Number.isFinite(date.getTime()) ? date : null;
}

export function relativeDay(date, now = new Date()) {
  const day = (value) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  const diff = Math.round((day(date) - day(now)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return diff > 0 ? `In ${diff} days` : `${Math.abs(diff)} days ago`;
}

export function timeUntil(date, now = Date.now()) {
  const minutes = Math.ceil((date?.getTime() - now) / 60000);
  if (!Number.isFinite(minutes) || minutes < 0) return "";
  if (minutes <= 1) return "Starting now";
  if (minutes < 60) return `In ${minutes} minutes`;
  const startOfDay = (value) => new Date(value).setHours(0, 0, 0, 0);
  const days = Math.round((startOfDay(date) - startOfDay(now)) / 86400000);
  if (days === 0) {
    const hours = Math.floor(minutes / 60);
    return `Today, in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  return days === 1 ? "Tomorrow" : `In ${days} days`;
}

export function timeAgo(value) {
  const stamp = parseActivityTime(value)?.stamp ?? interviewDate(value)?.getTime();
  if (!stamp) return clean(value);
  const diff = Date.now() - stamp;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}
