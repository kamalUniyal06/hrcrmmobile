// "Upcoming": a day strip with that day's events (holidays, birthdays, work anniversaries, approved
// leave) and the live company announcements. Web: components/home/ScheduleCard.jsx + AnnouncementDialog.
import { useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, type } from "../../theme";
import { Card, SegmentedControl, SkeletonRows } from "../ui";
import { calendarDateKey, isWeekend, monthLabel, parseActivityTime, todayKey } from "../../utils/dates";
import { firstImage, plainText } from "../../utils/records";
import { addDaysToKey, announcementPreview, scheduleEventsForDay, shortDate, upcomingScheduleEvents, weekdayOf } from "../../utils/homeDashboard";
import { CardHead, EmptyLine, IconSquare, InlineError, SectionLabel } from "./HomeCardParts";

const EVENT_META = {
  holiday: { icon: "sparkles-outline", label: "Holiday", tone: "attention" },
  birthday: { icon: "gift-outline", label: "Birthday", tone: "closed" },
  anniversary: { icon: "ribbon-outline", label: "Anniversary", tone: "success" },
  leave: { icon: "sunny-outline", label: "Leave", tone: "info" },
};
const STRIP = 5;
const postedAt = (alert) => parseActivityTime(alert.date_entered)?.stamp ?? 0;
const postedDay = (alert) => parseActivityTime(alert.date_entered)?.date || calendarDateKey(alert.date_entered);

/**
 * `sources` = { employees, holidays, leaves, leaveLabel } for scheduleEventsForDay; `announcements`
 * are the live system alerts. `announcementsError`/`onRetryAnnouncements` cover the alerts query.
 */
