// Round 1 test invitation from the recruitment backend: response checks and what the to-do card shows.
// Ports of the web app's pages/interviews/candidateTestData.js, CandidateTestInvitation.jsx and
// services/recruitmentUtils.js (safeInvitationUrl, recruitmentDate). No app imports, so the API module can use it.

const clean = (value) => String(value ?? "").trim();

/** Only http(s) links without credentials; plain http only for a local backend. */
export function safeInvitationUrl(value) {
  const text = clean(value);
  const match = text.match(/^(https?):\/\/([^/?#\s]+)(?:[/?#]\S*)?$/i);
  if (!match || match[2].includes("@")) return "";
  const host = match[2].replace(/:\d+$/, "").toLowerCase();
  if (match[1].toLowerCase() === "http" && !["localhost", "127.0.0.1", "[::1]"].includes(host)) return "";
  return text;
}

/** Recruitment timestamps are UTC without a zone; shown as a local medium date and short time. */
export function recruitmentDate(value) {
  if (!value) return "";
  let raw = String(value).replace(" ", "T");
  if (!/Z$|[+-]\d{2}:?\d{2}$/.test(raw)) raw += "Z";
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
}

const INVITATION_STATUSES = ["pending", "accepted", "completed", "expired", "revoked"];

/**
 * Checks a `my-invitation` response against the signed-in candidate and reduces it to
 * { status, url, expiresAt }. Status is one of not_created | pending | accepted | completed |
 * expired | revoked | unavailable.
 */
export function readTestInvitation(response, { candidate, email }, now = Date.now()) {
  const reference = clean(candidate?.id);
  const loginEmail = clean(email).toLowerCase();
  if (response?.success !== true) throw new Error(response?.error || response?.message || "Your test invitation could not be loaded.");
  const invitation = response.invitation;
  if (invitation === null) return { status: "not_created", url: "", expiresAt: "" };
  if (!invitation?.id || clean(invitation.external_reference) !== reference || clean(invitation.intended_email).toLowerCase() !== loginEmail) {
    throw new Error("The test invitation did not match your profile. Please refresh and try again.");
  }
  const expiresAt = clean(invitation.expires_at);
  const expires = Date.parse(expiresAt);
  if (!Number.isFinite(expires) || !INVITATION_STATUSES.includes(invitation.status)) {
    throw new Error("Your test invitation returned an invalid status. Please contact HR.");
  }
  // An opened link keeps signing the candidate back in until it expires.
  const reentryUrl = invitation.status === "accepted" && expires > now ? safeInvitationUrl(response.invitation_url) : "";
  if (reentryUrl) return { status: "accepted", url: reentryUrl, expiresAt };
  if (invitation.status !== "pending") return { status: invitation.status, url: "", expiresAt };
  if (expires <= now) return { status: "expired", url: "", expiresAt };
  if (invitation.link_unavailable === true) return { status: "unavailable", url: "", expiresAt };
  const url = safeInvitationUrl(response.invitation_url);
  if (!url) throw new Error("Your test link could not be loaded. Please contact HR.");
  return { status: "pending", url, expiresAt };
}

const statusMessages = {
  not_created: "Your test link will appear here once HR creates it.",
  unavailable: "Please ask HR to reissue your test link.",
  expired: "Your test link has expired. Please contact HR for a new link.",
  revoked: "HR has withdrawn this test link. Please contact HR.",
  accepted: "Your test link has been used and its access period has ended. Please contact HR if you need help.",
  completed: "You have submitted this test. HR will review your results.",
};

/** What the to-do card shows for an invitation (web CandidateTestInvitation). */
export function testInvitationView(invitation, now = Date.now()) {
  const expired = invitation?.status === "pending" && Date.parse(invitation.expiresAt) <= now;
  const started = invitation?.status === "accepted" && Boolean(invitation.url);
  const canOpen = Boolean((invitation?.status === "pending" && invitation.url && !expired) || started);
  return {
    canOpen,
    started,
    completed: invitation?.status === "completed",
    due: canOpen ? recruitmentDate(invitation.expiresAt) : "",
    message: statusMessages[expired ? "expired" : invitation?.status] || "Your test link is unavailable. Please refresh or contact HR.",
  };
}

/** True when the test still needs doing: the "To do" tile counts it. */
export const testIsDue = (invitation, now = Date.now()) => Boolean(invitation?.status === "pending" && invitation.url && Date.parse(invitation.expiresAt) > now);
