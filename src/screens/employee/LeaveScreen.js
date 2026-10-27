import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, tones, type } from "../../theme";
import { Button, Card, Chip, EmptyState, ErrorState, KeyValue, LoadingState, Row, Screen, SectionTitle, SegmentedControl, Sheet, Skeleton } from "../../components/ui";
import DateBlock from "../../components/ui/DateBlock";
import { useLeaveHistory, useMyEmployeeRecord, useMyLeaves, usePublicHolidays } from "../../hooks/queries";
import { leaveApproval, leaveBalancesOf, leaveStatusOf } from "../../api/leaves.api";
import { selectIsAdmin, useAuthStore } from "../../store/authStore";
import { calendarDateKey, formatDate, todayKey } from "../../utils/dates";
import { clean, errorMessage, lower, plainText, readable } from "../../utils/records";

const FILTERS = [{ label: "All", value: "all" }, { label: "Applied", value: "Applied" }, { label: "Accepted", value: "Accepted" }, { label: "Rejected", value: "Rejected" }];
const STATUS_TONE = { Applied: "attention", Accepted: "success", Rejected: "closed" };
const STATUS_LABEL = { Applied: "Awaiting review", Accepted: "Approved", Rejected: "Rejected" };
const VIEWS = [{ label: "Applications", value: "applications" }, { label: "Leave history", value: "history" }];

