import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, type } from "../../theme";
import { Button, Card, Chip, EmptyState, ErrorState, ListRow, PageHeader, Row, Screen, SectionTitle, SegmentedControl } from "../../components/ui";
import { useMyEmployeeRecord, useMyLeaves, usePublicHolidays } from "../../hooks/queries";
import { leaveBalancesOf, leaveStatusOf } from "../../api/leaves.api";
import { calendarDateKey, formatDate, todayKey } from "../../utils/dates";
import { plainText } from "../../utils/records";

const FILTERS = [{ label: "All", value: "all" }, { label: "Applied", value: "Applied" }, { label: "Accepted", value: "Accepted" }, { label: "Rejected", value: "Rejected" }];
const STATUS_TONE = { Applied: "attention", Accepted: "success", Rejected: "closed" };

export default function LeaveScreen({ navigation }) {
  const employee = useMyEmployeeRecord();
  const leaves = useMyLeaves();
  const holidays = usePublicHolidays();
  const [filter, setFilter] = useState("all");
  const today = todayKey();

  const balances = leaveBalancesOf(employee.data);
  const requests = useMemo(
    () => (leaves.data || []).filter((leave) => filter === "all" || leaveStatusOf(leave) === filter).sort((a, b) => String(b.date_entered).localeCompare(String(a.date_entered))),
    [filter, leaves.data],
  );
  const upcomingHolidays = useMemo(
    () => (holidays.data || []).map((holiday) => ({ ...holiday, key: calendarDateKey(holiday.holiday_date) })).filter((holiday) => holiday.key && holiday.key >= today).sort((a, b) => a.key.localeCompare(b.key)).slice(0, 5),
    [holidays.data, today],
  );

  return (
    <Screen refreshing={leaves.isFetching || employee.isFetching} onRefresh={() => { leaves.refetch(); employee.refetch(); holidays.refetch(); }}>
      <PageHeader title="Leave" subtitle="Balances, requests and upcoming holidays." right={<Button title="Apply" icon="add" small onPress={() => navigation.navigate("ApplyLeave")} />} />

      <View style={{ gap: 10 }}>
        <SectionTitle title="Leave balance" hint="Days you can still apply for." />
        {employee.isPending ? (
          <Text style={type.small}>Loading balances…</Text>
        ) : employee.isError ? (
          <ErrorState message={employee.error.message} onRetry={() => employee.refetch()} />
        ) : balances.length === 0 ? (
          <EmptyState icon="calendar-outline" title="No leave balance found" message="Ask HR to set up your leave balance." />
        ) : (
          <Row>
            {balances.map((item) => (
              <Card key={item.type} style={{ flex: 1, gap: 4 }}>
                <Ionicons name={item.type === "Sick Leave" ? "thermometer-outline" : "sunny-outline"} size={20} color={colors.primary} />
                <Text style={[type.title, { fontSize: 28 }]}>{item.available}</Text>
                <Text style={type.subheading}>{item.type}</Text>
                <Text style={type.small}>{item.hint}</Text>
              </Card>
            ))}
          </Row>
        )}
      </View>

      <View style={{ gap: 10 }}>
        <SectionTitle title="My requests" />
        <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />
        {leaves.isPending ? (
          <Text style={type.small}>Loading requests…</Text>
        ) : leaves.isError ? (
          <ErrorState message={leaves.error.message} onRetry={() => leaves.refetch()} />
        ) : requests.length === 0 ? (
          <EmptyState icon="document-text-outline" title="No leave requests" message={filter === "all" ? "Apply for leave and it will show up here." : `No ${filter.toLowerCase()} requests.`} action={filter === "all" ? "Apply for leave" : undefined} onAction={() => navigation.navigate("ApplyLeave")} />
        ) : (
          requests.map((leave) => {
            const status = leaveStatusOf(leave);
            const from = formatDate(leave.leave_from, { year: false });
            const to = formatDate(leave.leave_to, { year: false });
            return (
              <ListRow
                key={leave.id}
                icon="calendar-outline"
                iconTone={STATUS_TONE[status]}
                title={plainText(leave.type_of_leave || leave.leave_type) || "Leave"}
                subtitle={from === to ? from : `${from} – ${to}`}
                meta={plainText(leave.description) || undefined}
                right={<Chip label={status} tone={STATUS_TONE[status]} small />}
              />
            );
          })
        )}
      </View>

      <View style={{ gap: 10 }}>
        <SectionTitle title="Upcoming holidays" />
        {upcomingHolidays.length === 0 ? (
          <Text style={type.small}>No upcoming public holidays.</Text>
        ) : (
          upcomingHolidays.map((holiday) => (
            <ListRow key={holiday.id || holiday.key} icon="gift-outline" iconTone="lime" title={plainText(holiday.name) || "Public holiday"} subtitle={formatDate(holiday.key, { weekday: true })} />
          ))
        )}
      </View>
    </Screen>
  );
}
