import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, shadow, tones, type } from "../../theme";
import { Button, Card, Chip, Notice, Row, Screen, SectionTitle } from "../../components/ui";
import { selectRole, useAuthStore } from "../../store/authStore";
import { missingConfig } from "../../config";
import { initials } from "../../utils/records";

const ROLE_LABEL = { admin: "Admin", employee: "Employee", candidate: "Candidate" };
const HERO_BANDS = Array.from({ length: 10 }, (_, index) => (index + 1) / 10);

// Tints cycled across the shortcut icons so the list reads at a glance.
const SHORTCUT_TONES = ["info", "success", "attention", "progress", "closed"];

/**
 * "Profile" tab: who is signed in, role-specific shortcuts, sign out.
 * `links` = [{ icon, title, subtitle, screen, params }] from the role navigator.
 */
export default function AccountScreen({ navigation, route }) {
  const user = useAuthStore((state) => state.user);
  const userInfo = useAuthStore((state) => state.userInfo);
  const role = useAuthStore(selectRole);
  const signOut = useAuthStore((state) => state.signOut);
  const links = route?.params?.links || [];
  const missing = missingConfig();
  const handle = String(user?.email || "").split("@")[0];
  const displayName = handle ? handle.charAt(0).toUpperCase() + handle.slice(1) : "Profile";

  const confirmSignOut = () =>
    Alert.alert("Sign out?", "You will need to sign in with Google or Microsoft again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => signOut() },
    ]);

  const details = [
    { icon: "mail", tone: "info", label: "Email", value: user?.email },
    { icon: "person", tone: "success", label: "Type", value: userInfo?.subject_type, capitalize: true },
    { icon: "flag", tone: "attention", label: "Stage", value: userInfo?.stage },
    { icon: "shield-checkmark", tone: "progress", label: "Status", value: userInfo?.status, capitalize: true },
  ].filter((item) => item.value !== undefined && item.value !== null && item.value !== "");

  return (
    <Screen>
      {/* Profile banner: the side menu's ink-to-green gradient. */}
      <View style={styles.hero}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {HERO_BANDS.map((alpha, index) => (
            <View key={index} style={{ flex: 1, backgroundColor: `rgba(6,64,48,${alpha})` }} />
          ))}
        </View>
        <View style={styles.heroGlow} />
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(displayName)}</Text>
          <View style={styles.onlineDot} />
        </View>
        <View style={{ alignItems: "center", gap: 2, alignSelf: "stretch" }}>
          <Text style={styles.name} numberOfLines={2}>{displayName}</Text>
          <Text style={styles.email} numberOfLines={1} ellipsizeMode="tail" adjustsFontSizeToFit minimumFontScale={0.8}>{user?.email || "Signed in"}</Text>
        </View>
        <Row style={{ flexWrap: "wrap", justifyContent: "center", columnGap: 8, rowGap: 8, alignSelf: "stretch", marginTop: 2 }}>
          <Chip label={ROLE_LABEL[role]} tone="lime" />
          {/* Admins show only the "Admin" badge (their stage, e.g. "HR", is not shown here). */}
          {userInfo?.stage && role !== "admin" ? (
            <View style={styles.stageChip}>
              <Text style={styles.stageText} numberOfLines={2}>{userInfo.stage}</Text>
            </View>
          ) : null}
        </Row>
      </View>

      {missing.length ? (
        <Notice tone="closed" icon="key-outline" title="App keys missing" message={`Requests will fail until ${missing.join(" and ")} are set in .env.`} />
      ) : null}

      {links.length ? (
        <View style={styles.section}>
          <SectionTitle title="Shortcuts" />
          {/* Each shortcut is its own card, spaced apart. */}
          <View style={styles.shortcutList}>
            {links.map((link, index) => {
              // A link may set its own tone (the red "I want to resign"); others cycle.
              const danger = link.tone === "closed";
              const tone = tones[link.tone || SHORTCUT_TONES[index % SHORTCUT_TONES.length]];
              return (
                <Pressable
                  key={link.title}
                  onPress={() => navigation.navigate(link.screen, link.params)}
                  style={({ pressed }) => [styles.shortcut, danger && styles.shortcutDanger, pressed && { opacity: 0.7 }]}
                >
                  <View style={[styles.shortcutIcon, { backgroundColor: tone.bg }]}>
                    <Ionicons name={link.icon} size={18} color={tone.fg} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[type.subheading, danger && { color: colors.destructive }]} numberOfLines={2}>{link.title}</Text>
                    {link.subtitle ? <Text style={type.small} numberOfLines={2}>{link.subtitle}</Text> : null}
                  </View>
                  <View style={[styles.chevron, danger && { backgroundColor: colors.destructiveSoft }]}>
                    <Ionicons name="chevron-forward" size={16} color={danger ? colors.destructive : colors.primary} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionTitle title="Account details" />
        <Card style={styles.listCard}>
          {details.map((item, index) => {
            const palette = tones[item.tone] || tones.progress;
            const value = String(item.value);
            return (
              <View key={item.label} style={[styles.detail, index > 0 && styles.rowBorder]}>
                <View style={[styles.detailIcon, { backgroundColor: palette.bg }]}>
                  <Ionicons name={item.icon} size={17} color={palette.fg} />
                </View>
                {/* Label above value: long values (email, record ID) get the full width. */}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.detailLabel}>{item.label}</Text>
                  <Text style={styles.detailValue}>
                    {item.capitalize ? value.charAt(0).toUpperCase() + value.slice(1) : value}
                  </Text>
                </View>
              </View>
            );
          })}
        </Card>
      </View>

      <View style={styles.signOutArea}>
        <Button title="Sign out" icon="log-out-outline" variant="destructive" full onPress={confirmSignOut} style={styles.signOut} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  hero: { alignItems: "center", gap: 12, paddingVertical: 28, paddingHorizontal: 18, borderRadius: radius.xl, backgroundColor: colors.navy, overflow: "hidden" },
  heroGlow: { position: "absolute", width: 200, height: 200, borderRadius: 100, right: -70, top: -100, backgroundColor: "rgba(212,250,60,0.16)" },
  avatar: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", backgroundColor: colors.lime, borderWidth: 3, borderColor: "rgba(255,255,255,0.9)" },
  avatarText: { fontSize: 28, lineHeight: 34, fontWeight: "600", color: colors.navy },
  name: { textAlign: "center", fontSize: 22, lineHeight: 28, fontWeight: "600", letterSpacing: -0.3, color: "#FFFFFF" },
  onlineDot: { position: "absolute", right: 2, bottom: 2, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.success, borderWidth: 3, borderColor: colors.navy },
  email: { fontSize: 14, lineHeight: 19, color: "rgba(255,255,255,0.75)", maxWidth: "100%", textAlign: "center" },
  stageChip: { flexShrink: 1, maxWidth: "100%", paddingVertical: 5, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.18)" },
  stageText: { textAlign: "center", fontSize: 13, lineHeight: 18, fontWeight: "600", color: "#FFFFFF" },
  listCard: { paddingVertical: 4, paddingHorizontal: 14, gap: 0 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  shortcutList: { gap: 12 },
  shortcut: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 14, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  shortcutDanger: { borderColor: "rgba(212,24,61,0.22)" },
  shortcutIcon: { flexShrink: 0, width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  chevron: { flexShrink: 0, width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  detail: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  detailIcon: { flexShrink: 0, width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  detailLabel: { ...type.tiny, fontSize: 10, letterSpacing: 0.6 },
  detailValue: { fontSize: 15, lineHeight: 20, fontWeight: "600", color: colors.navy, marginTop: 2 },
  signOutArea: { marginTop: 6, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  signOut: { minHeight: 50 },
});
