import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type } from "../../theme";
import { Card, Chip, ListRow, PageHeader, Row, Screen, SectionTitle, StatTile } from "../../components/ui";
import TodayAttendanceCard from "../../components/TodayAttendanceCard";
import { AlertsRequiredSheet, PendingAlertsCard } from "../../components/AlertsPrompt";
import { useAttendanceLimits, useEmail, useEmployeesDirectory } from "../../hooks/queries";
import { getOrgActivityForDay } from "../../api/dailyActivity.api";
import { getAllLeaves, leaveStatusOf } from "../../api/leaves.api";
import { fetchCandidatePage, fetchInterviews, fetchResignations, isExEmployee, boardState, uniqueInterviews, hasOutcome } from "../../api/admin.api";
import { daySummary } from "../../utils/attendance";
import { calendarDateKey, formatClock, todayKey } from "../../utils/dates";
import { clean, fullName, lower } from "../../utils/records";
import { greeting } from "../employee/EmployeeHomeScreen";

export default function AdminHomeScreen({ navigation }) {
  const email = useEmail();
  const limits = useAttendanceLimits();
  const [alertsRequired, setAlertsRequired] = useState(null);
  const today = todayKey();
  const queryClient = useQueryClient();

  const employees = useEmployeesDirectory();
  const activity = useQuery({ queryKey: ["dailyActivity", "admin", "all", today], queryFn: () => getOrgActivityForDay(today), refetchInterval: 60000 });
  const leaves = useQuery({ queryKey: ["leaves", "admin", "all"], queryFn: () => getAllLeaves(), staleTime: 5 * 60 * 1000 });
  const candidates = useQuery({ queryKey: ["candidates", "list", "page", 1], queryFn: () => fetchCandidatePage({ page: 1 }), staleTime: 5 * 60 * 1000 });
  const interviews = useQuery({ queryKey: ["interviews"], queryFn: fetchInterviews, staleTime: 5 * 60 * 1000 });
  const resignations = useQuery({ queryKey: ["resignations", "offboarding"], queryFn: fetchResignations, staleTime: 5 * 60 * 1000 });

  const roster = useMemo(() => (employees.data || []).filter((employee) => !isExEmployee(employee)), [employees.data]);

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
    return { groups, avgCheckIn: avg, total: roster.length };
  }, [activity.data, leaves.data, limits.lateAfter, roster, today]);

  const pendingLeaves = useMemo(() => (leaves.data || []).filter((leave) => leaveStatusOf(leave) === "Applied"), [leaves.data]);
  const interviewSummary = useMemo(() => {
    const unique = uniqueInterviews(interviews.data || []).filter((record) => !hasOutcome(record));
    return { due: unique.filter((r) => boardState(r) === "due").length, upcoming: unique.filter((r) => boardState(r) === "upcoming").length, unscheduled: unique.filter((r) => boardState(r) === "unscheduled").length };
  }, [interviews.data]);
  const openOffboarding = useMemo(() => (resignations.data || []).filter((record) => !/^(completed|closed|exited|rejected|withdrawn)$/i.test(clean(record.status))).length, [resignations.data]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["dailyActivity"] });
    queryClient.invalidateQueries({ queryKey: ["leaves"] });
    queryClient.invalidateQueries({ queryKey: ["candidates"] });
    queryClient.invalidateQueries({ queryKey: ["interviews"] });
    queryClient.invalidateQueries({ queryKey: ["system-alerts"] });
  };

  const [peopleTab, setPeopleTab] = useState("late");
  const people = todayStats.groups[peopleTab] || [];

  return (
    <Screen refreshing={activity.isFetching || leaves.isFetching} onRefresh={refresh}>
      <PageHeader eyebrow={greeting()} title="HR dashboard" subtitle={email} right={<Chip label="Admin" tone="lime" />} />

      <PendingAlertsCard />
      <TodayAttendanceCard onAlertsRequired={setAlertsRequired} />

      <View style={{ gap: 10 }}>
        <SectionTitle title="Today across the team" hint={activity.isPending || employees.isPending ? "Loading…" : `${todayStats.total} active employees · avg check-in ${formatClock(todayStats.avgCheckIn)}`} />
        <Row>
          <StatTile label="Present" value={todayStats.groups.present.length} tone="success" icon="checkmark-circle-outline" onPress={() => setPeopleTab("present")} />
          <StatTile label="Late" value={todayStats.groups.late.length} tone="attention" icon="time-outline" onPress={() => setPeopleTab("late")} />
        </Row>
        <Row>
          <StatTile label="Not in yet" value={todayStats.groups.missing.length} tone="closed" icon="close-circle-outline" onPress={() => setPeopleTab("missing")} />
          <StatTile label="On leave" value={todayStats.groups.leave.length} tone="info" icon="airplane-outline" onPress={() => setPeopleTab("leave")} />
        </Row>
        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <Text style={type.subheading}>{{ late: "Late today", missing: "Not checked in", leave: "On leave", present: "Present on time" }[peopleTab]}</Text>
            <Text style={type.small}>{people.length}</Text>
          </Row>
          {people.length === 0 ? (
            <Text style={type.small}>Nobody here right now.</Text>
          ) : (
            people.slice(0, 6).map((person) => (
              <ListRow key={person.key} avatar={person.name} title={person.name} subtitle={person.email} right={person.time ? <Text style={type.small}>{person.time}</Text> : undefined} onPress={() => navigation.navigate("People", { screen: "EmployeeDetail", params: { id: person.employeeId } })} style={{ borderWidth: 0, paddingHorizontal: 0, paddingVertical: 8 }} />
            ))
          )}
          {people.length > 6 ? <Text style={type.small}>+{people.length - 6} more in People.</Text> : null}
        </Card>
      </View>

      <View style={{ gap: 10 }}>
        <SectionTitle title="Needs action" />
        <ListRow icon="calendar-outline" iconTone={pendingLeaves.length ? "attention" : "neutral"} title="Leave approvals" subtitle={pendingLeaves.length ? `${pendingLeaves.length} request${pendingLeaves.length === 1 ? "" : "s"} waiting` : "All caught up"} onPress={() => navigation.navigate("Approvals")} />
        <ListRow icon="people-outline" iconTone={interviewSummary.due ? "attention" : "progress"} title="Interviews" subtitle={`${interviewSummary.due} awaiting decision · ${interviewSummary.upcoming} upcoming · ${interviewSummary.unscheduled} to schedule`} onPress={() => navigation.navigate("More", { screen: "InterviewBoard" })} />
        <ListRow icon="person-add-outline" iconTone="progress" title="Candidates" subtitle={candidates.data ? `${candidates.data.total} in the pipeline` : "Loading…"} onPress={() => navigation.navigate("Candidates")} />
        <ListRow icon="exit-outline" iconTone={openOffboarding ? "attention" : "neutral"} title="Offboarding" subtitle={openOffboarding ? `${openOffboarding} open case${openOffboarding === 1 ? "" : "s"}` : "No open cases"} onPress={() => navigation.navigate("More", { screen: "Offboarding" })} />
      </View>

      <AlertsRequiredSheet alerts={alertsRequired} visible={Boolean(alertsRequired)} onClose={() => setAlertsRequired(null)} />
    </Screen>
  );
}
