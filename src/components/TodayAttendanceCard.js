import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, tones, type } from "../theme";
import { Button, Card, Row } from "./ui";
import { useAttendanceLimits, useDailyActivity } from "../hooks/queries";
import { currentMinutesInIndia, formatDate, formatDuration, nowStampInIndia, parseActivityTime, todayInIndia } from "../utils/dates";

/**
 * Today's shift at a glance: clock-in, lunch and clock-out times with a live timer
 * (web: TodayAttendanceCard + TodayPresentCard). Read-only: attendance is marked
 * outside the app.
 */
export default function TodayAttendanceCard() {
  const { data: record, isPending, error, refetch } = useDailyActivity();
  const limits = useAttendanceLimits();
  const [, tick] = useState(0); // re-renders once a second so the timers advance

  useEffect(() => {
    const timer = setInterval(() => tick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const login = parseActivityTime(record?.login);
  const isPresentToday = login?.date === todayInIndia();
  const canLogin = limits.loginMinutes === null || currentMinutesInIndia() >= limits.loginMinutes;
  const lunchIn = parseActivityTime(record?.lunch_in);
  const lunchOut = parseActivityTime(record?.lunch_out);
  const logout = parseActivityTime(record?.logout);
  const onBreak = Boolean(lunchIn) && !lunchOut;

  // Activity stamps are IST wall-clock values stored as UTC, so "now" uses the same convention.
  const nowStamp = nowStampInIndia();
  const worked = login ? Math.max(0, Math.floor(((logout ? logout.stamp : nowStamp) - login.stamp) / 1000)) : 0;
  const breakSeconds = lunchIn ? Math.max(0, Math.floor(((lunchOut ? lunchOut.stamp : nowStamp) - lunchIn.stamp) / 1000)) : 0;
  const breakOver = onBreak && breakSeconds > limits.lunchOutMinutes * 60;

  // "Fri, 23 Oct · Shift from 9:30 AM" sits under the title, so the card needs no separate schedule row.
  const subtitle = `${formatDate(todayInIndia(), { weekday: true, year: false })} · Shift from ${limits.actualLoginTime}`;

  if (isPending) {
    return (
      <Card style={styles.card}>
        <TitleRow tone="neutral" label="Loading" subtitle="Checking today's attendance…" />
      </Card>
    );
  }
  if (error) {
    return (
      <Card style={styles.card}>
        <TitleRow tone="closed" label="Error" subtitle="Couldn't load today's attendance." />
        <Button title="Retry" variant="outline" small icon="refresh" onPress={() => refetch()} />
      </Card>
    );
  }
  if (!isPresentToday) {
    return (
      <Card style={styles.card}>
        <TitleRow tone="closed" label="Not in yet" subtitle={subtitle} />
        <View style={styles.note}>
          <Ionicons name={canLogin ? "finger-print-outline" : "time-outline"} size={15} color={colors.primary} style={{ flexShrink: 0 }} />
          <Text style={styles.noteText}>
            {canLogin ? "Clock in to start tracking your shift, lunch and working hours." : `Clock in opens at ${limits.actualLoginTime}.`}
          </Text>
        </View>
      </Card>
    );
  }

  const late = limits.lateAfter !== undefined && login.minutes !== undefined && login.minutes > limits.lateAfter;
  const status = logout
    ? { label: "Clocked out", tone: "neutral" }
    : onBreak
      ? { label: "On lunch", tone: "attention" }
      : late
        ? { label: "Checked in late", tone: "attention" }
        : { label: "Checked in", tone: "success" };

  return (
    <Card style={styles.card}>
      <TitleRow tone={status.tone} label={status.label} subtitle={subtitle} />

      <View style={styles.timerRow}>
        <Text style={styles.sessionLabel}>{logout ? "Worked today" : "Working session"}</Text>
        <Text style={styles.timer} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{formatDuration(worked)}</Text>
      </View>

      {/* One strip of four times instead of a 2×2 grid keeps the card short. */}
      <View style={styles.strip}>
        <Slot icon="log-in" tone="success" label="In" value={login.time} />
        <Slot icon="restaurant" tone="info" label="Lunch" value={lunchIn?.time} />
        <Slot
          icon="cafe"
          tone="info"
          label="Back"
          value={lunchOut?.time}
          active={onBreak}
          highlight={breakOver ? `>${limits.lunchOutMinutes}m` : onBreak ? formatDuration(breakSeconds).slice(3) : null}
          warn={breakOver}
        />
        <Slot icon="log-out" tone="neutral" label="Out" value={logout?.time} />
      </View>

      {logout ? (
        <Row gap={6}>
          <Ionicons name="checkmark-circle" size={15} color={colors.success} style={{ flexShrink: 0 }} />
          <Text style={[type.small, { flex: 1 }]}>Your shift is complete. See you tomorrow.</Text>
        </Row>
      ) : null}
    </Card>
  );
}

/** Web "Daily Check In" header: green icon tile, title with the date and shift under it, and a short status pill. */
function TitleRow({ tone, label, subtitle }) {
  const palette = tones[tone] || tones.neutral;
  return (
    <View style={styles.titleRow}>
      <View style={styles.titleIcon}>
        <Ionicons name="calendar-number-outline" size={17} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title}>Daily check-in</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.statusPill, { backgroundColor: palette.bg }]}>
        <View style={[styles.statusDot, { backgroundColor: palette.fg }]} />
        <Text style={[styles.statusText, { color: palette.fg }]} numberOfLines={2}>{label}</Text>
      </View>
    </View>
  );
}

