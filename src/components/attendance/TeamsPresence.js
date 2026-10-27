// Read-only Microsoft Teams presence for the admin attendance screen.
// Web: employement/components/attendance/TeamsPresence.jsx (TeamsCell, TeamsSummary, TeamsActivityPanel).
// Display only: nothing here clocks anyone in or out.
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, tones, type } from "../../theme";
import { Card, Sheet, Skeleton, SkeletonText } from "../ui";
import { fetchTeamsDay, fetchTeamsTimeline, teamsPresenceKeys, teamsRetry } from "../../api/teamsPresence.api";
import { formatMinutes } from "../../utils/adminAttendance";
import { formatDate } from "../../utils/dates";
import {
  PRESENCE_COLORS,
  PRESENCE_LEGEND,
  istMinutes,
  onlineThatDay,
  presenceBucket,
  presenceStatus,
  teamsClock,
  teamsErrorText,
  timelineWindow,
} from "../../utils/teamsPresence";

const minutes = (value) => formatMinutes(Number(value) || 0);
const LIVE_POLL = 60000;

/** Today polls the live feed every minute (the collector's own cadence); other days read the daily report. */
export const useTeamsPresenceDay = (day, { live = false, enabled = true } = {}) =>
  useQuery({
    queryKey: teamsPresenceKeys.day(day, live),
    queryFn: () => fetchTeamsDay(day, live),
    enabled: Boolean(day) && enabled,
    refetchInterval: live ? LIVE_POLL : false,
    retry: teamsRetry,
  });

export const useTeamsTimeline = (employeeId, day, { live = false, enabled = true } = {}) =>
  useQuery({
    queryKey: teamsPresenceKeys.timeline(employeeId, day),
    queryFn: () => fetchTeamsTimeline({ employeeId, date: day }),
    enabled: Boolean(employeeId && day) && enabled,
    refetchInterval: live ? LIVE_POLL : false,
    retry: teamsRetry,
  });

function Dot({ bucket, size = 8 }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, flexShrink: 0, backgroundColor: PRESENCE_COLORS[bucket] || PRESENCE_COLORS.unknown }} />;
}

// Offline is drawn faint and collector gaps in the border colour, so neither reads as a status the employee chose.
const periodStyle = (bucket) =>
  bucket === "untracked"
    ? { backgroundColor: colors.border }
    : bucket === "offline"
      ? { backgroundColor: colors.mutedForeground, opacity: 0.22 }
      : { backgroundColor: PRESENCE_COLORS[bucket] || PRESENCE_COLORS.unknown };

/**
 * One attendance row's Teams presence as a compact line: live status today, online hours on past days.
 * `onPress` (optional) opens the day's Teams panel.
 */
export function TeamsChip({ record, live, state, onPress }) {
  let content;
  if (!record && state === "loading") {
    content = <Skeleton height={11} width="60%" />;
  } else if (!record) {
    content = <Text style={styles.chipMuted} numberOfLines={1}>{state === "error" ? "Teams: —" : "Not on Teams"}</Text>;
  } else {
    const since = teamsClock(record.status_since);
    const headline = live
      ? `${presenceStatus(record)}${since ? ` · since ${since}` : ""}`
      : record.first_online_at
        ? `${teamsClock(record.first_online_at)} – ${teamsClock(record.last_online_at)}`
        : "Not online";
    content = (
      <View style={styles.chipBody}>
        <View style={styles.chipLine}>
          {live ? <Dot bucket={presenceBucket(record.availability)} /> : <Ionicons name="people-outline" size={12} color={colors.mutedForeground} style={styles.noShrink} />}
          <Text style={styles.chipTitle} numberOfLines={1} ellipsizeMode="tail">{headline}</Text>
        </View>
        <Text style={styles.chipMuted} numberOfLines={1}>Active {minutes(record.active_minutes)} · Online {minutes(record.online_minutes)}</Text>
      </View>
    );
  }
  return (
    <Pressable onPress={onPress} disabled={!onPress} hitSlop={4} accessibilityLabel="Teams activity" style={({ pressed }) => [styles.chip, pressed && { opacity: 0.75 }]}>
      <Text style={styles.chipLabel}>Teams</Text>
      <View style={{ flex: 1, minWidth: 0 }}>{content}</View>
      {onPress && record ? <Ionicons name="chevron-forward" size={13} color={colors.mutedForeground} style={styles.noShrink} /> : null}
    </Pressable>
  );
}

