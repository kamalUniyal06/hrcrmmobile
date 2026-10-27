// System alerts and employee responses (web: components/employement/api/systemAlerts.api.js).
import { fetchGpc, gateway } from "../services/api";
import { FETCH_GPC_X_API_KEY } from "../config";
import { assertSuccess, clean, errorMessage, fetchAllPages } from "../utils/records";
import { alertPayload, diffTargets, readAlertStatus, readMyAlerts, respondErrorKind } from "../utils/systemAlerts";

const ALERT_MODULE = "hrc_system_alert";
const RESPONSE_MODULE = "hrc_employee_response";
const EMPLOYEE_MODULE = "hrc_employees";

// Employees read their alerts through my_alerts only, under this one cache key.
export const MY_ALERTS_KEY = ["system-alerts", "mine"];

const fetchAll = async (module, filters = {}) => (await fetchAllPages(gateway, { action: "fetch", module, filters })).records;

const responseAlertId = (record) =>
  clean(record.alert_id) || clean(record.hrc_system_alert_hrc_employee_response_1hrc_system_alert_ida);

export const fetchSystemAlerts = () => fetchAll(ALERT_MODULE);

/* ── Employee calls (hrc entry point) ─────────────────────────────────── */

// The backend reads the employee from the CRM token, so no employee id is sent.
async function hrcAlertCall(type, body = null) {
  if (!FETCH_GPC_X_API_KEY) throw new Error("Alerts are not configured. Please contact your administrator.");
  let data;
  try {
    data = await fetchGpc({ method: "POST", params: { type }, body });
  } catch (error) {
    const wrapped = new Error(errorMessage(error, "The alert request failed. Please try again."));
    wrapped.status = error.response?.status;
    throw wrapped;
  }
  // A bad API key comes back as 200 with `status: false` instead of `success`.
  if (data?.success !== true) {
    const error = new Error(data?.message || data?.error || "The alert request failed. Please try again.");
    error.status = 500;
    throw error;
  }
  return data;
}

/** The signed-in employee's alerts: only ones targeted at them, active and not expired. */
export const fetchMyAlerts = async () => readMyAlerts(await hrcAlertCall("my_alerts"));

export const respondToAlert = async ({ alert, answer }) => {
  const normalized = clean(answer).toLowerCase();
  if (!alert?.id || !alert.allowed_answers?.includes(normalized)) {
    throw new Error("That answer is not allowed for this alert.");
  }
  try {
    return await hrcAlertCall("alert_respond", { alert_id: alert.id, answer: normalized });
  } catch (error) {
    // A double tap already saved it.
    if (respondErrorKind(error) === "duplicate") return { success: true, alert_id: alert.id, answer: normalized };
    throw error;
  }
};

// HR only: who responded and who is still pending, out of the alert's targets.
export const fetchAlertStatus = async (alertId) => readAlertStatus(await hrcAlertCall("alert_status", { alert_id: alertId }));

/* ── HR management (Smart Gateway) ────────────────────────────────────── */

const LINK_BATCH = 5;

async function linkEmployees(alertId, employeeIds, action) {
  const failed = [];
  for (let index = 0; index < employeeIds.length; index += LINK_BATCH) {
    const batch = employeeIds.slice(index, index + LINK_BATCH);
    const results = await Promise.allSettled(batch.map(async (employeeId) =>
      assertSuccess(
        await gateway({ action, module: ALERT_MODULE, id: alertId, related_module: EMPLOYEE_MODULE, related_id: employeeId }),
        "Could not update the alert's employees.",
      )));
    results.forEach((result, position) => {
      if (result.status === "rejected") failed.push(batch[position]);
    });
  }
  return failed;
}

/** Ids of the employees a "selected" alert is linked to. */
export const fetchAlertTargets = async (alertId) =>
  (await fetchAllPages(gateway, { action: "fetch_related", module: ALERT_MODULE, id: alertId, related_module: EMPLOYEE_MODULE }, { perPage: 200 }))
    .records.map((record) => clean(record.id)).filter(Boolean);

