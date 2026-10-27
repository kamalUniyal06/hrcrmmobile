// Admin attendance dashboard: one day for every employee, with the month drawer per person.
// Web: employement/components/attendance/AdminAttendanceDashboard.jsx.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, shadow, type } from "../../theme";
import { Avatar, Button, EmptyState, ErrorState, LoadingState, Notice, PageHeader, Screen, SearchField, Sheet, Skeleton } from "../../components/ui";
import MonthCalendar from "../../components/ui/MonthCalendar";
import { ClockInOut, Legend, LunchInOut, StatusPill, StatusTag } from "../../components/attendance/AttendanceStatus";
import DayDetailSheet from "../../components/attendance/DayDetailSheet";
import EmployeeAttendanceDrawer from "../../components/attendance/EmployeeAttendanceDrawer";
import { TeamsActivitySheet, TeamsChip, TeamsSummaryCard, useTeamsPresenceDay } from "../../components/attendance/TeamsPresence";
import { indexPresence, presenceForRow } from "../../utils/teamsPresence";
import { fetchAttendanceStats, getOrgActivityForDay } from "../../api/dailyActivity.api";
import { getLeavesOnDay } from "../../api/leaves.api";
import { useAttendanceLimits, useEmployeesDirectory } from "../../hooks/queries";
import { daySummary } from "../../utils/attendance";
import { buildAttendanceRows, buildLeaveDays, isHalfDayLeave, isRowOnLeave, leaveForRow, matchesOverviewFilter, OFFICE_IP } from "../../utils/adminAttendance";
import { dateKey, formatDate, todayKey } from "../../utils/dates";
import { lower } from "../../utils/records";

const PAGE_SIZE = 30;
const OVERVIEW_FILTERS = ["all", "checkedIn", "onTime", "late", "missing", "leave", "halfDay"];

