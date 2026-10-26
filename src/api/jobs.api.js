// Admin job postings: list, create, delete, plus the display helpers the admin screens share.
// Web sources: pages/jobs/jobsApi.js, pages/jobs/jobFormatting.js, pages/jobs/CreateJobDialog.jsx.
import { gateway } from "../services/api";
import { assertSuccess, clean, plainText, readable } from "../utils/records";
import { createJobPosting, fetchJobPostings, jobTitle } from "./candidate.api";

// Same request bodies (and query key) as the candidate Jobs tab, so both share one cache entry.
export { fetchJobPostings, createJobPosting };
export const jobPostingsKey = ["job-postings"];

export async function deleteJobPosting(id) {
  if (!id) throw new Error("A job posting ID is required.");
  return assertSuccess(await gateway({ action: "delete", module: "hrc_job_postings", id }), "Could not delete the job posting. Please retry.");
}

// ─── Create form ──────────────────────────────────────────────────────────────

/** Form sections in the web dialog's order. */
export const jobFormSections = [
  ["Role details", ["name", "job_title", "job_code", "department", "employment_type", "job_type", "number_of_positions", "job_status"]],
  [
    "Description & requirements",
    ["job_description", "job_responsibilities", "required_skills", "preferred_skills", "qualifications", "education_required", "required_certifications", "required_languages", "other_requirements"],
  ],
  ["Location & experience", ["location", "city", "state", "country", "work_mode", "minimum_experience", "maximum_experience", "notice_period"]],
  ["Compensation", ["minimum_salary", "maximum_salary", "salary_currency", "benefits"]],
  ["Application details", ["opening_date", "closing_date", "job_posting_url", "application_email", "application_instructions"]],
];
export const longJobFields = new Set([
  "job_description", "job_responsibilities", "required_skills", "preferred_skills", "qualifications",
  "required_certifications", "required_languages", "other_requirements", "benefits", "application_instructions",
]);
export const numericJobFields = new Set(["number_of_positions", "minimum_experience", "maximum_experience", "minimum_salary", "maximum_salary"]);
export const requiredJobFields = new Set(["name", "job_title", "job_description"]);
export const emptyJobDraft = () => ({ number_of_positions: "1", job_status: "open", salary_negotiable: "0" });
export const jobFieldLabel = (key) => key.replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase());

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates a draft the way the web dialog does and returns the `data` it sends:
 * trimmed values, blanks dropped, and `description` mirroring `job_description`.
 */
export function buildJobPostingData(draft) {
  const data = Object.fromEntries(
    Object.entries(draft)
      .map(([key, value]) => [key, clean(value)])
      .filter(([, value]) => value !== ""),
  );
  if (!data.name || !data.job_title || !data.job_description) throw new Error("Enter a posting name, job title, and description.");
  for (const key of numericJobFields) {
    if (data[key] !== undefined && !(Number(data[key]) >= (key === "number_of_positions" ? 1 : 0))) {
      throw new Error(`${jobFieldLabel(key)} must be a number${key === "number_of_positions" ? " of at least 1" : ""}.`);
    }
  }
  for (const [min, max, label] of [["minimum_salary", "maximum_salary", "Salary"], ["minimum_experience", "maximum_experience", "Experience"]]) {
    if (data[min] !== undefined && data[max] !== undefined && Number(data[min]) > Number(data[max])) {
      throw new Error(`${label}: maximum must be at least the minimum.`);
    }
  }
  // The web uses <input type="date">; on a phone the dates are typed, so check the format too.
  for (const key of ["opening_date", "closing_date"]) {
    if (data[key] !== undefined && !DATE.test(data[key])) throw new Error(`${jobFieldLabel(key)}: use the format YYYY-MM-DD.`);
  }
  if (data.opening_date && data.closing_date && data.closing_date < data.opening_date) {
    throw new Error("Closing date must be on or after the opening date.");
  }
  return { ...data, description: data.job_description };
}

// ─── Display helpers (jobFormatting.js) ───────────────────────────────────────

export const valueOf = (record, keys) => keys.map((key) => record?.[key]).find((v) => (typeof v === "string" && v.trim()) || typeof v === "number");
export const postingTitle = (job) => plainText(jobTitle(job)) || "Job posting";

/** First filled field of `keys`, shown with its dropdown label (or title-cased when `format`). */
export function fieldLabel(job, keys, dropdowns = {}, format = false) {
  const value = valueOf(job, keys);
  if (value === undefined) return "";
  const field = keys.find((key) => job[key] === value);
  const label = dropdowns[field]?.[value];
  return plainText(label || (format ? readable(value) : value));
}

/** Rich-text lists ("a, b" lines, bullets, <li>) split into items. */
export function requirementItems(value) {
  return plainText(value)
    .split(/\n+|\s+[•●▪]\s*|\s+-\s+/)
    .map((item) => item.replace(/^\s*[-•●▪]\s*/, "").trim())
    .filter(Boolean);
}

// Short phrases read better as chips; full sentences stay as a list.
export const isChipList = (items) => items.length > 0 && items.every((item) => item.length <= 48 && !/\.$/.test(item));

/** Posting status chip: label from the CRM dropdown, tone from the value. */
export function postingStatus(job, dropdowns = {}) {
  const label = fieldLabel(job, ["job_status"], dropdowns, true);
  if (!label) return null;
  const value = clean(job.job_status).toLowerCase();
  const tone = /^(open|active|published)/.test(value) ? "success" : /^(closed|filled|cancel|archiv|inactive)/.test(value) ? "closed" : /hold|draft/.test(value) ? "attention" : "neutral";
  return { label, tone };
}
