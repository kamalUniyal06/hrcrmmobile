// Schedule a candidate's first interview (web candidates/ScheduleInterviewDialog.jsx): creates Round 1
// and moves the candidate's status to Scheduled. If the interview saves but the status update fails,
// the sheet stays open and only retries the status update.
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { spacing, type } from "../../theme";
import { Button, Chip, Field, Notice, Row, SelectField, Sheet } from "../ui";
import DateField from "../ui/DateField";
import { FIRST_ROUND, candidateName, scheduleInterview, workflowValue } from "../../api/admin.api";
import { toast } from "../../store/toastStore";
import { INTERVIEW_TIME_OPTIONS, localDateTime } from "../../utils/recruitment";
import { errorMessage, plainText } from "../../utils/records";
import { todayKey } from "../../utils/dates";

/** Mount with a `key` per candidate so the form starts fresh. */
export default function ScheduleInterviewSheet({ candidate, statusOptions, onClose }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(() => ({
    name: candidate ? candidateName(candidate) : "",
    email: plainText(candidate?.email1 || candidate?.email),
    date: "",
    time: "",
    notes: "",
    job_id: String(candidate?.job_id || ""),
  }));
  const [created, setCreated] = useState(false);
  const [error, setError] = useState("");
  const set = (patch) => setDraft((current) => ({ ...current, ...patch }));

  const save = useMutation({
    mutationFn: () =>
      scheduleInterview({
        candidate,
        draft: { ...draft, when: localDateTime(draft.date, draft.time) },
        statusOptions,
        interviewCreated: created,
        onCreated: () => setCreated(true),
      }),
    onMutate: () => setError(""),
    onSuccess: () => {
      toast.success("Interview saved. Candidate marked as Scheduled.");
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["candidate-profile"] });
      queryClient.invalidateQueries({ queryKey: ["interviews"] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const locked = save.isPending || created;
  const currentStatus = candidate ? workflowValue(candidate, "status", statusOptions) : "";
  const showFrom = currentStatus && !/^(unassigned|scheduled)$/i.test(currentStatus);

  return (
    // Once the interview exists the sheet can't be dismissed until the status update succeeds (as on the web).
    <Sheet visible={Boolean(candidate)} onClose={() => !locked && onClose()} title="Schedule an interview">
      {candidate ? (
        <View style={styles.body}>
          <Text style={type.small}>This sets up {FIRST_ROUND} for {candidateName(candidate)}. They move to Scheduled when you save.</Text>
          <Row style={{ flexWrap: "wrap", rowGap: 6 }}>
            {showFrom ? <Chip label={`${currentStatus} →`} tone="neutral" small /> : null}
            <Chip label="Scheduled" icon="calendar-outline" tone="lime" small />
            <Chip label={FIRST_ROUND} tone="progress" small />
          </Row>
          {created ? <Notice tone="attention" icon="time-outline" message="The interview is saved. Retry the status update below; it won't create another interview." /> : null}
          {error ? <Notice tone="closed" icon="alert-circle-outline" message={error} /> : null}
          <Row align="flex-end" style={{ gap: spacing.sm }}>
            <DateField label="Date" value={draft.date} onChange={(date) => set({ date })} minKey={todayKey()} clearable={false} placeholder="Pick a day" disabled={locked} style={{ flex: 1.4, minWidth: 0 }} />
            <SelectField label="Time" value={draft.time} onChange={(time) => !locked && set({ time })} options={INTERVIEW_TIME_OPTIONS} placeholder="Time" style={{ flex: 1, minWidth: 0 }} />
          </Row>
          <Text style={type.small}>In your local time.</Text>
          <Field label="Candidate name" value={draft.name} onChangeText={(name) => set({ name })} editable={!locked} autoCapitalize="words" />
          <Field label="Email address" value={draft.email} onChangeText={(email) => set({ email })} editable={!locked} keyboardType="email-address" autoCapitalize="none" />
          <Field
            label="Interview notes (optional)"
            value={draft.notes}
            onChangeText={(notes) => set({ notes })}
            editable={!locked}
            multiline
            placeholder="Topics to cover, links, or anything the interviewer should know"
            hint="Shown on the interview card. You can build on these notes when you record the round's feedback."
          />
          <Row style={{ flexWrap: "wrap", rowGap: spacing.sm }}>
            <Button title="Cancel" variant="outline" style={styles.action} disabled={locked} onPress={onClose} />
            <Button
              title={created ? "Retry status update" : "Save interview"}
              icon="calendar-outline"
              style={styles.action}
              disabled={!created && (!draft.date || !draft.time)}
              loading={save.isPending}
              onPress={() => save.mutate()}
            />
          </Row>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  action: { flexGrow: 1, flexBasis: 120, minHeight: 48 },
});