export default function LeaveScreen({ navigation }) {
  const employee = useMyEmployeeRecord();
  const leaves = useMyLeaves();
  const holidays = usePublicHolidays();
  const isAdmin = useAuthStore(selectIsAdmin);
  const [view, setView] = useState("applications");
  const history = useLeaveHistory(view === "history");
  const [filter, setFilter] = useState("all");
  const [openLeave, setOpenLeave] = useState(null);
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
    <Screen refreshing={leaves.isFetching || employee.isFetching} onRefresh={() => { leaves.refetch(); employee.refetch(); holidays.refetch(); if (view === "history") history.refetch(); }}>
      {/* Brand-blue banner with the Apply action. */}
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.heroTitle}>Leave</Text>
          <Text style={styles.heroSubtitle}>Balances, requests and upcoming holidays.</Text>
        </View>
        <View style={styles.heroActions}>
          <Button title="Apply" icon="add" small variant="lime" onPress={() => navigation.navigate("ApplyLeave")} />
          {isAdmin ? <Button title="Approvals" icon="checkmark-done-outline" small variant="dark" onPress={() => navigation.navigate("AdminTabs", { screen: "Approvals" })} /> : null}
        </View>
      </View>

      <View style={styles.section}>
        <SectionTitle title="Leave balance" hint="Days you can still apply for." />
        {employee.isPending ? (
          <Row align="stretch" style={styles.balanceRow}>{[0, 1].map((slot) => <Skeleton key={slot} height={128} radius={radius.lg} style={styles.balance} />)}</Row>
        ) : employee.isError ? (
          <ErrorState message={employee.error.message} onRetry={() => employee.refetch()} />
        ) : balances.length === 0 ? (
          <EmptyState icon="calendar-outline" title="No leave balance found" message="Ask HR to set up your leave balance." />
        ) : (
          <Row align="stretch" style={styles.balanceRow}>
            {balances.map((item) => {
              const look = item.type === "Sick Leave" ? BALANCE_LOOK.sick : BALANCE_LOOK.annual;
              return (
                <View key={item.type} style={styles.balance}>
                  <View style={[styles.balanceIcon, { backgroundColor: look.iconBg }]}>
                    <Ionicons name={item.type === "Sick Leave" ? "thermometer" : "sunny"} size={18} color={look.fg} />
                  </View>
                  <Text style={styles.balanceValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{item.available}</Text>
                  <Text style={type.subheading}>{item.type}</Text>
                  <Text style={type.small}>{item.hint}</Text>
                </View>
              );
            })}
          </Row>
        )}
      </View>

      <View style={styles.section}>
        <SectionTitle title={view === "applications" ? "My requests" : "Leave history"} hint={view === "applications" ? "Tap a request to see HR's decision." : "Every leave debit and credit on your balance."} />
        <SegmentedControl options={VIEWS} value={view} onChange={setView} />
        {view === "history" ? (
          <LeaveHistoryList history={history} />
        ) : (
        <>
        <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />
        {leaves.isPending ? (
          <LoadingState rows={3} label="Loading your requests" />
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
              <Pressable key={leave.id} onPress={() => setOpenLeave(leave)} accessibilityRole="button" style={({ pressed }) => [styles.request, pressed && { opacity: 0.8 }]}>
                <View style={[styles.requestAccent, { backgroundColor: tone.fg }]} />
                <View style={[styles.requestIcon, { backgroundColor: tone.bg }]}>
                  <Ionicons name={STATUS_ICON[status]} size={18} color={tone.fg} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={type.subheading} numberOfLines={2}>{plainText(leave.type_of_leave || leave.leave_type) || "Leave"}</Text>
                  <Row gap={4} align="flex-start">
                    <Ionicons name="calendar-clear-outline" size={12} color={colors.mutedForeground} style={{ flexShrink: 0, marginTop: 3 }} />
                    <Text style={[type.small, { flexShrink: 1, minWidth: 0 }]}>{from === to ? from : `${from} – ${to}`}</Text>
                  </Row>
                  {description ? (
                    <View style={styles.requestNote}>
                      <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.mutedForeground} style={{ flexShrink: 0, marginTop: 2 }} />
                      <Text style={[type.small, { flex: 1, minWidth: 0 }]} numberOfLines={3}>{description}</Text>
                    </View>
                  ) : null}
                </View>
                <Chip label={status} tone={STATUS_TONE[status]} small style={styles.requestChip} />
              </Pressable>
            );
          })
        )}
        </>
        )}
      </View>

      <LeaveDetailsSheet leave={openLeave} onClose={() => setOpenLeave(null)} />

      <View style={styles.section}>
        <SectionTitle title="Upcoming holidays" />
        {upcomingHolidays.length === 0 ? (
          <Text style={type.small}>No upcoming public holidays.</Text>
        ) : (
          <Card style={styles.listCard}>
            {upcomingHolidays.map((holiday, index) => (
              <View key={holiday.id || holiday.key} style={[styles.holiday, index > 0 && styles.holidayBorder]}>
                <View style={{ flexShrink: 0 }}>
                  <DateBlock dateKey={holiday.key} tone="lime" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={type.subheading} numberOfLines={2}>{plainText(holiday.name) || "Public holiday"}</Text>
                  <Text style={type.small}>{formatDate(holiday.key, { weekday: true })}</Text>
                </View>
                <Ionicons name="gift-outline" size={18} color={colors.oliveLime} style={{ flexShrink: 0 }} />
              </View>
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}

/** One request with HR's decision (web LeaveDetails). */
function LeaveDetailsSheet({ leave, onClose }) {
  const status = leave ? leaveStatusOf(leave) : "Applied";
  const approval = leave ? leaveApproval(leave) : {};
  const from = leave ? formatDate(leave.leave_from, { weekday: true }) : "";
  const to = leave ? formatDate(leave.leave_to || leave.leave_from, { weekday: true }) : "";
  return (
    <Sheet visible={Boolean(leave)} onClose={onClose} title={leave ? plainText(leave.type_of_leave || leave.leave_type) || "Leave" : "Leave"}>
      {leave ? (
        <View style={styles.sheetBody}>
          <Chip label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} style={{ alignSelf: "flex-start" }} />
          <View>
            <KeyValue label="Dates" value={from === to ? from : `${from} – ${to}`} />
            <KeyValue label="Working days" value={clean(leave.leave_days) || undefined} />
            <KeyValue label="Applied" value={formatDate(leave.date_entered)} />
            <KeyValue label="Your reason" value={plainText(leave.description) || undefined} last={status === "Applied"} />
            {status !== "Applied" ? (
              <>
                <KeyValue label={status === "Accepted" ? "Approved by" : "Decided by"} value={approval.approvedBy || "Not recorded"} />
                <KeyValue label={status === "Accepted" ? "Reason for approval" : "HR's note"} value={approval.reason || "Not recorded"} />
                {status === "Accepted" ? <KeyValue label="Work handed over to" value={approval.handoverTo || "No handover"} /> : null}
                <KeyValue label="Decided on" value={approval.decidedOn ? formatDate(approval.decidedOn) : "Not recorded"} last />
              </>
            ) : null}
          </View>
          {status === "Applied" ? <Text style={type.small}>HR has not decided on this request yet.</Text> : null}
        </View>
      ) : null}
    </Sheet>
  );
}

/** Ledger rows from hrc_leave_transaction (web LeaveHistory table: date, leave type, status, action, paid). */
function LeaveHistoryList({ history }) {
  if (history.isPending) return <LoadingState label="Loading leave history…" />;
  if (history.isError) return <ErrorState message={errorMessage(history.error)} onRetry={() => history.refetch()} />;
  const { records, dropdowns } = history.data;
  if (!records.length) return <EmptyState icon="time-outline" title="No leave history yet" message="Leave taken or credited to you will show up here." />;
  const label = (field, value) => (clean(value) ? plainText(dropdowns?.[field]?.[value]) || readable(value) : "");
  return (
    <Card style={styles.listCard}>
      {records.map((record, index) => {
        const credit = lower(record.leave_action) === "credit";
        const paid = clean(record.pay);
        return (
          <View key={record.id} style={[styles.holiday, index > 0 && styles.holidayBorder]}>
            <View style={[styles.requestIcon, { backgroundColor: credit ? tones.success.bg : tones.closed.bg }]}>
              <Ionicons name={credit ? "add" : "remove"} size={18} color={credit ? tones.success.fg : tones.closed.fg} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={type.subheading} numberOfLines={2}>{label("leave_status", record.leave_status) || label("leave_type", record.leave_type) || "Leave"}</Text>
              <Text style={type.small} numberOfLines={2}>
                {[clean(record.leave_date) || formatDate(record.date_entered), label("leave_type", record.leave_type)].filter(Boolean).join(" · ")}
              </Text>
              {plainText(record.description) ? <Text style={type.small} numberOfLines={3}>{plainText(record.description)}</Text> : null}
            </View>
            <View style={styles.historyChips}>
              <Chip label={label("leave_action", record.leave_action) || "—"} tone={credit ? "success" : "closed"} small />
              {paid ? <Chip label={paid === "1" ? "Paid" : "Unpaid"} small /> : null}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const STATUS_ICON ={ Applied: "hourglass-outline", Accepted: "checkmark-circle-outline", Rejected: "close-circle-outline" };

// White cards like the home stat cards; only the icon is tinted.
const BALANCE_LOOK = {
  annual: { iconBg: colors.attentionSoft, fg: colors.attention },
  sick: { iconBg: colors.infoSoft, fg: "#1D4ED8" },
};

const styles = StyleSheet.create({
  section: { gap: 10 },
  hero: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.navy, borderRadius: radius.lg, padding: 18, overflow: "hidden" },
  heroGlow: { position: "absolute", width: 200, height: 200, borderRadius: 100, right: -70, top: -100, backgroundColor: "rgba(212,250,60,0.16)" },
  heroTitle: { fontSize: 24, lineHeight: 30, fontWeight: "600", letterSpacing: -0.4, color: "#FFFFFF" },
  heroSubtitle: { fontSize: 13, lineHeight: 18, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  balanceRow: { flexWrap: "wrap", columnGap: 10, rowGap: 10 },
  balance: { flexGrow: 1, flexShrink: 1, flexBasis: 140, minWidth: 0, gap: 2, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  balanceIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  balanceValue: { fontSize: 28, lineHeight: 35, fontWeight: "600", letterSpacing: -0.5, color: colors.navy, fontVariant: ["tabular-nums"] },
  request: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingRight: 12, paddingLeft: 16, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  requestAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  requestIcon: { flexShrink: 0, width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  requestChip: { flexShrink: 0, maxWidth: "45%", alignSelf: "center" },
  requestNote: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 4, paddingVertical: 6, paddingHorizontal: 8, borderRadius: radius.sm, backgroundColor: colors.background },
  listCard: { paddingVertical: 4, paddingHorizontal: 14, gap: 0 },
  holiday: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  holidayBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  heroActions: { flexShrink: 0, gap: 8, alignItems: "stretch" },
  historyChips: { flexShrink: 0, gap: 4, alignItems: "flex-end" },
  sheetBody: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
});
