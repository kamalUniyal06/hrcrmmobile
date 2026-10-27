import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { SafeAreaView } from "react-native-safe-area-context";
import { AUTH_URL, loginUrl } from "../config";
import { colors, radius, shadow, type } from "../theme";
import { IconButton } from "./ui";
import { isAuthorizeUrl, withAccountChooser } from "../utils/oauthUrl";

// Google refuses OAuth inside an embedded WebView unless it looks like a normal mobile browser.
const USER_AGENT = Platform.select({
  ios: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
});

const AUTH_ORIGIN = AUTH_URL.replace(/\/public\/index\.php$/, "");

// Google / Microsoft sign-in pages (account chooser, password, consent).
const PROVIDER_PAGE = /^https:\/\/(accounts\.google\.com|login\.microsoftonline\.com|login\.live\.com)\//i;

// Hides the provider's footer links (Microsoft: "Terms of use", "Privacy & cookies", "…" in
// div#footer; Google: the <footer> with language / Help / Privacy / Terms) so the card shows
// only the sign-in itself. A <style> tag survives the providers' in-page navigation.
const HIDE_FOOTER_SCRIPT = `
(function () {
  if (!/(^|\\.)(login\\.microsoftonline\\.com|login\\.live\\.com|accounts\\.google\\.com)$/.test(location.hostname)) return;
  function add() {
    if (document.getElementById("hrcrm-hide-footer")) return;
    var style = document.createElement("style");
    style.id = "hrcrm-hide-footer";
    style.textContent = "#footer, #footerLinks, footer { display: none !important; }";
    (document.head || document.documentElement).appendChild(style);
  }
  add();
  document.addEventListener("DOMContentLoaded", add);
})(); true;`;

// Runs inside pages on app.hrcrm.ai after OAuth: reads the `me` JSON and posts it back.
const READ_SESSION_SCRIPT = `
(function () {
  function post(payload) { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(payload)); }
  function parse(text) { try { return JSON.parse(text); } catch (e) { return null; } }
  var inline = parse((document.body && document.body.innerText) || "");
  if (inline && (inline.crm_access_token || inline.error)) { post({ type: "me", data: inline }); return; }
  fetch(${JSON.stringify(`${AUTH_URL}?controller=auth&action=me`)}, { credentials: "include", headers: { Accept: "application/json" } })
    .then(function (r) { return r.text().then(function (t) { return { status: r.status, body: parse(t) }; }); })
    .then(function (r) { post({ type: "me", status: r.status, data: r.body }); })
    .catch(function (e) { post({ type: "error", message: String(e && e.message || e) }); });
})(); true;`;

/**
 * Login card over the current screen. Loads the Google / Microsoft login URL; when the auth backend
 * redirects back to app.hrcrm.ai the injected script reads the session JSON and
 * `onSession(data)` receives it.
 */
