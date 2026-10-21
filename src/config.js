// Shared endpoints. These match the HRCRM web app (hrcrm.ai, branch dev2).
// Secrets come from the git-ignored .env file (see .env.example) through react-native-dotenv.
import {
  EXPO_PUBLIC_SMARTGATEWAY_SECRET_KEY,
  EXPO_PUBLIC_FETCHGPC_X_API_KEY,
  EXPO_PUBLIC_RECRUITMENT_API_URL,
  GOOGLE_WEB_CLIENT_ID,
} from "@env";

// Auth backend: Google / Microsoft login, session lookup (`me`), logout.
export const AUTH_URL = "https://app.hrcrm.ai/public/index.php";

// CRM backend. Every data request goes through the Smart Gateway or the `hrc` entry point.
export const CRM_URL = "https://flight.hrcrm.ai/index.php";
export const CRM_URL_PREFIX = "https://flight.hrcrm.ai/";
export const CRM_ALLOWED_ENTRY_POINTS = ["smart_gateway", "flexibility", "sidebar", "hrc"];

// Signs every Smart Gateway request (X-Api-Token). Same value as VITE_SMARTGATEWAY_SECRET_KEY on the web.
export const SMARTGATEWAY_SECRET_KEY = EXPO_PUBLIC_SMARTGATEWAY_SECRET_KEY || "";

// Key for the `hrc` entry point (clock in/out, leave with attachment). Same as VITE_FETCHGPC_X_API_KEY.
export const FETCH_GPC_X_API_KEY = EXPO_PUBLIC_FETCHGPC_X_API_KEY || "";

export const RECRUITMENT_API_URL = EXPO_PUBLIC_RECRUITMENT_API_URL || "https://recruitmentbackend.outrightsystems.org/api";

// Web-type OAuth client ID from the Google Cloud project that owns the HRCRM login.
// When set, "Continue with Google" uses the native Google Play Services dialog.
export const GOOGLE_WEB_CLIENT_ID_VALUE = GOOGLE_WEB_CLIENT_ID || "";

// The auth backend route that exchanges a Google ID token for an HRCRM session.
// It must verify the token and reply with the same JSON as `action=me`.
export const GOOGLE_TOKEN_LOGIN_URL = `${AUTH_URL}?controller=auth&action=googleTokenLogin`;

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
