// Admin data: candidates, employees, interviews, resignations, stats.
// Web sources: pages/candidates/candidatesApi.js + candidateList.js, pages/employees/employeesApi.js,
// pages/interviews/interviewUtils.js, employement/api/resignation.api.js.
import { gateway } from "../services/api";
import { activeRecords, assertSuccess, clean, fetchAllPages, lower, plainText, totalPagesOf } from "../utils/records";
import { interviewDate } from "../utils/dates";

export const candidatePageSize = 20;

// Same columns the web searches (candidateList.js candidateSearchFields).
export const candidateSearchFields = ["first_name", "last_name", "phone_mobile", "current_designation", "title", "department"];

// Workflow lookups and candidate columns (web candidatesApi.js workflowModules / workflowFields,
// candidateList.js workflowFilterFields). Filters send the option ID; sorting uses the plain field.
export const workflowModules = { stage: "hrc_stages", phase: "hrc_phases", status: "hrc_status" };
export const workflowFields = { stage: "stage", phase: "hrc_phase_name", status: "status" };
export const workflowFilterFields = { stage: "hrc_stages_id_c", phase: "hrc_phase_id", status: "hrc_status_id_c" };

/**
 * Web buildCandidateListRequest: assigned, non-employee candidates, newest first, 20 per page.
 * An email is matched exactly through `email1` (it isn't a searchable column); other text goes
 * to the gateway search. A chosen stage/phase/status ID replaces that column's "assigned" exclusion.
 * `dateRange` is { fromDate, toDate, fromTime?, toTime? } on date_entered. The shortlist request
 * carries no search or workflow filters, like the web (it is narrowed on the phone).
 */
export function buildCandidateListRequest({
  page = 1,
  perPage = candidatePageSize,
  orderBy = "date_entered",
  orderDir = "DESC",
  shortlistedOnly = false,
  dateRange = null,
  search = "",
  workflow = {},
  source = "",
} = {}) {
  const term = clean(search);
  return {
    action: "fetch",
    module: "hrc_candidates",
    filters: {
      employee: 0,
      ...(shortlistedOnly
        ? { hrc_stages_id_c_name: "Shortlisted" }
        : {
            ...Object.fromEntries(Object.entries(workflowFilterFields).map(([kind, field]) => [field, clean(workflow?.[kind]) || { nin: ["", "Unassigned"] }])),
            ...(clean(source) ? { candidate_source: clean(source) } : {}),
            ...(term.includes("@") ? { email1: term } : {}),
          }),
    },
    ...(!shortlistedOnly && term && !term.includes("@") ? { search: term, search_fields: candidateSearchFields } : {}),
    order_by: orderBy,
    order_dir: orderDir,
    ...(dateRange?.fromDate && dateRange?.toDate
      ? {
          date_range: "custom",
          date_field: "date_entered",
          date_from: `${dateRange.fromDate} ${dateRange.fromTime || "00:00"}:00`,
          date_to: `${dateRange.toDate} ${dateRange.toTime || "23:59"}:59`,
        }
      : {}),
    page,
    per_page: perPage,
  };
}

export async function fetchCandidatePage(options) {
  const body = buildCandidateListRequest(options);
  const response = assertSuccess(await gateway(body), "Could not load candidates. Please retry.");
  if (!Array.isArray(response.records)) throw new Error("Could not load candidates. Please retry.");
  const total = Number(response.total ?? response.total_records ?? response.pagination?.total) || response.records.length;
  return {
    records: response.records.filter((r) => String(r.deleted) !== "1"),
    total,
    page: Number(response.page) || body.page,
    pages: totalPagesOf(response, body.per_page),
    dropdownLists: response.dropdown_lists || {},
  };
}

/**
 * The whole shortlist for a period (web loadShortlistSource), 20 per page. Anyone who is an
 * employee or not actually Shortlisted means the server filter misbehaved, so the list is refused.
 */
export async function fetchShortlist({ dateRange = null } = {}) {
  const body = buildCandidateListRequest({ shortlistedOnly: true, dateRange });
  delete body.page; // fetchAllPages pages through on its own
  delete body.per_page;
  const { records } = await fetchAllPages(gateway, body, { perPage: candidatePageSize });
  if (records.some((record) => !(record.employee === false || clean(record.employee) === "0") || lower(record.hrc_stages_id_c_name) !== "shortlisted")) {
    throw new Error("The shortlist includes ineligible candidates. Please refresh or contact your administrator.");
  }
  return records;
}

