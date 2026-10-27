// Pure helpers for system alerts: response types, answers, targeting, dates and the HR form.
// Web source: components/alerts/systemAlertUtils.js.
import { alertExpiresAt, isAlertActive, parseUtc } from "./homeDashboard";
import { dateKey } from "./dates";
import { clean, fullName, lower, plainText } from "./records";

const pad = (value) => String(value).padStart(2, "0");
const truthy = (value) => value === true || value === 1 || ["1", "true"].includes(lower(value));
const capitalize = (text) => (text ? text[0].toUpperCase() + text.slice(1) : text);

// Each response type decides the employee's buttons and whether an unanswered alert holds up logout.
export const RESPONSE_TYPES = {
  none: { label: "Information only", hint: "Employees just read it and close it.", answers: ["seen"], blocksLogout: false },
  acknowledge: { label: "Acknowledge", hint: "Employees confirm they have read it.", answers: ["acknowledged"], blocksLogout: true },
  yes_no: { label: "Yes / No", hint: "Employees answer Yes or No.", answers: ["yes", "no"], blocksLogout: true },
};
export const RESPONSE_TYPE_KEYS = ["none", "acknowledge", "yes_no"];
export const AUDIENCES = { all: "All employees", selected: "Selected employees" };

const ANSWER_LABELS = { yes: "Yes", no: "No", acknowledged: "Acknowledged", seen: "Seen" };
const ANSWER_TONES = { yes: "success", no: "closed", acknowledged: "info", seen: "neutral" };
const BUTTON_LABELS = { seen: "Close", acknowledged: "I have read this", yes: "Yes", no: "No" };

export const responseTypeOf = (alert) => (RESPONSE_TYPES[lower(alert?.response_type)] ? lower(alert.response_type) : "yes_no");
export const audienceOf = (alert) => (lower(alert?.audience) === "selected" ? "selected" : "all");
export const answerLabel = (answer) => ANSWER_LABELS[lower(answer)] || capitalize(clean(answer)) || "Unknown";
export const answerTone = (answer) => ANSWER_TONES[lower(answer)] || "neutral";
export const answerButtonLabel = (answer) => BUTTON_LABELS[lower(answer)] || capitalize(clean(answer));
export const alertTitle = (alert) => plainText(alert?.name) || "Untitled alert";

const isEndOfDay = (date) => date.getHours() === 23 && date.getMinutes() === 59;

/** "31 Oct 2026" for an end-of-day expiry, "31 Oct 2026, 3:00 pm" otherwise. */
export function formatExpiry(date) {
  if (!date) return "";
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(isEndOfDay(date) ? {} : { hour: "numeric", minute: "2-digit" }),
  });
}

export const isAlertExpired = (alert, now = new Date()) => {
  const at = alertExpiresAt(alert);
  return Boolean(at && at < now);
};

/** A "YYYY-MM-DD" and an optional "HH:mm" in local time; no time = the end of that day. */
export function localExpiry(day, time) {
  if (!day) return null;
  const [year, month, date] = day.split("-").map(Number);
  if (!time) return new Date(year, month - 1, date, 23, 59, 59);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, date, hour, minute);
}

/** A Date as the UTC "YYYY-MM-DD HH:MM:SS" the backend uses for timestamps. */
export const toUtcStamp = (date) => date.toISOString().slice(0, 19).replace("T", " ");

/** hrc UTC "YYYY-MM-DD HH:MM:SS" → local wall-clock "YYYY-MM-DD HH:mm", the form the home cards read. */
export function utcToLocalStamp(value) {
  const date = parseUtc(value);
  return date ? `${dateKey(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}` : clean(value);
}

export function formatUtcTime(value) {
  const date = parseUtc(value);
  return date ? date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
}

/** Times offered for the expiry, every 30 minutes. "" = the end of the day. */
export const EXPIRY_TIMES = [
  { label: "End of the day", value: "" },
  ...Array.from({ length: 48 }, (_, index) => {
    const value = `${pad(Math.floor(index / 2))}:${index % 2 ? "30" : "00"}`;
    const [hour, minute] = value.split(":").map(Number);
    return { label: new Date(2000, 0, 1, hour, minute).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }), value };
  }),
];

