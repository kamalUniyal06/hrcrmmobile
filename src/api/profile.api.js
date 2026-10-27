// "My profile" for employees and admins (web: pages/Profile.jsx with pages/profile/candidateApi.js,
// candidateRelated.js, onboardingValidation.js). The web profile page edits the signed-in user's
// `hrc_candidates` record (looked up by email1) and its related skills / experience / education
// records, for employees as well as candidates. Same modules, field names and payloads here.
// Kept separate from candidate.api.js on purpose: only what the employee profile needs is duplicated.
import { CRM_URL, FETCH_GPC_X_API_KEY } from "../config";
import { fetchGpc, gateway } from "../services/api";
import { clean, createdId, lower } from "../utils/records";

export const PROFILE_MODULE = "hrc_candidates";

export const profileKeys = {
  record: (email) => ["my-profile", email],
  related: (id, section) => ["my-profile", "related", id, section],
};

/** Personal fields saved on the record, with their labels (web candidateFields). */
export const profileFields = {
  first_name: "First name",
  last_name: "Last name",
  email1: "Email",
  phone_mobile: "Mobile phone",
  current_designation: "Current designation",
  title: "Title",
  department: "Department",
  dob: "Date of birth",
  gender: "Gender",
  primary_address_street: "Street address",
  primary_address_city: "City",
  primary_address_state: "State",
  primary_address_postalcode: "Postal code",
  primary_address_country: "Country",
  linkedin_url: "LinkedIn URL",
  github_url: "GitHub URL",
  description: "About you",
};

export const ABOUT_MIN_LENGTH = 50;

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

export const GENDER_OPTIONS = ["Male", "Female", "Other"];

/** Related sections: list key → CRM module. */
export const relatedModules = { experiences: "hrc_experience", education: "hrc_education", skills: "hrc_skills" };
export const RELATED_SECTIONS = ["experiences", "education", "skills"];

/** Fields of each related record that the profile shows and saves (web relatedFields). */
export const relatedFields = {
  education: ["name", "qualification", "institution", "university", "school", "board", "specialization", "percentage", "from_time", "to_time", "status", "description"],
  experiences: ["name", "company_name", "company", "company_location", "position", "designation", "ctc", "joining_date", "leaving_date", "description", "responsibilities"],
  skills: ["name", "skill_name", "skill", "version", "last_used", "total_years_total_months", "description"],
};

export const relatedFieldLabels = {
  skills: { name: "Skill", skill_name: "Skill", skill: "Skill", version: "Version", last_used: "Last used", total_years_total_months: "Experience duration", description: "Description" },
  experiences: {
    name: "Job title", company_name: "Company", company: "Company", company_location: "Location", position: "Position",
    designation: "Designation", ctc: "CTC", joining_date: "Start date", leaving_date: "End date",
    description: "Responsibilities and achievements", responsibilities: "Responsibilities",
  },
  education: {
    name: "Education title", qualification: "Degree / qualification", institution: "Institution", university: "University",
    school: "School / college", board: "Board", specialization: "Field of study / specialization", percentage: "Percentage / grade",
    from_time: "Start year / date", to_time: "End year / date", status: "Completion status", description: "Academic achievements and details",
  },
};

// ─── Dates and URLs ───────────────────────────────────────────────────────────

export function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
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

/**
 * The related-records API returns experience dates as MM/DD/YYYY. Turn valid ones into
 * "YYYY-MM-DD" for the date pickers; anything else stays as entered.
 */
export function experienceDateForInput(value) {
  const text = clean(value);
  if (!text) return "";
  const slashDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const isoDate = text.match(/^(\d{4}-\d{2}-\d{2})(?:$|[T ]\d{2}:\d{2})/);
  const date = slashDate ? `${slashDate[3]}-${slashDate[1].padStart(2, "0")}-${slashDate[2].padStart(2, "0")}` : isoDate?.[1];
  return date && isCalendarDate(date) ? date : text;
}

// ─── Record ───────────────────────────────────────────────────────────────────

/**
 * The readable "about" text of a description. Parsed resumes store JSON there (with the
 * introduction inside); older profiles used plain text followed by EDUCATION/EXPERIENCES/SKILLS blocks.
 */
export function aboutText(description = "") {
  const text = String(description ?? "");
  try {
    const data = JSON.parse(text);
    const candidate = data?.content?.candidate;
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const about = typeof candidate.description === "string" ? candidate.description : candidate.summary;
      return typeof about === "string" ? about : "";
    }
    if (data && typeof data === "object" && !Array.isArray(data) &&
      (RELATED_SECTIONS.some((key) => Array.isArray(data[key])) || typeof data.about === "string")) {
      return typeof data.about === "string" ? data.about : "";
    }
  } catch {
    // Plain text: fall through.
  }
  return text.split(/(?:^|\n\n)(?:EDUCATION|EXPERIENCES|SKILLS)\r?\n/)[0].trim();
}