/** Every option of a workflow lookup (hrc_stages / hrc_phases / hrc_status), named and sorted. */
export async function fetchWorkflowOptions(kind) {
  const { records } = await fetchAllPages(gateway, { action: "fetch", module: workflowModules[kind] });
  return records.filter((item) => item.id && item.name).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

const hasOwn = (record, key) => Object.prototype.hasOwnProperty.call(record || {}, key);

/** The candidate column holding a workflow value: a returned foreign key first, else the web's plain field. */
export function workflowField(record, kind) {
  const module = workflowModules[kind];
  const keys = [`${kind}_id`, `${kind}_id_c`, `hrc_${kind}_id_c`, `hrc_${kind}_id`, `${module}_id_c`, `${module}_id`];
  const key = keys.find((item) => hasOwn(record, item)) || Object.keys(record || {}).find((item) => item.startsWith(`${module}_`) && /ida$|idb$/.test(item));
  return key || workflowFields[kind];
}

/** Display name of a candidate's stage / phase / status (web workflowValue). */
export function workflowValue(record, kind, options = []) {
  const key = workflowField(record, kind);
  const raw = key ? clean(record[key]) : "";
  if (key && !raw) return "Unassigned";
  const option = (options || []).find((item) => String(item.id) === raw || item.name === raw);
  return plainText(option?.name || record[`${key}_name`] || record[workflowFields[kind]] || record[`${kind}_name`] || raw) || "Unassigned";
}

/** What to store for an option: its ID when the column holds IDs, otherwise its name. */
export function optionValue(record, kind, option, options = []) {
  const key = workflowField(record, kind);
  const current = clean(record[key]);
  return /id/.test(key || "") || (current && options.some((item) => String(item.id) === current)) ? String(option.id) : option.name;
}

/** Update payload that moves a candidate to the named stage / phase / status (web workflowUpdate). */
export function workflowUpdate(record, kind, name, options = []) {
  const key = workflowField(record, kind);
  const option = (options || []).find((item) => lower(plainText(item.name)) === lower(name));
  if (option) return { [key]: optionValue(record, kind, option, options) };
  if (/id/.test(key) || (options || []).some((item) => String(item.id) === String(record[key]))) {
    throw new Error(`The ${name} ${kind} is unavailable. Please configure it in the CRM and refresh.`);
  }
  return { [key]: name };
}

export const isRejected = (candidate, statusOptions) => lower(workflowValue(candidate, "status", statusOptions)) === "rejected";

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
  if (!Object.keys(data || {}).length) return undefined;
  return assertSuccess(await gateway({ action: "update", module: "hrc_candidates", id, data }), "Could not save candidate. Your changes are still available; please retry.");
}

/** Move a candidate to a stage or status by name (web CandidatesPage changeWorkflow). Returns the saved fields. */
export async function changeCandidateWorkflow(record, kind, name, options = []) {
  const data = workflowUpdate(record, kind, name, options);
  await updateCandidateRecord(record.id, data);
  return data;
}

/** Only the fields that differ from the loaded record (web CandidateDetails save). */
export function changedFields(original, draft) {
  return Object.fromEntries(Object.keys(draft).filter((key) => (draft[key] ?? "") !== (original[key] ?? "")).map((key) => [key, draft[key]]));
}

/** Web ScheduleInterviewDialog: interviews scheduled from a candidate always start the pipeline. */
export const FIRST_ROUND = "Round 1";

/** A future Date as the gateway's UTC "YYYY-MM-DD HH:mm:ss" (web: toISOString on the datetime-local value). */
export function gatewayDateTime(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime()) || date <= new Date()) throw new Error("Choose an interview date and time in the future.");
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Web ScheduleInterviewDialog save: re-reads the candidate, refuses rejected candidates, checks the
 * "Scheduled" status exists, creates Round 1 (unless `interviewCreated` from an earlier attempt) and
 * then sets the candidate's status to Scheduled. `onCreated` runs once the interview exists, so a
 * failed status update can be retried without creating a second interview.
 * `draft` = { name, email, when: Date, notes, job_id }.
 */
