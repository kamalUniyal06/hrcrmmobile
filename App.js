import { useCallback, useEffect, useState } from "react";
import { StatusBar, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./src/lib/queryClient";
import { useAuthStore } from "./src/store/authStore";
import RootNavigator from "./src/navigation/RootNavigator";
import SessionBridge from "./src/components/SessionBridge";
import SplashScreen from "./src/components/SplashScreen";
import ToastHost from "./src/components/ui/Toast";

export default function App() {
  const status = useAuthStore((state) => state.status);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const [splashDone, setSplashDone] = useState(false);
  const finishSplash = useCallback(() => setSplashDone(true), []);

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
          barStyle={!splashDone || status === "signedIn" ? "dark-content" : "light-content"}
        />
        {status === "booting" ? <View style={{ flex: 1, backgroundColor: "#FFFFFF" }} /> : <RootNavigator />}
        {/* Covers the first screen while the session restores, then fades away. */}
        {splashDone ? null : <SplashScreen ready={status !== "booting"} onDone={finishSplash} />}
        {/* Always mounted: it carries the login cookies, so sessions restore on iOS too. */}
        <SessionBridge />
        <ToastHost />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
