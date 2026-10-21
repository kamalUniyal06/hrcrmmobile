import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, type } from "../theme";
import { Button, Card, Chip, Row } from "./ui";
import { useAttendanceLimits, useDailyActivity, useMarkActivity, usePendingAlerts } from "../hooks/queries";
import { currentMinutesInIndia, formatDuration, nowStampInIndia, parseActivityTime, todayInIndia } from "../utils/dates";

/**
 * Clock in → lunch → clock out for today (web: TodayAttendanceCard + TodayPresentCard).
 * `onAlertsRequired(alerts)` is called when pending system alerts block the clock-out.
 */
export default function TodayAttendanceCard({ onAlertsRequired }) {
  const { data: record, isPending, error, refetch } = useDailyActivity();
  const limits = useAttendanceLimits();
  const mark = useMarkActivity();
  const pendingAlerts = usePendingAlerts();
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
  const breakDone = Boolean(lunchIn && lunchOut);

  // Activity stamps are IST wall-clock values stored as UTC, so "now" uses the same convention.
  const nowStamp = nowStampInIndia();
  const worked = login ? Math.max(0, Math.floor(((logout ? logout.stamp : nowStamp) - login.stamp) / 1000)) : 0;
  const breakSeconds = lunchIn ? Math.max(0, Math.floor(((lunchOut ? lunchOut.stamp : nowStamp) - lunchIn.stamp) / 1000)) : 0;
  const breakOver = onBreak && breakSeconds > limits.lunchOutMinutes * 60;

  const act = (action) => mark.mutate(action);

  const clockOut = async () => {
    let pending = pendingAlerts.data;
    if (pendingAlerts.isStale || !pending) {
      try {
        pending = (await pendingAlerts.refetch()).data || [];
      } catch {
        Alert.alert("Could not check required alerts", "Please try clocking out again.");
        return;
      }
    }
    if (pending.length) {
      onAlertsRequired?.(pending);
      return;
    }
    Alert.alert("Clock out?", "This ends your shift for today.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clock out", style: "destructive", onPress: () => act("logout") },
    ]);
  };

  const shift = `Shift from ${limits.actualLoginTime}`;

  if (isPending) {
    return (
      <Card>
        <Header shift={shift} status={<Chip label="Loading" tone="neutral" />} />
        <Text style={type.small}>Checking today's attendance…</Text>
      </Card>
    );
  }
  if (error) {
    return (
      <Card>
        <Header shift={shift} status={<Chip label="Error" tone="closed" />} />
        <Text style={type.small}>Couldn't load today's attendance.</Text>
        <Button title="Retry" variant="outline" small icon="refresh" onPress={() => refetch()} />
      </Card>
    );
  }
  if (!isPresentToday) {
    return (
      <Card>
        <Header shift={shift} status={<Chip label="Not clocked in" tone="closed" />} />
        <Text style={type.small}>Clock in to start tracking your shift, lunch and working hours.</Text>
        {canLogin ? (
          <Button title="Clock in" icon="log-in-outline" full loading={mark.isPending} onPress={() => act("login")} />
        ) : (
          <View style={styles.locked}>
            <Ionicons name="time-outline" size={16} color={colors.mutedForeground} />
            <Text style={type.small}>Clock in opens at {limits.actualLoginTime}</Text>
          </View>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <Header shift={shift} status={<Chip label={logout ? "Clocked out" : onBreak ? "On lunch" : "Working"} tone={logout ? "neutral" : onBreak ? "attention" : "success"} />} />
      <Row style={{ justifyContent: "space-between" }}>
        <View>
          <Text style={type.tiny}>{logout ? "Worked today" : "On the clock"}</Text>
          <Text style={styles.timer}>{formatDuration(worked)}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={type.tiny}>Clocked in</Text>
          <Text style={type.subheading}>{login.time}</Text>
        </View>
      </Row>
      <View style={styles.steps}>
        <Step label="Lunch start" value={lunchIn?.time} />
        <Step label="Lunch end" value={lunchOut?.time} highlight={breakOver ? `over ${limits.lunchOutMinutes} min` : onBreak ? formatDuration(breakSeconds) : null} />
        <Step label="Clock out" value={logout?.time} />
      </View>
      {logout ? (
        <Text style={type.small}>Your shift is complete. See you tomorrow.</Text>
      ) : (
        <Row style={{ flexWrap: "wrap" }}>
          {!breakDone && !onBreak ? (
            <Button title="Start lunch" variant="secondary" icon="cafe-outline" small loading={mark.isPending && mark.variables === "lunch_in"} onPress={() => act("lunch_in")} />
          ) : null}
          {onBreak ? (
            <Button title="Back from lunch" variant={breakOver ? "lime" : "secondary"} icon="play-outline" small loading={mark.isPending && mark.variables === "lunch_out"} onPress={() => act("lunch_out")} />
          ) : null}
          {!onBreak ? (
            <Button title="Clock out" variant="dark" icon="log-out-outline" small loading={mark.isPending && mark.variables === "logout"} onPress={clockOut} />
          ) : null}
        </Row>
      )}
    </Card>
  );
}

function Header({ shift, status }) {
  return (
    <Row style={{ justifyContent: "space-between" }}>
      <View>
        <Text style={type.heading}>Today</Text>
        <Text style={type.small}>{shift}</Text>
      </View>
      {status}
    </Row>
  );
}

function Step({ label, value, highlight }) {
  return (
    <View style={styles.step}>
      <Text style={[type.tiny, { fontSize: 10 }]} numberOfLines={1}>{label}</Text>
      <Text style={[type.body, { fontWeight: "600" }]}>{value || "—"}</Text>
      {highlight ? <Text style={[type.small, { fontSize: 11, color: colors.attention }]}>{highlight}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  timer: { fontSize: 30, fontWeight: "600", color: colors.foreground, fontVariant: ["tabular-nums"] },
  steps: { flexDirection: "row", gap: 8 },
  step: { flex: 1, backgroundColor: colors.background, borderRadius: radius.md, padding: 10, gap: 2 },
  locked: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 12, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border },
});
