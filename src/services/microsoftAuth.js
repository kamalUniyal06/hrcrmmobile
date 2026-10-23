/**
 * Native Microsoft sign-in (Microsoft's login page in a Chrome Custom Tab, OAuth code + PKCE).
 *
 * Flow: the tab returns a Microsoft ID token issued for MICROSOFT_CLIENT_ID; the app
 * posts it to the auth backend, which verifies it, opens the PHP session and replies
 * with the same JSON as `action=me` (user, userInfo, crm_access_token).
 *
 * Azure setup (app registration "HRCrm App"):
 *   - Redirect URI of type Public client/native: `ai.hrcrm.app://oauth/redirect`.
 *   - Authentication -> Allow public client flows: Yes.
 *   - Its Application (client) ID goes in .env as MICROSOFT_CLIENT_ID; for a
 *     single-tenant app its Directory (tenant) ID goes in MICROSOFT_TENANT_ID.
 *
 * When this cannot be used (no client ID, redirect not registered, backend route
 * missing) the caller falls back to the WebView login, which needs no setup.
 */
import { authorize } from "react-native-app-auth";
import { MICROSOFT_CLIENT_ID_VALUE, MICROSOFT_REDIRECT_URL, MICROSOFT_TENANT_VALUE, MICROSOFT_TOKEN_LOGIN_URL } from "../config";
import { emailFromIdToken } from "../utils/oauthUrl";

// `common` accepts work, school and personal accounts, like the web login; a single-tenant
// app needs its tenant ID instead. Discovery for `common` reports a templated issuer, so
// the endpoints are given directly.
const AUTHORITY = `https://login.microsoftonline.com/${MICROSOFT_TENANT_VALUE}/oauth2/v2.0`;

export const nativeMicrosoftAvailable = () => Boolean(MICROSOFT_CLIENT_ID_VALUE);

let tokenRouteMissing = false;

// Without the backend route the browser-tab login cannot finish, and its remembered
// accounts are not shared with the WebView, so the user would sign in twice. Ask once
// per app run; once the backend ships the route the native flow switches on by itself.
async function tokenRouteAvailable() {
  if (tokenRouteMissing) return false;
  try {
    const response = await fetch(MICROSOFT_TOKEN_LOGIN_URL, {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: "{}",
    });
    const data = await response.json().catch(() => null);
    tokenRouteMissing = /invalid auth route/i.test(data?.error || data?.message || "");
  } catch {
    // Offline or unexpected: let the normal flow report it.
  }
  return !tokenRouteMissing;
}

/**
 * Returns `{ status: "ok", data }` with the `me` payload, `{ status: "cancelled" }`,
 * `{ status: "error", reason }`, or `{ status: "fallback", reason }` when the WebView
 * login should be used instead.
 */
export async function signInWithMicrosoftNative() {
  if (!nativeMicrosoftAvailable()) return { status: "fallback", reason: "MICROSOFT_CLIENT_ID is not set." };
  if (!(await tokenRouteAvailable())) return { status: "fallback", reason: "The HRCRM backend has no microsoftTokenLogin route yet." };
  let result;
  try {
    result = await authorize({
      clientId: MICROSOFT_CLIENT_ID_VALUE,
      redirectUrl: MICROSOFT_REDIRECT_URL,
      scopes: ["openid", "profile", "email", "User.Read"],
      additionalParameters: { prompt: "select_account" },
      serviceConfiguration: {
        authorizationEndpoint: `${AUTHORITY}/authorize`,
        tokenEndpoint: `${AUTHORITY}/token`,
      },
    });
  } catch (error) {
    const message = error?.message || "";
    // Closing the tab rejects with "User cancelled flow".
    if (/cancel/i.test(message)) return { status: "cancelled" };
    // AADSTS50011 (redirect URI not registered), AADSTS700016 (unknown client) and anything unexpected.
    return { status: "fallback", reason: message || "Microsoft sign-in is not configured for this build." };
  }
  if (!result?.idToken) return { status: "fallback", reason: "Microsoft did not return an ID token." };
  return exchangeIdToken(result.idToken, result.accessToken);
}

// The account's email rides along on a fallback so the web login can go straight to
// that account instead of asking again.
async function exchangeIdToken(idToken, accessToken) {
  const email = emailFromIdToken(idToken);
  let response;
  try {
    response = await fetch(MICROSOFT_TOKEN_LOGIN_URL, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ id_token: idToken, access_token: accessToken }),
    });
  } catch (error) {
    return { status: "fallback", reason: error.message || "Could not reach the HRCRM server.", email };
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (response.ok && data?.crm_access_token) return { status: "ok", data };
  const message = data?.error || data?.message || `The server replied ${response.status}.`;
  if (/invalid auth route/i.test(message)) {
    return { status: "fallback", reason: "The HRCRM backend has no microsoftTokenLogin route yet.", email };
  }
  return { status: "error", reason: message };
}
