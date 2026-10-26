import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, spacing, tones, type } from "../../theme";
import { Button, Card, Chip, EmptyState, ErrorState, Field, LoadingState, Notice, PageHeader, Row, Screen, SearchField, SegmentedControl, Sheet } from "../../components/ui";
import { boardState, createInterview, fetchInterviews, groupInterviews, hasOutcome, roundName, uniqueInterviews, updateInterview, PIPELINE_ROUNDS } from "../../api/admin.api";
import { toast } from "../../store/toastStore";
import { formatDateTime, interviewDate, relativeDay } from "../../utils/dates";
import { clean, errorMessage, lower, plainText } from "../../utils/records";

// More rounds than fit one segmented bar on a phone are split over several rows of this many.
const ROUNDS_PER_ROW = 3;
const chunk = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));

const STATE_LABEL = { due: { label: "Awaiting decision", tone: "attention" }, upcoming: { label: "Upcoming", tone: "progress" }, unscheduled: { label: "Needs a date", tone: "neutral" }, decided: { label: "Decided", tone: "closed" } };

export default function InterviewBoardScreen() {
  const queryClient = useQueryClient();
  const interviews = useQuery({ queryKey: ["interviews"], queryFn: fetchInterviews, staleTime: 5 * 60 * 1000 });
  const [round, setRound] = useState(null);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(null); // interview being decided
  const [feedback, setFeedback] = useState("");

  const groups = useMemo(() => groupInterviews(interviews.data || []), [interviews.data]);
  const currentKey = round || groups[0]?.key;
  const current = groups.find((group) => group.key === currentKey);
  const cards = useMemo(() => {
    const needle = lower(search);
    const rank = (record) => ["due", "upcoming", "unscheduled", "decided"].indexOf(boardState(record));
    return (current?.records || [])
      .filter((record) => !needle || lower(`${record.name} ${record.email} ${record.job_name}`).includes(needle))
      .sort((a, b) => rank(a) - rank(b) || (interviewDate(a.interview_datetime)?.getTime() || 0) - (interviewDate(b.interview_datetime)?.getTime() || 0));
  }, [current, search]);

  const decide = useMutation({
    mutationFn: async ({ record, outcome }) => {
      if (!clean(feedback)) throw new Error("Interview feedback is required.");
      if (outcome === "Pass") {
        const match = roundName(record).match(/^round\s+(\d+)$/i);
        const next = match ? `Round ${Number(match[1]) + 1}` : "";
        const nextIsPipeline = PIPELINE_ROUNDS.some((name) => lower(name) === lower(next));
        if (nextIsPipeline) {
          const existing = uniqueInterviews(interviews.data || []).find((item) => lower(roundName(item)) === lower(next) && (clean(item.candidate_id) || lower(item.email)) === (clean(record.candidate_id) || lower(record.email)) && clean(item.job_id) === clean(record.job_id));
          if (existing && hasOutcome(existing)) throw new Error(`This candidate has already completed ${next}.`);
          if (!existing) {
            await createInterview({
              name: record.name || "", email: record.email || "", candidate_id: clean(record.candidate_id) || clean(record.hrc_candidates_hrc_interviews_1hrc_candidates_ida),
              job_id: clean(record.job_id), assigned_user_id: clean(record.assigned_user_id), description: next, interview_datetime: "", interview_status: "", interview_feedback: "",
            });
          }
        }
      }
      await updateInterview(record.id, { interview_status: outcome, interview_feedback: clean(feedback) });
    },
    onSuccess: (_, { outcome }) => {
      toast.success(outcome === "Pass" ? "Marked as passed. The next round is ready." : "Marked as not selected.");
      setActive(null);
      setFeedback("");
      queryClient.invalidateQueries({ queryKey: ["interviews"] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Screen refreshing={interviews.isFetching} onRefresh={() => interviews.refetch()}>
      <PageHeader icon="chatbubbles" tone="info" title="Interviews" subtitle="Passing a round moves the candidate to the next one. Both decisions need feedback." />
      {interviews.isPending ? (
        <LoadingState label="Loading interviews…" />
      ) : interviews.isError ? (
        <ErrorState message={interviews.error.message} onRetry={() => interviews.refetch()} />
      ) : (
        <>
          {chunk(groups, ROUNDS_PER_ROW).map((row) => (
            <SegmentedControl key={row[0].key} options={row.map((group) => ({ label: group.name, value: group.key, count: group.records.length }))} value={currentKey} onChange={setRound} />
          ))}
          <SearchField value={search} onChangeText={setSearch} placeholder="Search candidate or job" />
          {cards.length === 0 ? (
            <EmptyState icon="people-outline" title={`No one in ${current?.name || "this round"}`} message="Candidates appear here when an interview is created." />
          ) : (
            cards.map((record) => {
              const state = boardState(record);
              const date = interviewDate(record.interview_datetime);
              return (
                <Card key={record.id} style={{ gap: spacing.md }}>
                  <View style={styles.cardHead}>
                    <View style={[styles.tile, { backgroundColor: tones.info.bg }]}>
                      <Ionicons name="person-outline" size={18} color={tones.info.fg} />
                    </View>
                    <View style={styles.headText}>
                      <Text style={styles.name}>{plainText(record.name) || record.email || "Candidate"}</Text>
                      <Text style={type.small}>{[record.email, record.job_name || record.hrc_job_postings_hrc_interviews_1_name].filter(Boolean).join(" · ")}</Text>
                    </View>
                    <Chip label={state === "decided" ? record.interview_status : STATE_LABEL[state].label} tone={state === "decided" ? (/pass/i.test(record.interview_status) ? "success" : "closed") : STATE_LABEL[state].tone} small numberOfLines={2} style={styles.stateChip} />
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name={date ? "calendar-outline" : "calendar-clear-outline"} size={16} color={colors.primary} style={styles.noShrink} />
                    <Text style={[type.body, styles.infoText]}>{date ? `${formatDateTime(record.interview_datetime)} · ${relativeDay(date)}` : "Not scheduled yet"}</Text>
                  </View>
                  {record.interview_feedback ? (
                    <View style={styles.feedback}>
                      <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.mutedForeground} style={styles.feedbackIcon} />
                      <Text style={[type.small, styles.infoText]}>Feedback: {plainText(record.interview_feedback)}</Text>
                    </View>
                  ) : null}
                  {state !== "decided" ? <Button title="Record decision" icon="checkmark-done-outline" small variant="secondary" onPress={() => { setActive(record); setFeedback(""); }} style={styles.decisionButton} /> : null}
                </Card>
              );
            })
          )}
        </>
      )}

      <Sheet visible={Boolean(active)} onClose={() => setActive(null)} title={active ? `${roundName(active)} · ${plainText(active.name) || active.email}` : ""}>
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Notice tone="info" icon="information-circle-outline" message="Feedback is saved on the interview and shown to other admins." />
          <Field label="Feedback" value={feedback} onChangeText={setFeedback} multiline placeholder="Strengths, concerns, recommendation" />
          <Row style={{ flexWrap: "wrap", rowGap: 8 }}>
            <Button title="Pass" icon="checkmark-circle-outline" style={styles.decide} loading={decide.isPending && decide.variables?.outcome === "Pass"} onPress={() => decide.mutate({ record: active, outcome: "Pass" })} />
            <Button title="Fail" icon="close-circle-outline" variant="destructive" style={styles.decide} loading={decide.isPending && decide.variables?.outcome === "Fail"} onPress={() => decide.mutate({ record: active, outcome: "Fail" })} />
          </Row>
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  headText: { flex: 1, minWidth: 0, gap: 2 },
  tile: { flexShrink: 0, width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 16, lineHeight: 22, fontWeight: "600", color: colors.navy },
  stateChip: { maxWidth: "38%", flexShrink: 0, alignSelf: "flex-start" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  infoText: { flex: 1, minWidth: 0 },
  feedback: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  feedbackIcon: { flexShrink: 0, marginTop: 2 },
  noShrink: { flexShrink: 0 },
  decisionButton: { alignSelf: "stretch", minHeight: 42 },
  decide: { flexGrow: 1, flexBasis: 120, minHeight: 50 },
});
