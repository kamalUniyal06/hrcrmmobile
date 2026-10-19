// Candidate self-service: profile, related sections, jobs, applications, interviews.
// Web sources: pages/profile/candidateApi.js, pages/jobs/jobsApi.js, pages/interviews/candidateInterviewData.js.
import { gateway } from "../services/api";
import { activeRecords, assertSuccess, clean, createdId, fetchAllPages, isDeleted, lower } from "../utils/records";
import { interviewDate } from "../utils/dates";

export const candidateFields = {
  first_name: "First name",
  last_name: "Last name",
  email1: "Email",
  phone_mobile: "Mobile phone",
  current_designation: "Current designation",
  department: "Department",
  dob: "Date of birth",
  gender: "Gender",
  primary_address_city: "City",
  primary_address_state: "State",
  primary_address_country: "Country",
  linkedin_url: "LinkedIn URL",
  github_url: "GitHub URL",
  description: "About you",
};

export const editableCandidateFields = [
  "first_name", "last_name", "phone_mobile", "current_designation", "department", "dob", "gender",
  "primary_address_city", "primary_address_state", "primary_address_country", "linkedin_url", "github_url", "description",
];

export async function findCandidate(email) {
  if (!email) throw new Error("Your login email is unavailable. Please sign in again.");
  const response = assertSuccess(
    await gateway({ action: "fetch", module: "hrc_candidates", filters: { email1: email }, page: 1, per_page: 20 }),
    "Could not load your candidate profile. Please retry.",
  );
  const records = Array.isArray(response.records) ? response.records : [];
  const record = records.find((item) => lower(item.email1) === lower(email));
  if (records.length && !record) throw new Error("The candidate lookup returned an unexpected email. Please retry.");
  return record || null;
}

export async function saveCandidate(id, draft, email) {
  const data = {};
  for (const key of editableCandidateFields) if (Object.hasOwn(draft, key)) data[key] = clean(draft[key]);
  data.email1 = email;
  if (!id) data.candidate_source = "career_portal";
  const response = assertSuccess(
    await gateway({ action: id ? "update" : "create", module: "hrc_candidates", ...(id ? { id } : {}), data }),
    "Could not save your profile. Please try again.",
  );
  return { ...data, id: id || createdId(response) };
}

export const candidateRelatedModules = { skills: "hrc_skills", experiences: "hrc_experience", education: "hrc_education" };

export async function fetchCandidateRelated(candidateId, section) {
  const related_module = candidateRelatedModules[section];
  if (!candidateId || !related_module) return [];
  const { records } = await fetchAllPages(gateway, { action: "fetch_related", module: "hrc_candidates", id: candidateId, related_module }, { perPage: 20 });
  return records.map((item) => Object.fromEntries(Object.entries(item).map(([k, v]) => [k, v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v)])));
}

