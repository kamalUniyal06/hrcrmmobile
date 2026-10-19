import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, type } from "../../theme";
import { Button, Notice, Screen } from "../../components/ui";
import AuthWebView from "../../components/AuthWebView";
import { useAuthStore } from "../../store/authStore";
import { toast } from "../../store/toastStore";
import { missingConfig } from "../../config";

export default function LoginScreen() {
  const [provider, setProvider] = useState(null);
  const signInWithMe = useAuthStore((state) => state.signInWithMe);
  const notice = useAuthStore((state) => state.notice);
  const clearNotice = useAuthStore((state) => state.clearNotice);
  const missing = missingConfig();

  const handleSession = async (data) => {
    try {
      await signInWithMe(data);
      setProvider(null);
      toast.success(`Signed in as ${data?.user?.email || "your account"}`);
    } catch (error) {
      toast.error(error.message || "Could not complete sign in.");
    }
  };

  return (
    <Screen contentStyle={styles.content} edges={["top", "bottom"]}>
      <View style={styles.hero}>
        <Image source={require("../../../assets/icon.png")} style={styles.logo} />
        <Text style={styles.brand}>HRCRM</Text>
        <Text style={styles.tagline}>The Future of Human Resources — Powered by AI.</Text>
      </View>

      <View style={styles.panel}>
        <Text style={type.title}>Sign in to your account</Text>
        <Text style={type.small}>Use the same Google or Microsoft account you use on app.hrcrm.ai.</Text>

        {notice ? <Notice tone="attention" icon="information-circle-outline" message={notice} action="Dismiss" onAction={clearNotice} /> : null}
        {missing.length ? (
          <Notice tone="closed" icon="key-outline" title="App keys missing" message={`Add ${missing.join(" and ")} to the .env file, then reload the app.`} />
        ) : null}

        <Button title="Continue with Google" icon="logo-google" variant="outline" full onPress={() => setProvider("google")} style={{ minHeight: 50 }} />
        <Button title="Continue with Microsoft" icon="logo-microsoft" variant="dark" full onPress={() => setProvider("microsoft")} style={{ minHeight: 50 }} />

        <View style={styles.footerRow}>
          <Ionicons name="shield-checkmark-outline" size={14} color={colors.mutedForeground} />
          <Text style={type.small}>Your session stays on this device. Nothing is shared.</Text>
        </View>
      </View>

      <AuthWebView
        provider={provider || "google"}
        visible={Boolean(provider)}
        onClose={() => setProvider(null)}
        onSession={handleSession}
        onError={(message) => toast.error(message)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: 0, gap: 0 },
  hero: { backgroundColor: colors.sidebar, paddingTop: 48, paddingBottom: 56, paddingHorizontal: 24, alignItems: "center", gap: 10, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  logo: { width: 64, height: 64, borderRadius: 16 },
  brand: { color: "#fff", fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  tagline: { color: colors.lime, fontSize: 14, textAlign: "center" },
  panel: { marginTop: -24, marginHorizontal: 16, backgroundColor: colors.card, borderRadius: radius.xl, padding: 20, gap: 14, borderWidth: 1, borderColor: colors.border },
  footerRow: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", marginTop: 4 },
});
