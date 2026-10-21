import { useEffect } from "react";
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./src/lib/queryClient";
import { colors } from "./src/theme";
import { useAuthStore } from "./src/store/authStore";
import RootNavigator from "./src/navigation/RootNavigator";
import SessionBridge from "./src/components/SessionBridge";
import ToastHost from "./src/components/ui/Toast";

function Splash() {
  return (
    <View style={styles.splash}>
      <Text style={styles.brand}>HRCRM</Text>
      <ActivityIndicator color={colors.lime} />
    </View>
  );
}

export default function App() {
  const status = useAuthStore((state) => state.status);
  const bootstrap = useAuthStore((state) => state.bootstrap);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (status === "signedOut") queryClient.clear();
  }, [status]);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar
          translucent
          backgroundColor="transparent"
          barStyle={status === "signedIn" ? "dark-content" : "light-content"}
        />
        {status === "booting" ? <Splash /> : <RootNavigator />}
        {/* Always mounted: it carries the login cookies, so sessions restore on iOS too. */}
        <SessionBridge />
        <ToastHost />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.sidebar, alignItems: "center", justifyContent: "center", gap: 16 },
  brand: { color: "#fff", fontSize: 32, fontWeight: "700", letterSpacing: -0.5 },
});
