// Record a decision on, or set the date of, one interview round (web interviews/InterviewActionDialog.jsx).
// Used by the interview board and the candidate profile. Saving re-reads the interview first and stops
// if someone else changed it; passing the final round also moves the candidate to the Joining stage.
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { colors, spacing, type } from "../../theme";
import { Button, Field, Notice, Row, SelectField, Sheet } from "../ui";
import DateField from "../ui/DateField";
import { HIRED_WORKFLOW, decideInterview, isFinalRound, nextPipelineRound, rescheduleInterview, roundName } from "../../api/admin.api";
import { toast } from "../../store/toastStore";
import { localDateTime, localInterviewParts, timeOptionsWith } from "../../utils/recruitment";
import { clean, errorMessage, plainText } from "../../utils/records";
import { todayKey } from "../../utils/dates";

/** `mode` is "decide" (pass / fail with feedback) or "schedule" (date and time). Mount with a `key` per record. */
export default function InterviewActionSheet({ record, mode, statusOptions, onClose }) {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState(record?.interview_feedback ? plainText(record.interview_feedback) : "");
  const [when, setWhen] = useState(() => localInterviewParts(record?.interview_datetime));
  const [error, setError] = useState("");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["interviews"] });
    queryClient.invalidateQueries({ queryKey: ["candidates"] });
  };
  const decide = useMutation({
    mutationFn: (outcome) => decideInterview({ record, outcome, feedback }),
    onMutate: () => setError(""),
    onSuccess: ({ outcome, nextRound, hired }) => {
      toast.success(
        outcome === "Fail"
          ? "Interview marked as fail."
          : nextRound
            ? `Passed. ${nextRound} is ready to schedule.`
            : hired
              ? `Passed ${roundName(record)}. Candidate selected and moved to the ${HIRED_WORKFLOW.stage} stage.`
              : "Interview marked as pass.",
      );
      refresh();
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const schedule = useMutation({
    mutationFn: () => rescheduleInterview({ record, when: localDateTime(when.date, when.time), statusOptions }),
    onMutate: () => setError(""),
    onSuccess: () => {
      toast.success("Interview date saved.");
      refresh();
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const busy = decide.isPending || schedule.isPending;
  const name = record ? plainText(record.name) || record.email || "Candidate" : "";
  const scheduled = Boolean(clean(record?.interview_datetime));
  const title = !record ? "" : mode === "decide" ? `Record decision · ${roundName(record)}` : scheduled ? "Reschedule interview" : "Schedule interview";
  const next = record ? nextPipelineRound(record) : "";
  const passHint = next
    ? `Passing opens ${next} for this candidate, ready for you to schedule.`
    : record && isFinalRound(record)
      ? `Passing ${roundName(record)} selects them and moves them to the ${HIRED_WORKFLOW.stage} stage. Their status stays the same.`
      : `Passing ${record ? roundName(record) : "this round"} completes their interviews.`;

  return (
    <Sheet visible={Boolean(record)} onClose={() => !busy && onClose()} title={title}>
      {record ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md }}>
          <Text style={type.small}>{name} · {roundName(record)}</Text>
          {mode === "decide" ? (
            <>
              <Field label="Interview feedback *" value={feedback} onChangeText={setFeedback} multiline editable={!busy} placeholder="Explain the outcome of this round" />
              <Notice tone="info" icon="information-circle-outline" message={`${passHint} Feedback is required for both decisions.`} />
            </>
          ) : (
            <>
              <Row align="flex-end" style={{ gap: spacing.sm }}>
                <DateField label="Date" value={when.date} onChange={(date) => setWhen((current) => ({ ...current, date }))} minKey={todayKey()} clearable={false} placeholder="Pick a day" disabled={busy} style={{ flex: 1.4, minWidth: 0 }} />
                <SelectField label="Time" value={when.time} onChange={(time) => setWhen((current) => ({ ...current, time }))} options={timeOptionsWith(when.time)} placeholder="Time" style={{ flex: 1, minWidth: 0 }} />
              </Row>
              <Text style={type.small}>In your local time. Rejected candidates and completed rounds can't be scheduled.</Text>
            </>
          )}
          {error ? <Notice tone="closed" icon="alert-circle-outline" message={error} /> : null}
          <Row style={{ flexWrap: "wrap", rowGap: spacing.sm }}>
            {mode === "decide" ? (
              <>
                <Button title="Pass" icon="checkmark-circle-outline" style={styles.action} disabled={busy} loading={decide.isPending && decide.variables === "Pass"} onPress={() => decide.mutate("Pass")} />
                <Button title="Fail" icon="close-circle-outline" variant="destructive" style={styles.action} disabled={busy} loading={decide.isPending && decide.variables === "Fail"} onPress={() => decide.mutate("Fail")} />
              </>
            ) : (
              <>
                <Button title="Cancel" variant="outline" style={styles.action} disabled={busy} onPress={onClose} />
                <Button title="Save interview date" icon="calendar-outline" style={styles.action} disabled={!when.date || !when.time} loading={schedule.isPending} onPress={() => schedule.mutate()} />
              </>
            )}
          </Row>
          {mode === "decide" && busy ? <Text style={[type.small, { color: colors.mutedForeground }]}>Saving… If this stops part-way, retry: an existing next-round record is reused.</Text> : null}
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({ action: { flexGrow: 1, flexBasis: 120, minHeight: 48 } });
