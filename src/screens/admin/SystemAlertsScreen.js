import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, spacing, tones, type } from "../../theme";
import { Button, Card, Chip, EmptyState, ErrorState, Field, IconButton, LoadingState, PageHeader, Row, Screen, SectionTitle } from "../../components/ui";
import { createSystemAlert, deleteSystemAlert, fetchSystemAlertResponses } from "../../api/systemAlerts.api";
import { toast } from "../../store/toastStore";
import { formatDate } from "../../utils/dates";
import { clean, errorMessage, lower, plainText } from "../../utils/records";

const RESPONSES_SHOWN = 8;

export default function SystemAlertsScreen() {
  const queryClient = useQueryClient();
  const groups = useQuery({ queryKey: ["system-alerts", "responses"], queryFn: fetchSystemAlertResponses });
  const [form, setForm] = useState({ name: "", description: "" });
  const [composing, setComposing] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["system-alerts"] });

  const create = useMutation({
    mutationFn: () => createSystemAlert(form),
    onSuccess: () => {
      toast.success("Alert published to all employees.");
      setForm({ name: "", description: "" });
      setComposing(false);
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (id) => deleteSystemAlert(id),
    onSuccess: () => {
      toast.success("Alert deleted.");
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const confirmDelete = (alert) =>
    Alert.alert("Delete this alert?", "Its employee responses are removed as well.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => remove.mutate(alert.id) },
    ]);

  return (
    <Screen refreshing={groups.isFetching} onRefresh={() => groups.refetch()}>
      <PageHeader icon="megaphone" tone="attention" title="System alerts" subtitle="Alerts show on every employee's home screen and must be answered Yes or No before they can clock out." />

      {composing ? (
        <Card style={{ gap: spacing.md }}>
          <View style={styles.cardHead}>
            <View style={[styles.tile, { backgroundColor: tones.progress.bg }]}>
              <Ionicons name="create-outline" size={18} color={tones.progress.fg} />
            </View>
            <Text style={[styles.cardHeading, styles.headText]}>New alert</Text>
          </View>
          <Field label="Title" value={form.name} onChangeText={(name) => setForm({ ...form, name })} placeholder="e.g. Office closed on Friday" />
          <Field label="Message" value={form.description} onChangeText={(description) => setForm({ ...form, description })} placeholder="What do employees need to confirm?" multiline />
          <View style={styles.actions}>
            <Button title="Publish" icon="megaphone-outline" loading={create.isPending} disabled={!clean(form.name) || !clean(form.description)} onPress={() => create.mutate()} style={styles.actionMain} />
            <Button title="Cancel" variant="outline" icon="close-outline" onPress={() => setComposing(false)} style={styles.actionSide} />
          </View>
        </Card>
      ) : (
        <Button title="Create alert" icon="add-circle-outline" full onPress={() => setComposing(true)} style={styles.bigButton} />
      )}

      <View style={{ gap: spacing.md }}>
        <SectionTitle title="Published alerts" hint={groups.data ? `${groups.data.length} alert(s)` : undefined} />
        {groups.isPending ? (
          <LoadingState />
        ) : groups.isError ? (
          <ErrorState message={groups.error.message} onRetry={() => groups.refetch()} />
        ) : groups.data.length === 0 ? (
          <EmptyState icon="megaphone-outline" title="No alerts yet" message="Create one to notify every employee." />
        ) : (
          groups.data.map(({ alert, responses }) => {
            const yes = responses.filter((r) => lower(r.description) === "yes").length;
            const no = responses.filter((r) => lower(r.description) === "no").length;
            const shown = responses.slice(0, RESPONSES_SHOWN);
            return (
              <Card key={alert.id} style={{ gap: spacing.md }}>
                <View style={styles.cardHead}>
                  <View style={[styles.tile, { backgroundColor: tones.attention.bg }]}>
                    <Ionicons name="megaphone-outline" size={18} color={tones.attention.fg} />
                  </View>
                  <View style={styles.headText}>
                    <Text style={styles.alertTitle}>{plainText(alert.name)}</Text>
                    {alert.date_entered ? (
                      <View style={styles.dateRow}>
                        <Ionicons name="calendar-outline" size={13} color={colors.mutedForeground} style={styles.noShrink} />
                        <Text style={[type.small, { flexShrink: 1 }]}>{formatDate(alert.date_entered)}</Text>
                      </View>
                    ) : null}
                  </View>
                  {!alert.unavailable ? (
                    <IconButton icon="trash-outline" size={18} color={colors.destructive} onPress={() => confirmDelete(alert)} label="Delete alert" style={styles.deleteButton} />
                  ) : null}
                </View>
                {alert.description ? <Text style={type.body}>{plainText(alert.description)}</Text> : null}
                <Row style={{ flexWrap: "wrap", rowGap: 6 }}>
                  <Chip label={`${yes} yes`} icon="thumbs-up-outline" tone="success" small style={styles.chip} />
                  <Chip label={`${no} no`} icon="thumbs-down-outline" tone="closed" small style={styles.chip} />
                  <Chip label={`${responses.length} responses`} icon="people-outline" tone="neutral" small style={styles.chip} />
                </Row>
                {responses.length ? (
                  <View style={styles.responses}>
                    {shown.map((response, index) => (
                      <View key={response.id} style={[styles.responseRow, index === shown.length - 1 && responses.length <= RESPONSES_SHOWN && { borderBottomWidth: 0 }]}>
                        <Ionicons name="person-circle-outline" size={18} color={colors.mutedForeground} style={styles.noShrink} />
                        <Text style={[type.small, styles.responseName]} numberOfLines={2}>{response.name || response.employee_id}</Text>
                        <Chip label={lower(response.description) === "yes" ? "Yes" : "No"} tone={lower(response.description) === "yes" ? "success" : "closed"} small style={styles.noShrink} />
                      </View>
                    ))}
                    {responses.length > RESPONSES_SHOWN ? <Text style={[type.small, styles.more]}>+{responses.length - RESPONSES_SHOWN} more</Text> : null}
                  </View>
                ) : null}
              </Card>
            );
          })
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  headText: { flex: 1, minWidth: 0, gap: 2, alignSelf: "center" },
  tile: { flexShrink: 0, width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  cardHeading: { fontSize: 18, lineHeight: 24, fontWeight: "600", color: colors.navy },
  alertTitle: { fontSize: 16, lineHeight: 22, fontWeight: "600", color: colors.navy },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  noShrink: { flexShrink: 0 },
  deleteButton: { flexShrink: 0, width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.destructiveSoft },
  chip: { alignSelf: "flex-start", flexShrink: 0 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  actionMain: { flexGrow: 1, flexBasis: 140, minHeight: 48 },
  actionSide: { flexGrow: 1, flexBasis: 110, minHeight: 48 },
  bigButton: { minHeight: 50 },
  responses: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, backgroundColor: colors.background },
  responseRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  responseName: { flex: 1, minWidth: 0, color: colors.foreground },
  more: { paddingVertical: 8, textAlign: "center" },
});
