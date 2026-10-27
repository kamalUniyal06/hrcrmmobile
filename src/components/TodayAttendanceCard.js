import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, tones, type } from "../theme";
import { Button, Card, Skeleton } from "./ui";
import { useAttendanceLimits, useDailyActivity } from "../hooks/queries";
import { currentMinutesInIndia, formatClock, formatDuration, nowStampInIndia, parseActivityTime, todayInIndia } from "../utils/dates";

// The banner follows the time of day in India: morning until noon, afternoon until 5 PM, then evening.
const SCENES = {
  morning: require("../../assets/workday-morning.png"),
  afternoon: require("../../assets/workday-afternoon.png"),
  evening: require("../../assets/workday-evening.png"),
};
const sceneFor = (minutes) => (minutes < 12 * 60 ? SCENES.morning : minutes < 17 * 60 ? SCENES.afternoon : SCENES.evening);
const SHIFT_MINUTES = 9 * 60;
// The office network; a login from anywhere else shows as "Outside office" (web TodayPresentCard).
const OFFICE_IP = "122.176.54.204";

/**
 * Today's shift (web: TodayAttendanceCard + TodayPresentCard): a time-of-day banner, the shift
 * window, where and how the employee is checked in, the live shift timer, and the login / lunch /
 * logout times. Read-only: attendance is marked outside the app.
 */
