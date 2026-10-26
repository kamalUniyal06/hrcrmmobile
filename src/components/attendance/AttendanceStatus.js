// Status styles and time spans shared by the admin attendance list, the employee drawer and the day sheet.
// Web: employement/components/attendance/AdminAttendanceDashboard.jsx (statuses, TimeSpan, ClockInOut, LunchInOut).
import { StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../../theme";
import { clockSpan, formatMinutes, lunchSpan } from "../../utils/adminAttendance";

export const STATUSES = {
  onTime: { label: "On time", bg: "#ECFDF5", fg: "#065F46", bar: "#6EE7B7", dot: "#10B981" },
  late: { label: "Late", bg: "#FFFBEB", fg: "#78350F", bar: "#FCD34D", dot: "#FBBF24" },
  incomplete: { label: "Incomplete", bg: "#FFF7ED", fg: "#9A3412", bar: "#FDBA74", dot: "#FB923C" },
  missing: { label: "No record", bg: "#F8FAFC", fg: "#94A3B8", bar: "#E2E8F0", dot: "#CBD5E1" },
  leave: { label: "On leave", bg: "#EEF2FF", fg: "#3730A3", bar: "#A5B4FC", dot: "#6366F1" },
  upcoming: { label: "Upcoming", bg: "#FFFFFF", fg: "#CBD5E1", bar: "transparent", dot: "#E2E8F0" },
  halfDay: { label: "Half-day leave", bg: "#F0F9FF", fg: "#075985", bar: "#7DD3FC", dot: "#0EA5E9" },
  dayOff: { label: "Weekend / holiday", bg: "#F1F5F9", fg: "#64748B", bar: "#CBD5E1", dot: "#94A3B8" },
};

export const LEGEND_ORDER = ["onTime", "late", "incomplete", "leave", "halfDay", "missing"];

export function StatusPill({ status, label, small = false, style }) {
  const palette = STATUSES[status] || STATUSES.missing;
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg, borderLeftColor: palette.bar }, small && styles.pillSmall, style]}>
      <View style={[styles.dot, { backgroundColor: palette.dot }]} />
      <Text style={[styles.pillText, { color: palette.fg }, small && { fontSize: 11, lineHeight: 15 }]} numberOfLines={2}>{label || palette.label}</Text>
    </View>
  );
}

/** Small rounded tag under a status ("Half-day leave", "On leave"). */
export function StatusTag({ status, label }) {
  const palette = STATUSES[status] || STATUSES.missing;
  return (
    <View style={[styles.tag, { backgroundColor: palette.bg }]}>
      <Text style={[styles.tagText, { color: palette.fg }]} numberOfLines={2}>{label || palette.label}</Text>
    </View>
  );
}

export function Legend({ statuses = LEGEND_ORDER }) {
  return (
    <View style={styles.legend}>
      {statuses.map((status) => (
        <View key={status} style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: STATUSES[status].dot }]} />
          <Text style={styles.legendText} numberOfLines={2}>{STATUSES[status].label}</Text>
        </View>
      ))}
    </View>
  );
}

// "09:30 AM ●─ 8h 12m ─● 06:42 PM": a start time, an end time and the gap between them.
export function TimeSpan({ start, end, middle, startStyle, endStyle, open = false }) {
  const line = [styles.line, open && styles.lineOpen];
  return (
    <View style={styles.span}>
      <Text style={[styles.time, startStyle]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{start}</Text>
      <View style={styles.spanMiddle}>
        <View style={styles.spanDot} />
        <View style={line} />
        <Text style={styles.spanText} numberOfLines={1}>{middle}</Text>
        <View style={line} />
        <View style={[styles.spanDot, open && { backgroundColor: "#FDBA74" }]} />
      </View>
      <Text style={[styles.time, endStyle]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{end}</Text>
    </View>
  );
}

// Late arrivals and missing clock-outs are highlighted.
export function ClockInOut({ summary, isToday }) {
  if (!summary.first) return <Text style={styles.empty}>—</Text>;
  const { lastLogout, closed, stillIn } = clockSpan(summary);
  return (
    <TimeSpan
      start={summary.first.time}
      startStyle={summary.status === "late" && { color: "#D97706" }}
      middle={summary.inOffice !== null && summary.inOffice !== undefined ? formatMinutes(summary.inOffice) : stillIn && isToday ? "In office" : "—"}
      end={closed ? lastLogout.time : isToday ? "Working" : "No clock-out"}
      endStyle={!closed && [styles.openEnd, { color: isToday ? "#059669" : "#EA580C" }]}
      open={!closed}
    />
  );
}

// Lunch longer than the configured limit is highlighted.
export function LunchInOut({ sessions, limit }) {
  const lunch = lunchSpan(sessions);
  if (!lunch) return <Text style={styles.empty}>—</Text>;
  return (
    <TimeSpan
      start={lunch.start?.time || "—"}
      middle={lunch.totalBreak || !lunch.onLunch ? `${formatMinutes(lunch.totalBreak)} break` : "—"}
      end={lunch.onLunch ? "On lunch" : lunch.end?.time || "—"}
      endStyle={lunch.onLunch ? [styles.openEnd, { color: "#EA580C" }] : lunch.totalBreak > limit && { color: "#D97706" }}
      open={lunch.onLunch}
    />
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", maxWidth: "100%", flexShrink: 1, borderLeftWidth: 3, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 10 },
  pillSmall: { paddingVertical: 4, paddingHorizontal: 8 },
  pillText: { fontSize: 12, lineHeight: 16, fontWeight: "600", flexShrink: 1, minWidth: 0 },
  dot: { flexShrink: 0, width: 8, height: 8, borderRadius: 4 },
  tag: { alignSelf: "flex-start", maxWidth: "100%", borderRadius: radius.pill, paddingVertical: 2, paddingHorizontal: 8 },
  tagText: { fontSize: 10, lineHeight: 14, fontWeight: "600" },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%" },
  legendText: { flexShrink: 1, fontSize: 12, lineHeight: 16, color: colors.mutedForeground },
  // Wraps the end time onto a second line instead of overflowing the card when the row is narrow.
  span: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 2, flexShrink: 1, minWidth: 0 },
  spanMiddle: { flexDirection: "row", alignItems: "center", flexShrink: 1, minWidth: 0 },
  spanDot: { flexShrink: 0, width: 6, height: 6, borderRadius: 3, backgroundColor: "#CBD5E1" },
  line: { flexShrink: 0, width: 10, height: 1, backgroundColor: "#E2E8F0" },
  lineOpen: { height: 0, borderTopWidth: 1, borderStyle: "dashed", borderColor: "#CBD5E1", backgroundColor: "transparent" },
  spanText: { fontSize: 11, lineHeight: 15, color: "#94A3B8", paddingHorizontal: 4, flexShrink: 1 },
  time: { flexShrink: 0, fontSize: 13, lineHeight: 18, fontWeight: "600", color: "#1E293B" },
  openEnd: { fontSize: 12, lineHeight: 17, fontWeight: "500" },
  empty: { fontSize: 13, lineHeight: 18, color: "#94A3B8" },
});
