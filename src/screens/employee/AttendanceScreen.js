import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { type } from "../../theme";
import { Card, Chip, KeyValue, PageHeader, Screen, StatTile, Row } from "../../components/ui";
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
    const byDay = groupActivityByDay(activity.data || []);
    const leaveDays = leaveDaysOf(leaves.data || []);
    const holidayMap = holidayMapOf(holidays.data || []);
    const markers = {};
    const counts = { present: 0, late: 0, leave: 0, absent: 0 };
    const days = new Date(cursor.year, cursor.month + 1, 0).getDate();
    for (let day = 1; day <= days; day += 1) {
      const key = dateKey(new Date(cursor.year, cursor.month, day));
      const summary = daySummary(byDay[key], key, today, leaveDays.has(key), limits.lateAfter);
      if (summary.status === "onTime") { markers[key] = { tone: "present" }; counts.present += 1; }
      else if (summary.status === "late") { markers[key] = { tone: "late" }; counts.late += 1; }
      else if (summary.status === "leave") { markers[key] = { tone: "leave" }; counts.leave += 1; }
      else if (holidayMap[key]) markers[key] = { tone: "holiday", label: holidayMap[key] };
      else if (isWeekend(key)) markers[key] = { tone: "weekend" };
      else if (summary.status === "missing" && key < today) { markers[key] = { tone: "absent" }; counts.absent += 1; }
      else if (summary.status === "incomplete") markers[key] = { tone: "incomplete" };
    }
    return { markers, byDay, leaveDays, holidayMap, counts };
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
      <PageHeader title={title} subtitle={route?.params?.email ? email : "Tap a day to see check-in, lunch and check-out times."} />
      <Row style={{ flexWrap: "wrap" }}>
        <StatTile label="On time" value={counts.present} tone="success" />
        <StatTile label="Late" value={counts.late} tone="attention" />
        <StatTile label="Leave" value={counts.leave} tone="info" />
        <StatTile label="Absent" value={counts.absent} tone="closed" />
      </Row>
      <Card>
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
        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <Text style={type.heading}>{formatDate(selected, { weekday: true })}</Text>
            <Chip label={statusLabel(selectedSummary.status, holidayMap[selected], isWeekend(selected))} tone={statusTone(selectedSummary.status, holidayMap[selected])} />
          </Row>
          {holidayMap[selected] ? <Text style={type.small}>{holidayMap[selected]}</Text> : null}
          {selectedSummary.sessions.length ? (
            selectedSummary.sessions.map((session, index) => (
              <View key={index} style={{ marginTop: 4 }}>
                <KeyValue label="Clock in" value={session.login?.time || "—"} />
                <KeyValue label="Lunch start" value={session.lunchIn?.time || "—"} />
                <KeyValue label="Lunch end" value={session.lunchOut?.time || "—"} />
                <KeyValue label="Clock out" value={session.logout?.time || "—"} />
                <KeyValue label="Worked" value={formatHours(session.worked)} last />
              </View>
            ))
          ) : (
            <Text style={type.small}>
              {selectedLeave ? `On leave — ${selectedLeave.type_of_leave || selectedLeave.leave_type || "Approved leave"}` : selected > today ? "This day is still ahead." : "No attendance recorded for this day."}
            </Text>
          )}
        </Card>
      ) : null}
    </Screen>
  );
}

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
