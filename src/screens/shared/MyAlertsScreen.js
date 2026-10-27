// The signed-in employee's system alerts: ones still waiting for an answer and the answered history.
// Web: components/employement/components/alerts/AlertBell.jsx ("Waiting" / "Past alerts").
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, spacing, tones, type } from "../../theme";
import { Chip, EmptyState, ErrorState, LoadingState, Notice, PageHeader, Screen, SegmentedControl } from "../../components/ui";
import { AlertItem } from "../../components/AlertsPrompt";
import { useAnswerAlert, useMyAlerts } from "../../hooks/queries";
import { errorMessage } from "../../utils/records";
import { alertTitle, answerLabel, answerTone, formatUtcTime } from "../../utils/systemAlerts";
import { splitMyAlerts } from "../../utils/myAlerts";

const TABS = ["pending", "past"];

/** Params: { tab?: "pending" | "past" }. */
export default function MyAlertsScreen({ navigation, route }) {
  const [tab, setTab] = useState(TABS.includes(route?.params?.tab) ? route.params.tab : "pending");
  const mine = useMyAlerts();
  const answer = useAnswerAlert();
  const { pending, past } = splitMyAlerts(mine.data?.alerts);
  const blocking = mine.data?.blockingCount || 0;
  const open = (alert) => navigation?.navigate("AnnouncementDetail", { alert });

  let body;
  if (mine.isPending) {
    body = <LoadingState label="Loading your alerts…" variant="cards" rows={3} />;
  } else if (mine.isError) {
    body = <ErrorState message={errorMessage(mine.error, "Could not load your alerts.")} onRetry={() => mine.refetch()} />;
  } else if (tab === "pending") {
    body = pending.length ? (
      <View style={{ gap: spacing.md }}>
        {pending.map((alert) => (
          <Pressable key={alert.id} onPress={() => open(alert)} accessibilityLabel={`Open ${alertTitle(alert)}`}>
            <AlertItem
              alert={alert}
              busy={answer.isPending && answer.variables?.alert.id === alert.id}
              pendingAnswer={answer.variables?.answer}
              onAnswer={(value) => answer.mutate({ alert, answer: value })}
            />
          </Pressable>
        ))}
      </View>
    ) : (
      <EmptyState icon="checkmark-done-outline" title="You're all caught up" message="No alerts are waiting for you." />
    );
  } else {
    body = past.length ? (
      <View style={{ gap: spacing.sm }}>
        {past.map((alert) => (
          <PastAlertRow key={alert.id} alert={alert} onPress={() => open(alert)} />
        ))}
      </View>
    ) : (
      <EmptyState icon="time-outline" title="No past alerts" message="Alerts you answer will appear here." />
    );
  }

  return (
    <Screen refreshing={mine.isRefetching} onRefresh={() => mine.refetch()}>
      <PageHeader icon="notifications" tone="attention" title="My alerts" subtitle="Alerts from HR that need your answer, and the ones you've answered." />
      {blocking ? (
        <Notice tone="attention" icon="alert-circle-outline" message={`${blocking} need${blocking === 1 ? "s" : ""} an answer before you clock out.`} />
      ) : null}
      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { label: "Needs response", value: "pending", count: mine.data ? pending.length : undefined },
          { label: "Past alerts", value: "past", count: mine.data ? past.length : undefined },
        ]}
      />
      {body}
    </Screen>
  );
}

function PastAlertRow({ alert, onPress }) {
  const answeredAt = formatUtcTime(alert.answered_at);
  const sentAt = formatUtcTime(alert.date_entered);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.muted }]}>
      <View style={[styles.icon, { backgroundColor: tones.neutral.bg }]}>
        <Ionicons name="checkmark-circle-outline" size={18} color={tones.neutral.fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={type.subheading} numberOfLines={2}>{alertTitle(alert)}</Text>
        <View style={styles.meta}>
          <Chip label={`You answered ${answerLabel(alert.answer)}`} tone={answerTone(alert.answer)} small style={styles.chip} />
        </View>
        {answeredAt || sentAt ? (
          <Text style={type.small} numberOfLines={2}>{answeredAt ? `Answered ${answeredAt}` : `Sent ${sentAt}`}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} style={{ flexShrink: 0 }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  icon: { flexShrink: 0, width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { alignSelf: "flex-start" },
});
