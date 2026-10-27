// Connectivity as seen by the app's own requests (no NetInfo in this project).
// A request that fails without any server response marks the app offline; any successful
// query/mutation (or a reachability probe) marks it online again. Web: components/InternetStatus.jsx.
import { create } from "zustand";
import { lower } from "../utils/records";

const NETWORK_MESSAGES = ["network error", "network request failed", "failed to fetch", "check your internet connection", "could not reach the hrcrm server"];

/** True for errors that mean "no connection" rather than "the server said no". */
export function isNetworkError(error) {
  if (!error || error.response) return false;
  if (error.code === "ERR_NETWORK" || error.code === "NETWORK") return true;
  const message = lower(error.message);
  return NETWORK_MESSAGES.some((text) => message.includes(text));
}

export const useNetworkStore = create((set, get) => ({
  offline: false,
  // When the app last went offline / came back (ms), for the banner's copy.
  changedAt: 0,
  setOffline: (offline) => {
    if (get().offline === offline) return;
    set({ offline, changedAt: Date.now() });
  },
  /** Feed any request error in; only connectivity failures flip the flag. */
  reportError: (error) => {
    if (isNetworkError(error)) get().setOffline(true);
  },
  reportSuccess: () => get().setOffline(false),
}));

export const selectOffline = (state) => state.offline;
