/**
 * Session state (replaces the web app's Redux userSlice).
 *
 * status: "booting" | "signedOut" | "signedIn"
 * user:     { email }
 * userInfo: { id, subject_type, stage, phase, status }   // status "admin" marks HR admins
 */
import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { AUTH_URL } from "../config";
import { applyMeResponse, clearCrmToken, onSessionExpired, refreshSession } from "../services/crmAuth";
import { apiRequest } from "../services/api";

const SNAPSHOT_KEY = "hrcrm.session";

const emptyInfo = { id: null, subject_type: null, stage: null, phase: null, status: null };

export function normalizeMe(data = {}) {
  const info = data.userInfo || { id: data.id ?? null, stage: data.stage ?? null, phase: data.phase ?? null, status: data.status ?? null };
  return {
    user: data.user || {},
    userInfo: {
      id: info.id ?? null,
      stage: info.stage ?? null,
      phase: info.phase ?? null,
      status: info.status ?? null,
      subject_type: data.subject_type ?? info.subject_type ?? null,
    },
  };
}

async function saveSnapshot(snapshot) {
  try {
    await SecureStore.setItemAsync(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage is a convenience: the live session still works without it.
  }
}

async function readSnapshot() {
  try {
    const raw = await SecureStore.getItemAsync(SNAPSHOT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function clearSnapshot() {
  try {
    await SecureStore.deleteItemAsync(SNAPSHOT_KEY);
  } catch {
    // Nothing else to do.
  }
}

export const useAuthStore = create((set, get) => ({
  status: "booting",
  user: {},
  userInfo: emptyInfo,
  notice: null,
  bridgeReady: false,

  setBridgeReady: (ready) => set({ bridgeReady: ready }),
  clearNotice: () => set({ notice: null }),

  /** Called with the parsed `me` JSON after the login WebView finishes. */
  signInWithMe: async (data) => {
    applyMeResponse(data);
    const snapshot = normalizeMe(data);
    await saveSnapshot(snapshot);
    set({ status: "signedIn", ...snapshot, notice: null });
  },

  /** App start: restore the last user, then confirm the cookie session still works. */
  bootstrap: async () => {
    const snapshot = await readSnapshot();
    if (snapshot) set({ ...snapshot });
    try {
      const data = await refreshSession();
      const fresh = normalizeMe(data);
      await saveSnapshot(fresh);
      set({ status: "signedIn", ...fresh, notice: null });
    } catch (error) {
      if (error.code === "NETWORK" && snapshot?.user?.email) {
        // Offline: keep the last known user so the app opens; requests will retry.
        set({ status: "signedIn", notice: "You appear to be offline. Showing the last known session." });
        return;
      }
      await clearSnapshot();
      set({ status: "signedOut", user: {}, userInfo: emptyInfo, notice: snapshot ? "Your session expired. Please sign in again." : null });
    }
  },

  /** Account logout (not the daily clock-out). */
  signOut: async () => {
    try {
      await apiRequest({ endpoint: `${AUTH_URL}?controller=auth`, params: { action: "logout" }, withCredentials: true });
    } catch {
      // Clearing the local session is still correct when the server call fails.
    }
    clearCrmToken();
    await clearSnapshot();
    set({ status: "signedOut", user: {}, userInfo: emptyInfo, notice: null });
  },

  /** Local-only sign out, used when the server says the session is gone. */
  expire: async (message) => {
    if (get().status !== "signedIn") return;
    clearCrmToken();
    await clearSnapshot();
    set({ status: "signedOut", user: {}, userInfo: emptyInfo, notice: message || "Your session expired. Please sign in again." });
  },
}));

onSessionExpired((error) => {
  useAuthStore.getState().expire(error?.message);
});

// Role helpers (same rules as the web app's pageAccess.js and Home.jsx).
export const selectIsAdmin = (state) => state.status === "signedIn" && state.userInfo?.status === "admin";
export const selectIsEmployee = (state) => state.status === "signedIn" && !selectIsAdmin(state) && state.userInfo?.phase === "Employment";
export const selectIsCandidate = (state) => state.status === "signedIn" && !selectIsAdmin(state) && !selectIsEmployee(state);
export const selectRole = (state) => (selectIsAdmin(state) ? "admin" : selectIsEmployee(state) ? "employee" : "candidate");
export const selectEmail = (state) => String(state.user?.email || "").trim();
export const selectUserId = (state) => state.userInfo?.id || null;

export const currentEmail = () => selectEmail(useAuthStore.getState());
export const currentUserId = () => selectUserId(useAuthStore.getState());
