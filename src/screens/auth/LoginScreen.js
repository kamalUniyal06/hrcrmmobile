import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, shadow, type } from "../../theme";
import { Button, Notice, Screen } from "../../components/ui";
import AuthWebView from "../../components/AuthWebView";
import { useAuthStore } from "../../store/authStore";
import { toast } from "../../store/toastStore";
import { missingConfig } from "../../config";
import { nativeMicrosoftAvailable, signInWithMicrosoftNative } from "../../services/microsoftAuth";

export default function LoginScreen() {
  const [provider, setProvider] = useState(null);
  const [loginHint, setLoginHint] = useState(null);
  const [microsoftBusy, setMicrosoftBusy] = useState(false);
  const signInWithMe = useAuthStore((state) => state.signInWithMe);
  const notice = useAuthStore((state) => state.notice);
  const clearNotice = useAuthStore((state) => state.clearNotice);
  const missing = missingConfig();
  const insets = useSafeAreaInsets();

  const handleSession = async (data) => {
    try {
      await signInWithMe(data);
      setProvider(null);
      toast.success(`Signed in as ${data?.user?.email || "your account"}`);
    } catch (error) {
      toast.error(error.message || "Could not complete sign in.");
    }
  };

  // Web login. AuthWebView forces the account chooser; `hint` is the account already
  // picked in a native dialog, so the provider goes straight to it.
  const openWebLogin = (name, hint = null) => {
    setLoginHint(hint);
    setProvider(name);
  };

  // Straight to Google's "Choose an account" page (remembered accounts + "Use another
  // account"). The native account dialog is skipped: without the backend's
  // googleTokenLogin route it could only add a second account picker before this one.
  const continueWithGoogle = () => openWebLogin("google");

  // Microsoft's sign-in page in a browser tab first; the web login takes over when it cannot be used.
  const continueWithMicrosoft = async () => {
    if (!nativeMicrosoftAvailable()) {
      openWebLogin("microsoft");
      return;
    }
    setMicrosoftBusy(true);
    try {
      const result = await signInWithMicrosoftNative();
      if (result.status === "ok") await handleSession(result.data);
      else if (result.status === "error") toast.error(result.reason);
      else if (result.status === "fallback") openWebLogin("microsoft", result.email);
    } finally {
      setMicrosoftBusy(false);
    }
  };

  return (
    <Screen contentStyle={styles.content} edges={["bottom"]}>
      <View style={[styles.hero, { paddingTop: insets.top + 40 }]}>
        <View style={styles.heroGlow} />
        {/* White tile: the logo's dark "HR" would vanish on the dark hero. */}
        <View style={styles.logoTile}>
          <Image source={require("../../../assets/hrcrm-icon.png")} style={styles.logo} resizeMode="contain" />
        </View>
        <Text style={styles.brand}>HRCRM</Text>
        <Text style={styles.tagline}>The Future of Human Resources — Powered by AI.</Text>
      </View>

      <View style={styles.panel}>
        <View style={{ gap: 6 }}>
          <Text style={[type.title, { color: colors.navy }]}>Sign in to your account</Text>
          <Text style={type.small}>Use the same Google or Microsoft account you use on app.hrcrm.ai.</Text>
        </View>

        {notice ? <Notice tone="attention" icon="information-circle-outline" message={notice} action="Dismiss" onAction={clearNotice} /> : null}
        {missing.length ? (
          <Notice tone="closed" icon="key-outline" title="App keys missing" message={`Add ${missing.join(" and ")} to the .env file, then restart Metro with npm run start:fresh.`} />
        ) : null}

        <View style={styles.buttons}>
          <Button title="Continue with Google" image={require("../../../assets/google-logo.png")} variant="outline" full onPress={continueWithGoogle} style={styles.button} />
          <Button title="Continue with Microsoft" image={require("../../../assets/microsoft-logo.png")} variant="dark" full loading={microsoftBusy} onPress={continueWithMicrosoft} style={[styles.button, styles.navyButton]} />
        </View>

        <View style={styles.footerRow}>
          <View style={styles.footerIcon}>
            <Ionicons name="shield-checkmark" size={14} color={colors.primary} />
          </View>
          <Text style={styles.footerText}>Your session stays on this device. Nothing is shared.</Text>
        </View>
      </View>

      <AuthWebView
        provider={provider || "google"}
        visible={Boolean(provider)}
        loginHint={loginHint}
        onClose={() => setProvider(null)}
        onSession={handleSession}
        onError={(message) => toast.error(message)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: 0, gap: 0 },
  // Same deep navy + blue glow as the in-app banners.
  hero: { backgroundColor: colors.navy, paddingBottom: 56, paddingHorizontal: 24, alignItems: "center", gap: 10, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: "hidden" },
  heroGlow: { position: "absolute", width: 260, height: 260, borderRadius: 130, right: -90, top: -110, backgroundColor: "rgba(212,250,60,0.16)" },
  logoTile: { flexShrink: 0, width: 62, height: 62, borderRadius: 17, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  logo: { width: 46, height: 46 },
  brand: { color: "#fff", fontSize: 28, lineHeight: 34, fontWeight: "600", letterSpacing: -0.5 },
  tagline: { color: "#93C5FD", fontSize: 14, lineHeight: 20, textAlign: "center" },
  panel: { marginTop: -24, marginHorizontal: 16, backgroundColor: colors.card, borderRadius: radius.xl, paddingHorizontal: 22, paddingTop: 28, paddingBottom: 26, gap: 22, borderWidth: 1, borderColor: colors.border, ...shadow.card, elevation: 4 },
  buttons: { gap: 12 },
  button: { minHeight: 54 },
  navyButton: { backgroundColor: colors.navy, borderColor: colors.navy },
  footerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2, paddingHorizontal: 4 },
  footerIcon: { flexShrink: 0, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  footerText: { flex: 1, flexShrink: 1, minWidth: 0, fontSize: 12, lineHeight: 17, color: colors.primaryDeep },
});
