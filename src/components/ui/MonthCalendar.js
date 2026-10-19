import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, type } from "../../theme";
import { dateKey, monthLabel, WEEKDAY_LABELS } from "../../utils/dates";

/**
 * Month grid. `markers[dayKey]` = { tone, label } colours the cell;
 * `selected` / `rangeStart` / `rangeEnd` are "YYYY-MM-DD" keys.
 */
export default function MonthCalendar({ year, month, onPrev, onNext, markers = {}, selected, rangeStart, rangeEnd, onSelectDay, minKey, maxKey, legend }) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < offset; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day));
  while (cells.length % 7) cells.push(null);
  const today = dateKey(new Date());

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={onPrev} hitSlop={10} style={styles.navButton}><Ionicons name="chevron-back" size={18} color={colors.foreground} /></Pressable>
        <Text style={type.subheading}>{monthLabel(year, month)}</Text>
        <Pressable onPress={onNext} hitSlop={10} style={styles.navButton}><Ionicons name="chevron-forward" size={18} color={colors.foreground} /></Pressable>
      </View>
      <View style={styles.weekRow}>
        {WEEKDAY_LABELS.map((label) => (
          <Text key={label} style={styles.weekday}>{label}</Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((date, index) => {
          if (!date) return <View key={`empty-${index}`} style={styles.cell} />;
          const key = dateKey(date);
          const marker = markers[key];
          const disabled = (minKey && key < minKey) || (maxKey && key > maxKey);
          const inRange = rangeStart && rangeEnd && key >= rangeStart && key <= rangeEnd;
          const isEdge = key === rangeStart || key === rangeEnd || key === selected;
          const bg = isEdge ? colors.primary : inRange ? colors.primarySoft : marker ? markerColor(marker.tone) : "transparent";
          const fg = isEdge ? "#fff" : marker && !inRange ? markerText(marker.tone) : disabled ? colors.border : colors.foreground;
          return (
            <Pressable key={key} disabled={disabled || !onSelectDay} onPress={() => onSelectDay?.(key)} style={styles.cell}>
              <View style={[styles.day, { backgroundColor: bg }, key === today && !isEdge && styles.today]}>
                <Text style={[styles.dayText, { color: fg }]}>{date.getDate()}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {legend ? (
        <View style={styles.legend}>
          {legend.map((item) => (
            <View key={item.label} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: markerColor(item.tone) }]} />
              <Text style={type.small}>{item.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function markerColor(tone) {
  return { present: colors.successSoft, late: colors.attentionSoft, leave: colors.infoSoft, absent: colors.destructiveSoft, holiday: colors.lime, weekend: colors.muted, incomplete: colors.muted }[tone] || colors.muted;
}
function markerText(tone) {
  return { present: "#047857", late: colors.attention, leave: "#1D4ED8", absent: colors.destructive, holiday: colors.foreground, weekend: colors.mutedForeground, incomplete: colors.mutedForeground }[tone] || colors.foreground;
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  navButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" },
  weekRow: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "600", color: colors.mutedForeground },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  day: { flex: 1, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  today: { borderWidth: 1.5, borderColor: colors.primary },
  dayText: { fontSize: 13, fontWeight: "500" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 4 },
});
