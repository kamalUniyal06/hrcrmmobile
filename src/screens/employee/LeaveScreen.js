import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, tones, type } from "../../theme";
import { Button, Card, Chip, EmptyState, ErrorState, Row, Screen, SectionTitle, SegmentedControl } from "../../components/ui";
import DateBlock from "../../components/ui/DateBlock";
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
      {/* Brand-blue banner with the Apply action. */}
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>Leave</Text>
          <Text style={styles.heroSubtitle}>Balances, requests and upcoming holidays.</Text>
        </View>
        <Button title="Apply" icon="add" small variant="lime" onPress={() => navigation.navigate("ApplyLeave")} />
      </View>

      <View style={styles.section}>
        <SectionTitle title="Leave balance" hint="Days you can still apply for." />
        {employee.isPending ? (
          <Text style={type.small}>Loading balances…</Text>
        ) : employee.isError ? (
          <ErrorState message={employee.error.message} onRetry={() => employee.refetch()} />
        ) : balances.length === 0 ? (
          <EmptyState icon="calendar-outline" title="No leave balance found" message="Ask HR to set up your leave balance." />
        ) : (
          <Row align="stretch">
            {balances.map((item) => {
              const look = item.type === "Sick Leave" ? BALANCE_LOOK.sick : BALANCE_LOOK.annual;
              return (
                <View key={item.type} style={styles.balance}>
                  <View style={[styles.balanceIcon, { backgroundColor: look.iconBg }]}>
                    <Ionicons name={item.type === "Sick Leave" ? "thermometer" : "sunny"} size={18} color={look.fg} />
                  </View>
                  <Text style={styles.balanceValue}>{item.available}</Text>
                  <Text style={type.subheading}>{item.type}</Text>
                  <Text style={type.small}>{item.hint}</Text>
                </View>
              );
            })}
          </Row>
        )}
      </View>

      <View style={styles.section}>
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
            const tone = tones[STATUS_TONE[status]];
            const from = formatDate(leave.leave_from, { year: false });
            const to = formatDate(leave.leave_to, { year: false });
            const description = plainText(leave.description);
            return (
              <View key={leave.id} style={styles.request}>
                <View style={[styles.requestAccent, { backgroundColor: tone.fg }]} />
                <View style={[styles.requestIcon, { backgroundColor: tone.bg }]}>
                  <Ionicons name={STATUS_ICON[status]} size={18} color={tone.fg} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={type.subheading} numberOfLines={1}>{plainText(leave.type_of_leave || leave.leave_type) || "Leave"}</Text>
                  <Row gap={4}>
                    <Ionicons name="calendar-clear-outline" size={12} color={colors.mutedForeground} />
                    <Text style={[type.small, { flexShrink: 1 }]} numberOfLines={1}>{from === to ? from : `${from} – ${to}`}</Text>
                  </Row>
                  {description ? (
                    <View style={styles.requestNote}>
                      <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.mutedForeground} style={{ marginTop: 2 }} />
                      <Text style={[type.small, { flex: 1 }]} numberOfLines={3}>{description}</Text>
                    </View>
                  ) : null}
                </View>
                <Chip label={status} tone={STATUS_TONE[status]} small />
              </View>
            );
          })
        )}
      </View>

      <View style={styles.section}>
        <SectionTitle title="Upcoming holidays" />
        {upcomingHolidays.length === 0 ? (
          <Text style={type.small}>No upcoming public holidays.</Text>
        ) : (
          <Card style={styles.listCard}>
            {upcomingHolidays.map((holiday, index) => (
              <View key={holiday.id || holiday.key} style={[styles.holiday, index > 0 && styles.holidayBorder]}>
                <DateBlock dateKey={holiday.key} tone="lime" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={type.subheading} numberOfLines={1}>{plainText(holiday.name) || "Public holiday"}</Text>
                  <Text style={type.small}>{formatDate(holiday.key, { weekday: true })}</Text>
                </View>
                <Ionicons name="gift-outline" size={18} color={colors.oliveLime} />
              </View>
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}

const STATUS_ICON = { Applied: "hourglass-outline", Accepted: "checkmark-circle-outline", Rejected: "close-circle-outline" };

// White cards like the home stat cards; only the icon is tinted.
const BALANCE_LOOK = {
  annual: { iconBg: colors.attentionSoft, fg: colors.attention },
  sick: { iconBg: colors.infoSoft, fg: "#1D4ED8" },
};

const styles = StyleSheet.create({
  section: { gap: 10 },
  hero: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.navy, borderRadius: radius.lg, padding: 18, overflow: "hidden" },
  heroGlow: { position: "absolute", width: 200, height: 200, borderRadius: 100, right: -70, top: -100, backgroundColor: "rgba(59,130,246,0.28)" },
  heroTitle: { fontSize: 24, lineHeight: 30, fontWeight: "600", letterSpacing: -0.4, color: "#FFFFFF" },
  heroSubtitle: { fontSize: 13, lineHeight: 18, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  balance: { flex: 1, gap: 2, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  balanceIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  balanceValue: { fontSize: 28, lineHeight: 34, fontWeight: "600", letterSpacing: -0.5, color: colors.navy, fontVariant: ["tabular-nums"] },
  request: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingRight: 12, paddingLeft: 16, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  requestAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  requestIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  requestNote: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 4, paddingVertical: 6, paddingHorizontal: 8, borderRadius: radius.sm, backgroundColor: colors.background },
  listCard: { paddingVertical: 4, paddingHorizontal: 14, gap: 0 },
  holiday: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  holidayBorder: { borderTopWidth: 1, borderTopColor: colors.border },
});