export default function AdminAttendanceScreen({ navigation, route }) {
  const limits = useAttendanceLimits();
  const lateAfter = limits.lateAfter;
  const [anchor, setAnchor] = useState(() => new Date());
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState(null);
  const [drawerKey, setDrawerKey] = useState(null);
  const [picking, setPicking] = useState(false);
  // The home dashboard can open this tab with { filter } to start on a filtered list.
  const [overviewFilter, setOverviewFilter] = useState(() => (OVERVIEW_FILTERS.includes(route?.params?.filter) ? route.params.filter : "all"));
  // Opening the (already mounted) tab again with { filter, at } re-applies the filter for today.
  const requestedFilter = route?.params?.filter;
  const requestedAt = route?.params?.at;
  useEffect(() => {
    if (!OVERVIEW_FILTERS.includes(requestedFilter)) return;
    setOverviewFilter(requestedFilter);
    setAnchor(new Date());
    setSearch("");
    setShown(PAGE_SIZE);
  }, [requestedFilter, requestedAt]);

  const activityDay = dateKey(anchor);
  const today = todayKey();
  const employees = useEmployeesDirectory();
  const activity = useQuery({ queryKey: ["dailyActivity", "admin", "all", activityDay], queryFn: () => getOrgActivityForDay(activityDay), refetchInterval: 60000 });
  const leaves = useQuery({ queryKey: ["leaves", "attendance", "day", activityDay], queryFn: () => getLeavesOnDay(activityDay), staleTime: 5 * 60 * 1000 });
  const stats = useQuery({ queryKey: ["attendance", "stats", activityDay], queryFn: () => fetchAttendanceStats(activityDay), refetchInterval: 60000 });

  // Teams presence (read-only): live status for today, the stored daily report for other days.
  const teamsLive = activityDay === today;
  const teams = useTeamsPresenceDay(activityDay, { live: teamsLive });
  const presenceIndex = useMemo(() => indexPresence(teams.data?.employees), [teams.data]);
  const teamsState = teams.isPending ? "loading" : teams.isError ? "error" : "ready";
  const [teamsFor, setTeamsFor] = useState(null);

  const rows = useMemo(() => buildAttendanceRows(employees.data || [], activity.data || []), [employees.data, activity.data]);
  const leaveDays = useMemo(() => buildLeaveDays(leaves.data || []), [leaves.data]);
  const isOnLeave = useCallback((row, day) => isRowOnLeave(leaveDays, row, day), [leaveDays]);
  // Half-day leave comes straight from hrc_leaves for the selected day; "On leave" means a full day.
  const halfDayLeaveDays = useMemo(() => buildLeaveDays((leaves.data || []).filter(isHalfDayLeave)), [leaves.data]);
  const isOnHalfDay = useCallback((row) => isRowOnLeave(halfDayLeaveDays, row, activityDay), [halfDayLeaveDays, activityDay]);
  const halfDayCount = leaves.isPending ? undefined : rows.filter((row) => row.matched && isOnHalfDay(row)).length;

  const needle = lower(search);
  const visible = rows.filter(
    (row) =>
      (row.matched || Boolean(row.days[activityDay])) &&
      [row.name, row.email, row.designation].some((value) => lower(value).includes(needle)) &&
      matchesOverviewFilter(overviewFilter, {
        records: row.days[activityDay] || [],
        matched: row.matched,
        onLeave: isOnLeave(row, activityDay),
        halfDay: isOnHalfDay(row),
        day: activityDay,
        today,
        lateAfter,
      }),
  );
  const pageRows = visible.slice(0, shown);
  const loading = employees.isPending || leaves.isPending || activity.isPending;
  const failed = employees.isError || activity.isError || leaves.isError;
  const fetching = employees.isFetching || activity.isFetching || leaves.isFetching || stats.isFetching || teams.isFetching;

  // Employees the drawer can step through with its previous/next buttons.
  const drawerRows = visible.filter((row) => row.matched);
  const drawerRow = drawerKey ? rows.find((row) => row.key === drawerKey) : null;
  const drawerIndex = drawerRows.findIndex((row) => row.key === drawerKey);
  const selectedRow = selected && rows.find((row) => row.key === selected.key);

  const overviewItems = [
    ["All employees", stats.data?.all, "people-outline", { bg: "#F1F5F9", fg: "#334155" }, "all"],
    ["Not checked in", stats.data?.notCheckedIn, "person-remove-outline", { bg: "#FFF7ED", fg: "#EA580C" }, "missing"],
    ["On leave", stats.data?.leave, "calendar-outline", { bg: "#EEF2FF", fg: "#4F46E5" }, "leave"],
    ["Half-day leave", halfDayCount, "calendar-number-outline", { bg: "#F0F9FF", fg: "#0284C7" }, "halfDay"],
    ["Late check-ins", stats.data?.late, "time-outline", { bg: "#FFFBEB", fg: "#D97706" }, "late"],
    ["On time", stats.data?.onTime, "checkmark-circle-outline", { bg: "#059669", fg: "#FFFFFF" }, "onTime"],
  ];

  const setDay = (date) => {
    setAnchor(date);
    setShown(PAGE_SIZE);
  };
  const moveDay = (direction) => setDay(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + direction));
  const refresh = () => {
    employees.refetch();
    activity.refetch();
    leaves.refetch();
    stats.refetch();
    teams.refetch();
  };

  return (
    <Screen refreshing={fetching && !loading} onRefresh={refresh}>
      <PageHeader
        icon="calendar"
        tone="progress"
        eyebrow="People workspace"
        title="Employee attendance"
        subtitle="Each employee's attendance for the day. Tap a person to review their month."
      />
      {/* Side by side, sharing the width so neither label is squeezed on a narrow phone. */}
      <View style={styles.headerActions}>
        <Button title="My attendance" icon="calendar-outline" small variant="outline" style={styles.headerButton} onPress={() => navigation.navigate("MyAttendance")} />
        <Button title="Refresh" icon="refresh" small variant="outline" style={styles.headerButton} loading={fetching} onPress={refresh} />
      </View>

      <View style={styles.overview} accessibilityLabel="Attendance overview">
        {overviewItems.map(([label, count, icon, palette, filter]) => {
          const active = overviewFilter === filter;
          return (
            <Pressable
              key={label}
              onPress={() => {
                setOverviewFilter(filter);
                // Re-read hrc_leaves so the half-day list reflects leaves approved since the screen loaded.
                if (filter === "halfDay") leaves.refetch();
                setShown(PAGE_SIZE);
              }}
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [styles.tile, filter === "onTime" && styles.tileOnTime, active && styles.tileActive, pressed && { opacity: 0.85 }]}
            >
              <View style={[styles.tileIcon, { backgroundColor: palette.bg }]}>
                <Ionicons name={icon} size={19} color={palette.fg} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                {count === undefined && !stats.isError ? <Skeleton width="60%" height={22} radius={6} style={{ marginVertical: 2 }} /> : <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{count ?? "—"}</Text>}
                <Text style={styles.tileLabel} numberOfLines={2}>{label}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {stats.isError ? <Notice tone="closed" icon="alert-circle-outline" message={stats.error?.message || "Could not load attendance totals."} action="Retry" onAction={() => stats.refetch()} /> : null}

      {overviewFilter !== "all" ? (
        <View style={styles.filterRow}>
          <Text style={styles.filterChip} numberOfLines={2}>Showing: {overviewItems.find((item) => item[4] === overviewFilter)?.[0] || "Checked in"}</Text>
          <Pressable onPress={() => setOverviewFilter("all")} hitSlop={8} style={styles.noShrink}>
            <Text style={styles.link}>Clear</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.listCard}>
        <View style={styles.dayBar}>
          <DayButton icon="chevron-back" label="Previous day" onPress={() => moveDay(-1)} />
          <Pressable onPress={() => setPicking(true)} style={styles.dayLabel} accessibilityLabel="Choose an attendance date">
            <Ionicons name="calendar-outline" size={15} color={colors.primaryDeep} style={styles.noShrink} />
            <Text style={styles.dayText} numberOfLines={2}>{formatDate(activityDay, { weekday: true })}</Text>
          </Pressable>
          <DayButton icon="chevron-forward" label="Next day" onPress={() => moveDay(1)} />
          <Pressable onPress={() => setDay(new Date())} disabled={activityDay === today} style={[styles.todayButton, activityDay === today && { opacity: 0.45 }]}>
            <Text style={styles.todayText} numberOfLines={1}>Today</Text>
          </Pressable>
        </View>
        <Legend />
        <TeamsSummaryCard query={teams} live={teamsLive} />
        <SearchField
          value={search}
          onChangeText={(value) => {
            setSearch(value);
            setShown(PAGE_SIZE);
          }}
          placeholder="Search employee, email or designation"
        />
      </View>

      {failed ? (
        <ErrorState message={employees.error?.message || activity.error?.message || leaves.error?.message || "Could not load attendance."} onRetry={refresh} />
      ) : loading ? (
        <LoadingState label="Loading employee attendance…" variant="cards" rows={4} />
      ) : !pageRows.length ? (
        <EmptyState icon="people-outline" title={search ? "No matching employees" : "No employees or attendance found"} message={search ? "Try another name or email." : "Records will appear here when available."} />
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={styles.countLabel}>
            {visible.length} employee{visible.length === 1 ? "" : "s"} · tap an employee to view their monthly attendance
          </Text>
          {pageRows.map((row) => {
            const records = row.days[activityDay] || [];
            const onLeave = isOnLeave(row, activityDay);
            const summary = daySummary(records, activityDay, today, onLeave, lateAfter);
            const halfDay = isOnHalfDay(row);
            const rowLeave = onLeave ? leaveForRow(leaves.data || [], row, activityDay) : null;
            const presence = presenceForRow(presenceIndex, row);
            const employeeId = row.key.startsWith("employee:") ? row.key.slice("employee:".length) : "";
            return (
              <EmployeeCard
                key={row.key}
                row={row}
                records={records}
                summary={summary}
                status={summary.status === "leave" && halfDay ? "halfDay" : summary.status}
                halfDay={halfDay}
                onLeave={onLeave}
                isToday={activityDay === today}
                lunchLimit={limits.lunchOutMinutes}
                active={drawerKey === row.key}
                onOpen={row.matched ? () => setDrawerKey(row.key) : undefined}
                onStatus={records.length || rowLeave ? () => setSelected({ key: row.key, date: activityDay, records, leave: rowLeave }) : undefined}
                teams={
                  <TeamsChip
                    record={presence}
                    live={teamsLive}
                    state={teamsState}
                    onPress={presence && employeeId ? () => setTeamsFor({ employeeId, name: row.name, date: activityDay }) : undefined}
                  />
                }
              />
            );
          })}
          {visible.length > shown ? (
            <Button title={`Show ${Math.min(PAGE_SIZE, visible.length - shown)} more`} variant="secondary" full onPress={() => setShown(shown + PAGE_SIZE)} />
          ) : null}
        </View>
      )}


      <EmployeeAttendanceDrawer
        row={drawerRow}
        position={drawerIndex + 1}
        total={drawerRows.length}
        onPrevious={() => drawerIndex > 0 && setDrawerKey(drawerRows[drawerIndex - 1].key)}
        onNext={() => drawerIndex < drawerRows.length - 1 && setDrawerKey(drawerRows[drawerIndex + 1].key)}
        onClose={() => setDrawerKey(null)}
        lateAfter={lateAfter}
      />

      <DayDetailSheet selected={selected} row={selectedRow} today={today} lateAfter={lateAfter} onClose={() => setSelected(null)} />

      <TeamsActivitySheet target={teamsFor} today={today} onClose={() => setTeamsFor(null)} />

      <Sheet visible={picking} onClose={() => setPicking(false)} title="Choose a date">
        <DatePicker
          value={activityDay}
          onPick={(key) => {
            const [year, month, day] = key.split("-").map(Number);
            setDay(new Date(year, month - 1, day));
            setPicking(false);
          }}
        />
      </Sheet>
    </Screen>
  );
}

function EmployeeCard({ row, records, summary, status, halfDay, onLeave, isToday, lunchLimit, active, onOpen, onStatus, teams }) {
  return (
    <Pressable onPress={onOpen} disabled={!onOpen} style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && { backgroundColor: colors.muted }]}>
      <View style={styles.rowHead}>
        <Avatar name={row.name} size={38} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={type.subheading} numberOfLines={2}>{row.name}</Text>
          <Text style={styles.rowSub} numberOfLines={1} ellipsizeMode="tail">{row.email || row.designation || "Employee"}</Text>
          {!row.matched ? <Text style={styles.unlinked}>Employee not linked</Text> : null}
        </View>
        <Pressable onPress={onStatus} disabled={!onStatus} hitSlop={6} accessibilityLabel="Attendance details" style={styles.statusCol}>
          <StatusPill status={status} small />
          {halfDay && summary.status !== "leave" ? <StatusTag status="halfDay" /> : null}
          {/* Logged in on a full day of approved leave: listed under both "On leave" and their check-in status. */}
          {onLeave && !halfDay && summary.status !== "leave" ? <StatusTag status="leave" /> : null}
        </Pressable>
      </View>
      <View style={styles.rowTimes}>
        <View style={styles.timeLine}>
          <Text style={styles.timeLabel}>Clock</Text>
          <View style={styles.timeValue}>
            <ClockInOut summary={summary} isToday={isToday} />
          </View>
        </View>
        <View style={styles.timeLine}>
          <Text style={styles.timeLabel}>Lunch</Text>
          <View style={styles.timeValue}>
            <LunchInOut sessions={summary.sessions} limit={lunchLimit} />
          </View>
        </View>
        {teams}
      </View>
      <View style={styles.rowFoot}>
        <View style={styles.loginFrom}>
          <Ionicons name={records.length ? (records[0]?.ip_address === OFFICE_IP ? "business-outline" : "home-outline") : "remove-outline"} size={13} color={colors.mutedForeground} style={styles.noShrink} />
          <Text style={[styles.rowSub, styles.shrink]} numberOfLines={1}>{records.length ? (records[0]?.ip_address === OFFICE_IP ? "Office" : "Remote") : "—"}</Text>
        </View>
        {onOpen ? (
          <View style={styles.loginFrom}>
            <Text style={styles.link} numberOfLines={1}>Month</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} style={styles.noShrink} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function DatePicker({ value, onPick }) {
  const [cursor, setCursor] = useState(() => {
    const [year, month] = value.split("-").map(Number);
    return { year, month: month - 1 };
  });
  const move = (delta) =>
    setCursor(({ year, month }) => {
      const next = new Date(year, month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
      <MonthCalendar year={cursor.year} month={cursor.month} onPrev={() => move(-1)} onNext={() => move(1)} selected={value} onSelectDay={onPick} />
    </View>
  );
}

function DayButton({ icon, label, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={6} style={({ pressed }) => [styles.dayButton, pressed && { backgroundColor: colors.muted }]}>
      <Ionicons name={icon} size={16} color={colors.foreground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  headerButton: { flexGrow: 1, flexBasis: 140 },
  overview: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { flexGrow: 1, flexBasis: "46%", minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  tileOnTime: { borderColor: "#A7F3D0", backgroundColor: "#ECFDF5" },
  tileActive: { borderColor: colors.primary, borderWidth: 1.5 },
  tileIcon: { flexShrink: 0, width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  tileValue: { fontSize: 22, lineHeight: 29, fontWeight: "600", color: colors.navy, fontVariant: ["tabular-nums"] },
  tileLabel: { fontSize: 12, lineHeight: 17, color: colors.mutedForeground },
  filterRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 10, rowGap: 6 },
  filterChip: { flexShrink: 1, maxWidth: "80%", fontSize: 12, lineHeight: 17, fontWeight: "600", color: "#065F46", backgroundColor: "#ECFDF5", borderWidth: 1, borderColor: "#A7F3D0", borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 12, overflow: "hidden" },
  link: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.primary },
  listCard: { gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, ...shadow.card },
  dayBar: { flexDirection: "row", alignItems: "center", gap: 6 },
  dayButton: { flexShrink: 0, width: 34, height: 34, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.card },
  dayLabel: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 34, paddingVertical: 4, borderRadius: radius.md, backgroundColor: colors.primarySoft, paddingHorizontal: 8 },
  dayText: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.navy, flexShrink: 1, textAlign: "center" },
  todayButton: { flexShrink: 0, minHeight: 34, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  todayText: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.foreground },
  countLabel: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.mutedForeground },
  row: { gap: 10, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  rowActive: { borderColor: colors.primary, backgroundColor: "#F3F8F5" },
  rowHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  rowSub: { fontSize: 12, lineHeight: 17, color: colors.mutedForeground },
  unlinked: { fontSize: 11, lineHeight: 15, color: colors.attention, marginTop: 2 },
  rowTimes: { gap: 8, padding: 10, borderRadius: radius.md, backgroundColor: "#F8FAFC" },
  timeLine: { flexDirection: "row", alignItems: "center", gap: 10 },
  timeLabel: { minWidth: 42, flexShrink: 0, fontSize: 11, lineHeight: 15, fontWeight: "600", color: colors.mutedForeground },
  rowFoot: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 12, rowGap: 6 },
  loginFrom: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1, minWidth: 0 },
  statusCol: { alignItems: "flex-end", gap: 4, flexShrink: 1, maxWidth: "45%" },
  timeValue: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1, minWidth: 0 },
  noShrink: { flexShrink: 0 },
});
