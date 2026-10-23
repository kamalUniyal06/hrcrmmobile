import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, tones, type } from "../theme";
import { Button, Card, Row } from "./ui";
import { useAttendanceLimits, useDailyActivity } from "../hooks/queries";
import { currentMinutesInIndia, formatDuration, nowStampInIndia, parseActivityTime, todayInIndia } from "../utils/dates";

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

  const shift = `Shift from ${limits.actualLoginTime}`;

  if (isPending) {
    return (
      <Card style={styles.card}>
        <StatusRow tone="neutral" label="Loading" />
        <Text style={type.small}>Checking today's attendance…</Text>
      </Card>
    );
  }
  if (error) {
    return (
      <Card style={styles.card}>
        <StatusRow tone="closed" label="Error" />
        <Text style={type.small}>Couldn't load today's attendance.</Text>
        <Button title="Retry" variant="outline" small icon="refresh" onPress={() => refetch()} />
      </Card>
    );
  }
  if (!isPresentToday) {
    return (
      <Card style={styles.card}>
        <StatusRow tone="closed" label="Not clocked in" />
        <ScheduleHeader shift={shift} />
        <View style={styles.idle}>
          <View style={styles.idleIcon}>
            <Ionicons name="finger-print-outline" size={22} color={colors.mutedForeground} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={type.small}>Clock in to start tracking your shift, lunch and working hours.</Text>
            {!canLogin ? (
              <Row gap={4}>
                <Ionicons name="time-outline" size={13} color={colors.mutedForeground} />
                <Text style={[type.small, { fontSize: 12 }]}>Clock in opens at {limits.actualLoginTime}</Text>
              </Row>
            ) : null}
          </View>
        </View>
      </Card>
    );
  }

  const late = limits.lateAfter !== undefined && login.minutes !== undefined && login.minutes > limits.lateAfter;
  const status = logout
    ? { label: "Clocked out", tone: "neutral" }
    : onBreak
      ? { label: "On lunch", tone: "attention" }
      : { label: `Checked in · ${late ? "Late" : "On time"}`, tone: late ? "attention" : "success" };

  return (
    <Card style={styles.card}>
      <StatusRow tone={status.tone} label={status.label} time={login.time} />

      <View>
        <Text style={styles.sessionLabel}>{logout ? "Worked today" : "Working session"}</Text>
        <Text style={styles.timer}>{formatDuration(worked)}</Text>
      </View>

      <ScheduleHeader shift={shift} />
      <View style={styles.grid}>
        <Slot icon="log-in" tone="success" label="Login / In" value={login.time} />
        <Slot icon="restaurant" tone="info" label="Lunch start" value={lunchIn?.time} />
        <Slot
          icon="cafe"
          tone="info"
          label="Lunch end"
          value={lunchOut?.time}
          active={onBreak}
          highlight={breakOver ? `over ${limits.lunchOutMinutes} min` : onBreak ? formatDuration(breakSeconds) : null}
          warn={breakOver}
        />
        <Slot icon="log-out" tone="neutral" label="Logout / Out" value={logout?.time} />
      </View>

      {logout ? (
        <Row gap={6}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={type.small}>Your shift is complete. See you tomorrow.</Text>
        </Row>
      ) : null}
    </Card>
  );
}

/** Coloured dot + uppercase status pill, with the punch time as a pill on the right. */
function StatusRow({ tone, label, time }) {
  const palette = tones[tone] || tones.neutral;
  return (
    <Row style={{ justifyContent: "space-between" }}>
      <View style={[styles.statusPill, { backgroundColor: palette.bg }]}>
        <View style={[styles.statusDot, { backgroundColor: palette.fg }]} />
        <Text style={[styles.statusText, { color: palette.fg }]} numberOfLines={1}>{label}</Text>
      </View>
      {time ? (
        <View style={styles.timePill}>
          <Ionicons name="time-outline" size={13} color={colors.foreground} />
          <Text style={styles.timePillText}>{time}</Text>
        </View>
      ) : null}
    </Row>
  );
}

function ScheduleHeader({ shift }) {
  return (
    <Row style={{ justifyContent: "space-between" }}>
      <Text style={styles.scheduleLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Daily schedule</Text>
      <View style={styles.shiftTag}>
        <Text style={styles.shiftTagText} numberOfLines={1}>{shift}</Text>
      </View>
    </Row>
  );
}

/** One schedule slot: a soft tinted tile with its icon; greyed out until it has a time. */
function Slot({ icon, tone, label, value, active, highlight, warn }) {
  const palette = tones[tone] || tones.neutral;
  const done = Boolean(value);
  return (
    <View style={[styles.slot, { backgroundColor: done || active ? palette.bg : colors.background }, active && styles.slotActive]}>
      <View style={styles.slotIcon}>
        <Ionicons name={done || active ? icon : `${icon}-outline`} size={15} color={done || active ? palette.fg : colors.mutedForeground} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.slotLabel} numberOfLines={1}>{label}</Text>
        <Text style={[styles.slotValue, !done && { color: colors.mutedForeground }]} numberOfLines={1}>{value || "—"}</Text>
        {highlight ? <Text style={[styles.highlight, warn && { color: colors.destructive }]} numberOfLines={1}>{highlight}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  idle: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: colors.background },
  idleIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.muted },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, lineHeight: 15, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, flexShrink: 1 },
  timePill: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  timePillText: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: colors.foreground, fontVariant: ["tabular-nums"] },
  sessionLabel: { ...type.tiny, letterSpacing: 1 },
  timer: { fontSize: 40, lineHeight: 46, fontWeight: "600", color: colors.navy, fontVariant: ["tabular-nums"], letterSpacing: -1 },
  scheduleLabel: { ...type.tiny, flex: 1, color: colors.foreground, letterSpacing: 0.3 },
  shiftTag: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.sm, backgroundColor: colors.primarySoft },
  shiftTagText: { fontSize: 11, lineHeight: 15, fontWeight: "600", color: colors.primary },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  slot: { width: "48.5%", flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: radius.md },
  slotActive: { borderWidth: 1, borderColor: colors.info },
  slotIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.card },
  slotLabel: { fontSize: 11, lineHeight: 15, fontWeight: "600", color: colors.mutedForeground },
  slotValue: { fontSize: 14, lineHeight: 19, fontWeight: "600", color: colors.foreground, fontVariant: ["tabular-nums"] },
  highlight: { fontSize: 11, lineHeight: 15, fontWeight: "600", color: colors.attention },
});
