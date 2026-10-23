import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { colors, type } from "../../theme";
import { Button, Card, Chip, EmptyState, ErrorState, Field, IconButton, LoadingState, Row, Screen, SectionTitle } from "../../components/ui";
import { createSystemAlert, deleteSystemAlert, fetchSystemAlertResponses } from "../../api/systemAlerts.api";
import { toast } from "../../store/toastStore";
import { formatDate } from "../../utils/dates";
import { clean, errorMessage, lower, plainText } from "../../utils/records";

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
      <Text style={type.small}>Alerts show on every employee's home screen and must be answered Yes or No before they can clock out.</Text>

      {composing ? (
        <Card>
          <Text style={type.heading}>New alert</Text>
          <Field label="Title" value={form.name} onChangeText={(name) => setForm({ ...form, name })} placeholder="e.g. Office closed on Friday" />
          <Field label="Message" value={form.description} onChangeText={(description) => setForm({ ...form, description })} placeholder="What do employees need to confirm?" multiline />
          <Row style={{ flexWrap: "wrap" }}>
            <Button title="Publish" icon="megaphone-outline" loading={create.isPending} disabled={!clean(form.name) || !clean(form.description)} onPress={() => create.mutate()} />
            <Button title="Cancel" variant="ghost" onPress={() => setComposing(false)} />
          </Row>
        </Card>
      ) : (
        <Button title="Create alert" icon="add" full onPress={() => setComposing(true)} />
      )}

      <View style={{ gap: 10 }}>
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
            return (
              <Card key={alert.id}>
                <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={type.subheading}>{plainText(alert.name)}</Text>
                    {alert.date_entered ? <Text style={type.small}>{formatDate(alert.date_entered)}</Text> : null}
                  </View>
                  {!alert.unavailable ? <IconButton icon="trash-outline" color={colors.destructive} onPress={() => confirmDelete(alert)} label="Delete alert" /> : null}
                </Row>
                {alert.description ? <Text style={type.body}>{plainText(alert.description)}</Text> : null}
                <Row style={{ flexWrap: "wrap" }}>
                  <Chip label={`${yes} yes`} tone="success" small />
                  <Chip label={`${no} no`} tone="closed" small />
                  <Chip label={`${responses.length} responses`} tone="neutral" small />
                </Row>
                {responses.length ? (
                  <View style={{ gap: 4 }}>
                    {responses.slice(0, 8).map((response) => (
                      <Row key={response.id} style={{ justifyContent: "space-between" }}>
                        <Text style={[type.small, { flex: 1 }]} numberOfLines={1}>{response.name || response.employee_id}</Text>
                        <Chip label={lower(response.description) === "yes" ? "Yes" : "No"} tone={lower(response.description) === "yes" ? "success" : "closed"} small />
                      </Row>
                    ))}
                    {responses.length > 8 ? <Text style={type.small}>+{responses.length - 8} more</Text> : null}
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
