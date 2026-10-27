// Candidate profile rules shared by the profile screens. Ports of the web app's
// pages/profile/onboardingValidation.js, governmentDocument.js, resumeSections.js,
// experienceDates.js and educationEntries.js, so mobile accepts exactly what the web accepts.

export const ABOUT_MIN_LENGTH = 50;

/** The 13 fields the web requires before a profile can be saved. */
export const requiredPersonalFields = {
  first_name: "First name",
  last_name: "Last name",
  email1: "Email",
  phone_mobile: "Phone number",
  dob: "Date of birth",
  gender: "Gender",
  current_designation: "Professional title",
  primary_address_street: "Street address",
  primary_address_city: "City",
  primary_address_state: "State / region",
  primary_address_postalcode: "Postal code",
  primary_address_country: "Country",
  description: "About you",
};

export const genderOptions = ["Male", "Female", "Other"];

export const governmentIdTypes = {
  pan: { label: "PAN", hint: "Enter 5 letters, 4 digits, and 1 letter, for example ABCDE1234F.", placeholder: "ABCDE1234F", maxLength: 10 },
  driving_licence: { label: "Driving Licence", hint: "Enter the licence number as printed on your document.", placeholder: "As printed on your licence", maxLength: 30 },
  aadhaar: { label: "Aadhaar", hint: "Enter 12 digits. Spaces or hyphens between groups are accepted.", placeholder: "1234 5678 9012", maxLength: 14 },
};

/** "How did you hear about us", sent as `stage` with a parsed resume. */
export const candidateSources = [
  ["Walk-in", "Walkin"],
  ["Job portal", "Via Portal"],
  ["Institute", "Institute"],
  ["Campus drive", "Campus Drive"],
  ["LinkedIn", "LinkedIn"],
  ["Instagram", "Instagram"],
  ["Facebook", "Facebook"],
  ["YouTube", "YouTube"],
  ["Employee referral", "Employee Referral"],
].map(([label, value]) => ({ label, value: `New Candidate -> ${value}` }));

/** Editable fields per related section (web candidateFormOptions.relatedFieldLabels). */
export const relatedFieldLabels = {
  skills: { name: "Skill", version: "Version", total_years_total_months: "Experience duration" },
  experiences: {
    name: "Job title",
    company_name: "Company",
    company_location: "Location",
    joining_date: "Start date",
    leaving_date: "End date",
    description: "Responsibilities and achievements",
  },
  education: {
    name: "Education title",
    qualification: "Degree / qualification",
    institution: "Institution",
    university: "University",
    school: "School / college",
    board: "Board",
    specialization: "Field of study / specialization",
    percentage: "Percentage / grade",
    from_time: "Start year / date",
    to_time: "End year / date",
    status: "Completion status",
    description: "Academic achievements and details",
  },
};

export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function normalizeProfileUrl(value = "") {
  const url = String(value ?? "").trim();
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  if (/^[a-z][a-z\d+.-]*:/i.test(url)) return url;
  return `https://${url}`;
}

