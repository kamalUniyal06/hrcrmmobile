// Recruitment helpers shared by the candidate and interview screens.
// Web sources: pages/profile/resumeSections.js, pages/candidates/candidateView.js and CandidatesPage.jsx,
// pages/interviews/interviewUtils.js (localInterviewTime).
import { candidateIdOf, candidateName, hasOutcome, roundName, uniqueInterviews, workflowValue } from "../api/admin.api";
import { dateKey, formatClock, interviewDate, monthRange, parseActivityTime } from "./dates";
import { clean, lower, plainText } from "./records";

/* ── Resume "about" (the description column) ───────────────────────────── */

const SECTION_KEYS = ["experiences", "education", "skills"];

function normalizeResumeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => item !== null && item !== undefined).map((item) => {
    if (typeof item !== "object" || Array.isArray(item)) return { details: String(item) };
    return Object.fromEntries(Object.entries(item).map(([key, value]) => [key, value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value)]));
  });
}

/** The description holds the readable "about" plus parsed-resume sections (JSON, or the older text format). */
export function readResumeSections(description = "") {
  const sections = { education: [], experiences: [], skills: [] };
  try {
    const data = JSON.parse(description);
    if (data?.content?.candidate && typeof data.content.candidate === "object" && !Array.isArray(data.content.candidate)) {
      for (const key of SECTION_KEYS) sections[key] = normalizeResumeItems(data.content[key]);
      const about = typeof data.content.candidate.description === "string" ? data.content.candidate.description : data.content.candidate.summary;
      return { about: typeof about === "string" ? about : "", sections };
    }
    if (data && typeof data === "object" && !Array.isArray(data) && (SECTION_KEYS.some((key) => Array.isArray(data[key])) || typeof data.about === "string")) {
      for (const key of SECTION_KEYS) sections[key] = normalizeResumeItems(data[key]);
      return { about: typeof data.about === "string" ? data.about : "", sections };
    }
  } catch {
    // Plain text and legacy section headings are read below.
  }
  const parts = String(description ?? "").split(/(?:^|\n\n)(EDUCATION|EXPERIENCES|SKILLS)\r?\n/);
  for (let index = 1; index < parts.length; index += 2) {
    sections[parts[index].toLowerCase()] = parts[index + 1].trim().split(/\n\n/).filter(Boolean).flatMap((block) => {
      // Older profiles stored one entry per line with inline field separators.
      const entries = / · | � /.test(block) ? block.split("\n") : [block];
      return entries.map((entry) => {
        const values = {};
        let previous = "";
        for (const line of entry.split(/\n| · | � /)) {
          const field = line.match(/^([a-zA-Z][\w ]*):\s?(.*)$/);
          if (field) {
            previous = field[1].replace(/ /g, "_");
            values[previous] = field[2];
          } else if (previous) values[previous] += `\n${line.startsWith("  ") ? line.slice(2) : line}`;
          else {
            previous = "details";
            values.details = line;
          }
        }
        return values;
      });
    });
  }
  return { about: parts[0].trim(), sections };
}

/** Replace the readable introduction and keep any resume data stored alongside it (web updateResumeAbout). */
export function updateResumeAbout(description, about) {
  try {
    const data = JSON.parse(description);
    if (data?.content?.candidate && typeof data.content.candidate === "object" && !Array.isArray(data.content.candidate)) {
      data.content.candidate.description = about;
      return JSON.stringify(data, null, 2);
    }
    if (data && typeof data === "object" && !Array.isArray(data) && (SECTION_KEYS.some((key) => Array.isArray(data[key])) || typeof data.about === "string")) {
      return JSON.stringify({ ...data, about }, null, 2);
    }
  } catch {
    // Older text format: rewritten as JSON below when it carries sections.
  }
  const { sections } = readResumeSections(description);
  return SECTION_KEYS.some((key) => sections[key].length)
    ? JSON.stringify({ about: about || "", ...Object.fromEntries(SECTION_KEYS.map((key) => [key, normalizeResumeItems(sections[key])])) }, null, 2)
    : about;
}

/* ── Candidate profile form (web CandidateDetails groups / candidateFields) ── */

export const CANDIDATE_FIELD_GROUPS = [
  ["Personal & contact", [["first_name", "First name"], ["last_name", "Last name"], ["email1", "Email"], ["phone_mobile", "Mobile phone"], ["dob", "Date of birth"], ["gender", "Gender"]]],
  ["Professional background", [["current_designation", "Current designation"], ["title", "Title"], ["department", "Department"], ["linkedin_url", "LinkedIn URL"], ["github_url", "GitHub URL"]]],
  ["Location", [["primary_address_street", "Street address"], ["primary_address_city", "City"], ["primary_address_state", "State"], ["primary_address_postalcode", "Postal code"], ["primary_address_country", "Country"]]],
];

/* ── Interview date & time ─────────────────────────────────────────────── */

const pad = (value) => String(value).padStart(2, "0");

/** Quarter-hour slots for interview pickers: value "HH:mm", label "09:30 AM". */
export const INTERVIEW_TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => ({ value: `${pad(Math.floor(index / 4))}:${pad((index % 4) * 15)}`, label: formatClock(index * 15) }));

