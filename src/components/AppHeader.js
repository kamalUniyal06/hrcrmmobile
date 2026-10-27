// Top bar of the admin tab screens: menu button, HRCRM brand, profile shortcut.
// Same brand treatment as the employee home app bar.
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius } from "../theme";
import { selectEmail, useAuthStore } from "../store/authStore";
import { initials } from "../utils/records";
import MenuButton from "./MenuButton";
import { navigationRef } from "../navigation/navigationRef";

const LOGO = require("../../assets/hrcrm-icon.png");

export default function AppHeader() {
  const insets = useSafeAreaInsets();
  const email = useAuthStore(selectEmail);
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6 }]}>
      <MenuButton />
      <View style={styles.brand} accessibilityRole="header">
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
        <Text style={styles.brandText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>HRCRM</Text>
      </View>
      <Pressable
        onPress={() => navigationRef.isReady() && navigationRef.navigate("Account")}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Open profile"
        style={({ pressed }) => [styles.profile, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.profileText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{initials(email.split("@")[0] || "?")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingBottom: 8, backgroundColor: colors.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  brand: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8 },
  logo: { flexShrink: 0, width: 32, height: 32, borderRadius: radius.sm },
  brandText: { fontSize: 22, lineHeight: 29, fontWeight: "600", letterSpacing: -0.3, color: colors.navy, flexShrink: 1 },
  profile: { flexShrink: 0, width: 36, height: 36, borderRadius: 18, marginRight: 4, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft, borderWidth: 2, borderColor: colors.primary },
  profileText: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.primary },
});