export default function ScheduleCard({ sources, loading, error, onRetry, announcements = [], announcementsLoading, announcementsError, onRetryAnnouncements, navigation, admin = true }) {
  const [today] = useState(todayKey);
  const [selected, setSelected] = useState(today);
  const [tab, setTab] = useState("events");
  const days = Array.from({ length: STRIP }, (_, index) => addDaysToKey(selected, index - Math.floor(STRIP / 2)));

  const eventsFor = useMemo(() => {
    const cache = new Map();
    return (key) => {
      if (!cache.has(key)) cache.set(key, scheduleEventsForDay(key, sources));
      return cache.get(key);
    };
  }, [sources]);
  const dayEvents = eventsFor(selected);
  const upcoming = useMemo(() => (dayEvents.length ? [] : upcomingScheduleEvents(selected, eventsFor)), [dayEvents.length, eventsFor, selected]);
  const sortedAnnouncements = useMemo(() => [...announcements].sort((a, b) => postedAt(b) - postedAt(a)), [announcements]);

  // Employees see the same card, but leave requests and employee profiles open only for admins.
  const openEvent = (event) => {
    if (!admin) return;
    if (event.leaveId) navigation.navigate("LeaveDetail", { id: event.leaveId });
    else if (event.employeeId) navigation.navigate("EmployeeDetail", { id: event.employeeId });
  };
  const [year, month] = selected.split("-").map(Number);

  return (
    <Card style={{ gap: 12 }}>
      <CardHead icon="calendar-outline" tone="info" title="Upcoming" action={selected !== today ? "Today" : null} onAction={() => setSelected(today)} />

      <View style={styles.monthBar}>
        <Text style={[type.subheading, { flex: 1, minWidth: 0 }]}>{monthLabel(year, month - 1)}</Text>
        <Pressable accessibilityLabel="Previous days" hitSlop={6} onPress={() => setSelected(addDaysToKey(selected, -STRIP))} style={styles.navButton}>
          <Ionicons name="chevron-back" size={16} color={colors.foreground} />
        </Pressable>
        <Pressable accessibilityLabel="Next days" hitSlop={6} onPress={() => setSelected(addDaysToKey(selected, STRIP))} style={styles.navButton}>
          <Ionicons name="chevron-forward" size={16} color={colors.foreground} />
        </Pressable>
      </View>

      <View style={styles.strip}>
        {days.map((key) => {
          const active = key === selected;
          const hasEvents = !loading && eventsFor(key).length > 0;
          const off = !active && isWeekend(key);
          return (
            <Pressable key={key} onPress={() => setSelected(key)} accessibilityState={{ selected: active }} style={[styles.day, off && styles.dayOff, active && styles.dayActive]}>
              <Text style={[styles.dayNumber, active && { color: colors.primaryForeground }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{key.slice(8, 10)}</Text>
              <Text style={[styles.dayName, off && styles.dayNameOff, active && { color: "rgba(255,255,255,0.8)" }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{weekdayOf(key)}</Text>
              <View style={[styles.dayDot, hasEvents && { backgroundColor: active ? colors.lime : colors.primary }]} />
            </Pressable>
          );
        })}
      </View>

      <SegmentedControl
        options={[
          { value: "events", label: "Events" },
          { value: "announcements", label: "Announcements", count: announcements.length || undefined },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "events" ? (
        error ? (
          <InlineError message="Holidays or leave could not be loaded." onRetry={onRetry} />
        ) : loading ? (
          <SkeletonRows avatar={false} label="Loading the schedule" />
        ) : dayEvents.length ? (
          dayEvents.map((event) => <EventRow key={event.id} event={event} onPress={admin ? openEvent : null} />)
        ) : (
          <>
            <EmptyLine>Nothing scheduled for {shortDate(selected)}.</EmptyLine>
            {upcoming.length ? (
              <>
                <SectionLabel>Coming up</SectionLabel>
                {upcoming.map(({ event, key }) => <EventRow key={`${key}:${event.id}`} event={event} date={key} onPress={admin ? openEvent : null} />)}
              </>
            ) : null}
          </>
        )
      ) : announcementsError ? (
        <InlineError message="Announcements could not be loaded." onRetry={onRetryAnnouncements} />
      ) : announcementsLoading ? (
        <SkeletonRows avatar={false} label="Loading announcements" />
      ) : sortedAnnouncements.length ? (
        sortedAnnouncements.map((alert) => {
          const preview = announcementPreview(alert.description);
          const image = firstImage(alert.description);
          const day = postedDay(alert);
          return (
            <Pressable key={alert.id} onPress={() => navigation.navigate("AnnouncementDetail", { alert, manage: admin })} style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.muted }]}>
              {image ? (
                <Image source={{ uri: image }} style={styles.thumb} resizeMode="cover" accessibilityIgnoresInvertColors />
              ) : (
                <Ionicons name="megaphone-outline" size={16} color={colors.primary} style={{ marginTop: 2, flexShrink: 0 }} />
              )}
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={type.subheading} numberOfLines={2}>{plainText(alert.name) || "Announcement"}</Text>
                {preview ? <Text style={styles.sub} numberOfLines={2}>{preview}</Text> : null}
                <Text style={styles.readMore}>Read announcement</Text>
              </View>
              {day ? <Text style={[styles.sub, styles.when]}>{shortDate(day)}</Text> : null}
            </Pressable>
          );
        })
      ) : (
        <EmptyLine>No announcements right now.</EmptyLine>
      )}
    </Card>
  );
}

function EventRow({ event, date, onPress }) {
  const meta = EVENT_META[event.type];
  const tappable = Boolean(onPress && (event.leaveId || event.employeeId));
  return (
    <Pressable disabled={!tappable} onPress={() => onPress(event)} style={({ pressed }) => [styles.item, { alignItems: "center" }, pressed && { backgroundColor: colors.muted }]}>
      <IconSquare icon={meta.icon} tone={meta.tone} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={type.tiny}>{meta.label}</Text>
        <Text style={type.subheading} numberOfLines={2}>{plainText(event.title)}</Text>
        {event.type !== "birthday" && event.type !== "holiday" ? <Text style={styles.detail}>{plainText(event.detail)}</Text> : null}
      </View>
      {date ? <Text style={[styles.sub, styles.when]}>{shortDate(date)}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  monthBar: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.muted },
  navButton: { flexShrink: 0, width: 30, height: 30, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  strip: { flexDirection: "row", gap: 6 },
  day: { flex: 1, minWidth: 0, alignItems: "center", paddingHorizontal: 2, paddingTop: 8, paddingBottom: 6, gap: 1, borderRadius: radius.md },
  dayActive: { backgroundColor: colors.primary },
  dayOff: { backgroundColor: colors.muted },
  dayNameOff: { color: colors.destructive, opacity: 0.7 },
  dayNumber: { fontSize: 17, lineHeight: 24, fontWeight: "600", color: colors.foreground, fontVariant: ["tabular-nums"] },
  dayName: { fontSize: 11, lineHeight: 15, color: colors.mutedForeground },
  dayDot: { width: 5, height: 5, borderRadius: 3, marginTop: 2, backgroundColor: "transparent" },
  item: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  sub: { fontSize: 12, lineHeight: 17, color: colors.mutedForeground },
  when: { flexShrink: 0, maxWidth: "30%", textAlign: "right" },
  detail: { fontSize: 12, lineHeight: 17, fontWeight: "600", color: colors.primary },
  readMore: { fontSize: 12, lineHeight: 17, fontWeight: "600", color: colors.primary, marginTop: 2 },
  thumb: { flexShrink: 0, width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.muted },
});