/** Teams status card above the attendance list: who is on Teams now, data freshness and access. */
export function TeamsSummaryCard({ query, live }) {
  let body;
  if (query.isPending) {
    body = <SkeletonText lines={2} style={{ paddingVertical: 2 }} />;
  } else if (query.isError) {
    body = (
      <View style={styles.line}>
        <Ionicons name="information-circle-outline" size={16} color={colors.mutedForeground} style={styles.noShrink} />
        <Text style={[type.small, styles.grow]}>{teamsErrorText(query.error)}</Text>
        {query.error?.status !== 403 ? (
          <Pressable onPress={() => query.refetch()} hitSlop={8} style={styles.noShrink} accessibilityRole="button">
            <Text style={styles.link}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  } else {
    const { counts, collector, employees = [] } = query.data || {};
    body = !live ? (
      <Text style={type.small}>
        <Text style={styles.strong}>{onlineThatDay(employees)}</Text> employees were online on Teams this day.
      </Text>
    ) : (
      <View style={{ gap: 8 }}>
        <View style={styles.counts}>
          {PRESENCE_LEGEND.slice(0, 4).map(([bucket, label]) => (
            <View key={bucket} style={styles.count}>
              <Dot bucket={bucket} />
              <Text style={styles.strong}>{counts?.[bucket] ?? 0}</Text>
              <Text style={type.small} numberOfLines={1}>{label.toLowerCase()}</Text>
            </View>
          ))}
        </View>
        {collector && Number(collector.employees_matched) < Number(collector.employees_total) ? (
          <Text style={type.small}>{collector.employees_matched} of {collector.employees_total} employees linked to Teams</Text>
        ) : null}
        {collector?.stale ? (
          <View style={[styles.stale, { backgroundColor: tones.attention.bg }]} accessibilityRole="alert">
            <Ionicons name="warning-outline" size={13} color={tones.attention.fg} style={styles.noShrink} />
            <Text style={[styles.staleText, { color: tones.attention.fg }]}>
              Teams data delayed{collector.last_success_at ? ` · last update ${teamsClock(collector.last_success_at)}` : ""}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }
  return (
    <Card style={{ gap: 8, padding: 14 }}>
      <View style={styles.line}>
        <Ionicons name="people-circle-outline" size={18} color={colors.primary} style={styles.noShrink} />
        <Text style={[type.subheading, styles.grow]}>{live ? "Teams now" : "Teams activity"}</Text>
      </View>
      {body}
    </Card>
  );
}

function TimelineBar({ periods, date }) {
  const { start, end } = timelineWindow(periods, date);
  const span = end - start || 1;
  const step = span > 12 * 60 ? 180 : 120;
  const ticks = Array.from({ length: Math.floor(span / step) + 1 }, (_, index) => start + index * step);
  const pct = (value) => ((Math.min(Math.max(value, start), end) - start) / span) * 100;
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.ticks}>
        {ticks.map((tick, index) => (
          <Text
            key={tick}
            style={[styles.tick, { left: `${pct(tick)}%` }, index === 0 ? null : pct(tick) >= 99 ? { marginLeft: -36, textAlign: "right" } : { marginLeft: -18, textAlign: "center" }]}
          >
            {String(Math.floor(tick / 60) % 24).padStart(2, "0")}:00
          </Text>
        ))}
      </View>
      <View style={styles.bar} accessibilityLabel={`Teams status from ${teamsClock(periods[0].started_at)} to ${teamsClock(periods[periods.length - 1].ended_at)}`}>
        {periods.map((period, index) => {
          const bucket = period.bucket || presenceBucket(period.availability);
          const from = pct(istMinutes(period.started_at, date));
          const to = pct(istMinutes(period.ended_at, date));
          return <View key={index} style={[styles.period, { left: `${from}%`, width: `${Math.max(to - from, 0)}%` }, periodStyle(bucket)]} />;
        })}
      </View>
      <View style={styles.legend}>
        {PRESENCE_LEGEND.map(([bucket, label]) => (
          <View key={bucket} style={styles.count}>
            <View style={[styles.swatch, periodStyle(bucket)]} />
            <Text style={styles.legendText}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Teams totals and a status bar for one employee's day. */
export function TeamsActivityPanel({ employeeId, date, live }) {
  const query = useTeamsTimeline(employeeId, date, { live });
  const totals = query.data?.totals;
  const periods = query.data?.periods || [];
  return (
    <View style={styles.panel}>
      <Text style={type.subheading}>Microsoft Teams</Text>
      <Text style={type.small}>Presence for this day, updated every minute.</Text>
      {query.isPending ? (
        <View style={{ gap: 8 }} accessibilityRole="progressbar" accessibilityLabel="Loading Teams activity…">
          <View style={styles.metrics}>
            {[0, 1, 2, 3].map((index) => <Skeleton key={index} height={48} radius={radius.md} style={styles.metric} />)}
          </View>
          <Skeleton height={18} />
        </View>
      ) : query.isError ? (
        <Text style={type.small}>{query.error?.status === 403 ? teamsErrorText(query.error) : query.error?.message}</Text>
      ) : !totals ? (
        <Text style={type.small}>No Teams activity recorded for this day.</Text>
      ) : (
        <>
          <View style={styles.metrics}>
            {[
              ["Active", minutes(totals.active_minutes)],
              ["Online", minutes(totals.online_minutes)],
              ["Away", minutes(totals.away_minutes)],
              ["First – last online", totals.first_online_at ? `${teamsClock(totals.first_online_at)} – ${teamsClock(totals.last_online_at)}` : "—"],
            ].map(([label, value]) => (
              <View key={label} style={styles.metric}>
                <Text style={type.small} numberOfLines={1}>{label}</Text>
                <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{value}</Text>
              </View>
            ))}
          </View>
          {periods.length ? <TimelineBar periods={periods} date={date} /> : null}
        </>
      )}
    </View>
  );
}

/** Sheet with one employee's Teams day, opened from the row's Teams line. `target` = { employeeId, name, date } or null. */
export function TeamsActivitySheet({ target, today, onClose }) {
  return (
    <Sheet visible={Boolean(target)} onClose={onClose} title={target?.name || "Teams activity"}>
      {target ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8, gap: 10 }}>
          <Text style={type.small}>{formatDate(target.date, { weekday: true })}</Text>
          <TeamsActivityPanel employeeId={target.employeeId} date={target.date} live={target.date === today} />
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  noShrink: { flexShrink: 0 },
  line: { flexDirection: "row", alignItems: "center", gap: 8 },
  link: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.primary },
  strong: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.foreground, fontVariant: ["tabular-nums"] },
  counts: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 6 },
  count: { flexDirection: "row", alignItems: "center", gap: 5 },
  stale: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", maxWidth: "100%", paddingVertical: 3, paddingHorizontal: 10, borderRadius: radius.pill },
  staleText: { fontSize: 12, lineHeight: 17, fontWeight: "600", flexShrink: 1 },
  chip: { flexDirection: "row", alignItems: "center", gap: 10 },
  chipLabel: { minWidth: 42, flexShrink: 0, fontSize: 11, lineHeight: 15, fontWeight: "600", color: colors.mutedForeground },
  chipBody: { gap: 1 },
  chipLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  chipTitle: { flexShrink: 1, fontSize: 12, lineHeight: 17, fontWeight: "600", color: colors.foreground },
  chipMuted: { fontSize: 11, lineHeight: 15, color: colors.mutedForeground },
  panel: { gap: 8, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: { flexGrow: 1, flexBasis: "46%", minWidth: 0, padding: 10, borderRadius: radius.md, backgroundColor: colors.muted, gap: 2 },
  metricValue: { fontSize: 15, lineHeight: 21, fontWeight: "600", color: colors.foreground, fontVariant: ["tabular-nums"] },
  ticks: { height: 14, position: "relative" },
  tick: { position: "absolute", width: 36, fontSize: 11, lineHeight: 15, color: colors.mutedForeground, fontVariant: ["tabular-nums"] },
  bar: { height: 18, borderRadius: 6, overflow: "hidden", backgroundColor: colors.muted, position: "relative" },
  period: { position: "absolute", top: 0, bottom: 0 },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 4, marginTop: 4 },
  swatch: { width: 10, height: 10, borderRadius: 3, borderWidth: 1, borderColor: colors.border },
  legendText: { fontSize: 11, lineHeight: 15, color: colors.mutedForeground },
});
