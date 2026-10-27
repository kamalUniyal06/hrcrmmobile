// Read-only formatting for the "My profile" view (web: pages/profile/profileDisplay.js).
import { localToday } from "../../api/profile.api";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const text = (value) => String(value ?? "").trim();

function calendarDate(value) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === raw ? date : null;
}

/** Calendar dates read "Mar 2021" (or "5 March 2021" with style "full"); years and free text stay as entered. */
export function formatProfileDate(value, style = "month") {
  const date = calendarDate(value);
  if (!date) return text(value);
  const month = date.getUTCMonth();
  return style === "full"
    ? `${date.getUTCDate()} ${MONTHS_LONG[month]} ${date.getUTCFullYear()}`
    : `${MONTHS[month]} ${date.getUTCFullYear()}`;
}

export function formatDateRange(start, end, ongoing = "") {
  const from = formatProfileDate(start);
  const to = formatProfileDate(end) || (from ? ongoing : "");
  return from && to ? `${from} – ${to}` : from || to;
}

/** Whole calendar months, counting the first, the way resumes usually do. */
export function experienceDuration(start, end, today = localToday()) {
  const from = calendarDate(start);
  const to = calendarDate(text(end) || today);
  if (!from || !to || to < from) return "";
  const months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth() + 1;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [years && `${years} yr${years > 1 ? "s" : ""}`, rest && `${rest} mo${rest > 1 ? "s" : ""}`].filter(Boolean).join(" ");
}

export function capitalize(value) {
  const words = text(value);
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const displayUrl = (value) => text(value).replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
export const isWebUrl = (value) => /^https?:\/\/\S+$/i.test(text(value));

export function formatAddress(draft = {}) {
  const region = [draft.primary_address_state, draft.primary_address_postalcode].map(text).filter(Boolean).join(" ");
  return [
    text(draft.primary_address_street),
    [text(draft.primary_address_city), region].filter(Boolean).join(", "),
    text(draft.primary_address_country),
  ].filter(Boolean);
}

export const profileStrengthFields = [
  ["first_name", "First name"],
  ["last_name", "Last name"],
  ["email1", "Email"],
  ["phone_mobile", "Phone number"],
  ["current_designation", "Professional title"],
  ["primary_address_city", "City"],
  ["description", "About you"],
  ["profile_image", "Profile photo"],
];

export function profileCompletion(draft) {
  const missing = profileStrengthFields.filter(([key]) => !text(draft?.[key])).map(([key, label]) => ({ key, label }));
  const total = profileStrengthFields.length;
  return { percent: Math.round(((total - missing.length) / total) * 100), missing };
}

const pick = (item, keys) => keys.map((key) => text(item[key])).find(Boolean) || "";

/** Shapes an experience, education or skill record into { title, subtitle[], period, duration, details[[label, value]], body[] }. */
export function relatedEntryView(section, item = {}) {
  let view;
  if (section === "experiences") {
    view = {
      title: pick(item, ["name", "position", "designation"]),
      subtitle: [pick(item, ["company_name", "company"]), text(item.company_location)],
      period: formatDateRange(item.joining_date, item.leaving_date, "Present"),
      duration: experienceDuration(item.joining_date, item.leaving_date),
      details: [["Position", item.position], ["Designation", item.designation], ["CTC", item.ctc]],
      body: [item.description, item.responsibilities],
    };
  } else if (section === "education") {
    view = {
      title: pick(item, ["name", "qualification"]),
      subtitle: [pick(item, ["institution", "school", "university"])],
      period: formatDateRange(item.from_time, item.to_time),
      duration: "",
      details: [
        ["Qualification", item.qualification],
        ["University", item.university],
        ["Board", item.board],
        ["Field of study", item.specialization],
        ["Grade", item.percentage],
        ["Status", capitalize(item.status)],
      ],
      body: [item.description],
    };
  } else {
    view = {
      title: pick(item, ["name", "skill_name", "skill"]),
      subtitle: [],
      period: "",
      duration: "",
      details: [["Version", item.version], ["Experience", item.total_years_total_months], ["Last used", formatProfileDate(item.last_used)]],
      body: [item.description],
    };
  }
  const subtitle = view.subtitle.filter(Boolean);
  const shown = new Set([view.title, ...subtitle].map((value) => value.toLowerCase()));
  return {
    ...view,
    subtitle,
    details: view.details.map(([label, value]) => [label, text(value)]).filter(([, value]) => value && !shown.has(value.toLowerCase())),
    body: [...new Set(view.body.map(text).filter(Boolean))],
  };
}
