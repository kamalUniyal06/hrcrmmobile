// Employee alert history (web: components/alerts/AlertBell.jsx "Waiting" / "Past alerts" tabs).
import { parseUtc } from "./homeDashboard";
import { pendingQueue } from "./systemAlerts";

const time = (value) => parseUtc(value)?.getTime() ?? 0;

/** Answered alerts, most recently answered first (falls back to when the alert was sent). */
export const pastAlerts = (alerts = []) =>
  (Array.isArray(alerts) ? alerts : [])
    .filter((alert) => alert.responded)
    .sort((a, b) => (time(b.answered_at) || time(b.date_entered)) - (time(a.answered_at) || time(a.date_entered)));

/** { pending, past } for the two tabs. */
export const splitMyAlerts = (alerts = []) => ({ pending: pendingQueue(Array.isArray(alerts) ? alerts : []), past: pastAlerts(alerts) });
