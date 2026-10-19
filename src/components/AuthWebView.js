import { useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { SafeAreaView } from "react-native-safe-area-context";
import { AUTH_URL, loginUrl } from "../config";
import { colors, type } from "../theme";
import { IconButton } from "./ui";

// Google refuses OAuth inside an embedded WebView unless it looks like a normal mobile browser.
const USER_AGENT = Platform.select({
  ios: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
});

const AUTH_ORIGIN = AUTH_URL.replace(/\/public\/index\.php$/, "");

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
 * Full-screen login. Loads the Google / Microsoft login URL; when the auth backend
 * redirects back to app.hrcrm.ai the injected script reads the session JSON and
 * `onSession(data)` receives it.
 */
export default function AuthWebView({ provider, visible, onClose, onSession, onError }) {
  const [loading, setLoading] = useState(true);
  const settled = useRef(false);
  const webview = useRef(null);

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

  const handleLoadEnd = (event) => {
    setLoading(false);
    const url = event.nativeEvent.url || "";
    const isAuthHost = url.startsWith(AUTH_ORIGIN) || /^https:\/\/([a-z0-9-]+\.)?hrcrm\.ai\//i.test(url);
    const isOAuthStep = /action=(googleLogin|microsoftLogin|googleCallback|microsoftCallback)/.test(url);
    if (isAuthHost && !isOAuthStep) webview.current?.injectJavaScript(READ_SESSION_SCRIPT);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.bar}>
          <IconButton icon="close" onPress={onClose} label="Cancel login" />
          <Text style={type.subheading}>{provider === "microsoft" ? "Microsoft" : "Google"} sign in</Text>
          <View style={{ width: 36 }} />
        </View>
        {visible ? (
          <WebView
            ref={webview}
            source={{ uri: loginUrl(provider) }}
            userAgent={USER_AGENT}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            domStorageEnabled
            javaScriptEnabled
            incognito={false}
            onMessage={handleMessage}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={handleLoadEnd}
            onError={(event) => onError?.(event.nativeEvent.description || "The login page could not be loaded.")}
            style={{ flex: 1, backgroundColor: colors.background }}
          />
        ) : null}
        {loading ? (
          <View style={styles.loading} pointerEvents="none">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  loading: { position: "absolute", top: 60, left: 0, right: 0, alignItems: "center" },
});
