// "You're offline" / "Back online" banner (web: components/InternetStatus.jsx, mounted in App.jsx).
// This project has no @react-native-community/netinfo, so connectivity is inferred from the app's own
// traffic: React Query's query and mutation caches are watched for network failures (no axios
// interceptor), and while offline a small reachability probe retries with backoff.
// Mount once inside <QueryClientProvider> (e.g. next to <ToastHost /> in App.js).
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, shadow } from "../theme";
import { CRM_URL } from "../config";
import { selectOffline, useNetworkStore } from "../store/networkStore";

const BASE_RETRY_DELAY = 3000;
const MAX_RETRY_DELAY = 30000;
const BACK_ONLINE_FOR = 3000;
const PROBE_TIMEOUT = 8000;

export const retryDelay = (attempt) => Math.min(BASE_RETRY_DELAY * 2 ** attempt, MAX_RETRY_DELAY);

/** Any HTTP answer at all means the network is back; only a thrown fetch means it is not. */
export async function probeConnection(url = CRM_URL, fetcher = typeof fetch === "function" ? fetch : undefined) {
  if (typeof fetcher !== "function") return false;
  let timer;
  try {
    await Promise.race([
      fetcher(url, { method: "HEAD", cache: "no-store" }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), PROBE_TIMEOUT);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Wires React Query's caches to the network store. Returns the unsubscribe function. */
export function watchQueryClient(queryClient, store = useNetworkStore) {
  const onEvent = (event) => {
    if (event?.type !== "updated") return;
    const action = event.action;
    if (action?.type === "error") store.getState().reportError(action.error);
    else if (action?.type === "success") store.getState().reportSuccess();
  };
  const offQueries = queryClient.getQueryCache().subscribe(onEvent);
  const offMutations = queryClient.getMutationCache().subscribe(onEvent);
  // If anything ever drives React Query's onlineManager (e.g. NetInfo later), follow it.
  const offOnline = onlineManager.subscribe((online) => store.getState().setOffline(!online));
  return () => {
    offQueries();
    offMutations();
    offOnline();
  };
}

export default function OfflineBanner() {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const offline = useNetworkStore(selectOffline);
  const [backOnline, setBackOnline] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [checking, setChecking] = useState(false);
  const wasOffline = useRef(false);
  const retryTimer = useRef(null);

  useEffect(() => watchQueryClient(queryClient), [queryClient]);

  const check = useCallback(async () => {
    clearTimeout(retryTimer.current);
    setChecking(true);
    const ok = await probeConnection();
    setChecking(false);
    if (ok) useNetworkStore.getState().setOffline(false);
    else setAttempt((current) => current + 1);
  }, []);

  // While offline, probe with exponential backoff.
  useEffect(() => {
    if (!offline) return undefined;
    retryTimer.current = setTimeout(check, retryDelay(attempt));
    return () => clearTimeout(retryTimer.current);
  }, [offline, attempt, check]);

  // Coming back: show "Back online" briefly and refresh what is on screen.
  useEffect(() => {
    if (offline) {
      wasOffline.current = true;
      setBackOnline(false);
      return undefined;
    }
    setAttempt(0);
    if (!wasOffline.current) return undefined;
    wasOffline.current = false;
    setBackOnline(true);
    queryClient.refetchQueries({ type: "active" });
    const timer = setTimeout(() => setBackOnline(false), BACK_ONLINE_FOR);
    return () => clearTimeout(timer);
  }, [offline, queryClient]);

  if (!offline && !backOnline) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 8 }]}>
      <View style={[styles.banner, { borderColor: offline ? "rgba(244,63,94,0.35)" : "rgba(52,211,153,0.35)" }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <Ionicons name={offline ? "cloud-offline-outline" : "cloud-done-outline"} size={18} color={offline ? "#FB7185" : "#34D399"} style={{ flexShrink: 0 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>{offline ? "You're offline" : "Back online"}</Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {offline ? (checking ? "Checking your connection…" : "Some data may be out of date. We'll keep retrying.") : "Connection restored."}
          </Text>
        </View>
        {offline ? (
          <Pressable onPress={check} disabled={checking} hitSlop={8} accessibilityRole="button" style={({ pressed }) => [styles.retry, (pressed || checking) && { opacity: 0.6 }]}>
            <Text style={styles.retryText}>Retry now</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 16, right: 16, alignItems: "center", zIndex: 1000, elevation: 1000 },
  banner: { flexDirection: "row", alignItems: "center", gap: 10, maxWidth: 480, width: "100%", paddingVertical: 10, paddingLeft: 12, paddingRight: 10, borderRadius: radius.lg, borderWidth: 1, backgroundColor: "rgba(28,31,38,0.96)", ...shadow.card },
  title: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: "#FFFFFF" },
  subtitle: { fontSize: 11, lineHeight: 15, color: "rgba(255,255,255,0.6)" },
  retry: { flexShrink: 0, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  retryText: { fontSize: 11, lineHeight: 15, fontWeight: "600", color: colors.card },
});