/* ── Employee side (hrc my_alerts / alert_respond) ─────────────────────── */

export function normalizeMyAlert(alert) {
  const responseType = responseTypeOf(alert);
  const allowed = (Array.isArray(alert?.allowed_answers) ? alert.allowed_answers : []).map(lower).filter(Boolean);
  const answer = lower(alert?.answer) || null;
  const responded = truthy(alert?.responded) || Boolean(answer);
  return {
    ...alert,
    id: clean(alert?.id),
    response_type: responseType,
    allowed_answers: allowed.length ? allowed : RESPONSE_TYPES[responseType].answers,
    answer,
    responded,
    blocks_logout: alert?.blocks_logout === undefined || alert?.blocks_logout === null
      ? !responded && RESPONSE_TYPES[responseType].blocksLogout
      : !responded && truthy(alert.blocks_logout),
  };
}

const summarize = (alerts) => ({
  alerts,
  pendingCount: alerts.filter((alert) => !alert.responded).length,
  blockingCount: alerts.filter((alert) => alert.blocks_logout).length,
});

/** my_alerts response → { alerts, pendingCount, blockingCount }. Alerts past their expiry time are dropped. */
export function readMyAlerts(response, now = new Date()) {
  const alerts = (Array.isArray(response?.alerts) ? response.alerts : [])
    .map(normalizeMyAlert)
    .filter((alert) => alert.id && !isAlertExpired(alert, now));
  return summarize(alerts);
}

export function markAlertAnswered(data, alertId, answer, answeredAt = new Date()) {
  return summarize((data?.alerts || []).map((alert) =>
    alert.id === alertId
      ? { ...alert, responded: true, answer: lower(answer), answered_at: toUtcStamp(answeredAt), blocks_logout: false }
      : alert,
  ));
}

/** Unanswered alerts, oldest first. */
export const pendingQueue = (alerts = []) =>
  alerts
    .filter((alert) => !alert.responded)
    .sort((a, b) => (parseUtc(a.date_entered)?.getTime() ?? 0) - (parseUtc(b.date_entered)?.getTime() ?? 0));

export function respondErrorKind(error) {
  const message = lower(error?.message);
  if (message.includes("already responded")) return "duplicate";
  if (message.includes("not available")) return "unavailable";
  return "other";
}

/* ── HR side ───────────────────────────────────────────────────────────── */

export function readAlertStatus(response) {
  const people = (list) => (Array.isArray(list) ? list : []).map((person) => ({
    id: clean(person.id),
    name: clean(person.name) || clean(person.email) || "Unnamed employee",
    email: clean(person.email),
    answer: lower(person.answer) || null,
    answeredAt: clean(person.answered_at) || null,
  }));
  const responded = people(response?.responded);
  const pending = people(response?.pending);
  const count = (value, fallback) => (clean(value) !== "" && Number.isFinite(Number(value)) ? Number(value) : fallback);
  return {
    alert: response?.alert || null,
    targetCount: count(response?.target_count, responded.length + pending.length),
    respondedCount: count(response?.responded_count, responded.length),
    pendingCount: count(response?.pending_count, pending.length),
    answerCounts: response?.answer_counts && typeof response.answer_counts === "object" ? response.answer_counts : {},
    responded,
    pending,
  };
}

/** { answer: count } over the saved responses, whatever the answer is. */
export function countAnswers(responses = []) {
  const counts = {};
  for (const response of responses) {
    const answer = lower(response.description);
    if (answer) counts[answer] = (counts[answer] || 0) + 1;
  }
  return counts;
}

export function diffTargets(currentIds = [], nextIds = []) {
  const current = new Set(currentIds.map(clean).filter(Boolean));
  const next = new Set(nextIds.map(clean).filter(Boolean));
  return {
    add: [...next].filter((id) => !current.has(id)),
    remove: [...current].filter((id) => !next.has(id)),
  };
}

