// Edit a candidate's profile (web candidates/CandidateDetails.jsx, edit mode): recruitment progress
// (stage, phase, status), contact, background, location and About. Only changed fields are sent.
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { colors, spacing, type } from "../../theme";
import { Button, Field, Notice, Row, SelectField, Sheet } from "../ui";
import { changedFields, optionValue, updateCandidateRecord, workflowField, workflowValue } from "../../api/admin.api";
import { toast } from "../../store/toastStore";
import { CANDIDATE_FIELD_GROUPS, WORKFLOW_KINDS, readResumeSections, updateResumeAbout } from "../../utils/recruitment";
import { errorMessage, plainText } from "../../utils/records";

const KEYBOARDS = { email1: "email-address", phone_mobile: "phone-pad", linkedin_url: "url", github_url: "url" };
const LABELS = { stage: "Stage", phase: "Phase", status: "Status" };

/** `lookups` = { stage, phase, status } option lists (undefined while loading). Mount with a `key` per record. */
export default function CandidateEditSheet({ record, lookups, onClose }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(record || {});
  const [error, setError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const changes = record ? changedFields(record, draft) : {};
  const count = Object.keys(changes).length;
  const change = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  const save = useMutation({
    mutationFn: () => updateCandidateRecord(record.id, changes),
    onMutate: () => setError(""),
    onSuccess: () => {
      queryClient.setQueryData(["candidates", "record", record.id], draft);
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["candidate-profile"] });
      toast.success("Candidate updated");
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const close = () => {
    if (save.isPending) return;
    if (count) setConfirmClose(true);
    else onClose();
  };

  return (
    <Sheet visible={Boolean(record)} onClose={close} title="Edit candidate">
      {record ? (
        <View style={styles.body}>
          {confirmClose ? (
            <Notice tone="attention" icon="warning-outline" title="You have unsaved changes." action="Discard" onAction={onClose} message="Keep editing, or discard them and close." />
          ) : null}
          {error ? <Notice tone="closed" icon="alert-circle-outline" message={error} /> : null}

          <Text style={styles.group}>Recruitment progress</Text>
          {WORKFLOW_KINDS.map((kind) => {
            const key = workflowField(record, kind);
            const options = lookups?.[kind] || [];
            const current = String(draft[key] ?? "");
            const items = options.map((option) => ({ value: optionValue(record, kind, option, options), label: plainText(option.name) }));
            // Keep a stored value the lookup no longer lists, so opening the picker never loses it.
            // Until the lookup loads, only the current value is offered.
            const choices = [{ value: "", label: "Unassigned" }, ...(current && !items.some((item) => item.value === current) ? [{ value: current, label: workflowValue(draft, kind, options) }] : []), ...items];
            return (
              <SelectField
                key={kind}
                label={LABELS[kind]}
                value={current}
                onChange={(value) => change(key, value)}
                options={lookups?.[kind] ? choices : [{ value: current, label: workflowValue(draft, kind, options) }]}
              />
            );
          })}

          {CANDIDATE_FIELD_GROUPS.map(([title, fields]) => (
            <View key={title} style={styles.section}>
              <Text style={styles.group}>{title}</Text>
              {fields.map(([key, label]) => (
                <Field
                  key={key}
                  label={label}
                  value={String(draft[key] ?? "")}
                  onChangeText={(value) => change(key, value)}
                  keyboardType={KEYBOARDS[key]}
                  autoCapitalize={KEYBOARDS[key] ? "none" : key.includes("name") ? "words" : "sentences"}
                  hint={key === "dob" ? "As stored in the CRM, e.g. YYYY-MM-DD" : undefined}
                  editable={!save.isPending}
                />
              ))}
            </View>
          ))}

          <View style={styles.section}>
            <Text style={styles.group}>About the candidate</Text>
            {/* Parsed-resume data stored with the description is kept; only the readable text changes. */}
            <Field label="Description" value={readResumeSections(draft.description || "").about} onChangeText={(value) => change("description", updateResumeAbout(draft.description || "", value))} multiline editable={!save.isPending} />
          </View>

          <Text style={[type.small, { color: colors.mutedForeground }]}>{count ? `${count} unsaved field${count === 1 ? "" : "s"}` : "No changes yet"}</Text>
          <Row style={{ flexWrap: "wrap", rowGap: spacing.sm }}>
            <Button title="Cancel" variant="outline" style={styles.action} disabled={save.isPending} onPress={close} />
            <Button title="Save changes" icon="save-outline" style={styles.action} disabled={!count} loading={save.isPending} onPress={() => save.mutate()} />
          </Row>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  section: { gap: spacing.md },
  group: { ...type.subheading, color: colors.navy, marginTop: spacing.xs },
  action: { flexGrow: 1, flexBasis: 120, minHeight: 48 },
});
