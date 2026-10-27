// Admin home: the web AdminHomePage at a glance — headline stats, today's check-in, who needs
// attention, offboarding, hiring, increments, the schedule, the feed and what is waiting for action.
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, tones, type } from "../../theme";
import { Avatar, Card, ListRow, PageHeader, Screen, SegmentedControl, SkeletonRows, StatTile } from "../../components/ui";
import TodayAttendanceCard from "../../components/TodayAttendanceCard";
import { PendingAlertsCard } from "../../components/AlertsPrompt";
import { useAuthStore } from "../../store/authStore";
import { CardHead, MiniCount } from "../../components/home/HomeCardParts";
import HiringPipelineCard from "../../components/home/HiringPipelineCard";
import IncrementRequestsCard from "../../components/home/IncrementRequestsCard";
import ScheduleCard from "../../components/home/ScheduleCard";
import FeedCard from "../../components/home/FeedCard";
import { useAnnouncements, useAttendanceLimits, useEmail, useEmployeesDirectory, useMyEmployeeRecord, usePublicHolidays } from "../../hooks/queries";
import { getOrgActivityForDay } from "../../api/dailyActivity.api";
import { getAllLeaves, leaveStatusOf } from "../../api/leaves.api";
import { fetchCandidatesForRange, fetchInterviews, fetchResignations, isExEmployee, boardState, uniqueInterviews, hasOutcome } from "../../api/admin.api";
import { fetchAdminQuestions, fetchAdminRequests } from "../../api/increment.api";
import { offboardingState } from "../../api/resignation.api";
import { daySummary } from "../../utils/attendance";
import { calendarDateKey, formatClock, monthRange, todayKey } from "../../utils/dates";
import { buildFeed, isAlertLive, leaveEmployeeName } from "../../utils/homeDashboard";
import { clean, fullName, lower } from "../../utils/records";
import { greeting } from "../employee/EmployeeHomeScreen";

// The card previews this many people; the rest are a tap away on the Attendance tab.
const ATTENTION_LIMIT = 6;
const FIVE_MINUTES = 5 * 60 * 1000;
// Same key and filters as the increment management screen's unfiltered list, so the cache is shared.
const ALL_REQUESTS = { search: "", from: "", to: "" };
const ATTENTION_TABS = [
  ["late", "Late"],
  ["missing", "Not checked in"],
  ["leave", "On leave"],
];

