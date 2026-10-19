// Shared endpoints. These match the HRCRM web app (hrcrm.ai, branch dev2).

// Auth backend: Google / Microsoft login, session lookup (`me`), logout.
export const AUTH_URL = "https://app.hrcrm.ai/public/index.php";

// CRM backend. Every data request goes through the Smart Gateway or the `hrc` entry point.
export const CRM_URL = "https://flight.hrcrm.ai/index.php";
export const CRM_URL_PREFIX = "https://flight.hrcrm.ai/";
export const CRM_ALLOWED_ENTRY_POINTS = ["smart_gateway", "flexibility", "sidebar", "hrc"];

// Signs every Smart Gateway request (X-Api-Token). Same value as VITE_SMARTGATEWAY_SECRET_KEY on the web.
export const SMARTGATEWAY_SECRET_KEY = process.env.EXPO_PUBLIC_SMARTGATEWAY_SECRET_KEY || "";

// Key for the `hrc` entry point (clock in/out, leave with attachment). Same as VITE_FETCHGPC_X_API_KEY.
export const FETCH_GPC_X_API_KEY = process.env.EXPO_PUBLIC_FETCHGPC_X_API_KEY || "";

export const RECRUITMENT_API_URL =
  process.env.EXPO_PUBLIC_RECRUITMENT_API_URL || "https://recruitmentbackend.outrightsystems.org/api";

// After OAuth the auth backend redirects to this URL inside the login WebView.
// Landing on `me` gives the app the session JSON (user, userInfo, crm_access_token) in one step.
export const LOGIN_RETURN_URL = `${AUTH_URL}?controller=auth&action=me`;

export const loginUrl = (provider) =>
  `${AUTH_URL}?controller=auth&action=${provider === "microsoft" ? "microsoftLogin" : "googleLogin"}` +
  `&frontend=${encodeURIComponent(LOGIN_RETURN_URL)}`;

/** Names of the env values that are still empty, so the app can explain what to put in .env. */
export function missingConfig() {
  const missing = [];
  if (!SMARTGATEWAY_SECRET_KEY) missing.push("EXPO_PUBLIC_SMARTGATEWAY_SECRET_KEY");
  if (!FETCH_GPC_X_API_KEY) missing.push("EXPO_PUBLIC_FETCHGPC_X_API_KEY");
  return missing;
}
