import { useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, tones, type } from "../../theme";
import { Card, LoadingState, Row, Screen, SegmentedControl } from "../../components/ui";
import TodayAttendanceCard from "../../components/TodayAttendanceCard";
import { PendingAlertsCard } from "../../components/AlertsPrompt";
import ScheduleCard from "../../components/home/ScheduleCard";
import FeedCard from "../../components/home/FeedCard";
import { useAttendanceLimits, useEmail, useEmployeesDirectory, useMyActivityRange, useMyAlerts, useMyLeaves, usePublicHolidays } from "../../hooks/queries";
import { buildFeed } from "../../utils/homeDashboard";
import { utcToLocalStamp } from "../../utils/systemAlerts";
import { employeeAttendanceStats, holidayMapOf, leaveDaysOf, groupActivityByDay, daySummary } from "../../utils/attendance";
import { dateKey, formatClock, formatDate, formatHours, monthRange, todayKey } from "../../utils/dates";
import { firstImage, initials, plainText } from "../../utils/records";

const PERIODS = [{ label: "This month", value: "month" }, { label: "Last 30 days", value: "30d" }];

export default function EmployeeHomeScreen({ navigation }) {
  const email = useEmail();
  const limits = useAttendanceLimits();
  const [period, setPeriod] = useState("month");
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
  // Web EmployeHomePage: employees read alerts only through my_alerts (aimed at them, live, not expired).
  const myAlerts = useMyAlerts();
  // my_alerts times are UTC; the home cards read local time.
  const announcements = useMemo(
    () => (myAlerts.data?.alerts || [])
      .map((alert) => ({ ...alert, date_entered: utcToLocalStamp(alert.date_entered) }))
      .sort((a, b) => String(b.date_entered).localeCompare(String(a.date_entered))),
    [myAlerts.data],
  );
  const employees = useEmployeesDirectory();

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

  const scheduleSources = useMemo(
    () => ({ employees: employees.data || [], holidays: holidays.data || [], leaves: leaves.data || [], leaveLabel: () => "You're on leave" }),
    [employees.data, holidays.data, leaves.data],
  );
  const feed = useMemo(() => buildFeed({ activity: activity.data || [], leaves: leaves.data || [], alerts: announcements }), [activity.data, announcements, leaves.data]);
  // Feed rows open the announcement, your leave or your attendance.
  const openFeedItem = (item) => {
    const alert = item.alertId ? announcements.find((record) => record.id === item.alertId) : null;
    if (alert) navigation.navigate("AnnouncementDetail", { alert });
    else if (item.leaveId) navigation.navigate("Leave");
    else navigation.navigate("Attendance");
  };

  const refreshing = activity.isFetching || leaves.isFetching;
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["dailyActivity"] });
    queryClient.invalidateQueries({ queryKey: ["leaves"] });
    queryClient.invalidateQueries({ queryKey: ["system-alerts"] });
  };

  const name = email.split("@")[0] || "Welcome";

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      {/* App bar: brand on the left, profile shortcut on the right. */}
      <View style={styles.appBar}>
        <View style={styles.brand}>
          <Image source={LOGO} style={styles.brandLogo} resizeMode="contain" />
          <Text style={styles.brandText} numberOfLines={1}>HRCRM</Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate("Profile")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
          style={({ pressed }) => [styles.profileButton, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.profileInitial}>{initials(name)}</Text>
        </Pressable>
      </View>

      {/* Deep navy welcome banner with an ambient glow. */}
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.heroRow}>
          <View style={{ flexShrink: 0 }}>
            <View style={styles.initials}>
              <Text style={styles.initialsText}>{initials(name)}</Text>
            </View>
            <View style={styles.onlineDot} />
          </View>
          {/* Long names wrap onto a second line (shrinking a little first) instead of being cut. */}
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <View style={styles.greetingRow}>
              <Text style={styles.heroGreeting}>{greeting()} •</Text>
              <View style={styles.datePill}>
                <Text style={styles.datePillText} numberOfLines={1}>{formatDate(today, { year: false })}</Text>
              </View>
            </View>
            <Text style={styles.heroName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{capitalize(name)}</Text>
          </View>
        </View>
        <Text style={styles.heroSubtitle}>Here's your attendance overview and what's coming up.</Text>
      </View>

      <PendingAlertsCard onSeeAll={() => navigation.navigate("MyAlerts")} />
      <TodayAttendanceCard />

      <View style={styles.section}>
        <SectionHeader title="My attendance" action="Calendar" onAction={() => navigation.navigate("Attendance")} />
        <SegmentedControl options={PERIODS} value={period} onChange={setPeriod} />
        <View style={styles.statGrid}>
          <Stat label="On time" value={stats.counts.present} tone="success" icon="checkmark-circle" />
          <Stat label="Late" value={stats.counts.late} tone="attention" icon="time" />
          <Stat label="On leave" value={stats.counts.leave} tone="info" icon="airplane" />
          <Stat label="Absent" value={stats.counts.absent} tone="closed" icon="close-circle" />
        </View>
        <View style={styles.metricBar}>
          <Metric label="Avg check-in" value={formatClock(stats.avgCheckIn)} />
          <View style={styles.metricDivider} />
          <Metric label="Avg worked" value={formatHours(stats.avgWorked)} />
          <View style={styles.metricDivider} />
          <Metric label="On-time rate" value={stats.onTimeRate === null ? "—" : `${stats.onTimeRate}%`} highlight />
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Recent days" hint="Login, lunch and logout for your last working days." />
        {activity.isPending ? <LoadingState rows={3} label="Loading recent days" /> : recentDays.length === 0 ? <Text style={type.small}>No attendance records in this period yet.</Text> : (
          <Card style={styles.listCard}>
            {recentDays.map(({ day, summary }, index) => {
              const tone = summary.status === "late" ? "closed" : summary.status === "onTime" ? "success" : "neutral";
              const statusText = summary.status === "late" ? "Late" : summary.status === "onTime" ? "On time" : null;
              return (
                <View key={day} style={[styles.listItem, index > 0 && styles.listItemBorder]}>
                  <View style={[styles.dayDot, { backgroundColor: tones[tone].fg }]} />
                  <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                    <View style={styles.dayTitleRow}>
                      <Text style={[type.subheading, { flexShrink: 1, minWidth: 0 }]} numberOfLines={2}>{formatDate(day, { weekday: true, year: false })}</Text>
                      {statusText ? (
                        <View style={[styles.dayBadge, { backgroundColor: tones[tone].bg }]}>
                          <Text style={[styles.dayBadgeText, { color: tones[tone].fg }]} numberOfLines={1}>{statusText}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.timeChips}>
                      <TimeChip label="In" value={summary.first?.time} />
                      <TimeChip label="Out" value={summary.lastLogout?.time} />
                    </View>
                  </View>
                  <View style={styles.hoursPill}>
                    <Text style={styles.hoursText} numberOfLines={1}>{formatHours(summary.worked)}</Text>
                  </View>
                </View>
              );
            })}
          </Card>
        )}
      </View>

      {/* Web EmployeHomePage: the Upcoming card (holidays, birthdays, anniversaries, your leave, announcements) and the activity log. */}
      <ScheduleCard
        sources={scheduleSources}
        loading={holidays.isPending || leaves.isPending}
        announcements={announcements}
        announcementsLoading={myAlerts.isPending}
        announcementsError={myAlerts.isError}
        onRetryAnnouncements={() => myAlerts.refetch()}
        navigation={navigation}
        admin={false}
      />
      <FeedCard feed={feed} loading={activity.isPending} error={activity.isError} onRetry={() => activity.refetch()} today={today} onOpen={openFeedItem} />

      {announcements.length ? (
        <View style={styles.section}>
          <SectionHeader title="Announcements" />
          {announcements.slice(0, 3).map((alert) => (
            <Card key={alert.id} style={styles.announcement} onPress={() => navigation.navigate("AnnouncementDetail", { alert })}>
              <View style={styles.announcementTop}>
                <Row gap={10} style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.announcementIcon}>
                    <Ionicons name="megaphone" size={16} color={colors.primary} />
                  </View>
                  <Text style={[styles.announcementLabel, { flexShrink: 1 }]} numberOfLines={1}>Announcement</Text>
                </Row>
                {alert.date_entered ? (
                  <View style={styles.announcementDate}>
                    <Ionicons name="calendar-clear-outline" size={11} color={colors.mutedForeground} />
                    <Text style={styles.announcementDateText} numberOfLines={1}>{formatDate(alert.date_entered, { year: false })}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.announcementTitle} numberOfLines={2}>{plainText(alert.name)}</Text>
              {/* Preview: line breaks collapsed so "Dear All,\n\n…" doesn't waste preview lines. */}
              {firstImage(alert.description) ? <Image source={{ uri: firstImage(alert.description) }} style={styles.announcementImage} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
              {plainText(alert.description) ? <Text style={styles.announcementPreview} numberOfLines={2}>{plainText(alert.description).replace(/\s+/g, " ")}</Text> : null}
              <View style={styles.announcementFooter}>
                <View style={styles.readMorePill}>
                  <Text style={styles.readMore}>Read more</Text>
                  <Ionicons name="arrow-forward" size={13} color={colors.primary} />
                </View>
              </View>
            </Card>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

/** Compact section header; the action is a small pill with an arrow. */
function SectionHeader({ title, hint, action, onAction }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.sectionTitle} numberOfLines={2}>{title}</Text>
        {hint ? <Text style={type.small}>{hint}</Text> : null}
      </View>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8} style={({ pressed }) => [styles.actionPill, pressed && { opacity: 0.7 }]}>
          <Text style={styles.actionText} numberOfLines={1}>{action}</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Stat({ label, value, tone, icon }) {
  const palette = tones[tone];
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: palette.bg }]}>
        <Ionicons name={icon} size={18} color={palette.fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value ?? "—"}</Text>
        <Text style={styles.statLabel} numberOfLines={2}>{label}</Text>
      </View>
    </View>
  );
}

function Metric({ label, value, highlight }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel} numberOfLines={2}>{label}</Text>
      <Text style={[styles.metricValue, highlight && { color: colors.primary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{value}</Text>
    </View>
  );
}

function TimeChip({ label, value }) {
  return (
    <View style={styles.timeChip}>
      <Text style={styles.timeChipLabel}>{label}</Text>
      <Text style={[styles.timeChipValue, !value && { color: colors.mutedForeground }]} numberOfLines={1}>{value || "—"}</Text>
    </View>
  );
}

const LOGO = require("../../../assets/hrcrm-icon.png");

const capitalize = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

const styles = StyleSheet.create({
  section: { gap: 10 },
  appBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: -4 },
  brand: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1, minWidth: 0 },
  brandLogo: { flexShrink: 0, width: 34, height: 34 },
  brandText: { flexShrink: 1, fontSize: 22, lineHeight: 28, fontWeight: "600", letterSpacing: -0.3, color: colors.foreground },
  profileButton: { flexShrink: 0, width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft, borderWidth: 2, borderColor: colors.primary },
  profileInitial: { fontSize: 14, lineHeight: 18, fontWeight: "600", color: colors.primary },
  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, paddingVertical: 20, paddingHorizontal: 18, gap: 14, overflow: "hidden" },
  heroGlow: { position: "absolute", width: 200, height: 200, borderRadius: 100, right: -70, top: -100, backgroundColor: "rgba(212,250,60,0.16)" },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  initials: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  initialsText: { fontSize: 18, lineHeight: 23, fontWeight: "600", color: "#FFFFFF" },
  onlineDot: { position: "absolute", right: 0, bottom: 0, width: 13, height: 13, borderRadius: 7, backgroundColor: colors.success, borderWidth: 2, borderColor: colors.navy },
  greetingRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 },
  heroGreeting: { ...type.tiny, fontSize: 10, letterSpacing: 1, color: "rgba(255,255,255,0.6)", flexShrink: 1 },
  datePill: { flexShrink: 0, alignSelf: "flex-start", paddingVertical: 2, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.12)" },
  datePillText: { fontSize: 11, lineHeight: 15, fontWeight: "600", color: "#FFFFFF" },
  heroName: { fontSize: 22, lineHeight: 28, fontWeight: "600", letterSpacing: -0.4, color: "#FFFFFF" },
  heroSubtitle: { fontSize: 13, lineHeight: 18, color: "rgba(255,255,255,0.62)" },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: "600", color: colors.foreground, letterSpacing: -0.2 },
  actionPill: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 6, paddingLeft: 12, paddingRight: 8, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  actionText: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.primary },
  statGrid: { flexDirection: "row", flexWrap: "wrap", columnGap: 10, rowGap: 10 },
  stat: { flexGrow: 1, flexShrink: 1, flexBasis: "46%", minWidth: 140, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 12, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  statIcon: { flexShrink: 0, width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 22, lineHeight: 26, fontWeight: "600", color: colors.navy, fontVariant: ["tabular-nums"] },
  statLabel: { fontSize: 12, lineHeight: 16, color: colors.mutedForeground },
  metricBar: { flexDirection: "row", alignItems: "stretch", paddingVertical: 12, borderRadius: radius.lg, backgroundColor: "#EEF2FB", borderWidth: 1, borderColor: colors.border },
  metric: { flex: 1, minWidth: 0, alignItems: "center", gap: 3, paddingHorizontal: 6 },
  metricDivider: { width: 1, backgroundColor: "rgba(13,27,42,0.10)" },
  metricValue: { fontSize: 16, lineHeight: 21, fontWeight: "600", color: colors.navy },
  metricLabel: { fontSize: 10, lineHeight: 14, fontWeight: "600", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "center" },
  listCard: { paddingVertical: 4, paddingHorizontal: 14, gap: 0 },
  listItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  listItemBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  dayDot: { flexShrink: 0, width: 10, height: 10, borderRadius: 5, alignSelf: "flex-start", marginTop: 6 },
  dayTitleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 },
  dayBadge: { flexShrink: 0, maxWidth: "45%", alignSelf: "flex-start", paddingVertical: 2, paddingHorizontal: 8, borderRadius: radius.pill },
  dayBadgeText: { fontSize: 11, lineHeight: 15, fontWeight: "600" },
  timeChips: { flexDirection: "row", flexWrap: "wrap", columnGap: 6, rowGap: 6 },
  timeChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.sm, backgroundColor: colors.background },
  timeChipLabel: { fontSize: 11, lineHeight: 15, fontWeight: "600", color: colors.mutedForeground },
  timeChipValue: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: colors.foreground },
  hoursPill: { flexShrink: 0, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  hoursText: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.primary },
  announcement: { gap: 8, padding: 16 },
  announcementTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 2 },
  announcementIcon: { flexShrink: 0, width: 32, height: 32, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  announcementLabel: { ...type.tiny, fontSize: 10, letterSpacing: 0.8, color: colors.primary },
  announcementDate: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  announcementDateText: { fontSize: 11, lineHeight: 15, fontWeight: "600", color: colors.mutedForeground },
  announcementTitle: { fontSize: 16, lineHeight: 22, fontWeight: "600", color: colors.navy, letterSpacing: -0.2 },
  announcementPreview: { fontSize: 13, lineHeight: 19, color: colors.mutedForeground },
  announcementImage: { width: "100%", height: 150, borderRadius: radius.md, backgroundColor: colors.muted },
  announcementFooter: { flexDirection: "row", justifyContent: "flex-end", paddingTop: 10, marginTop: 2, borderTopWidth: 1, borderTopColor: colors.border },
  readMorePill: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 5, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  readMore: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: colors.primary },
});

export function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

