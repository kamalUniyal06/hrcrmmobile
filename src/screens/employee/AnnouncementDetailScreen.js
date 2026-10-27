import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, type } from "../../theme";
import { Button, Card, EmptyState, Screen } from "../../components/ui";
import RichContent from "../../components/RichContent";
import { formatDate } from "../../utils/dates";
import { plainText } from "../../utils/records";

/**
 * Full announcement opened from a card. `route.params.alert` is the record; `manage` (admin home)
 * adds a shortcut to the Announcements page.
 */
export default function AnnouncementDetailScreen({ route, navigation }) {
  const alert = route?.params?.alert;
  if (!alert) {
    return (
      <Screen>
        <EmptyState icon="megaphone-outline" title="Announcement not found" message="Go back and open it again." />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.heroIcon}>
          <Ionicons name="megaphone" size={22} color="#FFFFFF" />
        </View>
        <Text style={styles.eyebrow}>Announcement</Text>
        <Text style={styles.title}>{plainText(alert.name) || "Announcement"}</Text>
        {alert.date_entered ? (
          <View style={styles.datePill}>
            <Ionicons name="time-outline" size={13} color="#FFFFFF" style={{ flexShrink: 0 }} />
            <Text style={styles.dateText}>{formatDate(alert.date_entered)}</Text>
          </View>
        ) : null}
      </View>

      {/* Paragraphs keep their breaks, pictures show at their own shape and tables stay tables. */}
      <Card style={styles.body}>
        <RichContent value={alert.description} empty="This announcement has no details." />
      </Card>

      {route?.params?.manage ? (
        <Button title="Manage announcements" icon="settings-outline" variant="secondary" full onPress={() => navigation.navigate("SystemAlerts")} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: 20, gap: 8, overflow: "hidden" },
  heroGlow: { position: "absolute", width: 200, height: 200, borderRadius: 100, right: -70, top: -100, backgroundColor: "rgba(212,250,60,0.16)" },
  heroIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, marginBottom: 4 },
  eyebrow: { ...type.tiny, color: "rgba(255,255,255,0.6)", letterSpacing: 1 },
  title: { fontSize: 22, lineHeight: 29, fontWeight: "600", letterSpacing: -0.3, color: "#FFFFFF" },
  datePill: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", maxWidth: "100%", marginTop: 4, paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.12)" },
  dateText: { flexShrink: 1, fontSize: 12, lineHeight: 17, fontWeight: "600", color: "#FFFFFF" },
  body: { padding: 20 },
});