/** Profile completeness, the way the candidate dashboard counts it. */
export function needsProfile(candidate) {
  if (!candidate?.id) return true;
  return !clean(candidate.first_name) && !clean(candidate.full_name) && !clean(candidate.name);
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export const candidateRelationship = "hrc_candidates_hrc_job_applications_1hrc_candidates_ida";

export const fetchJobPostings = () => fetchAllPages(gateway, { action: "fetch", module: "hrc_job_postings" }, { perPage: 20 });

export const createJobPosting = async (data) =>
  assertSuccess(await gateway({ action: "create", module: "hrc_job_postings", data }), "Could not create the job posting.");

export function fetchJobApplications(candidateId) {
  if (!candidateId) throw new Error("Save your candidate profile before applying.");
  return fetchAllPages(gateway, { action: "fetch_related", module: "hrc_candidates", id: candidateId, related_module: "hrc_job_applications" }, { perPage: 20 });
}

export async function applyToJob(candidate, jobId) {
  const email = clean(candidate?.email1);
  if (!candidate?.id || !email || !jobId) throw new Error("A saved candidate profile and job ID are required.");
  const existing = await fetchJobApplications(candidate.id);
  if (existing.records.some((record) => clean(record.jobid) === jobId)) return existing.records;
  const data = { name: email, jobid: jobId, status: "applied", [candidateRelationship]: candidate.id };
  const response = assertSuccess(
    await gateway({ action: "create", module: "hrc_job_applications", data }),
    "Could not submit your application. Please retry.",
  );
  return [...existing.records, { ...data, id: createdId(response) || `application-${jobId}` }];
}

const valueOf = (record, keys) => keys.map((key) => record?.[key]).find((v) => (typeof v === "string" && v.trim()) || typeof v === "number");
const numberOf = (value) => {
  const text = clean(value).replace(/,/g, "");
  return text && Number.isFinite(Number(text)) ? Number(text) : null;
};

export const jobTitle = (job) => clean(valueOf(job, ["job_title", "name", "title", "position"])) || "Job posting";
export const jobLocation = (job) =>
  clean(valueOf(job, ["job_location", "location"])) || ["city", "state", "country"].map((key) => clean(job?.[key])).filter(Boolean).join(", ");
export const jobType = (job, dropdowns = {}) => {
  const value = valueOf(job, ["job_type", "employment_type", "type"]);
  if (value === undefined) return "";
  const field = ["job_type", "employment_type", "type"].find((key) => job[key] === value);
  return clean(dropdowns[field]?.[value] || String(value).replace(/_/g, " "));
};
export function experienceRange(job) {
  const min = numberOf(job?.minimum_experience);
  const max = numberOf(job?.maximum_experience);
  const unit = (value) => `${value} year${value === 1 ? "" : "s"}`;
  if (min !== null && max !== null && max > min) return `${min}–${unit(max)}`;
  if (min !== null && min > 0) return `${min}+ years`;
  if (max !== null && max > 0) return `Up to ${unit(max)}`;
  if (min === 0 && (max === null || max === 0)) return "Freshers welcome";
  return clean(valueOf(job, ["experience_required", "experience", "experience_level"]));
}
export function salaryRange(job) {
  const min = numberOf(job?.minimum_salary);
  const max = numberOf(job?.maximum_salary);
  const currency = clean(job?.salary_currency);
  const format = (value) => value.toLocaleString(/^(inr|₹)?$/i.test(currency) ? "en-IN" : "en-US");
  const amount = min !== null && max !== null && max > min ? `${format(min)} – ${format(max)}` : min !== null ? `${format(min)}+` : max !== null ? `Up to ${format(max)}` : "";
  const negotiable = String(job?.salary_negotiable) === "1";
  if (!amount) return clean(valueOf(job, ["salary_range", "salary", "ctc"])) || (negotiable ? "Negotiable" : "");
  return `${currency ? `${currency} ` : ""}${amount}${negotiable ? " (negotiable)" : ""}`;
}
export const jobIsOpen = (job) => !/^(closed|inactive|filled|on[_ ]hold|archived)$/i.test(clean(job?.status));

/** Where an application sits: index 0..3 in Applied → Review → Interview → Decision. */
export function applicationStage(status) {
  const value = lower(status);
  if (/^(accepted|hired|selected|joined|offer)/.test(value)) return { index: 3, tone: "success", label: "Selected", next: "HR will share the next steps with you." };
  if (/^(rejected|withdrawn|declined|not[_ ]selected)/.test(value)) return { index: 3, tone: "closed", label: "Not selected", next: "No further steps." };
  if (/interview/.test(value)) return { index: 2, tone: "progress", label: "Interview", next: "Check My interviews for your schedule." };
  if (/shortlist/.test(value)) return { index: 2, tone: "progress", label: "Shortlisted", next: "Your interview will be scheduled soon." };
  if (/review|screen/.test(value)) return { index: 1, tone: "progress", label: "In review", next: "A recruiter is reviewing your profile." };
  return { index: 1, tone: "progress", label: "Applied", next: "Waiting for recruiter review." };
}

// ─── Interviews ───────────────────────────────────────────────────────────────

const roundName = (record) => clean(record.description).replace(/\s+/g, " ") || "Unspecified round";
const recordCandidateId = (record) => clean(record.candidate_id) || clean(record.hrc_candidates_hrc_interviews_1hrc_candidates_ida);

export function candidateInterviewStatus(record, now = Date.now()) {
  const raw = lower(record.interview_status);
  if (["pass", "passed"].includes(raw)) return { key: "passed", label: "Passed", tone: "success" };
  if (["fail", "failed"].includes(raw)) return { key: "failed", label: "Not selected", tone: "closed" };
  if (["cancelled", "canceled"].includes(raw)) return { key: "cancelled", label: "Cancelled", tone: "neutral" };
  if (raw === "completed") return { key: "completed", label: "Completed", tone: "success" };
  const date = interviewDate(record.interview_datetime);
  if (date) return date.getTime() >= now ? { key: "scheduled", label: "Scheduled", tone: "progress" } : { key: "pending", label: "Awaiting an update", tone: "attention" };
  return { key: "pending", label: "Date to be confirmed", tone: "attention" };
}

/** Interviews through the candidate relationship only, verified against the login email. */
export async function fetchMyInterviews({ candidate, email }) {
  const id = clean(candidate?.id);
  const loginEmail = lower(email);
  if (!id || !loginEmail || lower(candidate?.email1) !== loginEmail) {
    throw new Error("Your candidate profile could not be verified. Refresh your profile and try again.");
  }
  const { records } = await fetchAllPages(gateway, { action: "fetch_related", module: "hrc_candidates", id, related_module: "hrc_interviews" }, { perPage: 20 });
  for (const record of records) {
    const ownerId = recordCandidateId(record);
    const ownerEmail = lower(record.email || record.email1);
    if ((ownerId && ownerId !== id) || (!ownerId && ownerEmail && ownerEmail !== loginEmail)) {
      throw new Error("The interview response did not match your profile. Please refresh and try again.");
    }
  }
  return records
    .sort((a, b) => roundName(a).localeCompare(roundName(b), undefined, { numeric: true, sensitivity: "base" }))
    .map((record) => ({
      id: record.id,
      round: roundName(record),
      scheduledAt: clean(record.interview_datetime),
      status: clean(record.interview_status),
      jobTitle: clean(record.job_name || record.job_title || record.hrc_job_postings_hrc_interviews_1_name),
      location: clean(record.interview_location || record.location),
      meetingUrl: /^https?:\/\//i.test(clean(record.meeting_url || record.meeting_link || record.interview_link)) ? clean(record.meeting_url || record.meeting_link || record.interview_link) : "",
      feedback: clean(record.interview_feedback),
    }));
}

export function nextInterview(interviews = [], now = Date.now()) {
  return (
    interviews
      .map((record) => ({ record, date: interviewDate(record.scheduledAt) }))
      .filter(({ record, date }) => date && candidateInterviewStatus({ interview_status: record.status, interview_datetime: record.scheduledAt }, now).key === "scheduled")
      .sort((a, b) => a.date - b.date)[0] || null
  );
}

/** Candidate-facing hiring stepper from CRM status, applications and interviews. */
export function hiringProgress({ candidate, applications = [], interviews = [] }) {
  const candidateStates = [lower(candidate?.status), lower(candidate?.hrc_stages_id_c_name)];
  const applicationStates = applications.map((record) => lower(record.status));
  const interviewStates = interviews.map((record) => candidateInterviewStatus({ interview_status: record.status, interview_datetime: record.scheduledAt }).key);
  const hired = applicationStates.includes("accepted") || candidateStates.some((s) => ["hired", "selected", "joined", "accepted"].includes(s));
  const declined = !hired && (candidateStates.includes("rejected") || (applicationStates.length > 0 && applicationStates.every((s) => s.startsWith("rejected"))) || interviewStates.at(-1) === "failed");
  const interviewed = interviews.length > 0;
  const shortlisted = interviewed || candidateStates.includes("shortlisted");
  const applied = applications.length > 0 || shortlisted;
  const reached = hired || declined ? 3 : interviewed ? 2 : shortlisted ? 1 : applied || candidate?.id ? 0 : -1;
  const labels = ["Application received", "Shortlisted", "Interview", hired ? "Hired" : declined ? "Not selected" : "Final decision"];
  const steps = labels.map((label, index) => ({
    label,
    state: index > reached ? "upcoming" : index === 3 ? (declined ? "declined" : "done") : index === reached ? "current" : "done",
  }));
  const message = hired
    ? "Congratulations! You have been selected. HR will reach out with the next steps."
    : declined
      ? "This process has closed. Keep your profile updated and explore other open roles."
      : interviewed
        ? "You are in the interview stage. Check your schedule for upcoming rounds."
        : shortlisted
          ? "You have been shortlisted. HR will schedule your interview soon."
          : applied
            ? "Your application is with the hiring team for review."
            : candidate?.id
              ? "Your profile has been received. Apply to an open role to move forward."
              : "Apply to an open role to start your hiring journey.";
  return { steps, message };
}

export { isDeleted, activeRecords };
