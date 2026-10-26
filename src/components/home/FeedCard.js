// Tasks & activity: a switch between upcoming tasks (sample data until the task module exists)
// and the activity log — today's check-ins, leave updates and announcements, newest first.
// Web: components/home/TasksFeedCard.jsx (items from homeDashboardUtils.buildFeed).
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, tones } from "../../theme";
import { Avatar, Card, Chip, SegmentedControl } from "../ui";
import { feedDayLabel } from "../../utils/homeDashboard";
import { CardHead, EmptyLine, InlineError, homeStyles } from "./HomeCardParts";

const FEED_META = {
  checkin: { icon: "log-in-outline", tone: "success" },
  lunch: { icon: "cafe-outline", tone: "attention" },
  checkout: { icon: "log-out-outline", tone: "progress" },
  leave: { icon: "sunny-outline", tone: "info" },
  leaveApproved: { icon: "checkmark", tone: "success" },
  leaveRejected: { icon: "close", tone: "closed" },
  announcement: { icon: "megaphone-outline", tone: "progress" },
};
// The activity log opens with this many items; the rest are one tap away.
const PREVIEW = 6;

// Same sample rows as the web card: there is no task module yet, so the tab is badged "Sample data".
const SAMPLE_TASKS = [
  { id: 1, owner: "Riya Sharma", email: "riya.sharma@outrightcrm.com", task: "Add components to design system update", priority: "Medium", date: "Oct 16, 2026", status: "To Do" },
  { id: 2, owner: "Aman Verma", email: "aman.verma@outrightcrm.com", task: "HR management dashboard — new add flow", priority: "High", date: "Oct 17, 2026", status: "In Progress" },
  { id: 3, owner: "Neha Gupta", email: "neha.gupta@outrightcrm.com", task: "Fix Figma comments on shared post designs", priority: "Low", date: "Oct 20, 2026", status: "To Do" },
  { id: 4, owner: "Kunal Mehta", email: "kunal.mehta@outrightcrm.com", task: "Review onboarding checklist for new joiners", priority: "High", date: "Oct 22, 2026", status: "Done" },
];
const PRIORITY_TONE = { High: "closed", Medium: "attention", Low: "info" };
const STATUS_TONE = { "To Do": "neutral", "In Progress": "success", Done: "progress" };
const TABS = [
  { value: "tasks", label: "Upcoming tasks" },
  { value: "activity", label: "Activity log" },
];

