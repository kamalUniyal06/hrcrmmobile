// Admin data: candidates, employees, interviews, resignations, stats.
// Web sources: pages/candidates/candidatesApi.js + candidateList.js, pages/employees/employeesApi.js,
// pages/interviews/interviewUtils.js, employement/api/resignation.api.js.
import { gateway } from "../services/api";
import { activeRecords, assertSuccess, clean, fetchAllPages, lower, plainText, totalPagesOf } from "../utils/records";
import { interviewDate } from "../utils/dates";

export const candidatePageSize = 20;

// Same columns the web searches (candidateList.js candidateSearchFields).
export const candidateSearchFields = ["first_name", "last_name", "phone_mobile", "current_designation", "title", "department"];

/**
 * Web buildCandidateListRequest: assigned, non-employee candidates, newest first, 20 per page.
 * An email is matched exactly through `email1` (it isn't a searchable column); other text goes
 * to the gateway search. The shortlist request carries no search, like the web.
 */
export function buildCandidateListRequest({ page = 1, orderBy = "date_entered", orderDir = "DESC", shortlistedOnly = false, search = "" } = {}) {
  const term = clean(search);
  return {
    action: "fetch",
    module: "hrc_candidates",
    filters: {
      employee: 0,
      ...(shortlistedOnly
        ? { hrc_stages_id_c_name: "Shortlisted" }
        : {
            hrc_stages_id_c: { nin: ["", "Unassigned"] },
            hrc_phase_id: { nin: ["", "Unassigned"] },
            hrc_status_id_c: { nin: ["", "Unassigned"] },
            ...(term.includes("@") ? { email1: term } : {}),
          }),
    },
    ...(!shortlistedOnly && term && !term.includes("@") ? { search: term, search_fields: candidateSearchFields } : {}),
    order_by: orderBy,
    order_dir: orderDir,
    page,
    per_page: candidatePageSize,
  };
}

export async function fetchCandidatePage(options) {
  const body = buildCandidateListRequest(options);
  const response = assertSuccess(await gateway(body), "Could not load candidates. Please retry.");
  if (!Array.isArray(response.records)) throw new Error("Could not load candidates. Please retry.");
  const total = Number(response.total ?? response.total_records ?? response.pagination?.total) || response.records.length;
  return { records: response.records.filter((r) => String(r.deleted) !== "1"), total, page: Number(response.page) || body.page, pages: totalPagesOf(response, candidatePageSize) };
}

/**
 * Every candidate added between two "YYYY-MM-DD" days, with the "All" list's filters so counts match
 * (web: homeDashboard.queries useCandidatesForRange → fetchAllRecords, 100 per page).
 */
export const fetchCandidatesForRange = async ({ from, to }) =>
  (await fetchAllPages(gateway, {
    action: "fetch",
    module: "hrc_candidates",
    date_range: "custom",
    date_field: "date_entered",
    date_from: `${from} 00:00:00`,
    date_to: `${to} 23:59:59`,
    filters: buildCandidateListRequest().filters,
  })).records;

export async function fetchCandidateRecord(id) {
  const response = assertSuccess(
    await gateway({ action: "fetch", module: "hrc_candidates", filters: { id }, page: 1, per_page: 1 }),
    "Could not load candidate details.",
  );
  const record = (response.records || []).find((r) => r.id === id);
  if (!record) throw new Error("This candidate is no longer available. Refresh the list.");
  return record;
}

// CRM text can arrive as (escaped) HTML, so everything shown is converted to plain text.
export const candidateName = (record) =>
  plainText([record.first_name, record.last_name].filter(Boolean).join(" ") || record.full_name || record.name) || "Unnamed candidate";

export const candidateStage = (record) => plainText(record.hrc_stages_id_c_name || record.stage_name || record.stage) || "Unassigned";
export const candidatePhase = (record) => plainText(record.hrc_phase_id_name || record.hrc_phase_name || record.phase_name || record.phase) || "Unassigned";
export const candidateStatus = (record) => plainText(record.hrc_status_id_c_name || record.status_name || record.status) || "Unassigned";

export async function fetchCandidateInterviews(candidateId) {
  const { records } = await fetchAllPages(gateway, { action: "fetch_related", module: "hrc_candidates", id: candidateId, related_module: "hrc_interviews" }, { perPage: 20 });
  return records;
}

export async function updateCandidateRecord(id, data) {
  if (!id) throw new Error("A candidate ID is required to save changes.");
  return assertSuccess(await gateway({ action: "update", module: "hrc_candidates", id, data }), "Could not save candidate.");
}

// ─── Employees ────────────────────────────────────────────────────────────────

export const fetchEmployees = async () => (await fetchAllPages(gateway, { action: "fetch", module: "hrc_employees" })).records;

export async function fetchEmployee(id) {
  const response = assertSuccess(
    await gateway({ action: "fetch", module: "hrc_employees", filters: { id }, page: 1, per_page: 1 }),
    "Employee unavailable. Refresh the directory and try again.",
  );
  const record = activeRecords(response).find((item) => item.id === id);
  if (!record) throw new Error("Employee unavailable. Refresh the directory and try again.");
  return record;
}