// The web checks profile links with `new URL`; React Native's URL is partial, so the
// same rule (http/https with a dotted host) is matched directly.
const isProfileUrl = (value) => {
  const match = normalizeProfileUrl(value).match(/^https?:\/\/(?:[^/?#@\s]*@)?([^/?#:\s]+)(?::\d+)?(?:[/?#]\S*)?$/i);
  return Boolean(match && match[1].includes("."));
};

/** Field errors keyed by field name; empty when the draft can be saved. */
export function validatePersonalDetails(draft = {}, today = localToday()) {
  const errors = {};
  for (const [key, label] of Object.entries(requiredPersonalFields)) {
    if (!String(draft[key] || "").trim()) errors[key] = `${label} is required.`;
  }
  const phone = String(draft.phone_mobile || "");
  if (phone && !/^\+?[\d\s().-]+$/.test(phone.trim())) errors.phone_mobile = "Enter a valid phone number.";
  const digits = phone.replace(/\D/g, "").length;
  if (phone && (digits < 7 || digits > 15)) errors.phone_mobile = "Enter a phone number with 7 to 15 digits, including the country code if needed.";
  if (draft.dob && (!isCalendarDate(draft.dob) || draft.dob > today)) errors.dob = "Enter a valid date of birth that is not in the future.";
  if (draft.description && String(draft.description).trim().length < ABOUT_MIN_LENGTH) {
    errors.description = `Write at least ${ABOUT_MIN_LENGTH} characters about your background, skills, or career interests.`;
  }
  for (const key of ["linkedin_url", "github_url"]) {
    if (String(draft[key] || "").trim() && !isProfileUrl(draft[key])) errors[key] = "Enter a valid profile address, or leave this field blank.";
  }
  return errors;
}

export function normalizeGovernmentId(type, number) {
  const value = String(number ?? "").trim().toUpperCase();
  return type === "aadhaar" ? value.replace(/[\s-]/g, "") : value;
}

export function governmentIdError(type, number) {
  const value = normalizeGovernmentId(type, number);
  if (!governmentIdTypes[type]) return "Choose a government ID type.";
  if (!value) return `Enter your ${governmentIdTypes[type].label} number.`;
  if (type === "pan" && !/^[A-Z]{5}\d{4}[A-Z]$/.test(value)) return "Enter a valid PAN: 5 letters, 4 digits, and 1 letter.";
  if (type === "aadhaar" && !/^\d{12}$/.test(value)) return "Enter a 12-digit Aadhaar number.";
  if (type === "driving_licence" && !/^[A-Z0-9][A-Z0-9 /-]{4,29}$/.test(value)) return "Enter 5 to 30 characters using letters, numbers, spaces, slashes, or hyphens.";
  return "";
}

/** CRM fields for a verified ID (PAN is also stored in pan_card_number). */
export function governmentIdFields(type, number) {
  const error = governmentIdError(type, number);
  if (error) throw new Error(error);
  const normalized = normalizeGovernmentId(type, number);
  return { government_id_type: type, government_id_number: normalized, ...(type === "pan" ? { pan_card_number: normalized } : {}) };
}

/** `file` is a picked document: { name, size }. */
export function governmentDocumentFileError(file) {
  if (!file) return "Choose a government ID document to scan.";
  if (!/\.(jpe?g|png|webp)$/i.test(file.name || "")) return "Choose a JPG, PNG, or WEBP image of your government ID.";
  if (!file.size || file.size > 10 * 1024 * 1024) return "Choose a non-empty government ID image up to 10 MB.";
  return "";
}

export function governmentDocumentNumbersMatch(type, entered, scanned) {
  if (typeof entered !== "string" || typeof scanned !== "string") return false;
  if (governmentIdError(type, entered) || governmentIdError(type, scanned)) return false;
  const canonical = (number) => {
    const normalized = normalizeGovernmentId(type, number);
    return type === "driving_licence" ? normalized.replace(/[\s/-]/g, "") : normalized;
  };
  return canonical(entered) === canonical(scanned);
}

export function resumeFileError(file) {
  if (!file || !/\.(pdf|doc|docx)$/i.test(file.name || "") || !file.size || file.size > 10 * 1024 * 1024) {
    return "Choose a non-empty PDF, DOC or DOCX resume up to 10 MB.";
  }
  return "";
}

export function photoFileError(file) {
  const mime = String(file?.type || "").toLowerCase();
  const byName = /\.(jpe?g|png|webp)$/i.test(file?.name || "");
  if (!file || !(/^image\/(jpeg|png|webp)$/.test(mime) || (!mime && byName)) || !file.size) return "Choose a JPG, PNG, or WebP image.";
  return "";
}

/** First problem in a related section, or null. `index` -1 means the section as a whole. */
export function validateRelatedEntries(section, rows, noExperience = false, today = localToday()) {
  if (section === "experiences" && !rows.length && !noExperience) {
    return { index: -1, message: "Add your work experience or select that you have no work experience yet." };
  }
  for (const [index, row] of rows.entries()) {
    if (!String(row.name || "").trim()) {
      const what = section === "education" ? "an education title" : section === "skills" ? "a skill" : "a job title";
      return { index, field: "name", message: `Enter ${what} for entry ${index + 1}.` };
    }
    if (section !== "experiences") continue;
    if (!row.joining_date) return { index, field: "joining_date", message: `Add a start date for ${row.name}.` };
    if (!row.currentlyWorking && !row.leaving_date) return { index, field: "leaving_date", message: `Add an end date for ${row.name}, or select “Currently working here”.` };
    if (!isCalendarDate(row.joining_date) || (!row.currentlyWorking && !isCalendarDate(row.leaving_date))) {
      return { index, field: !isCalendarDate(row.joining_date) ? "joining_date" : "leaving_date", message: "Enter a valid employment date." };
    }
    if (row.joining_date > today || (!row.currentlyWorking && row.leaving_date > today)) {
      return { index, field: row.joining_date > today ? "joining_date" : "leaving_date", message: "Work experience dates cannot be in the future." };
    }
    if (!row.currentlyWorking && row.leaving_date < row.joining_date) return { index, field: "leaving_date", message: "End date must be on or after the start date." };
  }
  return null;
}

// ─── Resume content stored in the candidate description ─────────────────────

const sectionKeys = ["experiences", "education", "skills"];

export function normalizeResumeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => item !== null && item !== undefined)
    .map((item) => {
      if (typeof item !== "object" || Array.isArray(item)) return { details: String(item) };
      return Object.fromEntries(Object.entries(item).map(([key, value]) => [key, value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value)]));
    });
}