export default function TodayAttendanceCard() {
  const { data: record, isPending, error, refetch } = useDailyActivity();
  const limits = useAttendanceLimits();
  const [, tick] = useState(0); // re-renders once a second so the timers advance

  useEffect(() => {
    const timer = setInterval(() => tick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const nowMinutes = currentMinutesInIndia();
  const scene = sceneFor(nowMinutes);
  const shift = limits.loginMinutes === null || limits.loginMinutes === undefined
    ? null
    : `${formatClock(limits.loginMinutes)} – ${formatClock(limits.loginMinutes + SHIFT_MINUTES)}`;

  const login = parseActivityTime(record?.login);
  const isPresentToday = login?.date === todayInIndia();
  const canLogin = limits.loginMinutes === null || nowMinutes >= limits.loginMinutes;
  const lunchIn = parseActivityTime(record?.lunch_in);
  const lunchOut = parseActivityTime(record?.lunch_out);
  const logout = parseActivityTime(record?.logout);
  const onBreak = Boolean(lunchIn) && !lunchOut;

  // Activity stamps are IST wall-clock values stored as UTC, so "now" uses the same convention.
  const nowStamp = nowStampInIndia();
  const worked = login ? Math.max(0, Math.floor(((logout ? logout.stamp : nowStamp) - login.stamp) / 1000)) : 0;
  const breakSeconds = lunchIn ? Math.max(0, Math.floor(((lunchOut ? lunchOut.stamp : nowStamp) - lunchIn.stamp) / 1000)) : 0;
  const lunchLimit = limits.lunchOutMinutes * 60;
  const breakOver = breakSeconds > lunchLimit;

  if (isPending) {
    return (
      <Card style={styles.card}>
        <View accessibilityRole="progressbar" accessibilityLabel="Checking today's attendance">
          {/* The picture shows straight away; only the details shimmer while they load. */}
          <Banner scene={scene} />
          <View style={styles.body}>
            <Skeleton height={12} width="55%" />
            <View style={styles.badges}>
              <Skeleton width={96} height={22} radius={radius.pill} />
              <Skeleton width={78} height={22} radius={radius.pill} />
            </View>
            <Skeleton height={10} width={70} />
            <Skeleton height={34} width={150} radius={8} />
            <Skeleton height={88} radius={radius.md} />
          </View>
        </View>
      </Card>
    );
  }

  if (error) {
    return (
      <Card style={styles.card}>
        <Banner scene={scene} />
        <View style={styles.body}>
          <ShiftLine shift={shift} />
          <Pill tone="closed" label="Couldn't load" />
          <Button title="Retry" variant="outline" small icon="refresh" onPress={() => refetch()} />
        </View>
      </Card>
    );
  }

  if (!isPresentToday) {
    return (
      <Card style={styles.card}>
        <Banner scene={scene} />
        <View style={styles.body}>
          <ShiftLine shift={shift} />
          <View style={styles.badges}>
            <Pill tone="closed" label="Not checked in" />
          </View>
          <View style={styles.note}>
            <Ionicons name={canLogin ? "finger-print-outline" : "time-outline"} size={15} color={colors.primary} style={styles.noShrink} />
            <Text style={styles.noteText}>
              {canLogin ? "You haven't clocked in yet today." : `Clock in opens at ${limits.actualLoginTime}.`}
            </Text>
          </View>
        </View>
      </Card>
    );
  }

  const late = limits.lateAfter !== undefined && login.minutes !== undefined && login.minutes > limits.lateAfter;
  const status = logout
    ? { label: "Completed", tone: "neutral" }
    : onBreak
      ? { label: breakOver ? "Lunch overdue" : "At lunch", tone: breakOver ? "closed" : "attention" }
      : late
        ? { label: "Late", tone: "attention" }
        : { label: "Present", tone: "success" };
  const inOffice = record?.ip_address === OFFICE_IP;
  const lunchValue = !lunchIn
    ? "Not taken yet"
    : onBreak
      ? `${lunchIn.time} · ${formatDuration(breakSeconds).slice(3)} so far`
      : `${lunchIn.time} – ${lunchOut.time}`;

  return (
    <Card style={styles.card}>
      <Banner scene={scene} />
      <View style={styles.body}>
        <ShiftLine shift={shift} />
        <View style={styles.badges}>
          <Pill tone={inOffice ? "success" : "closed"} icon={inOffice ? "business-outline" : "location-outline"} label={inOffice ? "Office" : "Outside office"} />
          <Pill tone={status.tone} dot label={status.label} />
        </View>

        <View style={{ gap: 2 }}>
          <Text style={styles.timerLabel}>{logout ? "Worked today" : "Shift time"}</Text>
          <Text style={styles.timer} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{formatDuration(worked)}</Text>
        </View>

        <View style={styles.details}>
          <DetailRow icon="log-in-outline" label="Login" value={login.time} />
          <DetailRow icon="cafe-outline" label="Lunch" value={lunchValue} warn={lunchIn && breakOver} last={!logout} />
          {logout ? <DetailRow icon="log-out-outline" label="Logout" value={logout.time} last /> : null}
        </View>
      </View>
    </Card>
  );
}

const BANNER_HEIGHT = 130;

/** Time-of-day picture with the "Daily Check In" chip on it; a soft green wash shows if the picture can't load. */
function Banner({ scene }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={styles.banner}>
      {failed ? null : (
        <Image
          source={scene}
          style={styles.bannerImage}
          resizeMode="cover"
          onError={(event) => {
            if (__DEV__) console.warn("[check-in banner] image failed to load", event?.nativeEvent?.error);
            setFailed(true);
          }}
          accessibilityIgnoresInvertColors
        />
      )}
      <View style={styles.chip}>
        <Ionicons name="calendar-number-outline" size={14} color="#FFFFFF" />
        <Text style={styles.chipText}>Daily Check In</Text>
      </View>
    </View>
  );
}

function ShiftLine({ shift }) {
  if (!shift) return null;
  return (
    <View style={styles.shiftRow}>
      <Ionicons name="time-outline" size={15} color={colors.mutedForeground} style={styles.noShrink} />
      <Text style={styles.shiftText}>{shift}</Text>
    </View>
  );
}

function Pill({ tone, label, icon, dot = false }) {
  const palette = tones[tone] || tones.neutral;
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg, borderColor: palette.fg + "33" }]}>
      {icon ? <Ionicons name={icon} size={12} color={palette.fg} /> : null}
      {dot ? <View style={[styles.pillDot, { backgroundColor: palette.fg }]} /> : null}
      <Text style={[styles.pillText, { color: palette.fg }, dot && styles.pillTextCaps]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function DetailRow({ icon, label, value, warn = false, last = false }) {
  return (
    <View style={[styles.detailRow, !last && styles.detailDivider]}>
      <Ionicons name={icon} size={16} color={colors.mutedForeground} style={styles.noShrink} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, warn && { color: colors.destructive }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Image-led card with a soft green outline, like the web Daily Check In panel.
  card: { padding: 0, gap: 0, overflow: "hidden", borderWidth: 1.5, borderColor: "#C9DDD0" },
  banner: { height: BANNER_HEIGHT, backgroundColor: colors.primarySoft },
  bannerImage: { width: "100%", height: "100%" },
  chip: { position: "absolute", top: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: "rgba(11,19,16,0.55)" },
  chipText: { fontSize: 12, lineHeight: 17, fontWeight: "600", color: "#FFFFFF" },
  body: { padding: 14, gap: 12 },
  shiftRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  shiftText: { fontSize: 13, lineHeight: 18, fontWeight: "500", color: colors.mutedForeground, fontVariant: ["tabular-nums"] },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: -4 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 3, paddingHorizontal: 9, borderRadius: radius.pill, borderWidth: 1, maxWidth: "100%" },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, lineHeight: 15, fontWeight: "600", flexShrink: 1 },
  pillTextCaps: { textTransform: "uppercase", letterSpacing: 0.4 },
  timerLabel: { fontSize: 13, lineHeight: 18, fontWeight: "500", color: colors.mutedForeground },
  timer: { fontSize: 32, lineHeight: 40, fontWeight: "600", color: colors.navy, fontVariant: ["tabular-nums"], letterSpacing: -0.5 },
  details: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, backgroundColor: colors.card },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  detailDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  detailLabel: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20, color: colors.mutedForeground },
  detailValue: { flexShrink: 1, fontSize: 15, lineHeight: 21, fontWeight: "600", color: colors.foreground, textAlign: "right", fontVariant: ["tabular-nums"] },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  noteText: { ...type.small, flex: 1 },
  noShrink: { flexShrink: 0 },
});
