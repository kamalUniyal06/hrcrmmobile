// Right-hand drawer with one employee's month: totals, a status filter and the calendar.
// Web: employement/components/attendance/EmployeeAttendanceDrawer.jsx (+ AttendanceDayCell.jsx).
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, type } from "../../theme";
import { Avatar, ErrorState, LoadingState, Notice } from "../ui";
import { getMyActivityRange } from "../../api/dailyActivity.api";
import { getMyLeaves } from "../../api/leaves.api";
import { keys, usePublicHolidays } from "../../hooks/queries";
import { daySummary, groupActivityByDay, holidayMapOf } from "../../utils/attendance";
import { formatMinutes, leaveRecordsByDay } from "../../utils/adminAttendance";
import { dateKey, monthLabel, todayKey, WEEKDAY_LABELS } from "../../utils/dates";
import { plainText } from "../../utils/records";
import { STATUSES } from "./AttendanceStatus";
import DayDetailSheet from "./DayDetailSheet";

const STATUS_FILTERS = [
  ["all", "All status"],
  ["onTime", "On time"],
  ["late", "Late"],
  ["incomplete", "Incomplete"],
  ["missing", "Absent"],
  ["leave", "On leave"],
  ["dayOff", "Weekend / holiday"],
];

/**
 * `row` = { key, id, name, email, designation } or null (closed). `position`/`total` drive
 * the previous/next employee buttons.
 */
