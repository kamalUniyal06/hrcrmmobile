import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { ME_URL, registerBridgeRefresher } from "../services/crmAuth";
import { useAuthStore } from "../store/authStore";

const READ_SCRIPT = `
(function () {
  var text = (document.body && document.body.innerText) || "";
  var data = null; try { data = JSON.parse(text); } catch (e) {}
  window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: "me", data: data, raw: data ? "" : text.slice(0, 200) }));
})(); true;`;

/**
 * Invisible WebView that holds the auth cookies. When the CRM token expires and a
 * native fetch cannot reach the session, crmAuth asks this bridge to load `me`
 * and hand back the JSON. Mounted once while the user is signed in.
 */
export default function SessionBridge() {
  const [request, setRequest] = useState(null); // { id, resolve, reject }
  const webview = useRef(null);
  const pending = useRef(null);
  const setBridgeReady = useAuthStore((state) => state.setBridgeReady);

  useEffect(() => {
    const unregister = registerBridgeRefresher(
      () =>
        new Promise((resolve, reject) => {
          if (pending.current) {
            pending.current.reject(new Error("A session refresh is already in progress."));
          }
          const timer = setTimeout(() => {
            if (pending.current?.id === id) {
              pending.current = null;
              reject(new Error("The session refresh timed out."));
            }
          }, 20000);
          const id = Date.now();
          pending.current = { id, resolve, reject, timer };
          setRequest({ id });
        }),
    );
    setBridgeReady(true);
    return () => {
      unregister();
      setBridgeReady(false);
    };
  }, [setBridgeReady]);

  const finish = (handler) => {
    const current = pending.current;
    if (!current) return;
    clearTimeout(current.timer);
    pending.current = null;
    handler(current);
  };

  const handleMessage = (event) => {
    let payload;
    try {
      payload = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    finish(({ resolve, reject }) => {
      if (payload.data?.crm_access_token) resolve(payload.data);
      else {
        const error = new Error(payload.data?.error || "The session is no longer valid.");
        error.status = payload.data?.error ? 401 : 500;
        reject(error);
      }
    });
  };

  if (!request) return null;
  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        key={request.id}
        ref={webview}
        source={{ uri: `${ME_URL}&_=${request.id}` }}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        javaScriptEnabled
        cacheEnabled={false}
        onMessage={handleMessage}
        onLoadEnd={() => webview.current?.injectJavaScript(READ_SCRIPT)}
        onError={() => finish(({ reject }) => reject(new Error("Could not reach the HRCRM server.")))}
        onHttpError={(event) => {
          const status = event.nativeEvent.statusCode;
          if (status === 401 || status === 403) {
            finish(({ reject }) => {
              const error = new Error("Your session has expired.");
              error.status = status;
              reject(error);
            });
          }
        }}
        style={{ width: 1, height: 1, opacity: 0 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { position: "absolute", width: 1, height: 1, left: -10, top: -10, opacity: 0 },
});
