import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { colors, type } from "../../theme";
import { Button, Card, Chip, EmptyState, ErrorState, Field, LoadingState, Notice, Row, Screen, SegmentedControl, Sheet } from "../../components/ui";
import { boardState, createInterview, fetchInterviews, groupInterviews, hasOutcome, roundName, uniqueInterviews, updateInterview, PIPELINE_ROUNDS } from "../../api/admin.api";
import { toast } from "../../store/toastStore";
import { formatDateTime, interviewDate, relativeDay } from "../../utils/dates";
import { clean, errorMessage, lower, plainText } from "../../utils/records";

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
      <Text style={type.small}>Passing a round moves the candidate to the next one. Both decisions need feedback.</Text>
      {interviews.isPending ? (
        <LoadingState label="Loading interviews…" />
      ) : interviews.isError ? (
        <ErrorState message={interviews.error.message} onRetry={() => interviews.refetch()} />
      ) : (
        <>
          <SegmentedControl options={groups.map((group) => ({ label: group.name, value: group.key, count: group.records.length }))} value={currentKey} onChange={setRound} />
          <Field value={search} onChangeText={setSearch} placeholder="Search candidate or job" autoCapitalize="none" />
          {cards.length === 0 ? (
            <EmptyState icon="people-outline" title={`No one in ${current?.name || "this round"}`} message="Candidates appear here when an interview is created." />
          ) : (
            cards.map((record) => {
              const state = boardState(record);
              const date = interviewDate(record.interview_datetime);
              return (
                <Card key={record.id}>
                  <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={type.subheading}>{plainText(record.name) || record.email || "Candidate"}</Text>
                      <Text style={type.small}>{[record.email, record.job_name || record.hrc_job_postings_hrc_interviews_1_name].filter(Boolean).join(" · ")}</Text>
                    </View>
                    <Chip label={state === "decided" ? record.interview_status : STATE_LABEL[state].label} tone={state === "decided" ? (/pass/i.test(record.interview_status) ? "success" : "closed") : STATE_LABEL[state].tone} small />
                  </Row>
                  <Text style={type.body}>{date ? `${formatDateTime(record.interview_datetime)} · ${relativeDay(date)}` : "Not scheduled yet"}</Text>
                  {record.interview_feedback ? <Text style={type.small}>Feedback: {plainText(record.interview_feedback)}</Text> : null}
                  {state !== "decided" ? <Button title="Record decision" icon="checkmark-done-outline" small variant="secondary" onPress={() => { setActive(record); setFeedback(""); }} /> : null}
                </Card>
              );
            })
          )}
        </>
      )}

      <Sheet visible={Boolean(active)} onClose={() => setActive(null)} title={active ? `${roundName(active)} · ${plainText(active.name) || active.email}` : ""}>
        <View style={{ padding: 16, gap: 12 }}>
          <Notice tone="info" icon="information-circle-outline" message="Feedback is saved on the interview and shown to other admins." />
          <Field label="Feedback" value={feedback} onChangeText={setFeedback} multiline placeholder="Strengths, concerns, recommendation" />
          <Row>
            <Button title="Pass" icon="checkmark" style={{ flex: 1 }} loading={decide.isPending && decide.variables?.outcome === "Pass"} onPress={() => decide.mutate({ record: active, outcome: "Pass" })} />
            <Button title="Fail" icon="close" variant="destructive" style={{ flex: 1 }} loading={decide.isPending && decide.variables?.outcome === "Fail"} onPress={() => decide.mutate({ record: active, outcome: "Fail" })} />
          </Row>
        </View>
      </Sheet>
    </Screen>
  );
}