export const createSystemAlert = async (values) => {
  const data = alertPayload(values);
  if (!data.name || !data.description.trim()) throw new Error("An alert title and description are required.");
  const selected = data.audience === "selected";
  const employeeIds = selected ? values.employeeIds || [] : [];
  if (selected && !employeeIds.length) throw new Error("Pick at least one employee.");
  // A targeted alert starts inactive and is switched on once every link exists,
  // so no one it targets can log in before their link is there.
  const created = assertSuccess(
    await gateway({ action: "create", module: ALERT_MODULE, data: selected ? { ...data, active: 0 } : data }),
    "Could not create the alert.",
  );
  const id = clean(created?.record?.id || created?.data?.id || created?.id || created?.record_id);
  if (!id) throw new Error("The alert was created but its ID was not returned.");
  if (selected) {
    const failed = await linkEmployees(id, employeeIds, "add_relationship");
    if (failed.length) {
      throw new Error(`The alert was saved as inactive because ${failed.length} employee${failed.length === 1 ? "" : "s"} could not be linked. Edit it to retry.`);
    }
    if (data.active) {
      assertSuccess(
        await gateway({ action: "update", module: ALERT_MODULE, id, data: { active: 1 } }),
        "The alert was saved but could not be switched on. Edit it to turn it on.",
      );
    }
  }
  return { id };
};

export const updateSystemAlert = async ({ id, values, currentTargetIds = [] }) => {
  if (!clean(id)) throw new Error("An alert is required.");
  const data = alertPayload(values);
  if (!data.name || !data.description.trim()) throw new Error("An alert title and description are required.");
  if (data.audience === "selected") {
    // Links change first, while the old audience still applies.
    const { add, remove } = diffTargets(currentTargetIds, values.employeeIds || []);
    const failed = [...(await linkEmployees(id, add, "add_relationship")), ...(await linkEmployees(id, remove, "remove_relationship"))];
    if (failed.length) throw new Error(`${failed.length} employee link${failed.length === 1 ? "" : "s"} could not be updated. Nothing else was changed. Please try again.`);
  }
  assertSuccess(await gateway({ action: "update", module: ALERT_MODULE, id, data }), "Could not save the alert.");
  return { id };
};

/** Turns an alert on or off without touching anything else. */
export const setSystemAlertActive = async (id, active) =>
  assertSuccess(await gateway({ action: "update", module: ALERT_MODULE, id, data: { active: active ? 1 : 0 } }), "Could not update the alert.");

export const deleteSystemAlert = async (id) => {
  id = clean(id);
  if (!id) throw new Error("An alert is required.");
  // Finish pagination before deleting so shrinking pages cannot skip responses.
  const responses = (await fetchAll(RESPONSE_MODULE)).filter((record) => responseAlertId(record) === id);
  for (const record of responses) {
    const result = await gateway({ action: "delete", module: RESPONSE_MODULE, id: record.id });
    if (result?.success !== true) {
      throw new Error("Response cleanup stopped; the alert has not been deleted. Retry to finish.");
    }
  }
  return assertSuccess(await gateway({ action: "delete", module: ALERT_MODULE, id }), "Could not delete the alert.");
};

/** Alerts with every employee response grouped under them (admin). */
export const fetchSystemAlertResponses = async () => {
  const [alerts, responses] = await Promise.all([fetchAll(ALERT_MODULE), fetchAll(RESPONSE_MODULE)]);
  const groups = new Map(alerts.map((alert) => [clean(alert.id), { alert, responses: [] }]));
  for (const response of responses) {
    const id = responseAlertId(response);
    if (!groups.has(id)) groups.set(id, { alert: { id, unavailable: true, name: "Responses to a removed alert" }, responses: [] });
    groups.get(id).responses.push(response);
  }
  return [...groups.values()];
};
