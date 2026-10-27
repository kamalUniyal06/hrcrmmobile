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

const ENTITIES = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™", rupee: "₹",
};

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[name.toLowerCase()] ?? match;
  });
}

/**
 * Strip HTML and decode the entities the CRM returns. The CRM often stores rich text
 * escaped (`&lt;p&gt;Hi&lt;/p&gt;`), so entities are decoded before tags are removed.
 */
export function plainText(value) {
  const text = unescapeHtml(value);
  return decodeEntities(
    text
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<li\b[^>]*>/gi, "• ")
      .replace(/<br\s*\/?>|<\/(?:p|li|div|tr|h[1-6])>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Turns CRM-escaped HTML back into markup. Up to two passes: escaped, and escaped twice (`&amp;lt;p&amp;gt;`). */
function unescapeHtml(value) {
  let text = String(value ?? "");
  for (let pass = 0; pass < 2 && /&(lt|gt|amp);/i.test(text); pass += 1) text = decodeEntities(text);
  return text;
}

const IMAGE_TAG = /<img\b[^>]*>/gi;

/** The `src` of an <img> tag, when it is a web or inline (data:) image. */
function imageSource(tag) {
  const src = decodeEntities(tag.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)?.slice(1).find(Boolean) || "").trim();
  return /^(https?:|data:image\/)/i.test(src) ? src : "";
}

/** The first picture in rich text (card thumbnails), or "". */
export function firstImage(value) {
  for (const tag of unescapeHtml(value).match(IMAGE_TAG) || []) {
    const uri = imageSource(tag);
    if (uri) return uri;
  }
  return "";
}

/**
 * Splits rich text into readable blocks: `{ type: "text", text }` paragraphs,
 * `{ type: "image", uri }` pictures and `{ type: "table", header, rows }` tables (cells as
 * plain text). Used where tables must stay tables and pictures must show, e.g. announcements.
 */
export function htmlBlocks(value) {
  const html = unescapeHtml(value);
  const blocks = [];
  const pushPlain = (segment) => {
    const text = plainText(segment);
    if (text) blocks.push({ type: "text", text });
  };
  const pushText = (segment) => {
    let last = 0;
    for (const match of segment.matchAll(IMAGE_TAG)) {
      pushPlain(segment.slice(last, match.index));
      last = match.index + match[0].length;
      const uri = imageSource(match[0]);
      if (uri) blocks.push({ type: "image", uri });
    }
    pushPlain(segment.slice(last));
  };
  const tablePattern = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let last = 0;
  let match;
  while ((match = tablePattern.exec(html))) {
    pushText(html.slice(last, match.index));
    last = tablePattern.lastIndex;
    const rows = [...match[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => ({
      isHead: /<th\b/i.test(row[1]),
      cells: [...row[1].matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((cell) => plainText(cell[2])),
    })).filter((row) => row.cells.some(Boolean));
    if (!rows.length) continue;
    // A <th> row is the header; otherwise the first row reads as one (e.g. "Team | Members").
    const headIndex = rows.findIndex((row) => row.isHead);
    const header = headIndex >= 0 ? rows[headIndex].cells : rows.length > 1 ? rows[0].cells : null;
    const body = rows.filter((_, index) => index !== (headIndex >= 0 ? headIndex : header ? 0 : -1)).map((row) => row.cells);
    blocks.push({ type: "table", header, rows: body });
  }
  pushText(html.slice(last));
  return blocks;
}