export default function AdminHomeScreen({ navigation }) {
  const email = useEmail();
  const isEmployee = useAuthStore((state) => state.userInfo?.phase === "Employment");
  const me = useMyEmployeeRecord();
  const limits = useAttendanceLimits();
  const today = todayKey();
  const queryClient = useQueryClient();

  const employees = useEmployeesDirectory();
  const activity = useQuery({ queryKey: ["dailyActivity", "admin", "all", today], queryFn: () => getOrgActivityForDay(today), refetchInterval: 60000 });
  const leaves = useQuery({ queryKey: ["leaves", "admin", "all"], queryFn: () => getAllLeaves(), staleTime: FIVE_MINUTES });
  const [month] = useState(() => monthRange());
  const candidates = useQuery({ queryKey: ["candidates", "home", month.from, month.to], queryFn: () => fetchCandidatesForRange(month), staleTime: FIVE_MINUTES });
  const interviews = useQuery({ queryKey: ["interviews"], queryFn: fetchInterviews, staleTime: FIVE_MINUTES });
  const resignations = useQuery({ queryKey: ["resignations", "offboarding"], queryFn: fetchResignations, staleTime: FIVE_MINUTES });
  const incrementRequests = useQuery({ queryKey: ["increment-admin", "request-collection", ALL_REQUESTS], queryFn: () => fetchAdminRequests(ALL_REQUESTS), staleTime: FIVE_MINUTES });
  const incrementQuestions = useQuery({ queryKey: ["increment-admin", "questions"], queryFn: fetchAdminQuestions, staleTime: FIVE_MINUTES });
  const holidays = usePublicHolidays();
  const announcements = useAnnouncements();

  const roster = useMemo(() => (employees.data || []).filter((employee) => !isExEmployee(employee)), [employees.data]);
  const employeesByEmail = useMemo(() => new Map((employees.data || []).map((employee) => [lower(employee.email1), employee])), [employees.data]);
  const employeesById = useMemo(() => new Map((employees.data || []).map((employee) => [String(employee.id), employee])), [employees.data]);
  // HR reads every alert; only live ones (active, not expired) are announcements.
  const liveAnnouncements = useMemo(() => (announcements.data || []).filter((alert) => isAlertLive(alert)), [announcements.data]);

  const todayStats = useMemo(() => {
    const byEmail = new Map();
    for (const record of activity.data || []) {
      const key = lower(record.name);
      if (!key) continue;
      (byEmail.get(key) || byEmail.set(key, []).get(key)).push(record);
    }
    const onLeave = new Set(
      (leaves.data || [])
        .filter((leave) => leaveStatusOf(leave) === "Accepted" && calendarDateKey(leave.leave_from) <= today && (calendarDateKey(leave.leave_to) || calendarDateKey(leave.leave_from)) >= today)
        .map((leave) => lower(leave.name || leave.email)),
    );
    const groups = { late: [], missing: [], leave: [], present: [] };
    const checkIns = [];
    for (const employee of roster) {
      const key = lower(employee.email1);
      const records = byEmail.get(key) || [];
      const summary = daySummary(records, today, today, onLeave.has(key), limits.lateAfter);
      const person = { key: employee.id, name: fullName(employee), email: employee.email1, time: summary.first?.time, employeeId: employee.id };
      if (summary.status === "late") groups.late.push(person);
      else if (summary.status === "onTime") groups.present.push(person);
      else if (onLeave.has(key)) groups.leave.push(person);
      else groups.missing.push(person);
      if (summary.first) checkIns.push(summary.first.minutes);
    }
    const avg = checkIns.length ? Math.round(checkIns.reduce((a, b) => a + b, 0) / checkIns.length) : null;
    const arrived = groups.present.length + groups.late.length;
    return { groups, avgCheckIn: avg, total: roster.length, onTimeRate: arrived ? Math.round((groups.present.length / arrived) * 100) : null };
  }, [activity.data, leaves.data, limits.lateAfter, roster, today]);

  const leaveName = useMemo(() => {
    const employeeFor = (leave) => employeesById.get(String(leave.employee_id || leave.hrc_employees_hrc_leaves_1hrc_employees_ida)) || employeesByEmail.get(lower(leave.name || leave.email));
    return (leave) => leaveEmployeeName(leave, employeeFor(leave));
  }, [employeesByEmail, employeesById]);
  const feed = useMemo(() => buildFeed({
    activity: activity.data || [],
    leaves: leaves.data || [],
    alerts: liveAnnouncements,
    personLabel: (record) => {
      const person = employeesByEmail.get(lower(record.name));
      return (person && fullName(person, "")) || clean(record.hrc_employees_hrc_daily_activity_1_name) || clean(record.name);
    },
    leaveLabel: (leave) => `${leaveName(leave)}'s`,
    limit: 15,
  }), [activity.data, leaves.data, liveAnnouncements, employeesByEmail, leaveName]);
  const scheduleSources = useMemo(() => ({
    employees: roster,
    holidays: holidays.data || [],
    leaves: leaves.data || [],
    leaveLabel: (leave) => `${leaveName(leave)} on leave`,
  }), [roster, holidays.data, leaves.data, leaveName]);

  const pendingLeaves = useMemo(() => (leaves.data || []).filter((leave) => leaveStatusOf(leave) === "Applied"), [leaves.data]);
  const interviewSummary = useMemo(() => {
    const unique = uniqueInterviews(interviews.data || []).filter((record) => !hasOutcome(record));
    return { due: unique.filter((r) => boardState(r) === "due").length, unscheduled: unique.filter((r) => boardState(r) === "unscheduled").length };
  }, [interviews.data]);
  const offboarding = useMemo(() => {
    const open = (resignations.data || []).map((record) => ({ record, state: offboardingState(record) })).filter(({ state }) => !state.completed);
    return { open, pending: open.filter(({ state }) => state.key === "pending").length, progress: open.filter(({ state }) => state.key === "progress").length };
  }, [resignations.data]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["dailyActivity"] });
    queryClient.invalidateQueries({ queryKey: ["leaves"] });
    queryClient.invalidateQueries({ queryKey: ["candidates"] });
    queryClient.invalidateQueries({ queryKey: ["interviews"] });
    queryClient.invalidateQueries({ queryKey: ["resignations"] });
    queryClient.invalidateQueries({ queryKey: ["system-alerts"] });
    queryClient.invalidateQueries({ queryKey: ["increment-admin"] });
  };
  // Feed rows open the leave request, the full announcement or the employee who checked in.
  const openFeedItem = (item) => {
    const person = item.email ? employeesByEmail.get(item.email) : null;
    const alert = item.alertId ? (announcements.data || []).find((record) => record.id === item.alertId) : null;
    if (item.leaveId) navigation.navigate("LeaveDetail", { id: item.leaveId });
    else if (alert) navigation.navigate("AnnouncementDetail", { alert, manage: true });
    else if (item.alertId) navigation.navigate("SystemAlerts");
    else if (person) navigation.navigate("EmployeeDetail", { id: person.id });
    else navigation.navigate("Attendance");
  };

  const [peopleTab, setPeopleTab] = useState("late");
  const people = todayStats.groups[peopleTab] || [];
  // The Attendance tab lists everyone in this group for today (Late, Not checked in, On leave).
  const openAttendanceList = () => navigation.navigate("Attendance", { filter: peopleTab, at: Date.now() });
  const loadingToday = activity.isPending || employees.isPending;
  const name = (me.data && fullName(me.data, "")) || email.split("@")[0] || "there";
  const lateAfterLabel = formatClock(limits.lateAfter);

  return (
    <Screen refreshing={activity.isFetching || leaves.isFetching} onRefresh={refresh}>
      {/* The greeting names the signed-in admin, so the title stays even under the app bar. */}
      <PageHeader
        icon="grid"
        tone="progress"
        eyebrow={greeting()}
        title={name}
        subtitle="Attendance, hiring and people changes across the team, at a glance."
        showTitle
      />

      {/* Web AdminHomePage: alerts waiting for this admin, and their own shift only when they are also an employee. */}
      <PendingAlertsCard onSeeAll={() => navigation.navigate("MyAlerts")} />
      {isEmployee ? <TodayAttendanceCard /> : null}

      <View style={styles.statGrid}>
        <StatTile label="Active employees" loading={employees.isPending} value={employees.isPending ? "—" : todayStats.total} hint="View directory" icon="people-outline" tone="neutral" onPress={() => navigation.navigate("People")} />
        <StatTile label="Average check-in" loading={loadingToday} value={loadingToday ? "—" : formatClock(todayStats.avgCheckIn)} hint={`Shift starts ${limits.actualLoginTime}`} icon="log-in-outline" tone="success" onPress={() => navigation.navigate("Attendance")} />
        <StatTile label="On-time arrival" loading={loadingToday} value={loadingToday || todayStats.onTimeRate === null ? "—" : `${todayStats.onTimeRate}%`} hint={`Late after ${lateAfterLabel}`} icon="alarm-outline" tone="attention" onPress={() => navigation.navigate("Attendance", { filter: "onTime" })} />
        <StatTile label="Pending leave" loading={leaves.isPending} value={leaves.isPending ? "—" : pendingLeaves.length} hint="Awaiting approval" icon="calendar-outline" tone="info" onPress={() => navigation.navigate("Approvals")} />
      </View>

      <Card style={{ gap: 12 }}>
        <CardHead icon="alert-circle-outline" tone="attention" title="Needs attention today" action="View all" onAction={openAttendanceList} />
        <SegmentedControl
          options={ATTENTION_TABS.map(([value, label]) => ({ value, label, count: loadingToday ? undefined : todayStats.groups[value].length }))}
          value={peopleTab}
          onChange={setPeopleTab}
        />
        {loadingToday ? (
          <SkeletonRows count={3} label="Loading today's attendance" />
        ) : people.length === 0 ? (
          <View style={styles.allClear}>
            <Ionicons name="checkmark-circle-outline" size={18} color={colors.primary} style={styles.noShrink} />
            <Text style={[type.small, { flex: 1, minWidth: 0 }]}>Nobody here right now.</Text>
          </View>
        ) : (
          people.slice(0, ATTENTION_LIMIT).map((person) => (
            <Pressable key={person.key} onPress={() => navigation.navigate("EmployeeDetail", { id: person.employeeId })} style={({ pressed }) => [styles.person, pressed && { opacity: 0.7 }]}>
              <Avatar name={person.name} size={38} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={type.subheading} numberOfLines={2}>{person.name}</Text>
                <Text style={styles.personEmail} numberOfLines={1} ellipsizeMode="tail">{person.email}</Text>
              </View>
              {person.time ? <Text style={[styles.personTime, peopleTab === "late" && styles.personTimeLate]} numberOfLines={1}>{person.time}</Text> : null}
            </Pressable>
          ))
        )}
        {people.length > ATTENTION_LIMIT ? (
          <Pressable onPress={openAttendanceList} accessibilityRole="button" style={({ pressed }) => [styles.moreButton, pressed && { opacity: 0.75 }]}>
            <Text style={[styles.moreText, styles.shrink]}>View all {people.length} in Attendance</Text>
            <Ionicons name="arrow-forward" size={15} color={colors.primary} style={styles.noShrink} />
          </Pressable>
        ) : null}
      </Card>

      <Card style={[styles.offboarding, { gap: 12 }]}>
        <View style={styles.offboardingGlow} />
        <View style={styles.cardHeadRow}>
          <View style={styles.offboardingIcon}>
            <Ionicons name="exit-outline" size={20} color={tones.closed.fg} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.titleRow}>
              <Text style={[styles.cardTitle, styles.shrink]} numberOfLines={2}>Offboarding</Text>
              <View style={styles.countBadge}><Text style={styles.countBadgeText} numberOfLines={1}>{offboarding.open.length}</Text></View>
            </View>
            <Text style={[type.small, { marginTop: 2 }]}>Employees on their way out</Text>
          </View>
          <Pressable onPress={() => navigation.navigate("Offboarding")} hitSlop={8} accessibilityRole="button" style={styles.viewAll}>
            <Text style={styles.link} numberOfLines={1}>View all</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} style={styles.noShrink} />
          </Pressable>
        </View>
        <View style={styles.offboardingStats}>
          <MiniCount dot="#F59E0B" label="Awaiting approvals" loading={resignations.isPending} value={offboarding.pending} onPress={() => navigation.navigate("Offboarding", { status: "pending" })} />
          <MiniCount dot={colors.primary} label="Checkout in progress" loading={resignations.isPending} value={offboarding.progress} onPress={() => navigation.navigate("Offboarding", { status: "progress" })} />
        </View>
        {offboarding.open.slice(0, 3).map(({ record, state }) => {
          // Resignation records store the employee's email in `name`; show their directory name when known.
          const person = employeesByEmail.get(lower(record.name));
          const who = person ? fullName(person) : clean(record.name) || "Employee";
          return (
            <Pressable key={record.id} onPress={() => navigation.navigate("OffboardingDetail", { id: record.id })} style={({ pressed }) => [styles.person, pressed && { opacity: 0.7 }]}>
              <Avatar name={who} size={38} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={type.subheading} numberOfLines={2}>{who}</Text>
                <Text style={styles.approvals} numberOfLines={1}>Approvals {state.approvalsDone}/3</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} style={styles.noShrink} />
            </Pressable>
          );
        })}
      </Card>

      <HiringPipelineCard candidates={candidates} interviews={interviews} navigation={navigation} />

      <IncrementRequestsCard
        requests={incrementRequests}
        questions={incrementQuestions}
        nameFor={(address) => {
          const person = employeesByEmail.get(lower(address));
          return person ? fullName(person, "") : "";
        }}
        navigation={navigation}
      />

      <ScheduleCard
        sources={scheduleSources}
        loading={holidays.isPending || leaves.isPending}
        error={holidays.isError || leaves.isError}
        onRetry={() => {
          holidays.refetch();
          leaves.refetch();
        }}
        announcements={liveAnnouncements}
        announcementsLoading={announcements.isPending}
        announcementsError={announcements.isError}
        onRetryAnnouncements={() => announcements.refetch()}
        navigation={navigation}
      />

      <FeedCard feed={feed} loading={activity.isPending || leaves.isPending} error={activity.isError} onRetry={() => activity.refetch()} today={today} onOpen={openFeedItem} />

      <Card style={{ gap: 8 }}>
        <CardHead icon="flash-outline" tone="info" title="Needs action" />
        <ListRow icon="calendar-outline" iconTone={pendingLeaves.length ? "attention" : "neutral"} title="Leave approvals" subtitle={pendingLeaves.length ? `${pendingLeaves.length} request${pendingLeaves.length === 1 ? "" : "s"} waiting` : "All caught up"} onPress={() => navigation.navigate("Approvals")} style={styles.flatRow} />
        <ListRow icon="chatbubbles-outline" iconTone={interviewSummary.due ? "attention" : "progress"} title="Interview decisions" subtitle={interviews.isPending ? "Loading…" : `${interviewSummary.due} awaiting decision · ${interviewSummary.unscheduled} to schedule`} onPress={() => navigation.navigate("InterviewBoard")} style={styles.flatRow} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  cardHeadRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardTitle: { ...type.heading, color: colors.navy },
  link: { flexShrink: 1, fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.primary },
  viewAll: { flexDirection: "row", alignItems: "center", gap: 2, flexShrink: 0, maxWidth: "40%" },
  allClear: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  person: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  personEmail: { fontSize: 12, lineHeight: 17, color: colors.mutedForeground },
  personTime: { flexShrink: 0, fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.navy, fontVariant: ["tabular-nums"] },
  personTimeLate: { color: colors.attention },
  offboarding: { overflow: "hidden" },
  offboardingGlow: { position: "absolute", width: 220, height: 220, borderRadius: 110, right: -90, top: -120, backgroundColor: "rgba(252,165,165,0.18)" },
  offboardingIcon: { flexShrink: 0, width: 42, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: tones.closed.bg },
  countBadge: { flexShrink: 0, minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: tones.closed.bg },
  countBadgeText: { fontSize: 12, lineHeight: 17, fontWeight: "600", color: tones.closed.fg, fontVariant: ["tabular-nums"] },
  offboardingStats: { flexDirection: "row", gap: 10 },
  approvals: { alignSelf: "flex-start", maxWidth: "100%", marginTop: 3, paddingVertical: 2, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: tones.attention.bg, fontSize: 11, lineHeight: 15, fontWeight: "600", color: tones.attention.fg, overflow: "hidden" },
  moreButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  moreText: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.primary },
  titleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 },
  shrink: { flexShrink: 1, minWidth: 0 },
  noShrink: { flexShrink: 0 },
  flatRow: { borderWidth: 0, paddingHorizontal: 0, paddingVertical: 8, shadowOpacity: 0, elevation: 0 },
});
