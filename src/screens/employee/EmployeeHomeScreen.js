import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { type } from "../../theme";
import { Card, Chip, ListRow, PageHeader, Row, Screen, SectionTitle, SegmentedControl, StatTile } from "../../components/ui";
import TodayAttendanceCard from "../../components/TodayAttendanceCard";
import { AlertsRequiredSheet, PendingAlertsCard } from "../../components/AlertsPrompt";
import { useAnnouncements, useAttendanceLimits, useEmail, useMyActivityRange, useMyLeaves, usePublicHolidays } from "../../hooks/queries";
import { useAuthStore } from "../../store/authStore";
import { employeeAttendanceStats, holidayMapOf, leaveDaysOf, groupActivityByDay, daySummary } from "../../utils/attendance";
import { calendarDateKey, dateKey, formatClock, formatDate, formatHours, monthRange, todayKey } from "../../utils/dates";
import { plainText } from "../../utils/records";

const PERIODS = [{ label: "This month", value: "month" }, { label: "Last 30 days", value: "30d" }];

export default function EmployeeHomeScreen({ navigation }) {
  const email = useEmail();
  const userInfo = useAuthStore((state) => state.userInfo);
  const limits = useAttendanceLimits();
  const [period, setPeriod] = useState("month");
  const [alertsRequired, setAlertsRequired] = useState(null);
  const today = todayKey();
  const queryClient = useQueryClient();

  const range = useMemo(() => {
    if (period === "month") return monthRange();
    const start = new Date();
    start.setDate(start.getDate() - 29);
    return { from: dateKey(start), to: today };
  }, [period, today]);

  const activity = useMyActivityRange(range);
  const leaves = useMyLeaves();
  const holidays = usePublicHolidays();
  const announcements = useAnnouncements();

  const stats = useMemo(() => {
    const leaveDays = leaveDaysOf(leaves.data || []);
    const holidayDays = new Set(Object.keys(holidayMapOf(holidays.data || [])));
    return employeeAttendanceStats({ records: activity.data || [], ...range, today, lateAfter: limits.lateAfter, leaveDays, holidays: holidayDays });
  }, [activity.data, holidays.data, leaves.data, limits.lateAfter, range, today]);

  const recentDays = useMemo(() => {
    const byDay = groupActivityByDay(activity.data || []);
    return Object.keys(byDay)
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 5)
      .map((day) => ({ day, summary: daySummary(byDay[day], day, today, false, limits.lateAfter) }));
  }, [activity.data, limits.lateAfter, today]);

  const upcoming = useMemo(() => {
    const items = [];
    for (const holiday of holidays.data || []) {
      const key = calendarDateKey(holiday.holiday_date);
      if (key && key >= today) items.push({ key, title: plainText(holiday.name) || "Public holiday", detail: "Public holiday", tone: "lime" });
    }
    for (const leave of leaves.data || []) {
      const key = calendarDateKey(leave.leave_from);
      if (key && key >= today) items.push({ key, title: plainText(leave.type_of_leave || leave.leave_type) || "Leave", detail: `${leave.status || "Applied"} · ${leave.leave_days || ""} day(s)`, tone: leave.status === "Accepted" ? "success" : leave.status === "Rejected" ? "closed" : "attention" });
    }
    return items.sort((a, b) => a.key.localeCompare(b.key)).slice(0, 4);
  }, [holidays.data, leaves.data, today]);

  const refreshing = activity.isFetching || leaves.isFetching;
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["dailyActivity"] });
    queryClient.invalidateQueries({ queryKey: ["leaves"] });
    queryClient.invalidateQueries({ queryKey: ["system-alerts"] });
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <PageHeader eyebrow={greeting()} title={email.split("@")[0] || "Welcome"} subtitle="Here's your attendance overview and what's coming up." right={<Chip label={userInfo?.status || "Employee"} tone="progress" />} />

      <PendingAlertsCard />
      <TodayAttendanceCard onAlertsRequired={setAlertsRequired} />

      <View style={{ gap: 10 }}>
        <SectionTitle title="My attendance" action="Calendar" onAction={() => navigation.navigate("Attendance")} />
        <SegmentedControl options={PERIODS} value={period} onChange={setPeriod} />
        <Row style={{ flexWrap: "wrap" }}>
          <StatTile label="On time" value={stats.counts.present} tone="success" icon="checkmark-circle-outline" />
          <StatTile label="Late" value={stats.counts.late} tone="attention" icon="time-outline" />
        </Row>
        <Row style={{ flexWrap: "wrap" }}>
          <StatTile label="On leave" value={stats.counts.leave} tone="info" icon="airplane-outline" />
          <StatTile label="Absent" value={stats.counts.absent} tone="closed" icon="close-circle-outline" />
        </Row>
        <Card style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Metric label="Avg check-in" value={formatClock(stats.avgCheckIn)} />
          <Metric label="Avg worked" value={formatHours(stats.avgWorked)} />
          <Metric label="On-time rate" value={stats.onTimeRate === null ? "—" : `${stats.onTimeRate}%`} />
        </Card>
      </View>

      <View style={{ gap: 10 }}>
        <SectionTitle title="Recent days" hint="Login, lunch and logout for your last working days." />
        {activity.isPending ? <Text style={type.small}>Loading…</Text> : recentDays.length === 0 ? <Text style={type.small}>No attendance records in this period yet.</Text> : recentDays.map(({ day, summary }) => (
          <ListRow
            key={day}
            icon={summary.status === "late" ? "time-outline" : "checkmark-circle-outline"}
            iconTone={summary.status === "late" ? "attention" : summary.status === "onTime" ? "success" : "neutral"}
            title={formatDate(day, { weekday: true, year: false })}
            subtitle={`In ${summary.first?.time || "—"} · Out ${summary.lastLogout?.time || "—"}`}
            right={<Text style={type.subheading}>{formatHours(summary.worked)}</Text>}
          />
        ))}
      </View>

      <View style={{ gap: 10 }}>
        <SectionTitle title="Coming up" action="Leave" onAction={() => navigation.navigate("Leave")} />
        {upcoming.length === 0 ? <Text style={type.small}>No holidays or leave scheduled.</Text> : upcoming.map((item, index) => (
          <ListRow key={`${item.key}-${index}`} icon="calendar-outline" iconTone={item.tone} title={item.title} subtitle={item.detail} right={<Text style={type.small}>{formatDate(item.key, { year: false })}</Text>} />
        ))}
      </View>

      {announcements.data?.length ? (
        <View style={{ gap: 10 }}>
          <SectionTitle title="Announcements" />
          {announcements.data.slice(0, 3).map((alert) => (
            <Card key={alert.id} style={{ gap: 4 }}>
              <Text style={type.subheading}>{plainText(alert.name)}</Text>
              <Text style={type.small} numberOfLines={3}>{plainText(alert.description)}</Text>
              <Text style={[type.small, { fontSize: 11 }]}>{formatDate(alert.date_entered)}</Text>
            </Card>
          ))}
        </View>
      ) : null}

      <AlertsRequiredSheet alerts={alertsRequired} visible={Boolean(alertsRequired)} onClose={() => setAlertsRequired(null)} />
    </Screen>
  );
}

function Metric({ label, value }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={type.tiny}>{label}</Text>
      <Text style={[type.subheading, { marginTop: 2 }]}>{value}</Text>
    </View>
  );
}

export function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

