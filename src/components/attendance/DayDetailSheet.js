// One employee's day: leave details, day report and every login session.
// Web: the attendance details Dialog in AdminAttendanceDashboard.jsx (+ leave/LeaveDetails.jsx).
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, type } from "../../theme";
import { Chip, Sheet } from "../ui";
import { daySummary } from "../../utils/attendance";
import { formatMinutes } from "../../utils/adminAttendance";
import { formatDate } from "../../utils/dates";
import { clean, plainText } from "../../utils/records";
import { leaveStatusOf } from "../../api/leaves.api";
import { STATUSES } from "./AttendanceStatus";

const DAILY_TARGET_MINUTES = 540;
const LEAVE_STATUS = {
  Applied: { label: "Awaiting review", tone: "attention" },
  Accepted: { label: "Approved", tone: "success" },
  Rejected: { label: "Rejected", tone: "closed" },
};

/** `selected` = { date, records, leave } or null; `row` is the employee ({ name, email }). */
export default function DayDetailSheet({ selected, row, today, lateAfter, onClose }) {
  const records = selected?.records || [];
  const summary = daySummary(records, selected?.date, today, false, lateAfter);
  const breakMinutes = summary.sessions.every((session) => session.breakMinutes !== null)
    ? summary.sessions.reduce((sum, session) => sum + session.breakMinutes, 0)
    : null;
  const progress = summary.worked === null ? 0 : Math.min(Math.round((summary.worked / DAILY_TARGET_MINUTES) * 100), 100);

  return (
    <Sheet visible={Boolean(selected)} onClose={onClose} title={row?.name || "Attendance details"} scroll={false}>
      {selected ? (
        <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.body}>
          <Text style={type.small}>
            {formatDate(selected.date, { weekday: true })} · {selected.leave && !records.length ? "Leave details" : "Login, logout and lunch activity"}
          </Text>

          {selected.leave ? <LeaveCard leave={selected.leave} /> : null}

          {records.length ? (
            <>
              <View style={styles.report}>
                <Text style={type.subheading}>Day report</Text>
                {row?.email || row?.name ? <Text style={type.small} numberOfLines={1} ellipsizeMode="tail">{row?.email || row?.name}</Text> : null}
                <View style={styles.metrics}>
                  <Metric label="Time in office" value={formatMinutes(summary.inOffice)} />
                  <Metric label="Effective time" value={formatMinutes(summary.worked)} />
                  <Metric label="Break time" value={formatMinutes(breakMinutes)} />
                </View>
                <View style={styles.target}>
                  <View style={styles.targetHead}>
                    <Text style={[styles.metricLabel, { flex: 1, minWidth: 0 }]}>Daily target</Text>
                    <Text style={styles.targetValue} numberOfLines={1}>{progress}%</Text>
                  </View>
                  <View style={styles.track}><View style={[styles.fill, { width: `${progress}%` }]} /></View>
                  <Text style={styles.metricLabel}>{formatMinutes(summary.worked)} of 9h 00m</Text>
                </View>
              </View>

              <Text style={styles.sectionLabel}>Activity timeline</Text>
              {records.map((record, index) => {
                const one = daySummary([record], selected.date, today, false, lateAfter);
                const session = one.sessions[0];
                return (
                  <View key={record.id || index} style={styles.session}>
                    <View style={styles.sessionHead}>
                      <Text style={[type.subheading, { flexShrink: 1 }]}>Session {index + 1}</Text>
                      <Text style={[type.small, styles.sessionStatus, { color: STATUSES[one.status].fg }]}>{STATUSES[one.status].label}</Text>
                    </View>
                    <View style={styles.grid}>
                      {[
                        ["Login", session.login, "log-in-outline"],
                        ["Logout", session.logout, "log-out-outline"],
                        ["Lunch in", session.lunchIn, "cafe-outline"],
                        ["Lunch out", session.lunchOut, "restaurant-outline"],
                      ].map(([label, time, icon]) => (
                        <View key={label} style={styles.cell}>
                          <View style={styles.cellLabelRow}>
                            <Ionicons name={icon} size={12} color={colors.mutedForeground} style={{ flexShrink: 0 }} />
                            <Text style={[styles.metricLabel, { flexShrink: 1 }]}>{label}</Text>
                          </View>
                          <Text style={[styles.cellValue, !time && { color: colors.mutedForeground, fontWeight: "400" }]}>{time?.time || "Not recorded"}</Text>
                          {time && time.date !== selected.date ? <Text style={styles.metricLabel}>{formatDate(time.date)}</Text> : null}
                        </View>
                      ))}
                      <View style={styles.cell}>
                        <Text style={styles.metricLabel}>Break duration</Text>
                        <Text style={styles.cellValue}>{formatMinutes(session.breakMinutes)}</Text>
                      </View>
                      <View style={styles.cell}>
                        <Text style={styles.metricLabel}>Effective time</Text>
                        <Text style={[styles.cellValue, { color: colors.primaryDeep }]}>{formatMinutes(session.worked)}</Text>
                      </View>
                    </View>
                    {clean(record.description) ? <Text style={styles.description}>{plainText(record.description)}</Text> : null}
                  </View>
                );
              })}
            </>
          ) : selected.leave ? null : (
            <Text style={type.small}>This activity is no longer available. Refresh the list.</Text>
          )}
        </ScrollView>
      ) : null}
    </Sheet>
  );
}

function Metric({ label, value }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel} numberOfLines={2}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{value}</Text>
    </View>
  );
}

function LeaveCard({ leave }) {
  const status = LEAVE_STATUS[leaveStatusOf(leave)];
  const from = formatDate(leave.leave_from);
  const to = clean(leave.leave_to) && leave.leave_to !== leave.leave_from ? formatDate(leave.leave_to) : null;
  const reason = plainText(leave.description);
  return (
    <View style={styles.leave}>
      <View style={styles.sessionHead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.metricLabel}>Leave</Text>
          <Text style={type.subheading} numberOfLines={2}>{plainText(leave.type_of_leave || leave.leave_type) || "Leave"}</Text>
        </View>
        <Chip label={status.label} tone={status.tone} small style={{ alignSelf: "flex-start", maxWidth: "45%" }} />
      </View>
      <Text style={type.small}>
        {to ? `${from} – ${to}` : from}
        {clean(leave.leave_days) ? ` · ${clean(leave.leave_days)} day${Number(leave.leave_days) === 1 ? "" : "s"}` : ""}
      </Text>
      {reason ? <Text style={[type.small, { color: colors.foreground }]}>{reason}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  report: { gap: 10, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: "#F8FAFC" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: { flexGrow: 1, flexBasis: "30%", minWidth: 96, padding: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 2 },
  metricLabel: { fontSize: 11, lineHeight: 15, color: colors.mutedForeground },
  metricValue: { fontSize: 15, lineHeight: 20, fontWeight: "600", color: colors.foreground },
  target: { gap: 6, padding: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  targetHead: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  targetValue: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: colors.primaryDeep },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.muted, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4, backgroundColor: colors.primaryDeep },
  sectionLabel: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.mutedForeground },
  session: { gap: 10, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  sessionHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  sessionStatus: { flexShrink: 1, maxWidth: "55%", textAlign: "right" },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 12 },
  cell: { width: "50%", minWidth: 0, gap: 2, paddingRight: 8 },
  cellLabelRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  cellValue: { fontSize: 14, lineHeight: 19, fontWeight: "600", color: colors.foreground },
  description: { fontSize: 12, lineHeight: 17, color: colors.mutedForeground, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  leave: { gap: 6, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
});