export default function EmployeeAttendanceDrawer({ row, position, total, onPrevious, onNext, onClose, lateAfter }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const panelWidth = Math.min(width, 640);
  const slide = useRef(new Animated.Value(panelWidth)).current;
  const open = Boolean(row);

  useEffect(() => {
    if (open) {
      slide.setValue(panelWidth);
      Animated.timing(slide, { toValue: 0, duration: 240, useNativeDriver: true }).start();
    }
  }, [open, panelWidth, slide]);

  const close = () => Animated.timing(slide, { toValue: panelWidth, duration: 200, useNativeDriver: true }).start(() => onClose());

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close employee attendance" />
      <Animated.View style={[styles.panel, { width: panelWidth, paddingTop: insets.top, paddingBottom: insets.bottom, transform: [{ translateX: slide }] }, panelWidth < width && styles.panelRounded]}>
        {row ? (
          <>
            <View style={styles.topBar}>
              <View style={styles.topNav}>
                <NavButton icon="chevron-back" label="Previous employee" disabled={position <= 1} onPress={onPrevious} />
                <NavButton icon="chevron-forward" label="Next employee" disabled={position >= total} onPress={onNext} />
                <Text style={[type.small, { flexShrink: 1 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{position} out of {total}</Text>
              </View>
              <Pressable onPress={close} hitSlop={10} accessibilityLabel="Close employee attendance" style={styles.closeButton}>
                <Ionicons name="close" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
            {/* Keyed by employee so the month and filter reset when stepping to the next person. */}
            <DrawerBody key={row.key} row={row} lateAfter={lateAfter} />
          </>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

function DrawerBody({ row, lateAfter }) {
  const [month, setMonth] = useState(() => new Date());
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const email = row.email || "";
  const employeeId = row.id || undefined;
  const from = dateKey(new Date(month.getFullYear(), month.getMonth(), 1));
  const to = dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const today = todayKey();

  const activity = useQuery({
    queryKey: ["dailyActivity", "admin", email, from, to],
    queryFn: () => getMyActivityRange({ email, from, to }),
    enabled: Boolean(email),
    refetchInterval: 60000,
  });
  const leaves = useQuery({
    queryKey: keys.myLeaves(employeeId, email),
    queryFn: () => getMyLeaves({ employeeId, email }),
    enabled: Boolean(employeeId || email),
    staleTime: 5 * 60 * 1000,
  });
  const holidays = usePublicHolidays();

  const holidayNames = useMemo(() => holidayMapOf(holidays.data || []), [holidays.data]);
  const leaveRecords = useMemo(() => leaveRecordsByDay(leaves.data || []), [leaves.data]);

  const monthDays = useMemo(() => {
    const byDay = groupActivityByDay(activity.data || []);
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(month.getFullYear(), month.getMonth(), index + 1);
      const key = dateKey(date);
      const records = byDay[key] || [];
      const summary = daySummary(records, key, today, Boolean(leaveRecords[key]), lateAfter);
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      // Weekends and holidays without activity are days off, not missing attendance.
      const status = summary.status === "missing" && (isWeekend || holidayNames[key]) ? "dayOff" : summary.status;
      return { key, date, records, summary, status, isWeekend };
    });
  }, [activity.data, month, today, leaveRecords, holidayNames, lateAfter]);

  const totals = { onTime: 0, late: 0, incomplete: 0, missing: 0, leave: 0, upcoming: 0, dayOff: 0, holiday: 0, worked: 0 };
  monthDays.forEach(({ key, summary, status }) => {
    totals[status] += 1;
    if (holidayNames[key]) totals.holiday += 1;
    totals.worked += summary.worked ?? 0;
  });
  // Blank cells before the 1st and after the last day keep whole Monday-first weeks.
  const leadingBlanks = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  const trailingBlanks = (7 - ((leadingBlanks + monthDays.length) % 7)) % 7;
  const isCurrentMonth = from.slice(0, 7) === today.slice(0, 7);
  const pending = activity.isPending && Boolean(email);

  const moveMonth = (direction) => setMonth(new Date(month.getFullYear(), month.getMonth() + direction, 1));

  return (
    <>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.profile}>
          <View style={styles.profileHead}>
            <Avatar name={row.name} size={52} />
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={type.heading} numberOfLines={2}>{row.name}</Text>
              <View style={styles.profileMeta}>
                <View style={{ minWidth: 0, flexShrink: 1 }}>
                  <Text style={styles.metaLabel}>Designation</Text>
                  <Text style={styles.metaValue} numberOfLines={2}>{row.designation || "Employee"}</Text>
                </View>
                <View style={{ minWidth: 0, flexShrink: 1 }}>
                  <Text style={styles.metaLabel}>Email</Text>
                  <Text style={[styles.metaValue, { color: colors.primaryDeep }]} numberOfLines={1} ellipsizeMode="tail">{row.email || "—"}</Text>
                </View>
              </View>
            </View>
          </View>
          <View style={styles.totals}>
            {[
              ["On time", totals.onTime],
              ["Late clock-in", totals.late],
              ["Incomplete", totals.incomplete],
              ["Absent", totals.missing],
              ["On leave", totals.leave],
              ["Holidays", totals.holiday],
              ["Worked", formatMinutes(totals.worked)],
            ].map(([label, value]) => (
              <View key={label} style={styles.total}>
                <Text style={styles.metaLabel} numberOfLines={2}>{label}</Text>
                <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{pending ? "—" : value}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.monthBar}>
          <Text style={[type.subheading, { flex: 1, minWidth: 0 }]}>{monthLabel(month.getFullYear(), month.getMonth())}</Text>
          <View style={styles.topNav}>
            <NavButton icon="chevron-back" label="Previous month" onPress={() => moveMonth(-1)} />
            <NavButton icon="chevron-forward" label="Next month" disabled={isCurrentMonth} onPress={() => moveMonth(1)} />
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {STATUS_FILTERS.map(([value, label]) => {
            const active = statusFilter === value;
            return (
              <Pressable key={value} onPress={() => setStatusFilter(value)} accessibilityState={{ selected: active }} style={[styles.filter, active && styles.filterActive]}>
                {value !== "all" ? <View style={[styles.dot, { backgroundColor: STATUSES[value].dot }]} /> : null}
                <Text style={[styles.filterText, active && { color: colors.primaryDeep }]} numberOfLines={1}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {!email ? (
          <Notice tone="closed" icon="alert-circle-outline" message="This employee does not have an email address for matching attendance." />
        ) : activity.isError ? (
          <ErrorState message={activity.error?.message || "Could not load attendance."} onRetry={() => activity.refetch()} />
        ) : pending ? (
          <LoadingState rows={4} variant="lines" label="Loading monthly attendance" style={styles.loading} />
        ) : (
          <View style={styles.calendar}>
            <View style={styles.weekRow}>
              {WEEKDAY_LABELS.map((label) => <Text key={label} style={styles.weekday} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{label}</Text>)}
            </View>
            <View style={styles.grid}>
              {Array.from({ length: leadingBlanks }, (_, index) => <View key={`lead-${index}`} style={[styles.cell, styles.blank]} />)}
              {monthDays.map((day) => {
                const leave = leaveRecords[day.key];
                const pressable = day.records.length > 0 || Boolean(leave);
                return (
                  <DayCell
                    key={day.key}
                    day={day}
                    isToday={day.key === today}
                    holidayName={holidayNames[day.key]}
                    leaveName={leave ? plainText(leave.type_of_leave || leave.leave_type) || "Approved leave" : undefined}
                    dimmed={statusFilter !== "all" && day.status !== statusFilter}
                    onPress={pressable ? () => setSelected({ date: day.key, records: day.records, leave }) : undefined}
                  />
                );
              })}
              {Array.from({ length: trailingBlanks }, (_, index) => <View key={`trail-${index}`} style={[styles.cell, styles.blank]} />)}
            </View>
          </View>
        )}
        <Text style={styles.footnote}>Tap a day with activity or leave to see its sessions.</Text>
      </ScrollView>
      <DayDetailSheet selected={selected} row={row} today={today} lateAfter={lateAfter} onClose={() => setSelected(null)} />
    </>
  );
}

// Web AttendanceDayCell, condensed for a phone-width week: date, status bar and first/last time.
function DayCell({ day, isToday, holidayName, leaveName, dimmed, onPress }) {
  const { summary, status, date, isWeekend } = day;
  const palette = STATUSES[status] || STATUSES.missing;
  const lastLogout = summary.sessions.map((session) => session.logout).filter(Boolean).sort((a, b) => a.stamp - b.stamp).at(-1);
  const dayType = !summary.first && (leaveName ? "Leave" : holidayName ? "Holiday" : isWeekend ? "Weekend" : null);
  const short = (time) => time?.replace(/ (AM|PM)$/, (match, half) => half[0].toLowerCase());
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityLabel={`${date.getDate()} ${palette.label}${holidayName ? `, ${holidayName}` : ""}`}
      style={({ pressed }) => [styles.cell, dayType && styles.cellMuted, isToday && styles.cellToday, dimmed && { opacity: 0.3 }, pressed && { opacity: 0.6 }]}
    >
      <View style={[styles.dayNumber, isToday && styles.dayNumberToday]}>
        <Text style={[styles.dayText, isToday && { color: "#fff" }]} numberOfLines={1}>{date.getDate()}</Text>
      </View>
      {summary.first ? (
        <View style={styles.times}>
          <Text style={[styles.timeText, status === "late" && { color: "#D97706" }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{short(summary.first.time)}</Text>
          <Text style={styles.timeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{lastLogout ? short(lastLogout.time) : "—"}</Text>
        </View>
      ) : dayType ? (
        <Text style={styles.typeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{dayType}</Text>
      ) : null}
      {status !== "upcoming" && status !== "dayOff" ? <View style={[styles.statusBar, { backgroundColor: palette.dot }]} /> : null}
    </Pressable>
  );
}

function NavButton({ icon, label, disabled = false, onPress }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityLabel={label} hitSlop={6} style={({ pressed }) => [styles.navButton, disabled && { opacity: 0.4 }, pressed && { backgroundColor: colors.muted }]}>
      <Ionicons name={icon} size={16} color={colors.foreground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(2,6,23,0.35)" },
  panel: { position: "absolute", top: 0, bottom: 0, right: 0, backgroundColor: "#F8FAFC", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 20, elevation: 16 },
  panelRounded: { borderTopLeftRadius: radius.xl, borderBottomLeftRadius: radius.xl, overflow: "hidden" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  topNav: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1, minWidth: 0 },
  navButton: { flexShrink: 0, width: 32, height: 32, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  closeButton: { flexShrink: 0, width: 36, height: 36, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  body: { padding: 16, gap: 14, paddingBottom: 32 },
  profile: { gap: 14, padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  profileHead: { flexDirection: "row", alignItems: "center", gap: 14 },
  profileMeta: { flexDirection: "row", flexWrap: "wrap", columnGap: 18, rowGap: 4 },
  metaLabel: { fontSize: 11, lineHeight: 15, color: colors.mutedForeground },
  metaValue: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: colors.foreground },
  totals: { flexDirection: "row", flexWrap: "wrap", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  total: { width: "25%", minWidth: 0, paddingVertical: 10, paddingHorizontal: 8, borderColor: colors.border, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
  totalValue: { fontSize: 17, lineHeight: 22, fontWeight: "600", color: colors.foreground, fontVariant: ["tabular-nums"] },
  monthBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  filters: { gap: 8, paddingRight: 8 },
  filter: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  filterActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  filterText: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: colors.mutedForeground },
  dot: { flexShrink: 0, width: 8, height: 8, borderRadius: 4 },
  loading: { paddingVertical: 24, paddingHorizontal: 4 },
  calendar: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: "hidden" },
  weekRow: { flexDirection: "row", backgroundColor: colors.muted, borderBottomWidth: 1, borderBottomColor: colors.border },
  weekday: { flex: 1, textAlign: "center", paddingVertical: 8, fontSize: 11, lineHeight: 15, fontWeight: "600", color: colors.mutedForeground },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, minHeight: 68, padding: 3, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.card },
  blank: { backgroundColor: "#F1F5F9" },
  cellMuted: { backgroundColor: "#F8FAFC" },
  cellToday: { backgroundColor: colors.primarySoft },
  dayNumber: { alignSelf: "flex-end", minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  dayNumberToday: { backgroundColor: colors.primary },
  dayText: { fontSize: 11, lineHeight: 14, fontWeight: "600", color: colors.mutedForeground },
  times: { marginTop: 2, gap: 1 },
  timeText: { alignSelf: "stretch", fontSize: 10, lineHeight: 13, fontWeight: "600", color: "#1E293B", textAlign: "center" },
  typeText: { alignSelf: "stretch", marginTop: 6, fontSize: 9, lineHeight: 12, fontWeight: "600", color: colors.mutedForeground, textAlign: "center" },
  statusBar: { position: "absolute", left: 4, right: 4, bottom: 4, height: 3, borderRadius: 2 },
  footnote: { fontSize: 12, lineHeight: 17, color: colors.mutedForeground },
});
