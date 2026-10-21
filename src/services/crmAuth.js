/**
 * CRM token lifecycle (port of the web app's services/crmAuth.js).
 *
 * The auth backend issues a short-lived RS256 JWT (`crm_access_token`) from
 * `?controller=auth&action=me`, authenticated by the PHPSESSID cookie set during
 * Google / Microsoft login. The token is cached in memory until 30 seconds before
 * expiry and mirrored to AsyncStorage so a relaunch can keep working until it expires.
 *
 * Refresh works in two steps:
 *   1. native fetch with cookies (Android shares the WebView cookie jar with fetch);
 *   2. if that fails, a hidden WebView (`SessionBridge`) loads `me` and posts the JSON back.
 */
import { AUTH_URL } from "../config";
import { readJson, remove, writeJson } from "./storage";

const TOKEN_KEY = "hrcrm.crmToken";

let cachedToken = null;
let expiresAt = 0;
let inflight = null;
let bridgeRefresher = null;
let sessionExpiredHandler = null;

export const ME_URL = `${AUTH_URL}?controller=auth&action=me`;

export function registerBridgeRefresher(fn) {
  bridgeRefresher = fn;
  return () => {
    if (bridgeRefresher === fn) bridgeRefresher = null;
  };
}

export function onSessionExpired(fn) {
  sessionExpiredHandler = fn;
}

/** Load a still-valid token saved by a previous run. */
export async function restoreCrmToken() {
  const saved = await readJson(TOKEN_KEY);
  if (saved?.token && Number(saved.expiresAt) > Date.now() + 5000) {
    cachedToken = saved.token;
    expiresAt = Number(saved.expiresAt);
    return true;
  }
  return false;
}

/** Store the token carried by a `me` response and return that response. */
export function applyMeResponse(data) {
  const token = data?.crm_access_token;
  if (!token) {
    const error = new Error("The session response did not include a CRM token.");
    error.code = "NO_TOKEN";
    throw error;
  }
  const expiresIn = Number(data?.crm_access_token_expires_in) || 600;
  cachedToken = token;
  expiresAt = Date.now() + Math.max(expiresIn - 30, 30) * 1000;
  writeJson(TOKEN_KEY, { token, expiresAt });
  return data;
}

export async function fetchMeNative() {
  const response = await fetch(ME_URL, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const error = new Error("Session lookup failed");
    error.status = response.status;
    throw error;
  }
  return response.json();
}

/**
 * Fetch a fresh `me` payload: native first, hidden WebView second.
 * Throws an error with `code: "SESSION_EXPIRED"` when both report the session is gone.
 */
export async function refreshSession() {
  let nativeError = null;
  try {
    return applyMeResponse(await fetchMeNative());
  } catch (error) {
    nativeError = error;
  }

  if (bridgeRefresher) {
    try {
      return applyMeResponse(await bridgeRefresher());
    } catch (error) {
      nativeError = error.status ? error : nativeError;
    }
  }

  const status = nativeError?.status;
  const expired = status === 401 || status === 403 || nativeError?.code === "NO_TOKEN";
  const error = new Error(expired ? "Your session has expired. Please sign in again." : nativeError?.message || "Could not reach the HRCRM server.");
  error.code = expired ? "SESSION_EXPIRED" : "NETWORK";
  error.status = status;
  if (expired) {
    clearCrmToken();
    sessionExpiredHandler?.(error);
  }
  throw error;
}

export async function getCrmToken() {
  if (cachedToken && Date.now() < expiresAt) return cachedToken;
  if (inflight) return inflight;
  inflight = refreshSession()
    .then(() => cachedToken)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function clearCrmToken() {
  cachedToken = null;
  expiresAt = 0;
  remove(TOKEN_KEY);
}

export function hasCrmToken() {
  return Boolean(cachedToken && Date.now() < expiresAt);
}