/** The readable "about" text and resume sections inside a description (parsed JSON, section JSON or legacy text). */
export function readResumeSections(description = "") {
  const sections = { education: [], experiences: [], skills: [] };
  try {
    const data = JSON.parse(description);
    const candidate = data?.content?.candidate;
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      for (const key of sectionKeys) sections[key] = normalizeResumeItems(data.content[key]);
      const about = typeof candidate.description === "string" ? candidate.description : candidate.summary;
      return { about: typeof about === "string" ? about : "", sections, parsedResume: data };
    }
    if (data && typeof data === "object" && !Array.isArray(data) && (sectionKeys.some((key) => Array.isArray(data[key])) || typeof data.about === "string")) {
      for (const key of sectionKeys) sections[key] = normalizeResumeItems(data[key]);
      return { about: typeof data.about === "string" ? data.about : "", sections };
    }
  } catch {
    // Plain text and legacy section headings stay editable.
  }
  const parts = String(description ?? "").split(/(?:^|\n\n)(EDUCATION|EXPERIENCES|SKILLS)\r?\n/);
  for (let index = 1; index < parts.length; index += 2) {
    const key = parts[index].toLowerCase();
    sections[key] = parts[index + 1].trim().split(/\n\n/).filter(Boolean).flatMap((block) => {
      // Older profiles stored one entry per line with inline field separators.
      const records = / · | � /.test(block) ? block.split("\n") : [block];
      return records.map((record) => {
        const values = {};
        let previous = "";
        for (const line of record.split(/\n| · | � /)) {
          const field = line.match(/^([a-zA-Z][\w ]*):\s?(.*)$/);
          if (field) {
            previous = field[1].replaceAll(" ", "_");
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

/** The CRM returns experience dates as MM/DD/YYYY; forms work in YYYY-MM-DD. */
export function experienceDateForInput(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const slashDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const isoDate = text.match(/^(\d{4}-\d{2}-\d{2})(?:$|[T ]\d{2}:\d{2})/);
  const date = slashDate ? `${slashDate[3]}-${slashDate[1].padStart(2, "0")}-${slashDate[2].padStart(2, "0")}` : isoDate?.[1];
  if (!date) return text;
  return isCalendarDate(date) ? date : text;
}

/** Linked education records win; otherwise education read from a parsed resume (without its unconfirmed IDs). */
export function educationForOnboarding(records, description = "") {
  const fromResume = !records.length;
  const entries = fromResume ? readResumeSections(description).sections.education : records;
  return entries.map((entry) => {
    const row = { ...entry, name: String(entry.name || "").trim() || entry.qualification || "" };
    if (fromResume) delete row.id;
    return row;
  });
}

/** Profile fields → editable draft, the way the web's normalizeCandidate fills it. */
export const candidateDraftFields = [
  "first_name", "last_name", "email1", "phone_mobile", "current_designation", "title", "department", "dob", "gender",
  "primary_address_street", "primary_address_city", "primary_address_state", "primary_address_postalcode", "primary_address_country",
  "linkedin_url", "github_url", "description",
];

export function normalizeCandidate(record = {}, email = "") {
  const draft = Object.fromEntries(candidateDraftFields.map((key) => [key, typeof record?.[key] === "string" ? record[key].trim() : ""]));
  const names = String(record?.full_name || record?.name || "").trim().split(/\s+/);
  draft.first_name ||= names.length > 1 ? names.slice(0, -1).join(" ") : "";
  draft.last_name ||= names.at(-1) || "";
  draft.email1 = email;
  draft.phone_mobile ||= record?.phone || record?.mobile || "";
  const addressSources = { primary_address_street: "street", primary_address_city: "city", primary_address_state: "state", primary_address_postalcode: "postal_code", primary_address_country: "country" };
  for (const [field, source] of Object.entries(addressSources)) draft[field] ||= typeof record?.[source] === "string" ? record[source] : "";
  draft.current_designation ||= record?.designation || record?.title || "";
  draft.description ||= record?.summary || "";
  draft.description = readResumeSections(draft.description).about;
  for (const key of ["linkedin_url", "github_url"]) draft[key] = /^https?:\/\/$/i.test(draft[key]) ? "" : normalizeProfileUrl(draft[key]);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(draft.dob)) {
    const [month, day, year] = draft.dob.split("/");
    draft.dob = `${year}-${month}-${day}`;
  }
  draft.profile_image = /^https?:\/\/.+/i.test(record?.profile_image || "") ? record.profile_image : "";
  return draft;
}
