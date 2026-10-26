import { StyleSheet, Text, View } from "react-native";
import { type, colors } from "../theme";
import { Button, Card, Row } from "./ui";
import { useAnswerAlert, usePendingAlerts } from "../hooks/queries";
import { plainText } from "../utils/records";
import { formatDate } from "../utils/dates";

/** Inline card listing system alerts the employee still has to answer with Yes / No. */
export function PendingAlertsCard() {
  const pending = usePendingAlerts();
  const answer = useAnswerAlert();
  const alerts = pending.data || [];
  if (!alerts.length) return null;
  return (
    <Card tone="attention" style={{ gap: 12 }}>
      <Text style={[type.heading, { color: colors.attention }]}>Needs your response</Text>
      {alerts.map((alert) => (
        <AlertItem key={alert.id} alert={alert} busy={answer.isPending && answer.variables?.alertId === alert.id} onAnswer={(value) => answer.mutate({ alertId: alert.id, answer: value })} />
      ))}
    </Card>
  );
}

function AlertItem({ alert, busy, onAnswer }) {
  return (
    <View style={styles.item}>
      <Text style={type.subheading}>{plainText(alert.name) || "Notice"}</Text>
      {alert.description ? <Text style={type.body}>{plainText(alert.description)}</Text> : null}
      <Text style={type.small}>{formatDate(alert.date_entered)}</Text>
      <Row style={{ flexWrap: "wrap" }}>
        <Button title="Yes" small icon="checkmark" loading={busy} onPress={() => onAnswer("yes")} />
        <Button title="No" small variant="outline" icon="close" disabled={busy} onPress={() => onAnswer("no")} />
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  item: { backgroundColor: colors.card, borderRadius: 12, padding: 12, gap: 6, borderWidth: 1, borderColor: colors.border },
});
