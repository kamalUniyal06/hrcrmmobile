import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, tones, type } from "../../theme";
import { Card, Chip, Screen, Row } from "../../components/ui";
import MonthCalendar from "../../components/ui/MonthCalendar";
import { getMyActivityRange } from "../../api/dailyActivity.api";
import { getMyLeaves } from "../../api/leaves.api";
import { keys, useAttendanceLimits, useEmail, usePublicHolidays, useUserId } from "../../hooks/queries";
import { daySummary, groupActivityByDay, holidayMapOf, leaveDaysOf } from "../../utils/attendance";
import { dateKey, formatDate, formatHours, isWeekend, todayKey } from "../../utils/dates";

const LEGEND = [
  { label: "On time", tone: "present" },
  { label: "Late", tone: "late" },
  { label: "Leave", tone: "leave" },
  { label: "Absent", tone: "absent" },
  { label: "Holiday", tone: "holiday" },
];

/** Monthly attendance calendar. `route.params.email` lets admins open another employee. */
export default function AttendanceScreen({ route }) {
  const myEmail = useEmail();
  const myId = useUserId();
  const email = route?.params?.email || myEmail;
  const employeeId = route?.params?.email ? route.params.employeeId : myId;
  const title = route?.params?.name ? `${route.params.name}` : "My attendance";
  const limits = useAttendanceLimits();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selected, setSelected] = useState(todayKey());
  const today = todayKey();

  const from = dateKey(new Date(cursor.year, cursor.month, 1));
  const to = dateKey(new Date(cursor.year, cursor.month + 1, 0));

  const activity = useQuery({
    queryKey: keys.activityRange(email, from, to),
    queryFn: () => getMyActivityRange({ email, from, to }),
    enabled: Boolean(email),
    staleTime: 5 * 60 * 1000,
  });
  const leaves = useQuery({
    queryKey: keys.myLeaves(employeeId, email),
    queryFn: () => getMyLeaves({ employeeId, email }),
    enabled: Boolean(employeeId || email),
    staleTime: 5 * 60 * 1000,
  });
  const holidays = usePublicHolidays();

  const { markers, byDay, leaveDays, holidayMap, counts } = useMemo(() => {
    const dayMap = groupActivityByDay(activity.data || []);
    const leaveSet = leaveDaysOf(leaves.data || []);
    const holidayNames = holidayMapOf(holidays.data || []);
    const cellMarkers = {};
    const totals = { present: 0, late: 0, leave: 0, absent: 0 };
    const days = new Date(cursor.year, cursor.month + 1, 0).getDate();
    for (let day = 1; day <= days; day += 1) {
      const key = dateKey(new Date(cursor.year, cursor.month, day));
      const summary = daySummary(dayMap[key], key, today, leaveSet.has(key), limits.lateAfter);
      if (summary.status === "onTime") { cellMarkers[key] = { tone: "present" }; totals.present += 1; }
      else if (summary.status === "late") { cellMarkers[key] = { tone: "late" }; totals.late += 1; }
      else if (summary.status === "leave") { cellMarkers[key] = { tone: "leave" }; totals.leave += 1; }
      else if (holidayNames[key]) cellMarkers[key] = { tone: "holiday", label: holidayNames[key] };
      else if (isWeekend(key)) cellMarkers[key] = { tone: "weekend" };
      else if (summary.status === "missing" && key < today) { cellMarkers[key] = { tone: "absent" }; totals.absent += 1; }
      else if (summary.status === "incomplete") cellMarkers[key] = { tone: "incomplete" };
    }
    return { markers: cellMarkers, byDay: dayMap, leaveDays: leaveSet, holidayMap: holidayNames, counts: totals };
  }, [activity.data, cursor, holidays.data, leaves.data, limits.lateAfter, today]);

  const move = (delta) =>
    setCursor(({ year, month }) => {
      const next = new Date(year, month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });

  const selectedSummary = selected ? daySummary(byDay[selected], selected, today, leaveDays.has(selected), limits.lateAfter) : null;
  const selectedLeave = selected && leaveDays.has(selected) ? (leaves.data || []).find((leave) => leave.status === "Accepted") : null;

  return (
    <Screen refreshing={activity.isFetching} onRefresh={() => activity.refetch()}>
      {/* Green banner with this month's totals. */}
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <Text style={styles.heroTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.heroSubtitle}>{route?.params?.email ? email : "Tap a day to see check-in, lunch and check-out times."}</Text>
        <View style={styles.heroStats}>
          <HeroStat label="On time" value={counts.present} color="#34D399" />
          <HeroStat label="Late" value={counts.late} color="#FBBF24" />
          <HeroStat label="Leave" value={counts.leave} color="#93C5FD" />
          <HeroStat label="Absent" value={counts.absent} color="#FCA5A5" />
        </View>
      </View>
      <Card style={styles.calendarCard}>
        <MonthCalendar
          year={cursor.year}
          month={cursor.month}
          onPrev={() => move(-1)}
          onNext={() => move(1)}
          markers={markers}
          selected={selected}
          onSelectDay={setSelected}
          legend={LEGEND}
        />
        {activity.isPending ? <Text style={type.small}>Loading attendance…</Text> : null}
        {activity.error ? <Text style={[type.small, { color: "#D4183D" }]}>{activity.error.message}</Text> : null}
      </Card>

      {selected && selectedSummary ? (
        <Card style={styles.dayCard}>
          <Row style={{ justifyContent: "space-between" }}>
            <Row gap={10} style={{ flex: 1 }}>
              <View style={[styles.dayIcon, { backgroundColor: tones[statusTone(selectedSummary.status, holidayMap[selected])].bg }]}>
                <Ionicons name="calendar" size={18} color={tones[statusTone(selectedSummary.status, holidayMap[selected])].fg} />
              </View>
              <Text style={[type.heading, { flex: 1 }]} numberOfLines={1}>{formatDate(selected, { weekday: true })}</Text>
            </Row>
            <Chip label={statusLabel(selectedSummary.status, holidayMap[selected], isWeekend(selected))} tone={statusTone(selectedSummary.status, holidayMap[selected])} />
          </Row>
          {holidayMap[selected] ? <Text style={type.small}>{holidayMap[selected]}</Text> : null}
          {selectedSummary.sessions.length ? (
            selectedSummary.sessions.map((session, index) => (
              <View key={index} style={styles.session}>
                <View style={styles.timeGrid}>
                  <TimeTile icon="log-in" label="Clock in" value={session.login?.time} tone="success" />
                  <TimeTile icon="cafe" label="Lunch start" value={session.lunchIn?.time} tone="attention" />
                  <TimeTile icon="restaurant" label="Lunch end" value={session.lunchOut?.time} tone="info" />
                  <TimeTile icon="log-out" label="Clock out" value={session.logout?.time} tone="closed" />
                </View>
                <View style={styles.workedBar}>
                  <Row gap={8}>
                    <Ionicons name="hourglass-outline" size={16} color={colors.primary} />
                    <Text style={styles.workedLabel}>Worked</Text>
                  </Row>
                  <Text style={styles.workedValue}>{formatHours(session.worked)}</Text>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyDay}>
              <Ionicons name={selectedLeave ? "airplane-outline" : selected > today ? "time-outline" : "remove-circle-outline"} size={18} color={colors.mutedForeground} />
              <Text style={[type.small, { flex: 1 }]}>
                {selectedLeave ? `On leave — ${selectedLeave.type_of_leave || selectedLeave.leave_type || "Approved leave"}` : selected > today ? "This day is still ahead." : "No attendance recorded for this day."}
              </Text>
            </View>
          )}
        </Card>
      ) : null}
    </Screen>
  );
}

function HeroStat({ label, value, color }) {
  return (
    <View style={styles.heroStat}>
      <View style={[styles.heroDot, { backgroundColor: color }]} />
      <Text style={styles.heroStatValue}>{value}</Text>
      <Text style={styles.heroStatLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function TimeTile({ icon, label, value, tone }) {
  const palette = tones[tone];
  return (
    <View style={[styles.timeTile, { backgroundColor: value ? palette.bg : colors.background }]}>
      <View style={[styles.timeIcon, { backgroundColor: value ? colors.card : colors.muted }]}>
        <Ionicons name={value ? icon : `${icon}-outline`} size={14} color={value ? palette.fg : colors.mutedForeground} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.timeLabel, value && { color: palette.fg }]} numberOfLines={1}>{label}</Text>
        <Text style={[styles.timeValue, !value && { color: colors.mutedForeground }]} numberOfLines={1}>{value || "—"}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: 18, gap: 4, overflow: "hidden" },
  heroGlow: { position: "absolute", width: 200, height: 200, borderRadius: 100, right: -70, top: -100, backgroundColor: "rgba(59,130,246,0.28)" },
  heroTitle: { fontSize: 24, fontWeight: "600", letterSpacing: -0.4, color: "#FFFFFF" },
  heroSubtitle: { fontSize: 13, lineHeight: 18, color: "rgba(255,255,255,0.75)" },
  heroStats: { flexDirection: "row", gap: 8, marginTop: 12 },
  heroStat: { flex: 1, paddingVertical: 10, paddingHorizontal: 10, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", gap: 2 },
  heroDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 4 },
  heroStatValue: { fontSize: 22, fontWeight: "600", color: "#FFFFFF" },
  heroStatLabel: { fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.8)" },
  calendarCard: { padding: 14 },
  dayCard: { gap: 12 },
  dayIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  session: { gap: 10 },
  timeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  timeTile: { width: "48.5%", flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: radius.md },
  timeIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  timeLabel: { fontSize: 11, fontWeight: "600", color: colors.mutedForeground },
  timeValue: { fontSize: 15, fontWeight: "600", color: colors.foreground },
  workedBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  workedLabel: { fontSize: 14, fontWeight: "600", color: colors.primary },
  workedValue: { fontSize: 16, fontWeight: "600", color: colors.navy },
  emptyDay: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.background },
});

function statusLabel(status, holiday, weekend) {
  if (status === "onTime") return "On time";
  if (status === "late") return "Late";
  if (status === "leave") return "On leave";
  if (status === "incomplete") return "Incomplete";
  if (status === "upcoming") return "Upcoming";
  if (holiday) return "Holiday";
  if (weekend) return "Weekend";
  return "Absent";
}
function statusTone(status, holiday) {
  if (status === "onTime") return "success";
  if (status === "late") return "attention";
  if (status === "leave") return "info";
  if (holiday) return "lime";
  if (status === "missing") return "closed";
  return "neutral";
}
