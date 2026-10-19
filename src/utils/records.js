// Helpers shared by every API module. Mirrors the small helpers repeated across the web app.

export const clean = (value) => String(value ?? "").trim();
export const lower = (value) => clean(value).toLowerCase();
export const isDeleted = (record) => String(record?.deleted) === "1";

export function assertSuccess(response, fallbackMessage) {
  if (response?.success !== true) {
    throw new Error(response?.error || response?.message || fallbackMessage || "The request failed. Please try again.");
  }
  return response;
}

export function activeRecords(response) {
  return (Array.isArray(response?.records) ? response.records : []).filter((record) => record && !isDeleted(record));
}

export function totalPagesOf(response, perPage) {
  const pagination = response?.pagination || {};
  return (
    Number(response?.total_pages ?? pagination.total_pages) ||
    Math.ceil(Number(response?.total ?? pagination.total) / (Number(response?.per_page ?? pagination.per_page) || perPage)) ||
    1
  );
}

/**
 * Fetch every page of a Smart Gateway collection.
 * `request(body)` must return the raw gateway response.
 */
export async function fetchAllPages(request, body, { perPage = 100, maxPages = 50 } = {}) {
  const records = [];
  let dropdowns = {};
  let page = 1;
  let pages = 1;
  do {
    const response = assertSuccess(await request({ ...body, page, per_page: perPage }), `Could not load ${body.module || "records"}.`);
    if (!Array.isArray(response.records)) throw new Error("The server returned an invalid record collection.");
    records.push(...response.records.filter((record) => record && !isDeleted(record)));
    dropdowns = { ...dropdowns, ...(response.dropdown_lists || {}) };
    pages = Math.min(totalPagesOf(response, perPage), maxPages);
    page += 1;
  } while (page <= pages);
  return { records, dropdowns };
}

/** Readable message from an Axios/gateway error. */
export function errorMessage(error, fallback = "Something went wrong. Please try again.") {
  if (!error) return fallback;
  const payload = error.response?.data;
  if (payload && typeof payload === "object") {
    return payload.error || payload.message || fallback;
  }
  if (error.code === "ECONNABORTED") return "The server took too long to respond.";
  if (error.message === "Network Error") return "Network error. Check your internet connection.";
  return error.message || fallback;
}

export const createdId = (response) =>
  response?.id || response?.record?.id || response?.data?.id || response?.record_id || "";

export const readable = (value) =>
  String(value ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export function fullName(record = {}, fallback = "Unnamed") {
  return (
    [record.first_name, record.last_name].map(clean).filter(Boolean).join(" ") ||
    clean(record.full_name) ||
    clean(record.name) ||
    clean(record.email1) ||
    fallback
  );
}

export function initials(name = "") {
  const parts = clean(name).split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Strip HTML and decode the common entities the CRM returns. */
export function plainText(value) {
  return String(value ?? "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(?:p|li|div|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\r\n/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .trim();
}
