// Adjusts the Google / Microsoft authorize URLs the HRCRM backend redirects to, so the
// login always shows an account chooser (remembered accounts + "Use another account")
// instead of silently reusing the last account. The backend sends Google approval_prompt=auto.

const GOOGLE_AUTHORIZE = /^https:\/\/accounts\.google\.com\/o\/oauth2\/(?:v2\/)?auth\b/i;
const MICROSOFT_AUTHORIZE = /^https:\/\/login\.microsoftonline\.com\/[^/]+\/oauth2\/v2\.0\/authorize\b/i;

export const isAuthorizeUrl = (url = "") => GOOGLE_AUTHORIZE.test(url) || MICROSOFT_AUTHORIZE.test(url);

// `key` is matched as a whole parameter name, so `prompt` never matches `approval_prompt`.
function getParam(url, key) {
  const match = url.match(new RegExp(`[?&]${key}=([^&#]*)`));
  return match ? decodeURIComponent(match[1].replace(/\+/g, " ")) : null;
}

function setParam(url, key, value) {
  const pattern = new RegExp(`([?&])${key}=[^&#]*(&?)`);
  if (value == null) {
    return url.replace(pattern, (_, lead, tail) => (tail ? lead : "")).replace(/[?&]$/, "");
  }
  const pair = `${key}=${encodeURIComponent(value)}`;
  if (pattern.test(url)) return url.replace(pattern, (_, lead, tail) => `${lead}${pair}${tail}`);
  const [base, hash = ""] = url.split("#");
  return `${base}${base.includes("?") ? "&" : "?"}${pair}${hash ? `#${hash}` : ""}`;
}

/**
 * Returns the URL to load instead, or `url` unchanged when nothing needs to change.
 * With `loginHint` (an account the user already picked in the native dialog) the
 * provider goes straight to that account; otherwise it shows the account chooser.
 */
export function withAccountChooser(url, loginHint) {
  if (!isAuthorizeUrl(url)) return url;
  // The backend sends Google the legacy `approval_prompt=auto`; Google rejects a request
  // carrying both it and `prompt` ("Error 400: invalid_request"), so it is dropped.
  const base = setParam(url, "approval_prompt", null);
  if (loginHint) {
    if (base === url && getParam(url, "login_hint") === loginHint && getParam(url, "prompt") == null) return url;
    return setParam(setParam(base, "prompt", null), "login_hint", loginHint);
  }
  if (base === url && getParam(url, "prompt") === "select_account") return url;
  return setParam(base, "prompt", "select_account");
}

/** Email inside a JWT ID token (Google `email`, Microsoft `email` / `preferred_username`). */
export function emailFromIdToken(idToken) {
  try {
    const payload = String(idToken).split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(decodeURIComponent(escape(global.atob(payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=")))));
    return String(claims.email || claims.preferred_username || "").trim() || null;
  } catch {
    return null;
  }
}