/** `feed` comes from buildFeed(); `onOpen(item)` handles taps (leave → request, check-in → employee). */
export default function FeedCard({ feed = [], loading, error, onRetry, today, onOpen }) {
  const [tab, setTab] = useState("tasks");

  return (
    <Card style={{ gap: 12 }}>
      <View style={styles.headRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <CardHead icon="pulse-outline" tone="progress" title="Tasks & activity" />
        </View>
        {tab === "tasks" ? <Chip label="Sample data" tone="attention" small style={styles.sampleBadge} /> : null}
      </View>
      <SegmentedControl options={TABS} value={tab} onChange={setTab} />
      {tab === "tasks" ? <TaskList /> : <ActivityLog feed={feed} loading={loading} error={error} onRetry={onRetry} today={today} onOpen={onOpen} />}
    </Card>
  );
}

function TaskList() {
  const [done, setDone] = useState(() => new Set(SAMPLE_TASKS.filter((task) => task.status === "Done").map((task) => task.id)));
  const toggle = (id) =>
    setDone((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <View style={{ gap: 8 }}>
      {SAMPLE_TASKS.map((task) => {
        const isDone = done.has(task.id);
        const status = isDone ? "Done" : task.status === "Done" ? "To Do" : task.status;
        return (
          <View key={task.id} style={styles.task}>
            <View style={styles.taskTop}>
              <Pressable
                onPress={() => toggle(task.id)}
                hitSlop={8}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isDone }}
                accessibilityLabel={`Mark "${task.task}" as done`}
                style={styles.checkbox}
              >
                <Ionicons name={isDone ? "checkbox" : "square-outline"} size={20} color={isDone ? colors.primary : colors.mutedForeground} />
              </Pressable>
              <Text style={[styles.taskText, isDone && styles.taskDone]}>{task.task}</Text>
            </View>
            <View style={styles.owner}>
              <Avatar name={task.owner} size={28} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.ownerName}>{task.owner}</Text>
                <Text style={homeStyles.rowSub} numberOfLines={1} ellipsizeMode="tail">{task.email}</Text>
              </View>
            </View>
            <View style={styles.taskMeta}>
              <Chip label={task.priority} tone={PRIORITY_TONE[task.priority]} small style={styles.metaChip} />
              <Chip label={status} tone={STATUS_TONE[status]} small style={styles.metaChip} />
              <View style={styles.due}>
                <Ionicons name="calendar-outline" size={13} color={colors.mutedForeground} style={{ flexShrink: 0 }} />
                <Text style={homeStyles.rowSub}>{task.date}</Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ActivityLog({ feed, loading, error, onRetry, today, onOpen }) {
  const [expanded, setExpanded] = useState(false);
  const items = expanded ? feed : feed.slice(0, PREVIEW);

  if (loading) return <EmptyLine>Loading the activity log…</EmptyLine>;
  if (error) return <InlineError message="Couldn't load the activity log." onRetry={onRetry} />;
  if (feed.length === 0) return <EmptyLine>No activity yet today.</EmptyLine>;
  return (
    <>
      <View>
        <View style={styles.rail} />
        {items.map((item) => {
          const meta = FEED_META[item.type] || FEED_META.announcement;
          const palette = tones[meta.tone];
          return (
            <Pressable key={item.id} onPress={() => onOpen(item)} style={({ pressed }) => [homeStyles.row, { alignItems: "flex-start" }, pressed && { opacity: 0.7 }]}>
              <View style={[styles.bubble, { backgroundColor: palette.bg }]}>
                <Ionicons name={meta.icon} size={15} color={palette.fg} />
              </View>
              <View style={{ flex: 1, minWidth: 0, paddingTop: 5 }}>
                <Text style={styles.title}>{item.title}</Text>
                {item.detail ? <Text style={homeStyles.rowSub}>{item.detail}</Text> : null}
              </View>
              <Text style={[homeStyles.rowSub, styles.when]}>{feedDayLabel(item.at, today)}</Text>
            </Pressable>
          );
        })}
      </View>
      {feed.length > PREVIEW ? (
        <Pressable onPress={() => setExpanded((value) => !value)} accessibilityRole="button" style={({ pressed }) => [styles.more, pressed && { opacity: 0.75 }]}>
          <Text style={styles.moreText}>{expanded ? "Show less" : `Show all ${feed.length}`}</Text>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={15} color={colors.primary} />
        </Pressable>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sampleBadge: { flexShrink: 0, maxWidth: "45%" },
  task: { gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  taskTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  checkbox: { flexShrink: 0, width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  taskText: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20, fontWeight: "600", color: colors.foreground },
  taskDone: { color: colors.mutedForeground, textDecorationLine: "line-through" },
  owner: { flexDirection: "row", alignItems: "center", gap: 8 },
  ownerName: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.foreground },
  taskMeta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 6 },
  metaChip: { alignSelf: "flex-start", maxWidth: "45%" },
  due: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1, minWidth: 0 },
  // Timeline line behind the icon bubbles (bubble centre = 16px).
  rail: { position: "absolute", left: 15.5, top: 18, bottom: 18, width: 1, backgroundColor: colors.border },
  bubble: { flexShrink: 0, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colors.card },
  title: { fontSize: 14, lineHeight: 19, fontWeight: "600", color: colors.foreground },
  when: { flexShrink: 0, maxWidth: "30%", textAlign: "right", paddingTop: 7 },
  more: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.primarySoft },
  moreText: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.primary },
});