/** Employees HR can pick: no deleted records and no former employees, as { id, name, email } sorted by name. */
export function employeeOptions(employees = []) {
  return employees
    .filter((employee) =>
      String(employee.deleted) !== "1" &&
      clean(employee.id) &&
      !(clean(employee.stage_id_name) === "Ex Employee" && clean(employee.hrc_phase_id_name) === "Exit"))
    .map((employee) => ({ id: clean(employee.id), name: fullName(employee, "Unnamed employee"), email: lower(employee.email1 || employee.email) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ── The create / edit form ────────────────────────────────────────────── */

const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Plain text typed on the phone → the HTML the web shows: one <p> per paragraph, <br> per line. */
export const textToHtml = (text) =>
  String(text ?? "")
    .trim()
    .split(/\n\s*\n/)
    .filter((paragraph) => paragraph.trim())
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");

export const messageHtml = (values) => (values.messageMode === "html" ? String(values.message ?? "") : textToHtml(values.message));

const hasMessage = (html) => Boolean(plainText(html)) || /<img\b/i.test(String(html ?? ""));

export const emptyAlertForm = () => ({
  name: "",
  messageMode: "text",
  message: "",
  audience: "all",
  employeeIds: [],
  responseType: "yes_no",
  active: true,
  expiresOn: "",
  expiresTime: "",
});

export function validateAlertForm(values, now = new Date()) {
  const errors = {};
  if (!clean(values.name)) errors.name = "Add a title.";
  if (!hasMessage(messageHtml(values))) errors.message = "Write the message employees will see.";
  if (values.audience === "selected" && !(values.employeeIds || []).length) errors.employees = "Pick at least one employee.";
  if (!RESPONSE_TYPES[values.responseType]) errors.responseType = "Choose how employees respond.";
  if (values.expiresTime && !values.expiresOn) errors.expiresOn = "Pick a date for the time you set.";
  else if (values.expiresOn && localExpiry(values.expiresOn, values.expiresTime) <= now) {
    errors.expiresOn = values.expiresTime ? "Pick a time later than now." : "Pick today or a later date.";
  }
  return errors;
}

/** Form values → hrc_system_alert fields. The expiry goes as a UTC timestamp so a same-day time survives. */
export function alertPayload(values) {
  const expiresAt = localExpiry(values.expiresOn, values.expiresTime);
  return {
    name: clean(values.name),
    description: messageHtml(values),
    audience: values.audience === "selected" ? "selected" : "all",
    response_type: RESPONSE_TYPES[values.responseType] ? values.responseType : "yes_no",
    active: values.active ? 1 : 0,
    expires_on: expiresAt ? toUtcStamp(expiresAt) : "",
  };
}

// Markup the phone's text mode writes; anything richer is edited as HTML so it is not lost.
const SIMPLE_MARKUP = /^(?:\s|<\/?p>|<br\s*\/?>|[^<])*$/i;

export function alertFormFromRecord(alert, employeeIds = []) {
  const expiresAt = alertExpiresAt(alert);
  const html = String(alert?.description ?? "");
  const simple = SIMPLE_MARKUP.test(html);
  return {
    name: clean(alert?.name) ? alertTitle(alert) : "",
    messageMode: simple ? "text" : "html",
    message: simple ? plainText(html) : html,
    audience: audienceOf(alert),
    employeeIds,
    responseType: responseTypeOf(alert),
    active: isAlertActive(alert),
    expiresOn: expiresAt ? dateKey(expiresAt) : "",
    expiresTime: expiresAt && !isEndOfDay(expiresAt) ? `${pad(expiresAt.getHours())}:${pad(expiresAt.getMinutes())}` : "",
  };
}

/** "live" | "off" | "expired", the HR list filters. */
export function alertStatus(alert, now = new Date()) {
  if (!isAlertActive(alert)) return "off";
  return isAlertExpired(alert, now) ? "expired" : "live";
}

export const STATUS_LABELS = {
  live: { label: "Live", tone: "success" },
  off: { label: "Turned off", tone: "neutral" },
  expired: { label: "Expired", tone: "attention" },
};
