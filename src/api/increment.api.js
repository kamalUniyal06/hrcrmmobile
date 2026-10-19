// Increment requests (web: components/employement/api/increment.api.js + incrementAdminData.js).
import * as SecureStore from "expo-secure-store";
import { gateway } from "../services/api";
import { activeRecords, assertSuccess, clean, createdId, fetchAllPages } from "../utils/records";

export const INCREMENT_MODULE = "hrc_increment";
export const QUESTION_MODULE = "hrc_increment_questions";
export const REPLY_MODULE = "hrc_increment_replies";
const SALARY_MODULE = "hrc_salaries";
const FALLBACK_SALARY = 15000;
const MONTHS_IN_YEAR = 12;

const storageKey = (email) => `hrcrm.pendingIncrement.${clean(email).toLowerCase().replace(/[^a-z0-9]/g, "_") || "anonymous"}`;

export const getRememberedIncrementId = async (email) => {
  try {
    return (await SecureStore.getItemAsync(storageKey(email))) || "";
  } catch {
    return "";
  }
};
export const rememberIncrementId = async (email, id) => {
  try {
    if (id) await SecureStore.setItemAsync(storageKey(email), String(id));
  } catch {
    // The request still works without local memory.
  }
};
export const clearRememberedIncrement = async (email) => {
  try {
    await SecureStore.deleteItemAsync(storageKey(email));
  } catch {
    // Nothing else required.
  }
};

const latestSalaryFor = async (filters) => {
  const response = assertSuccess(
    await gateway({ action: "fetch", module: SALARY_MODULE, filters, page: 1, per_page: 1, order_by: "date_entered", order_dir: "DESC" }),
    "Could not load the current salary.",
  );
  return activeRecords(response)[0] || null;
};

export const fetchCurrentSalary = async (employeeId) => {
  const id = clean(employeeId);
  if (id) {
    for (const key of ["hrc_employees_hrc_salaries_1hrc_employees_ida", "employee_id"]) {
      try {
        const record = await latestSalaryFor({ [key]: id });
        const amount = Number(record?.offered_salary);
        if (Number.isFinite(amount) && amount > 0) {
          return { amount: amount * MONTHS_IN_YEAR, monthlyAmount: amount, isFallback: false, record };
        }
      } catch {
        // Try the next relationship field.
      }
    }
  }
  return { amount: FALLBACK_SALARY * MONTHS_IN_YEAR, monthlyAmount: FALLBACK_SALARY, isFallback: true };
};

export const createIncrement = async ({ email, expectedSalary }) => {
  const normalizedEmail = clean(email).toLowerCase();
  if (!normalizedEmail) throw new Error("Your employee email is required.");
  const response = assertSuccess(
    await gateway({ action: "create", module: INCREMENT_MODULE, data: { name: normalizedEmail, description: String(expectedSalary) } }),
    "Could not create your increment request.",
  );
  const id = createdId(response);
  if (!id) throw new Error("The request was created but its ID was not returned.");
  return { ...response, id };
};

export const fetchIncrementQuestions = async () =>
  (await fetchAllPages(gateway, { action: "fetch", module: QUESTION_MODULE, order_by: "date_entered", order_dir: "ASC" })).records;

export const fetchIncrementReplies = async (incrementId) => {
  if (!incrementId) return [];
  return (await fetchAllPages(gateway, { action: "fetch", module: REPLY_MODULE, filters: { increment_id: incrementId } })).records;
};

export const fetchMyIncrements = async (email) =>
  (await fetchAllPages(gateway, { action: "fetch", module: INCREMENT_MODULE, filters: { name: clean(email).toLowerCase() }, order_by: "date_entered", order_dir: "DESC" })).records;

export const getPendingIncrement = async (incrementId) => {
  if (!incrementId) return null;
  const [questions, replies] = await Promise.all([fetchIncrementQuestions(), fetchIncrementReplies(incrementId)]);
  const answered = new Set(replies.map((reply) => clean(reply.question_id)));
  return { incrementId, questions, replies, pendingQuestions: questions.filter((q) => !answered.has(clean(q.id))) };
};

export const createIncrementReply = async ({ incrementId, questionId, answer }) => {
  if (!incrementId || !questionId || !clean(answer)) throw new Error("An increment, question, and answer are required.");
  return assertSuccess(
    await gateway({ action: "create", module: REPLY_MODULE, data: { increment_id: incrementId, question_id: questionId, description: clean(answer) } }),
    "Could not save your answer.",
  );
};

export const questionText = (question) => clean(question.description) || clean(question.name) || "Untitled question";

// Admin: every request with reply progress.
export const fetchAdminIncrementOverview = async () => {
  const [requests, questions] = await Promise.all([
    (await fetchAllPages(gateway, { action: "fetch", module: INCREMENT_MODULE, order_by: "date_entered", order_dir: "DESC" })).records,
    fetchIncrementQuestions(),
  ]);
  const ids = requests.map((r) => clean(r.id)).filter(Boolean);
  const replies = ids.length
    ? (await fetchAllPages(gateway, { action: "fetch", module: REPLY_MODULE, filters: { increment_id: { in: ids } } })).records
    : [];
  const questionIds = new Set(questions.map((q) => clean(q.id)));
  const byRequest = new Map();
  for (const reply of replies) {
    if (!clean(reply.description) || !questionIds.has(clean(reply.question_id))) continue;
    const id = clean(reply.increment_id);
    if (!byRequest.has(id)) byRequest.set(id, new Set());
    byRequest.get(id).add(clean(reply.question_id));
  }
  return requests.map((record) => {
    const answered = byRequest.get(clean(record.id))?.size || 0;
    return { record, answered, total: questionIds.size, complete: questionIds.size > 0 && answered === questionIds.size };
  });
};