/** The editable draft of a profile record (web normalizeCandidate). */
export function normalizeProfile(record = {}, email = "") {
  const source = record || {};
  const draft = Object.fromEntries(Object.keys(profileFields).map((key) => [key, typeof source[key] === "string" ? source[key].trim() : ""]));
  const names = String(source.full_name || source.name || "").trim().split(/\s+/);
  draft.first_name ||= names.length > 1 ? names.slice(0, -1).join(" ") : "";
  draft.last_name ||= names[names.length - 1] || "";
  draft.email1 = email;
  draft.phone_mobile ||= source.phone || source.mobile || "";
  const addressAliases = { primary_address_street: "street", primary_address_city: "city", primary_address_state: "state", primary_address_postalcode: "postal_code", primary_address_country: "country" };
  for (const [field, alias] of Object.entries(addressAliases)) {
    draft[field] ||= typeof source[alias] === "string" ? source[alias] : "";
  }
  draft.current_designation ||= source.designation || source.title || "";
  draft.description ||= source.summary || "";
  draft.description = aboutText(draft.description);
  for (const key of ["linkedin_url", "github_url"]) {
    draft[key] = /^https?:\/\/$/i.test(draft[key]) ? "" : normalizeProfileUrl(draft[key]);
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(draft.dob)) {
    const [month, day, year] = draft.dob.split("/");
    draft.dob = `${year}-${month}-${day}`;
  }
  draft.profile_image = /^https?:\/\/.+/i.test(source.profile_image || "") ? source.profile_image : "";
  return draft;
}

/** The signed-in user's profile record, or null when there is none yet. */
export async function findProfile(email) {
  if (!email) throw new Error("Your login email is unavailable. Please sign in again.");
  const response = await gateway({ action: "fetch", module: PROFILE_MODULE, filters: { email1: email }, page: 1, per_page: 20 });
  if (response?.success !== true || !Array.isArray(response.records)) {
    throw new Error(response?.message || "Could not load your profile. Please retry.");
  }
  const record = response.records.find((item) => lower(item?.email1) === lower(email));
  if (response.records.length && !record) throw new Error("The profile lookup returned an unexpected email. Please retry.");
  if (record && !record.id) throw new Error("The profile record is missing its ID. Please contact support.");
  return record || null;
}

/** Create or update the profile record with the same payload as the web (web saveCandidate). */
export async function saveProfile(id, draft, email) {
  const data = { ...normalizeProfile(draft, email), candidate_source: draft.candidate_source || "career_portal" };
  const response = await gateway({ action: id ? "update" : "create", module: PROFILE_MODULE, ...(id ? { id } : {}), data });
  if (response?.success !== true) throw new Error(response?.message || "Could not save your profile. Please try again.");
  return { ...data, id: id || createdId(response) };
}

// ─── Related sections ─────────────────────────────────────────────────────────

const asText = (value) => (value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value));

/** Every non-deleted related record of one section, values as strings (web loadCandidateRelated). */
export async function fetchProfileRelated(id, section) {
  const related_module = relatedModules[section];
  if (!id || !related_module) throw new Error("A saved profile is required to load this section.");
  const records = [];
  let page = 1;
  let totalPages = 1;
  do {
    const response = await gateway({ action: "fetch_related", module: PROFILE_MODULE, id, related_module, page, per_page: 20 });
    if (response?.success !== true || !Array.isArray(response.records)) {
      throw new Error(response?.error || response?.message || "Could not load this section. Please retry.");
    }
    records.push(...response.records.filter((record) => record && String(record.deleted) !== "1"));
    const pagination = response.pagination || {};
    totalPages = Number(response.total_pages ?? pagination.total_pages)
      || Math.ceil(Number(response.total ?? pagination.total) / (Number(response.per_page ?? pagination.per_page) || 20)) || 1;
    page += 1;
  } while (page <= totalPages && page <= 50);
  const items = records.map((record) =>
    typeof record === "object" && !Array.isArray(record)
      ? Object.fromEntries(Object.entries(record).map(([key, value]) => [key, asText(value)]))
      : { details: String(record) },
  );
  if (section !== "experiences") return items;
  return items.map((item) => ({
    ...item,
    ...Object.fromEntries(["joining_date", "leaving_date"].filter((key) => Object.hasOwn(item, key)).map((key) => [key, experienceDateForInput(item[key])])),
  }));
}

/** Update one related record with only the fields that changed (web saveCandidateRelated). Returns true when a request was sent. */
export async function saveProfileRelated(section, item, original) {
  const module = relatedModules[section];
  if (!module || !item?.id || item.id !== original?.id) throw new Error("The related record is missing its ID. Reload this section and retry.");
  const data = Object.fromEntries(
    relatedFields[section].filter((key) => Object.hasOwn(item, key) && item[key] !== original[key]).map((key) => [key, item[key]]),
  );
  if (!Object.keys(data).length) return false;
  const response = await gateway({ action: "update", module, id: item.id, data });
  if (response?.success !== true) {
    throw new Error(response?.message || `Could not save ${section}. Please retry. Earlier successful changes have been kept.`);
  }
  return true;
}

