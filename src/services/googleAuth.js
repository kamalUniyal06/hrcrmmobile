/**
 * Native Google Sign-In (Google Play Services account dialog).
 *
 * Flow: the dialog returns a Google ID token signed for GOOGLE_WEB_CLIENT_ID; the
 * app posts it to the auth backend, which verifies it, opens the PHP session and
 * replies with the same JSON as `action=me` (user, userInfo, crm_access_token).
 *
 * Google Cloud setup (same project as the web login):
 *   - OAuth client of type Android: package `ai.hrcrm.app` + the SHA-1 of each
 *     signing key (`cd android && gradlew signingReport`).
 *   - OAuth client of type Web: its ID goes in .env as GOOGLE_WEB_CLIENT_ID.
 *
 * When the dialog cannot be used (no client ID, no Play Services, backend route
 * missing) the caller falls back to the WebView login, which needs no setup.
 */
import { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } from "@react-native-google-signin/google-signin";
import { GOOGLE_TOKEN_LOGIN_URL, GOOGLE_WEB_CLIENT_ID_VALUE } from "../config";

let configured = false;

export const nativeGoogleAvailable = () => Boolean(GOOGLE_WEB_CLIENT_ID_VALUE);

function configure() {
  if (configured) return;
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID_VALUE, offlineAccess: false, scopes: ["email", "profile"] });
  configured = true;
}

/**
 * Returns `{ status: "ok", data }` with the `me` payload, `{ status: "cancelled" }`,
 * or `{ status: "fallback", reason }` when the WebView login should be used instead.
 */
export async function signInWithGoogleNative() {
  if (!nativeGoogleAvailable()) return { status: "fallback", reason: "GOOGLE_WEB_CLIENT_ID is not set." };
  configure();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // Forget the last account so the picker always appears instead of reusing it.
    try {
      await GoogleSignin.signOut();
    } catch {
      // Nothing was signed in.
    }
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return { status: "cancelled" };
    const idToken = response.data?.idToken;
    const email = response.data?.user?.email || null;
    if (!idToken) return { status: "fallback", reason: "Google did not return an ID token.", email };
    return exchangeIdToken(idToken, email);
  } catch (error) {
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) return { status: "cancelled" };
      if (error.code === statusCodes.IN_PROGRESS) return { status: "cancelled" };
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return { status: "fallback", reason: "Google Play Services is not available on this device." };
    }
    // DEVELOPER_ERROR (SHA-1 / client ID not registered) and anything unexpected.
    return { status: "fallback", reason: error?.message || "Native Google sign-in is not configured for this build." };
  }
}

// `email` (the account picked in the dialog) rides along on a fallback so the web
// login can go straight to that account instead of asking again.
async function exchangeIdToken(idToken, email) {
  let response;
  try {
    response = await fetch(GOOGLE_TOKEN_LOGIN_URL, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ id_token: idToken }),
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
    return { status: "fallback", reason: "The HRCRM backend has no googleTokenLogin route yet.", email };
  }
  return { status: "error", reason: message };
}

export async function signOutGoogleNative() {
  // After an app restart nothing has configured the SDK yet, but the account is still remembered.
  if (!nativeGoogleAvailable()) return;
  configure();
  try {
    await GoogleSignin.signOut();
  } catch {
    // The HRCRM session is already cleared; the Google account state is best effort.
  }
}