/** Create (no id) or update an employee. Web: employeesApi.saveEmployee. */
export async function saveEmployee(id, data) {
  const response = await gateway({ action: id ? "update" : "create", module: "hrc_employees", ...(id ? { id } : {}), data });
  if (response?.success !== true) throw new Error(response?.message || response?.error || "Could not save employee. Please retry.");
  return response;
}

export const employeeDepartment = (record) => clean(record.department) || clean(record.hrc_departments_hrc_employees_1_name);
export const employeePhone = (record) => clean(record.phone_mobile) || clean(record.phone_work);
export const employeeDesignation = (record) => clean(record.current_designation) || clean(record.title);

/** Stored joining dates are DD/MM/YYYY; returns "YYYY-MM-DD" (or the first 10 characters as stored). */
export function employeeDate(value = "") {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : text.slice(0, 10);
}

/** Time since joining, e.g. "2y 3m"; empty for missing or future dates. */
export function tenure(value) {
  const match = employeeDate(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const now = new Date();
  let months = (now.getFullYear() - Number(match[1])) * 12 + now.getMonth() - (Number(match[2]) - 1);
  if (now.getDate() < Number(match[3])) months -= 1;
  if (months < 0) return "";
  if (months < 1) return "New joiner";
  const years = Math.floor(months / 12);
  return [years && `${years}y`, months % 12 && `${months % 12}m`].filter(Boolean).join(" ");
}

export const isExEmployee = (employee) => clean(employee.stage_id_name) === "Ex Employee" && clean(employee.hrc_phase_id_name) === "Exit";

// ─── Interviews (board) ───────────────────────────────────────────────────────

export const roundName = (record) => plainText(record.description).replace(/\s+/g, " ") || "Unspecified round";
export const hasOutcome = (record) => ["pass", "passed", "fail", "failed"].includes(lower(record.interview_status));
export const isPassed = (record) => /^(pass|passed)$/i.test(clean(record.interview_status));
const candidateIdOf = (record) => clean(record.candidate_id) || clean(record.hrc_candidates_hrc_interviews_1hrc_candidates_ida);
const identity = (record) => candidateIdOf(record) || lower(record.email);
const interviewKey = (record) => JSON.stringify([identity(record) || clean(record.id), clean(record.job_id), lower(roundName(record))]);

export const fetchInterviews = async () => (await fetchAllPages(gateway, { action: "fetch", module: "hrc_interviews" })).records;

export function uniqueInterviews(records) {
  const unique = new Map();
  const modified = (item) => interviewDate(item.date_modified)?.getTime() || interviewDate(item.date_entered)?.getTime() || 0;
  for (const record of records) {
    if (String(record.deleted) === "1") continue;
    const key = identity(record) ? interviewKey(record) : `record:${record.id}`;
    const previous = unique.get(key);
    if (!previous || modified(record) > modified(previous)) unique.set(key, record);
  }
  return [...unique.values()];
}

export const PIPELINE_ROUNDS = ["Round 1", "Round 2", "Round 3"];

/** Board groups by round, passed rounds removed, pipeline rounds always present. */
export function groupInterviews(records) {
  const groups = new Map();
  for (const record of uniqueInterviews(records)) {
    if (isPassed(record)) continue;
    const name = roundName(record);
    const key = lower(name);
    if (!groups.has(key)) groups.set(key, { key, name, records: [] });
    groups.get(key).records.push(record);
  }
  for (const name of PIPELINE_ROUNDS) if (!groups.has(lower(name))) groups.set(lower(name), { key: lower(name), name, records: [] });
  const rank = (group) => {
    const index = PIPELINE_ROUNDS.findIndex((name) => lower(name) === group.key);
    return index < 0 ? PIPELINE_ROUNDS.length : index;
  };
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export function boardState(record, now = Date.now()) {
  if (hasOutcome(record)) return "decided";
  const date = interviewDate(record.interview_datetime);
  if (!date) return "unscheduled";
  return date.getTime() < now ? "due" : "upcoming";
}

export async function updateInterview(id, data) {
  if (!id) throw new Error("An interview ID is required.");
  return assertSuccess(await gateway({ action: "update", module: "hrc_interviews", id, data }), "Could not save the interview.");
}

export async function createInterview(data) {
  return assertSuccess(await gateway({ action: "create", module: "hrc_interviews", data }), "Could not save the interview.");
}

// ─── Resignations ─────────────────────────────────────────────────────────────

export const fetchResignations = async () => (await fetchAllPages(gateway, { action: "fetch", module: "hrc_resignation", filters: {} })).records;

// ─── Stats (get_stats) ────────────────────────────────────────────────────────

export async function fetchStats(queries) {
  const response = assertSuccess(await gateway({ action: "get_stats", queries }), "Could not load statistics.");
  const stats = response.stats || response.data || response.results || {};
  const read = (key) => {
    const entry = Array.isArray(stats) ? stats.find((item) => item.key === key) : stats[key];
    const count = entry && typeof entry === "object" ? entry.count ?? entry.total ?? entry.value : entry;
    return Number(count) || 0;
  };
  return Object.fromEntries(queries.map((query) => [query.key, read(query.key)]));
}