/** Time options that also include `current` when it is off the quarter-hour grid. */
export function timeOptionsWith(current) {
  if (!current || INTERVIEW_TIME_OPTIONS.some((option) => option.value === current)) return INTERVIEW_TIME_OPTIONS;
  const [hour, minute] = current.split(":").map(Number);
  return [...INTERVIEW_TIME_OPTIONS, { value: current, label: formatClock(hour * 60 + minute) }].sort((a, b) => a.value.localeCompare(b.value));
}

/** A stored (UTC) interview time as the local { date: "YYYY-MM-DD", time: "HH:mm" } the pickers show. */
export function localInterviewParts(value) {
  const date = interviewDate(value);
  return date ? { date: dateKey(date), time: `${pad(date.getHours())}:${pad(date.getMinutes())}` } : { date: "", time: "" };
}

/** Local "YYYY-MM-DD" + "HH:mm" → Date (null when incomplete). */
export function localDateTime(day, time) {
  const d = String(day || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = String(time || "").match(/^(\d{2}):(\d{2})$/);
  return d && t ? new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2])) : null;
}

/* ── Candidate list ────────────────────────────────────────────────────── */

export const NO_FILTERS = { stage: "", phase: "", status: "", source: "" };
export const WORKFLOW_KINDS = ["stage", "phase", "status"];

/** The web list's default period: the whole current month. */
export function currentMonthRange(date = new Date()) {
  const { from, to } = monthRange(date);
  return { fromDate: from, fromTime: "00:00", toDate: to, toTime: "23:59" };
}

// Web sort keys (column headers) as phone choices; `name` is sent as first_name, stage/status as their plain fields.
export const SORT_OPTIONS = [
  { value: "date_entered:-1", label: "Newest first" },
  { value: "date_entered:1", label: "Oldest first" },
  { value: "name:1", label: "Name A–Z" },
  { value: "name:-1", label: "Name Z–A" },
  { value: "stage:1", label: "Stage A–Z" },
  { value: "status:1", label: "Status A–Z" },
];
export const parseSort = (value) => {
  const [key, direction] = String(value).split(":");
  return { key, direction: Number(direction) === 1 ? 1 : -1 };
};

/** Server order for a sort (web CandidatesPage request.orderBy / orderDir). */
export function sortRequest(sort) {
  const orderBy = sort.key === "name" ? "first_name" : { stage: "stage", status: "status" }[sort.key] || sort.key;
  return { orderBy, orderDir: sort.direction === 1 ? "ASC" : "DESC" };
}

const enteredTime = (record) => parseActivityTime(record.date_entered)?.stamp ?? (Date.parse(record.date_entered_uni_format || record.date_entered) || 0);

/**
 * The shortlist is loaded whole, so it is searched, filtered and sorted on the phone (web CandidatesPage).
 * `filters` holds option IDs; `lookups` the { stage, phase, status } option lists.
 */
export function filterShortlist(records, { search = "", filters = NO_FILTERS, sort = { key: "name", direction: 1 }, lookups = {} } = {}) {
  const needle = lower(search);
  const value = (record, key) => (key === "name" ? candidateName(record) : workflowValue(record, key, lookups[key]));
  const optionName = (kind, id) => plainText((lookups[kind] || []).find((item) => String(item.id) === id)?.name) || id;
  const visible = records.filter(
    (record) =>
      [candidateName(record), record.email1, record.phone_mobile, record.current_designation, record.department].some((item) => lower(plainText(item)).includes(needle)) &&
      WORKFLOW_KINDS.every((kind) => !filters[kind] || value(record, kind) === optionName(kind, filters[kind])) &&
      (!filters.source || record.candidate_source === filters.source),
  );
  return visible.sort((left, right) =>
    sort.key === "date_entered"
      ? (enteredTime(left) - enteredTime(right)) * sort.direction
      : String(value(left, sort.key)).localeCompare(String(value(right, sort.key)), undefined, { numeric: true, sensitivity: "base" }) * sort.direction,
  );
}

/** Stage / phase / status choices for filters: named, without "Unassigned". */
export function filterOptions(options = []) {
  return options
    .map((option) => ({ value: String(option.id), label: plainText(option.name) }))
    .filter(({ label }) => label && lower(label) !== "unassigned");
}

/** Open interviews ahead of now and those still waiting for a date (web summary tiles). */
export function interviewCounts(records = [], now = Date.now()) {
  const open = uniqueInterviews(records).filter((record) => !hasOutcome(record));
  return {
    open: open.length,
    upcoming: open.filter((record) => (interviewDate(record.interview_datetime)?.getTime() ?? 0) >= now).length,
    unscheduled: open.filter((record) => !interviewDate(record.interview_datetime)).length,
  };
}

/** A candidate's interviews, newest first (web interviewsForCandidate): by linked ID, or by email when unlinked. */
export function interviewsForCandidate(interviews = [], candidate = {}) {
  const id = clean(candidate.id);
  const email = lower(candidate.email1);
  const time = (record) => interviewDate(record.interview_datetime)?.getTime() ?? Infinity;
  return interviews
    .filter((record) => String(record.deleted) !== "1")
    .filter((record) => (id && candidateIdOf(record) === id) || (!candidateIdOf(record) && email && lower(record.email) === email))
    .sort((left, right) => time(right) - time(left) || roundName(right).localeCompare(roundName(left)));
}