/** One time in the strip: icon, short label and time; greyed out until it has a time. */
function Slot({ icon, tone, label, value, active, highlight, warn }) {
  const palette = tones[tone] || tones.neutral;
  const done = Boolean(value);
  return (
    <View style={[styles.slot, { backgroundColor: done || active ? palette.bg : colors.card }, active && styles.slotActive]}>
      <View style={styles.slotHead}>
        <Ionicons name={done || active ? icon : `${icon}-outline`} size={12} color={done || active ? palette.fg : colors.mutedForeground} />
        <Text style={styles.slotLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
      </View>
      <Text style={[styles.slotValue, !done && { color: colors.mutedForeground }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {value || "—"}
      </Text>
      {highlight ? <Text style={[styles.highlight, warn && { color: colors.destructive }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{highlight}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Light lime card with a green border, like the web Daily Check In panel; kept compact for phones.
  card: { gap: 10, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: "#F7FBEA", borderColor: "#A9D3BD", borderWidth: 1.5 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  titleIcon: { flexShrink: 0, width: 34, height: 34, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  title: { fontSize: 15, lineHeight: 20, fontWeight: "600", color: colors.foreground },
  subtitle: { fontSize: 12, lineHeight: 16, fontWeight: "500", color: colors.primary },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 0, maxWidth: "40%", paddingVertical: 4, paddingHorizontal: 9, borderRadius: radius.pill },
  statusDot: { flexShrink: 0, width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, lineHeight: 15, fontWeight: "600", flexShrink: 1 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.sm, backgroundColor: "rgba(255,255,255,0.7)" },
  noteText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.mutedForeground },
  timerRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 10, rowGap: 2 },
  sessionLabel: { ...type.tiny, flexShrink: 1, letterSpacing: 0.8 },
  timer: { flexShrink: 0, fontSize: 26, lineHeight: 32, fontWeight: "600", color: colors.navy, fontVariant: ["tabular-nums"], letterSpacing: -0.5 },
  strip: { flexDirection: "row", gap: 6 },
  slot: { flex: 1, minWidth: 0, gap: 2, paddingVertical: 7, paddingHorizontal: 7, borderRadius: radius.sm, borderWidth: 1, borderColor: "transparent" },
  slotActive: { borderColor: colors.info },
  slotHead: { flexDirection: "row", alignItems: "center", gap: 4 },
  slotLabel: { flexShrink: 1, fontSize: 10, lineHeight: 13, fontWeight: "600", color: colors.mutedForeground },
  slotValue: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: colors.foreground, fontVariant: ["tabular-nums"] },
  highlight: { fontSize: 10, lineHeight: 13, fontWeight: "600", color: colors.attention },
});
