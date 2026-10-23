// Employee resignation flow (web: "I want to resign" → Resignation assistance dialog).
// One hrc_resignation record per employee (keyed by email in `name`); each approval step
// is unlocked by a private token the team lead / manager / HR shares with the employee.
import { gateway } from "../services/api";
import { assertSuccess } from "../utils/records";

const MODULE = "hrc_resignation";

export const RESIGNATION_STEPS = [
  { key: "tl", title: "Team lead", question: "Have you notified your team lead?", tokenField: "tl_token", notifyField: "notify_tl" },
  { key: "manager", title: "Manager", question: "Have you notified your manager?", tokenField: "manager_token", notifyField: "notify_manager" },
  { key: "hr", title: "HR", question: "Have you notified HR?", tokenField: "hr_token", notifyField: "notify_hr" },
];

export const isNotified = (value) => value === true || value === 1 || value === "1";

/** The employee's resignation record, or null. */
export const findResignation = async (email) => {
  const name = String(email || "").trim();
  if (!name) throw new Error("An employee email is required.");
  const response = assertSuccess(
    await gateway({ action: "fetch", module: MODULE, filters: { name }, page: 1, per_page: 1 }),
    "Could not load the resignation request.",
  );
  return Array.isArray(response.records) ? response.records[0] ?? null : null;
};

/** Existing record, or a new one created for this email (same as the web app). */
export const startResignation = async (email) => {
  const existing = await findResignation(email);
  if (existing) return existing;
  const response = assertSuccess(
    await gateway({ action: "create", module: MODULE, data: { name: String(email).trim() } }),
    "Could not create the resignation request.",
  );
  if (response.record?.id && response.record.tl_token !== undefined) return response.record;
  const created = await findResignation(email);
  if (!created) throw new Error("The resignation request was created but could not be loaded.");
  return created;
};

/** Marks one approval step as notified after its token was verified. */
export const markStepNotified = async (id, notifyField) => {
  if (!id) throw new Error("A resignation request ID is required.");
  return assertSuccess(
    await gateway({ action: "update", module: MODULE, id, data: { [notifyField]: "1" } }),
    "Could not update the resignation request.",
  );
};
