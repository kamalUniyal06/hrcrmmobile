// Read-only Microsoft Teams presence (web: src/api/teamsPresence.api.js + queries/teamsPresence.queries.js).
// Collected by a cron job on flight.hrcrm.ai and served by the `teams_presence` entry point.
//
// The web crm client attaches the CRM Bearer token for this entry point and retries once on a 401.
// The phone's crm client only does that for the entry points in config.CRM_ALLOWED_ENTRY_POINTS
// ("teams_presence" is not one of them yet), so the token is attached here, with the same one-retry rule.
import { apiRequest } from "../services/api";
import { clearCrmToken, getCrmToken } from "../services/crmAuth";
import { CRM_URL } from "../config";

export const TEAMS_PRESENCE_URL = CRM_URL;
const FALLBACK = "Could not load Teams activity.";

async function request(params, retried = false) {
  const token = await getCrmToken();
  try {
    return await apiRequest({
      endpoint: TEAMS_PRESENCE_URL,
      params: { entryPoint: "teams_presence", ...params },
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    if (error.response?.status === 401 && !retried) {
      clearCrmToken();
      return request(params, true);
    }
    throw error;
  }
}

/** One teams_presence call; failures come back as { success: false, error } with a meaningful HTTP code (403 = no access). */
export async function teamsPresence(params) {
  let response;
  try {
    response = await request(params);
  } catch (error) {
    if (!error.response) throw error;
    const failure = new Error(error.response.data?.error || FALLBACK);
    failure.status = error.response.status;
    throw failure;
  }
  if (response?.success !== true) throw new Error(response?.error || FALLBACK);
  return response;
}

/** Today's status and totals for every tracked employee, plus collector health. */
export const fetchTeamsLive = () => teamsPresence({ action: "live" });

/** One record per employee per day for an inclusive YYYY-MM-DD range (up to 92 days). */
export const fetchTeamsReport = ({ from, to, employeeId }) =>
  teamsPresence({ action: "report", from, to, ...(employeeId ? { employee_id: employeeId } : {}) });

/** One employee's status periods for one day, in order. */
export const fetchTeamsTimeline = ({ employeeId, date }) => teamsPresence({ action: "timeline", employee_id: employeeId, date });

/* ── Query helpers (web queries/teamsPresence.queries.js) ─────────────── */

export const teamsPresenceKeys = {
  all: ["teams-presence"],
  day: (day, live) => ["teams-presence", live ? "live" : "report", day],
  timeline: (employeeId, day) => ["teams-presence", "timeline", employeeId, day],
};

// Access and validation errors won't change on retry.
export const teamsRetry = (count, error) => ![401, 403, 422].includes(error?.status) && count < 2;

/** Today reads the live feed; other days read the stored daily report as { employees }. */
export async function fetchTeamsDay(day, live) {
  if (live) return fetchTeamsLive();
  const report = await fetchTeamsReport({ from: day, to: day });
  return { employees: report.records || [] };
}
