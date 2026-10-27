import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, type } from "../../theme";
import { dateKey, monthLabel, WEEKDAY_LABELS } from "../../utils/dates";

const WEEKEND = new Set([0, 6]);

/**
 * Month grid. `markers[dayKey]` = { tone, label } colours the cell;
 * `selected` / `rangeStart` / `rangeEnd` are "YYYY-MM-DD" keys; `isDisabled(key)` blocks extra days (e.g. holidays).
 * Saturdays and Sundays show as off and cannot be picked unless `allowWeekends` is set.
 */
export default function MonthCalendar({ year, month, onPrev, onNext, markers = {}, selected, rangeStart, rangeEnd, onSelectDay, minKey, maxKey, isDisabled, allowWeekends = false, legend }) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < offset; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day));
  while (cells.length % 7) cells.push(null);
  const today = dateKey(new Date());
  const legendItems = [...(legend || []), ...(!allowWeekends && !(legend || []).some((item) => item.tone === "weekend") ? [{ label: "Weekend (off)", tone: "weekend" }] : [])];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={onPrev} hitSlop={10} style={styles.navButton}><Ionicons name="chevron-back" size={18} color={colors.foreground} /></Pressable>
        <Text style={[type.subheading, styles.monthTitle]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{monthLabel(year, month)}</Text>
        <Pressable onPress={onNext} hitSlop={10} style={styles.navButton}><Ionicons name="chevron-forward" size={18} color={colors.foreground} /></Pressable>
      </View>
      <View style={styles.weekRow}>
        {WEEKDAY_LABELS.map((label, index) => (
          <Text key={label} style={[styles.weekday, !allowWeekends && index >= 5 && styles.weekendLabel]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{label}</Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((date, index) => {
          if (!date) return <View key={`empty-${index}`} style={styles.cell} />;
          const key = dateKey(date);
          const marker = markers[key];
          // Saturday and Sunday are off: greyed and not selectable, unless the day carries real
          // data (e.g. attendance on a worked weekend) or the calendar allows weekends.
          const weekendOff = !allowWeekends && WEEKEND.has(date.getDay()) && (!marker || marker.tone === "weekend");
          const disabled = weekendOff || (minKey && key < minKey) || (maxKey && key > maxKey) || Boolean(isDisabled?.(key));
          const inRange = rangeStart && rangeEnd && key >= rangeStart && key <= rangeEnd;
          const isEdge = key === rangeStart || key === rangeEnd || key === selected;
          const bg = isEdge ? colors.primary : weekendOff ? markerColor("weekend") : inRange ? colors.primarySoft : marker ? markerColor(marker.tone) : "transparent";
          const fg = isEdge ? "#fff" : weekendOff ? colors.mutedForeground : marker && !inRange ? markerText(marker.tone) : disabled ? colors.border : colors.foreground;
          return (
            <Pressable key={key} disabled={disabled || !onSelectDay} onPress={() => onSelectDay?.(key)} style={styles.cell}>
              <View style={[styles.day, { backgroundColor: bg }, key === today && !isEdge && styles.today]}>
                <Text style={[styles.dayText, { color: fg }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{date.getDate()}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {legendItems.length ? (
        <View style={styles.legend}>
          {legendItems.map((item) => (
            <View key={item.label} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: markerColor(item.tone) }]} />
              <Text style={[type.small, { flexShrink: 1 }]}>{item.label}</Text>
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
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  monthTitle: { flex: 1, minWidth: 0, textAlign: "center" },
  navButton: { flexShrink: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" },
  weekRow: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", fontSize: 11, lineHeight: 15, fontWeight: "600", color: colors.mutedForeground },
  weekendLabel: { color: colors.destructive, opacity: 0.7 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  day: { flex: 1, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  today: { borderWidth: 1.5, borderColor: colors.primary },
  dayText: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%" },
  swatch: { flexShrink: 0, width: 12, height: 12, borderRadius: 4 },
});
