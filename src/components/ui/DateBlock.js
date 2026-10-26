import { StyleSheet, Text, View } from "react-native";
import { radius, tones } from "../../theme";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Calendar-style day number over a short month for a "YYYY-MM-DD" key, tinted by `tone`. */
export default function DateBlock({ dateKey: key, tone = "progress", size = 44 }) {
  const [, month, day] = String(key || "").split("-");
  const palette = tones[tone] || tones.progress;
  return (
    <View style={[styles.block, { minWidth: size, minHeight: size + 2, backgroundColor: palette.bg }]}>
      <Text style={[styles.day, { color: palette.fg }]} numberOfLines={1}>{Number(day) || "—"}</Text>
      <Text style={[styles.month, { color: palette.fg }]} numberOfLines={1}>{MONTHS[Number(month) - 1] || ""}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { flexShrink: 0, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingVertical: 2, paddingHorizontal: 2 },
  day: { fontSize: 17, fontWeight: "600", lineHeight: 20 },
  month: { fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, lineHeight: 13 },
});