export async function scheduleInterview({ candidate, draft, statusOptions = [], interviewCreated = false, onCreated }) {
  const fresh = await fetchCandidateRecord(candidate.id);
  if (isRejected(fresh, statusOptions)) throw new Error("Rejected candidates cannot be scheduled.");
  const status = workflowUpdate(fresh, "status", "Scheduled", statusOptions);
  if (!interviewCreated) {
    const name = candidateName(candidate);
    const jobId = clean(draft.job_id);
    const existing = await fetchInterviews();
    const planned = { ...draft, description: FIRST_ROUND, candidate_id: candidate.id, job_id: jobId };
    if (existing.some((item) => interviewKey(item) === interviewKey(planned))) throw new Error(`${name} already has a ${FIRST_ROUND} interview. Reschedule it from Interviews.`);
    if (!clean(draft.name) || !clean(draft.email)) throw new Error("Enter a candidate name and email.");
    const interview_datetime = gatewayDateTime(draft.when);
    await createInterview({
      name: clean(draft.name),
      email: clean(draft.email),
      interview_datetime,
      interview_feedback: clean(draft.notes),
      job_id: jobId,
      description: FIRST_ROUND,
      candidate_id: candidate.id,
    });
    onCreated?.();
  }
  await updateCandidateRecord(candidate.id, status);
  return status;
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
export const candidateIdOf = (record) => clean(record.candidate_id) || clean(record.hrc_candidates_hrc_interviews_1hrc_candidates_ida);
const identity = (record) => candidateIdOf(record) || lower(record.email);
export const interviewKey = (record) => JSON.stringify([identity(record) || clean(record.id), clean(record.job_id), lower(roundName(record))]);

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

// Passing the last pipeline round selects the candidate: only their stage moves (to Joining), their status stays.
export const HIRED_WORKFLOW = { stage: "Joining" };
export const isFinalRound = (record) => lower(roundName(record)) === lower(PIPELINE_ROUNDS[PIPELINE_ROUNDS.length - 1]);
export const isSelected = (record) => Boolean(record) && isPassed(record) && isFinalRound(record);

/** Passing a pipeline round opens the next one; the last pipeline round and custom rounds end there. */
export function nextPipelineRound(record) {
  const match = roundName(record).match(/^round\s+(\d+)$/i);
  const next = match ? `Round ${Number(match[1]) + 1}` : "";
  return PIPELINE_ROUNDS.find((name) => lower(name) === lower(next)) || "";
}

/** Board groups by round, pipeline rounds always present. Passed rounds leave the board, except the
 *  final round, which stays to show who was selected (web groupInterviews). */
export function groupInterviews(records) {
  const groups = new Map();
  for (const record of uniqueInterviews(records)) {
    if (isPassed(record) && !isFinalRound(record)) continue;
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

// Board states, most urgent first. Only a passed final round stays on the board ("selected"), so "decided" means failed.
export const BOARD_STATES = ["due", "upcoming", "unscheduled", "selected", "decided"];

export function boardState(record, now = Date.now()) {
  if (isSelected(record)) return "selected";
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

export async function fetchInterviewRecord(id) {
  const response = await gateway({ action: "fetch", module: "hrc_interviews", filters: { id }, page: 1, per_page: 1 });
  const record = response?.records?.find((item) => String(item.id) === String(id) && String(item.deleted) !== "1");
  if (response?.success !== true || !record) throw new Error(response?.message || "This interview is no longer available. Refresh and try again.");
  return record;
}

/** The candidate an interview belongs to: by linked ID, else by a unique email match (web findInterviewCandidate). */
export function findInterviewCandidate(record, candidates = []) {
  const id = candidateIdOf(record);
  if (id) return candidates.find((candidate) => clean(candidate.id) === id) || null;
  const email = lower(record.email);
  const matches = email ? candidates.filter((candidate) => lower(candidate.email1 || candidate.email) === email) : [];
  return matches.length === 1 ? matches[0] : null;
}

// Fields compared before saving, so a decision never overwrites someone else's change (web InterviewActionDialog).
const WATCHED_FIELDS = ["date_modified", "interview_status", "interview_datetime", "interview_feedback", "description", "job_id", "candidate_id"];

/** Re-reads the interview and refuses to continue if it changed since `record` was loaded. */
async function freshInterview(record) {
  const fresh = await fetchInterviewRecord(record.id);
  if (WATCHED_FIELDS.some((field) => clean(fresh[field]) !== clean(record[field]))) {
    throw new Error("This interview changed since you opened it. Close this and refresh before saving.");
  }
  return fresh;
}

/** Fields for the next round's interview (web nextRoundData). */
export function nextRoundData(record, description) {
  if (!identity(record)) throw new Error("A candidate ID or email is required to create the next round.");
  if (!clean(description) || lower(roundName({ description })) === lower(roundName(record))) throw new Error("Enter a different name for the next round.");
  return {
    name: record.name || "",
    email: record.email || "",
    candidate_id: candidateIdOf(record),
    job_id: clean(record.job_id),
    assigned_user_id: clean(record.assigned_user_id),
    description: roundName({ description }),
    interview_datetime: "",
    interview_status: "",
    interview_feedback: "",
  };
}

/**
 * Web passToNextRound: create the next round first so a failed create never hides the current one;
 * on retry, an existing next-round record is reused.
 */
async function passToNextRound(record, feedback, description) {
  const data = nextRoundData(record, description);
  const target = uniqueInterviews(await fetchInterviews()).find((item) => interviewKey(item) === interviewKey(data));
  if (target && hasOutcome(target)) throw new Error(`This candidate has already completed ${data.description}. Choose another round.`);
  if (!target) await createInterview(data);
  await updateInterview(record.id, { interview_status: "Pass", interview_feedback: clean(feedback) });
}

/** The candidate's Joining-stage update for a passed final round, built before anything is written. */
async function hiringUpdate(interview) {
  const id = candidateIdOf(interview) || findInterviewCandidate(interview, (await fetchAllPages(gateway, { action: "fetch", module: "hrc_candidates" })).records)?.id;
  if (!id) throw new Error("This interview isn't linked to a candidate, so they can't be moved to Joining. Add the candidate before passing the final round.");
  const [candidate, stages] = await Promise.all([fetchCandidateRecord(id), fetchWorkflowOptions("stage")]);
  return { id, data: workflowUpdate(candidate, "stage", HIRED_WORKFLOW.stage, stages) };
}

/**
 * Pass or fail a round (web InterviewActionDialog). Feedback is required. Passing Round 1/2 opens the
 * next round; passing the final round also moves the candidate to the Joining stage (status unchanged).
 * Returns { outcome, nextRound, hired }.
 */
export async function decideInterview({ record, outcome, feedback }) {
  if (!["Pass", "Fail"].includes(outcome)) throw new Error("Choose pass or fail.");
  const fresh = await freshInterview(record);
  if (!clean(feedback)) throw new Error("Interview feedback is required for both pass and fail.");
  const nextRound = outcome === "Pass" ? nextPipelineRound(fresh) : "";
  const hired = outcome === "Pass" && !nextRound && isFinalRound(fresh);
  if (hired) {
    const hire = await hiringUpdate(fresh);
    await updateCandidateRecord(hire.id, hire.data);
  }
  if (nextRound) await passToNextRound(fresh, feedback, nextRound);
  else await updateInterview(fresh.id, { interview_status: outcome, interview_feedback: clean(feedback) });
  return { outcome, nextRound, hired };
}

/**
 * Set or change a round's date and time (web InterviewActionDialog "schedule"). Completed rounds and
 * rejected candidates are refused. `when` is a local Date; it is saved as UTC.
 */
export async function rescheduleInterview({ record, when, statusOptions = [] }) {
  const fresh = await freshInterview(record);
  if (hasOutcome(fresh)) throw new Error("A completed interview cannot be rescheduled.");
  const id = candidateIdOf(fresh);
  if (id && isRejected(await fetchCandidateRecord(id), statusOptions)) throw new Error("Rejected candidates cannot be scheduled or rescheduled.");
  const data = { interview_datetime: gatewayDateTime(when) };
  await updateInterview(fresh.id, data);
  return data;
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
