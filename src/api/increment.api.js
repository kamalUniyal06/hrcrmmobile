// Increment requests (web: components/employement/api/increment.api.js + incrementAdminData.js).
import { gateway } from "../services/api";
import { readString, remove, writeString } from "../services/storage";
import { activeRecords, assertSuccess, clean, createdId, fetchAllPages } from "../utils/records";

export const INCREMENT_MODULE = "hrc_increment";
export const QUESTION_MODULE = "hrc_increment_questions";
export const REPLY_MODULE = "hrc_increment_replies";
const SALARY_MODULE = "hrc_salaries";
const FALLBACK_SALARY = 15000;
const MONTHS_IN_YEAR = 12;

const storageKey = (email) => `hrcrm.pendingIncrement.${clean(email).toLowerCase().replace(/[^a-z0-9]/g, "_") || "anonymous"}`;

export const getRememberedIncrementId = (email) => readString(storageKey(email));
export const rememberIncrementId = async (email, id) => {
  if (id) await writeString(storageKey(email), id);
};
export const clearRememberedIncrement = (email) => remove(storageKey(email));

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

// ─── Admin: increment management ─────────────────────────────────────────────
// Web: employement/api/incrementAdmin.api.js + incrementAdminData.js. Request bodies match the web exactly.
// Stored contract: request.name = employee email, request.description = requested annual salary;
// question.name = title, question.description = text; reply.increment_id / question_id / description.
// Current salary and approval status are not stored on a request, so neither is shown or changed here.

function assertResponse(response, message) {
  if (response?.success !== true) throw new Error(response?.error || response?.message || message);
  return response;
}

async function loadPage(module, options = {}) {
  const response = assertResponse(
    await gateway({ action: "fetch", module, page: 1, per_page: 20, order_by: "date_entered", order_dir: "DESC", ...options }),
    "Could not load increment records.",
  );
  if (!Array.isArray(response.records)) throw new Error("The gateway returned an invalid record collection.");
  return {
    ...response,
    records: response.records.filter((record) => clean(record.deleted) !== "1"),
    total: Number(response.total) || 0,
    total_pages: Math.max(1, Number(response.total_pages) || 1),
  };
}

async function loadAll(module, options = {}) {
  const records = [];
  let page = 1;
  let pages = 1;
  do {
     
    const response = await loadPage(module, { ...options, per_page: 200, page });
    records.push(...response.records);
    pages = response.total_pages;
    page += 1;
  } while (page <= pages);
  return records;
}

export const fetchAdminQuestions = () => loadAll(QUESTION_MODULE, { order_dir: "ASC" });

/** Requests matching an email search and submission dates ("YYYY-MM-DD"), with their replies. */
export async function fetchAdminRequests({ search, from, to } = {}) {
  const records = await loadAll(INCREMENT_MODULE, {
    ...(search ? { search, search_fields: ["name"] } : {}),
    ...(from || to ? { date_range: "custom", date_field: "date_entered", date_from: from, date_to: to } : {}),
  });
  const ids = records.map((record) => clean(record.id)).filter(Boolean);
  const requestIds = new Set(ids);
  const replies = [];
  // Bounded ID batches; never send an empty IN filter (the gateway ignores it).
  for (let offset = 0; offset < ids.length; offset += 200) {
     
    const batch = await loadAll(REPLY_MODULE, {
      filters: { increment_id: { in: ids.slice(offset, offset + 200) } },
      fields: ["id", "increment_id", "question_id", "description"],
    });
    replies.push(...batch.filter((reply) => requestIds.has(clean(reply.increment_id))));
  }
  return { records, replies };
}

/** Newest first: the gateway filters on the employee email. */
export const fetchAdminRequestsByEmail = (email) => {
  if (!email) throw new Error("An employee email is required.");
  return loadAll(INCREMENT_MODULE, { filters: { name: email } });
};

export const fetchAdminReplies = (id) => {
  if (!id) throw new Error("Select an increment request first.");
  return loadAll(REPLY_MODULE, { filters: { increment_id: id }, order_dir: "ASC" });
};