export default function AuthWebView({ provider, visible, loginHint, onClose, onSession, onError }) {
  const [loading, setLoading] = useState(true);
  const [uri, setUri] = useState(() => loginUrl(provider));
  // With a picked account the page stays behind a "Signing in as …" cover and is only
  // shown when Google / Microsoft actually need the user (password, consent).
  const [needsUser, setNeedsUser] = useState(!loginHint);
  // Only Google / Microsoft pages are shown. The HRCRM redirect and session pages in
  // between (raw JSON) stay behind a plain spinner until the app opens.
  const [onProviderPage, setOnProviderPage] = useState(false);
  const settled = useRef(false);
  const adjusted = useRef(false);
  const webview = useRef(null);

  // Each opening is a new login attempt.
  useEffect(() => {
    if (visible) {
      settled.current = false;
      adjusted.current = false;
      setLoading(true);
      setNeedsUser(!loginHint);
      setOnProviderPage(false);
      setUri(loginUrl(provider));
    }
  }, [visible, provider, loginHint]);

  // Google / Microsoft keep their remembered accounts (no password again), but the
  // chooser is forced so the user picks the account instead of getting the last one.
  // Only the first authorize request of an attempt is adjusted: the providers reload it
  // themselves mid-login (Microsoft's sso_reload), and forcing it again would loop.
  const handleShouldStart = (request) => {
    if (adjusted.current || !isAuthorizeUrl(request.url)) return true;
    adjusted.current = true;
    const target = withAccountChooser(request.url, loginHint);
    if (target === request.url) return true;
    setUri(target);
    return false;
  };

  const handleMessage = (event) => {
    if (settled.current) return;
    let payload;
    try {
      payload = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (payload.type === "me" && payload.data?.crm_access_token) {
      settled.current = true;
      onSession(payload.data);
    } else if (payload.type === "me" && payload.data?.error) {
      onError?.(payload.data.error === "Invalid token" ? "Login did not complete. Please try again." : payload.data.error);
    } else if (payload.type === "error") {
      onError?.(payload.message);
    }
  };

  const trackPage = (event) => {
    const url = event.nativeEvent.url || "";
    // TEMP diagnostics: which page the card shows (path only, no query/tokens).
    if (__DEV__) console.log("[auth-page]", event.type || "load", url.split(/[?#]/)[0], "loading=" + String(event.nativeEvent.loading));
    setOnProviderPage(PROVIDER_PAGE.test(url));
  };

  const handleLoadEnd = (event) => {
    setLoading(false);
    trackPage(event);
    const url = event.nativeEvent.url || "";
    // A remembered account redirects straight back to HRCRM; a provider page that
    // finishes loading is waiting for the user.
    if (PROVIDER_PAGE.test(url)) setNeedsUser(true);
    const isAuthHost = url.startsWith(AUTH_ORIGIN) || /^https:\/\/([a-z0-9-]+\.)?hrcrm\.ai\//i.test(url);
    const isOAuthStep = /action=(googleLogin|microsoftLogin|googleCallback|microsoftCallback)/.test(url);
    if (isAuthHost && !isOAuthStep) webview.current?.injectJavaScript(READ_SESSION_SCRIPT);
  };

  // Its own white screen: a header with the title, and the provider's page in a card that
  // fills the rest of the screen (the page starts with the provider's logo and "Pick an
  // account", and scrolls inside the card when the account list is long).
  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Sign in with {provider === "microsoft" ? "Microsoft" : "Google"}</Text>
            <Text style={styles.subtitle}>Choose an account to continue to HRCRM</Text>
          </View>
          <IconButton icon="close" onPress={onClose} label="Cancel login" style={styles.close} size={20} color={colors.foreground} />
        </View>
        <View style={styles.center}>
          <View style={styles.card}>
            <View style={styles.body}>
              {visible ? (
                <WebView
                  ref={webview}
                  source={{ uri }}
                  onShouldStartLoadWithRequest={handleShouldStart}
                  userAgent={USER_AGENT}
                  sharedCookiesEnabled
                  thirdPartyCookiesEnabled
                  domStorageEnabled
                  javaScriptEnabled
                  incognito={false}
                  injectedJavaScriptBeforeContentLoaded={HIDE_FOOTER_SCRIPT}
                  injectedJavaScript={HIDE_FOOTER_SCRIPT}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  onMessage={handleMessage}
                  onLoadStart={(event) => {
                    setLoading(true);
                    trackPage(event);
                  }}
                  onNavigationStateChange={(state) => setOnProviderPage(PROVIDER_PAGE.test(state.url || ""))}
                  onLoadEnd={handleLoadEnd}
                  onError={(event) => onError?.(event.nativeEvent.description || "The login page could not be loaded.")}
                  style={{ flex: 1, backgroundColor: colors.card }}
                />
              ) : null}
              {loading && needsUser && onProviderPage ? (
                <View style={styles.loading} pointerEvents="none">
                  <View style={styles.loadingPill}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={type.small}>Loading…</Text>
                  </View>
                </View>
              ) : null}
              {visible && (!needsUser || !onProviderPage) ? (
                <View style={styles.cover}>
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 22, lineHeight: 29, fontWeight: "600", letterSpacing: -0.4, color: colors.foreground },
  subtitle: { fontSize: 13, lineHeight: 18, color: colors.mutedForeground, marginTop: 2 },
  center: { flex: 1, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 14 },
  card: { flex: 1, width: "100%", maxWidth: 560, alignSelf: "center", backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.card, elevation: 6 },
  close: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: colors.muted },
  body: { flex: 1 },
  loading: { position: "absolute", top: 16, left: 0, right: 0, alignItems: "center" },
  loadingPill: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  cover: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", gap: 8, padding: 24 },
});
