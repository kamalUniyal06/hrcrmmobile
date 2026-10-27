// Leave management (web: components/employement/api/leaves.api.js + users.api.js).
import { CRM_URL } from "../config";
import { fetchGpc, gateway } from "../services/api";
import { currentEmail, currentUserId } from "../store/authStore";
import { activeRecords, assertSuccess, fetchAllPages } from "../utils/records";
import { leaveDayRequests, leavesCoveringDay } from "../utils/adminAttendance";

export const LEAVE_TYPES = [
  "Half Day Sick Leave", "Sick Leave in Family", "Self Marriage",
  "Marriage in Immediate Family ( Same City )", "Marriage in Immediate Family ( Other City )",
  "Friends's Marriage ( Same City )", "Friends's Marriage ( Other City )", "BirthDay Leave",
  "Pet related emergency", "Train not coming on time", "worship in family", "Banking work",
  "Celebration in family", "Death of a relative", "Need to travel for hometown", "Short leave", "Other Reason",
];

/** The signed-in employee's record (leave balances live here). */
export const getMyEmployeeRecord = async () => {
  const response = assertSuccess(
    await gateway({ action: "fetch", module: "hrc_employees", filters: { email1: currentEmail() }, page: 1, per_page: 5 }),
    "Could not load your employee record.",
  );
  return activeRecords(response)[0] || null;
};

export const leaveBalancesOf = (employee) =>
  employee
    ? [
        { type: "Annual Leave", hint: "Planned time off", available: Number(employee.available_planned_leaves || 0) },
        { type: "Sick Leave", hint: "When you're unwell", available: Number(employee.available_sick_leaves || 0) },
      ]
    : [];

/**
 * Create a leave request through the `hrc` entry point.
 * `attachment` is an optional { uri, name, mimeType } from the document picker.
 */
export const applyForLeave = async (data) => {
  const formData = new FormData();
  formData.append("email", data.email || currentEmail());
  formData.append("leave_type", data.leave_type || "");
  formData.append("status", data.status || "Applied");
  formData.append("leave_from", data.leave_from || "");
  formData.append("leave_to", data.leave_to || "");
  formData.append("leave_days", String(data.leave_days || ""));
  formData.append("description", data.description || "");
  formData.append("candidate_id", data.candidate_id || currentUserId() || "");
  if (data.attachment?.uri) {
    formData.append("attachment", {
      uri: data.attachment.uri,
      name: data.attachment.name || "attachment.pdf",
      type: data.attachment.mimeType || "application/pdf",
    });
  }
  const response = await fetchGpc({
    endpoint: `${CRM_URL}?entryPoint=hrc`,
    method: "POST",
    params: { type: "create_leave" },
    body: formData,
  });
  if (!response?.success) throw new Error(response?.message || response?.error || "Failed to apply for leave.");
  return response;
};

export const getPublicHolidays = async () => {
  const response = assertSuccess(
    await gateway({ action: "fetch", module: "hrc_holidays", page: 1, per_page: 100 }),
    "Could not load public holidays.",
  );
  return activeRecords(response);
};

/** The signed-in employee's leave requests. */
export const getMyLeaves = async ({ employeeId, email }) => {
  const { records } = await fetchAllPages(gateway, {
    action: "fetch",
    module: "hrc_leaves",
    filters: employeeId ? { employee_id: employeeId } : { email },
    order_by: "date_entered",
    order_dir: "DESC",
  });
  return records;
};

/** The signed-in employee's leave ledger (web getLeavesHistory, module hrc_leave_transaction): records plus dropdown labels. */
export const getLeaveHistory = async ({ employeeId }) => {
  if (!employeeId) return { records: [], dropdowns: {} };
  return fetchAllPages(gateway, {
    action: "fetch",
    module: "hrc_leave_transaction",
    filters: { employee_id: employeeId },
    order_by: "date_entered",
    order_dir: "DESC",
  });
};

/** Admin feed, optionally limited to a date range on `dateField` and to one employee's `email` (web getAllLeaves). */
export const getAllLeaves = async ({ from, to, dateField = "leave_from", email } = {}) => {
  const { records } = await fetchAllPages(gateway, {
    action: "fetch",
    module: "hrc_leaves",
    filters: email ? { name: email } : {},
    ...(from && to ? { date_range: "custom", date_field: dateField, date_from: from, date_to: to } : {}),
    order_by: "date_entered",
    order_dir: "DESC",
  });
  return records;
};

/** Every leave whose dates include `day` (admin attendance). */
export const getLeavesOnDay = async (day) => {
  const lists = await Promise.all(leaveDayRequests(day).map((request) => getAllLeaves(request)));
  return leavesCoveringDay(lists, day);
};

export const getLeaveDocuments = async (id) => {
  if (!id) return [];
  const { records } = await fetchAllPages(gateway, { action: "fetch_related", module: "hrc_leaves", id, related_module: "Notes" });
  return records.filter((record) => record.image_url || record.file_url || record.filename || record.name);
};

/** One leave request by id, so the detail screen doesn't depend on whichever list was loaded. */
export const getLeave = async (id) => {
  const response = assertSuccess(
    await gateway({ action: "fetch", module: "hrc_leaves", filters: { id }, page: 1, per_page: 1 }),
    "Could not load the leave request.",
  );
  const record = activeRecords(response).find((item) => String(item.id) === String(id));
  if (!record) throw new Error("This leave request is no longer available. Refresh the list.");
  return record;
};

const localDayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

/**
 * Web updateLeaveStatus: approving needs a reason and an approver, and records who covers
 * the work and the approval date; rejecting saves the status (and a reason if given).
 */
export const updateLeaveStatus = async (id, status, { reason = "", approvedById = "", handoverToId = "" } = {}) => {
  if (!id) throw new Error("A leave request ID is required.");
  if (!["Accepted", "Rejected"].includes(status)) throw new Error("Choose Accepted or Rejected.");
  const verdict = String(reason || "").trim();
  if (status === "Accepted" && !verdict) throw new Error("Add a reason for approving this leave.");
  if (status === "Accepted" && !approvedById) throw new Error("Choose who is approving this leave.");
  const data = status === "Accepted"
    ? { status, verdict, approved_by_id: approvedById, work_handed_over_to_id: handoverToId || "", approved_date: localDayKey() }
    : { status, ...(verdict ? { verdict } : {}) };
  return assertSuccess(await gateway({ action: "update", module: "hrc_leaves", id, data }), "Could not update the leave request.");
};

/** Who approved a leave, who covers the work and why (web leaveAdminUtils.leaveApproval). */
export function leaveApproval(record, nameById = new Map()) {
  const looksLikeId = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(value);
  const first = (...values) => values.map((value) => String(value ?? "").trim()).find((value) => value && !looksLikeId(value)) || "";
  const approvedById = String(record?.approved_by_id ?? "").trim();
  const handoverId = String(record?.work_handed_over_to_id ?? "").trim();
  return {
    approvedBy: first(record?.approved_by_id_name, record?.approved_by, nameById.get(approvedById)),
    handoverTo: first(record?.work_handed_over_to_id_name, record?.work_handed_over_to, nameById.get(handoverId)),
    reason: String(record?.verdict ?? "").trim(),
    decidedOn: leaveStatusOf(record) === "Applied" ? "" : String(record?.approved_date || record?.date_modified || "").trim(),
  };
}

export const leaveStatusOf = (record) => (["Applied", "Accepted", "Rejected"].includes(record?.status) ? record.status : "Applied");