export async function fetchAdminRequest(id) {
  if (!id) throw new Error("An increment ID is required.");
  const response = await loadPage(INCREMENT_MODULE, { filters: { id }, per_page: 1 });
  const record = response.records.find((item) => item.id === id);
  if (!record) throw new Error("This request is no longer available. Return to the request list and refresh.");
  return record;
}

/** Create or update a question, then read it back to confirm the gateway kept the values. */
export async function saveAdminQuestion(id, { name, description }) {
  if (!clean(name) || !clean(description)) throw new Error("Enter a title and question text.");
  const data = { name: clean(name), description: clean(description) };
  const result = assertResponse(
    await gateway({ action: id ? "update" : "create", module: QUESTION_MODULE, ...(id ? { id } : {}), data }),
    "The changes could not be saved.",
  );
  if (!result.id || (id && clean(result.id) !== clean(id))) throw new Error("The gateway did not confirm the saved record. Refresh before retrying.");
  const verified = await loadPage(QUESTION_MODULE, { filters: { id: result.id }, per_page: 1 });
  const record = verified.records.find((item) => clean(item.id) === clean(result.id));
  if (!record || Object.entries(data).some(([key, value]) => clean(record[key]) !== clean(value))) {
    throw new Error("The gateway saved a different result. Refresh and review the record before retrying.");
  }
  return record;
}

export function numericAmount(value) {
  const text = clean(value).replace(/,/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export const requestedAnnualSalary = (record) => numericAmount(record.description);

export function requestIdentity(record) {
  const email = clean(record.name);
  const displayName = [record.first_name, record.last_name].map(clean).filter(Boolean).join(" ");
  return { email: email.includes("@") ? email : "", name: displayName || (email.includes("@") ? email : "Employee email unavailable") };
}

export function answerProgress(questions, replies, incrementId) {
  const questionIds = new Set(questions.map((question) => clean(question.id)));
  const answered = new Set(
    replies
      .filter((reply) => clean(reply.increment_id) === clean(incrementId) && clean(reply.description) && questionIds.has(clean(reply.question_id)))
      .map((reply) => clean(reply.question_id)),
  ).size;
  return { answered, total: questionIds.size, complete: questionIds.size > 0 && answered === questionIds.size };
}

export function requestOverview(records, questions, replies) {
  const questionIds = new Set(questions.map((question) => clean(question.id)));
  const answersByRequest = new Map();
  for (const reply of replies) {
    if (!clean(reply.description) || !questionIds.has(clean(reply.question_id))) continue;
    const id = clean(reply.increment_id);
    if (!answersByRequest.has(id)) answersByRequest.set(id, new Set());
    answersByRequest.get(id).add(clean(reply.question_id));
  }
  const rows = records.map((record) => {
    const answered = answersByRequest.get(clean(record.id))?.size || 0;
    return { record, progress: { answered, total: questionIds.size, complete: questionIds.size > 0 && answered === questionIds.size } };
  });
  const complete = rows.filter((row) => row.progress.complete).length;
  return { rows, total: rows.length, complete, awaiting: rows.length - complete };
}

export function filterRequestRows(rows, completion) {
  if (completion === "complete") return rows.filter((row) => row.progress.complete);
  if (completion === "awaiting") return rows.filter((row) => !row.progress.complete);
  return rows;
}

/** Replies grouped under each question; replies to removed questions get a "missing" group. */
export function groupAnswers(questions, replies, incrementId) {
  const groups = new Map(questions.map((question) => [clean(question.id), { id: clean(question.id), question, replies: [], missing: false }]));
  for (const reply of replies) {
    if (clean(reply.increment_id) !== clean(incrementId)) continue;
    const key = clean(reply.question_id);
    if (!groups.has(key)) groups.set(key, { id: key, question: null, replies: [], missing: true });
    groups.get(key).replies.push(reply);
  }
  return [...groups.values()];
}
