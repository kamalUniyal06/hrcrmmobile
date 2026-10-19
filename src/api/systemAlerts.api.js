// System alerts and employee responses (web: components/employement/api/systemAlerts.api.js).
import { gateway } from "../services/api";
import { assertSuccess, clean, fetchAllPages } from "../utils/records";

const ALERT_MODULE = "hrc_system_alert";
const RESPONSE_MODULE = "hrc_employee_response";

const fetchAll = async (module, filters = {}) => (await fetchAllPages(gateway, { action: "fetch", module, filters })).records;

const responseEmployeeId = (record) =>
  clean(record.employee_id || record.hrc_employees_hrc_employee_response_1hrc_employees_ida);
const responseAlertId = (record) =>
  clean(record.alert_id) || clean(record.hrc_system_alert_hrc_employee_response_1hrc_system_alert_ida);

export const fetchSystemAlerts = () => fetchAll(ALERT_MODULE);

export const createSystemAlert = async ({ name, description }) => {
  name = clean(name);
  description = clean(description);
  if (!name || !description) throw new Error("An alert title and description are required.");
  return assertSuccess(
    await gateway({ action: "create", module: ALERT_MODULE, data: { name, description } }),
    "Could not create the alert.",
  );
};

export const deleteSystemAlert = async (id) => {
  id = clean(id);
  if (!id) throw new Error("An alert is required.");
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

/** Alerts the employee has not answered yet. */
export const fetchPendingSystemAlerts = async (employeeId) => {
  const id = clean(employeeId);
  if (!id) return [];
  const [alerts, responses] = await Promise.all([fetchAll(ALERT_MODULE), fetchAll(RESPONSE_MODULE, { employee_id: id })]);
  const answered = new Set(
    responses.filter((r) => !responseEmployeeId(r) || responseEmployeeId(r) === id).map(responseAlertId).filter(Boolean),
  );
  return alerts.filter((alert) => !answered.has(clean(alert.id)));
};

export const createSystemAlertResponse = async ({ email, employeeId, alertId, answer }) => {
  if (!employeeId || !alertId || !["yes", "no"].includes(answer)) {
    throw new Error("A valid employee, alert, and response are required.");
  }
  return assertSuccess(
    await gateway({
      action: "create",
      module: RESPONSE_MODULE,
      data: { name: email, employee_id: employeeId, alert_id: alertId, description: answer },
    }),
    "Could not save your response.",
  );
};