/**
 * The web "Save profile" button: save the record (creating it when the lookup finds none),
 * then every changed related record. `related` = [{ section, items, original }].
 * Returns the saved record and the related lists as they now stand on the server.
 */
export async function saveMyProfile({ record, draft, email, related = [] }) {
  // Recheck before creating, including after an uncertain previous save response.
  const existing = record || (await findProfile(email));
  const saved = await saveProfile(existing?.id, { ...draft, candidate_source: existing?.candidate_source }, email);
  if (!saved.id) {
    const confirmed = await findProfile(email);
    if (!confirmed) throw new Error("Save was accepted, but the profile could not be confirmed. Retry saving to check again.");
    saved.id = confirmed.id;
  }
  const savedRelated = {};
  for (const { section, items = [], original = [] } of related) {
    let current = [...original];
    for (const item of items) {
      await saveProfileRelated(section, item, original.find((value) => value.id === item.id));
      current = current.map((value) => (value.id === item.id ? { ...item } : value));
    }
    savedRelated[section] = current;
  }
  return { record: { ...existing, ...saved }, related: savedRelated };
}

// ─── Photo ────────────────────────────────────────────────────────────────────

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_PHOTO_SIZE = 10 * 1024 * 1024;

/** MIME type of a picked image, from its type or file name; "" when it is not JPG, PNG or WebP. */
export function photoMimeType(file = {}) {
  const declared = lower(file.type || file.mimeType);
  if (PHOTO_TYPES.includes(declared)) return declared;
  if (declared === "image/jpg") return "image/jpeg";
  const extension = lower(file.name).match(/\.(jpe?g|png|webp)$/)?.[1];
  return extension ? (extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg") : "";
}

/**
 * Upload a profile photo through the `hrc` entry point (type=upload_candidate_image), like the web.
 * `file` is { uri, name, type } from the document picker. Resolves with the hosted image URL,
 * which the profile then saves as `profile_image`.
 */
export async function uploadProfilePhoto({ email, file }) {
  if (!clean(email)) throw new Error("Your login email is unavailable. Please sign in again.");
  if (!FETCH_GPC_X_API_KEY) throw new Error("Photo upload is not configured. Please contact your administrator.");
  const mimeType = photoMimeType(file);
  if (!file?.uri || !mimeType) throw new Error("Choose a JPG, PNG, or WebP image.");
  const body = new FormData();
  body.append("email", clean(email));
  body.append("image", { uri: file.uri, name: file.name || `profile-photo.${mimeType.split("/")[1]}`, type: mimeType });
  const response = await fetchGpc({ endpoint: `${CRM_URL}?entryPoint=hrc`, method: "POST", params: { type: "upload_candidate_image" }, body });
  if (response?.success !== true) {
    throw new Error(
      typeof response?.message === "string" ? response.message : typeof response?.error === "string" ? response.error : "Could not upload your photo. Please try again.",
    );
  }
  const imageUrl = response.image_url;
  if (typeof imageUrl !== "string" || !/^https?:\/\/.+/i.test(imageUrl)) {
    throw new Error("The upload did not return a valid image URL. Please try again.");
  }
  return imageUrl;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/** Field errors for the personal details, keyed by field (web validatePersonalDetails). */
export function validatePersonalDetails(draft = {}) {
  const errors = {};
  for (const [key, label] of Object.entries(requiredPersonalFields)) {
    if (!clean(draft[key])) errors[key] = `${label} is required.`;
  }
  const phone = clean(draft.phone_mobile);
  if (phone && !/^\+?[\d\s().-]+$/.test(phone)) errors.phone_mobile = "Enter a valid phone number.";
  const digits = phone.replace(/\D/g, "").length;
  if (phone && (digits < 7 || digits > 15)) {
    errors.phone_mobile = "Enter a phone number with 7 to 15 digits, including the country code if needed.";
  }
  if (draft.dob && (!isCalendarDate(draft.dob) || draft.dob > localToday())) {
    errors.dob = "Enter a valid date of birth that is not in the future.";
  }
  if (draft.description && clean(draft.description).length < ABOUT_MIN_LENGTH) {
    errors.description = `Write at least ${ABOUT_MIN_LENGTH} characters about your background, skills, or career interests.`;
  }
  for (const key of ["linkedin_url", "github_url"]) {
    if (!clean(draft[key])) continue;
    const match = normalizeProfileUrl(draft[key]).match(/^(https?):\/\/([^/?#\s]+)/i);
    if (!match || !match[2].replace(/:\d+$/, "").includes(".")) {
      errors[key] = "Enter a valid profile address, or leave this field blank.";
    }
  }
  return errors;
}
