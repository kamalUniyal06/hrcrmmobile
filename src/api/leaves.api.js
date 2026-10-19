// Leave management (web: components/employement/api/leaves.api.js + users.api.js).
import { CRM_URL } from "../config";
import { fetchGpc, gateway } from "../services/api";
import { currentEmail, currentUserId } from "../store/authStore";
import { activeRecords, assertSuccess, fetchAllPages } from "../utils/records";

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

/** Admin feed, optionally limited to a date range on `leave_from`. */
export const getAllLeaves = async ({ from, to, dateField = "leave_from" } = {}) => {
  const { records } = await fetchAllPages(gateway, {
    action: "fetch",
    module: "hrc_leaves",
    filters: {},
    ...(from && to ? { date_range: "custom", date_field: dateField, date_from: from, date_to: to } : {}),
    order_by: "date_entered",
    order_dir: "DESC",
  });
  return records;
};

export const getLeaveDocuments = async (id) => {
  if (!id) return [];
  const { records } = await fetchAllPages(gateway, { action: "fetch_related", module: "hrc_leaves", id, related_module: "Notes" });
  return records.filter((record) => record.image_url || record.file_url || record.filename || record.name);
};

export const updateLeaveStatus = async (id, status) => {
  if (!id) throw new Error("A leave request ID is required.");
  if (!["Accepted", "Rejected"].includes(status)) throw new Error("Choose Accepted or Rejected.");
  return assertSuccess(
    await gateway({ action: "update", module: "hrc_leaves", id, data: { status } }),
    "Could not update the leave request.",
  );
};

export const leaveStatusOf = (record) => (["Applied", "Accepted", "Rejected"].includes(record?.status) ? record.status : "Applied");
