import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { type, colors } from "../theme";
import { Button, Card, Row } from "./ui";
import { useAnswerAlert, useMyAlerts } from "../hooks/queries";
import { plainText } from "../utils/records";
import { formatDate } from "../utils/dates";
import { answerButtonLabel, pendingQueue } from "../utils/systemAlerts";

const ANSWER_ICONS = { yes: "checkmark", no: "close", acknowledged: "checkmark-done", seen: "eye-outline" };

/**
 * Inline card listing system alerts the employee still has to answer, with the buttons each alert's type allows.
 * `onSeeAll` (optional) adds a small "See all" link to the header, e.g. to open the MyAlerts screen.
 */
export function PendingAlertsCard({ onSeeAll } = {}) {
  const mine = useMyAlerts();
  const answer = useAnswerAlert();
  const alerts = pendingQueue(mine.data?.alerts);
  if (!alerts.length) return null;
  return (
    <Card tone="attention" style={{ gap: 12 }}>
      <View style={styles.header}>
        <Text style={[type.heading, styles.title]}>Needs your response</Text>
        {onSeeAll ? (
          <Pressable onPress={onSeeAll} hitSlop={8} accessibilityRole="button" accessibilityLabel="See all alerts" style={styles.seeAll}>
            <Text style={styles.seeAllText}>See all</Text>
            <Ionicons name="chevron-forward" size={13} color={colors.attention} />
          </Pressable>
        ) : null}
      </View>
      {alerts.map((alert) => (
        <AlertItem key={alert.id} alert={alert} busy={answer.isPending && answer.variables?.alert.id === alert.id} pendingAnswer={answer.variables?.answer} onAnswer={(value) => answer.mutate({ alert, answer: value })} />
      ))}
    </Card>
  );
}

export function AlertItem({ alert, busy, pendingAnswer, onAnswer }) {
  return (
    <View style={styles.item}>
      <Text style={type.subheading}>{plainText(alert.name) || "Notice"}</Text>
      {alert.description ? <Text style={type.body}>{plainText(alert.description)}</Text> : null}
      <Text style={type.small}>{formatDate(alert.date_entered)}</Text>
      <Row style={{ flexWrap: "wrap" }}>
        {alert.allowed_answers.map((value, index) => (
          <Button
            key={value}
            title={answerButtonLabel(value)}
            small
            variant={index === 0 ? "primary" : "outline"}
            icon={ANSWER_ICONS[value]}
            loading={busy && pendingAnswer === value}
            disabled={busy}
            onPress={() => onAnswer(value)}
          />
        ))}
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: colors.attention, flex: 1, minWidth: 0 },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2, flexShrink: 0 },
  seeAllText: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.attention },
  item: { backgroundColor: colors.card, borderRadius: 12, padding: 12, gap: 6, borderWidth: 1, borderColor: colors.border },
});
