// Date input for forms and filters: a field that opens a month calendar in a sheet.
// Stands in for the web app's <input type="date">; `value` is a "YYYY-MM-DD" key or "".
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, spacing, type } from "../../theme";
import { formatDate } from "../../utils/dates";
import MonthCalendar from "./MonthCalendar";
import { Button, Sheet } from "./index";

const cursorFor = (value) => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})/);
  const now = new Date();
  return match ? { year: Number(match[1]), month: Number(match[2]) - 1 } : { year: now.getFullYear(), month: now.getMonth() };
};

export default function DateField({ label, value, onChange, placeholder = "Any date", minKey, maxKey, clearable = true, disabled = false, allowWeekends = false, style }) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => cursorFor(value));
  const move = (delta) =>
    setCursor(({ year, month }) => {
      const next = new Date(year, month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  const show = () => {
    setCursor(cursorFor(value));
    setOpen(true);
  };

  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable onPress={show} disabled={disabled} accessibilityRole="button" accessibilityLabel={label || placeholder} style={[styles.input, disabled && { opacity: 0.6 }]}>
        <Ionicons name="calendar-outline" size={16} color={colors.mutedForeground} style={{ flexShrink: 0 }} />
        <Text style={[type.body, { flex: 1, minWidth: 0 }, !value && { color: colors.mutedForeground }]} numberOfLines={2}>{value ? formatDate(value) : placeholder}</Text>
        {value && clearable ? (
          <Pressable onPress={() => onChange("")} hitSlop={8} accessibilityLabel={`Clear ${label || "date"}`} style={{ flexShrink: 0 }}>
            <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label || "Choose a date"}>
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.md }}>
          <MonthCalendar
            year={cursor.year}
            month={cursor.month}
            onPrev={() => move(-1)}
            onNext={() => move(1)}
            selected={value || undefined}
            minKey={minKey || undefined}
            maxKey={maxKey || undefined}
            allowWeekends={allowWeekends}
            onSelectDay={(key) => {
              onChange(key);
              setOpen(false);
            }}
          />
          {value && clearable ? (
            <Button
              title="Clear date"
              variant="outline"
              small
              onPress={() => {
                onChange("");
                setOpen(false);
              }}
            />
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.foreground },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", gap: 8 },
});
