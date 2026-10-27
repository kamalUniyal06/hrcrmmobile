import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, spacing, tones, type } from "../../theme";
import { Button, Card, Chip, EmptyState, ErrorState, LoadingState, Notice, PageHeader, Row, Screen, SearchField, SegmentedControl } from "../../components/ui";
import { BOARD_STATES, HIRED_WORKFLOW, boardState, fetchInterviews, findInterviewCandidate, groupInterviews, hasOutcome, isRejected } from "../../api/admin.api";
import InterviewActionSheet from "../../components/recruitment/InterviewActionSheet";
import useWorkflowLookups from "../../components/recruitment/useWorkflowLookups";
import { gateway } from "../../services/api";
import { formatDateTime, interviewDate, relativeDay } from "../../utils/dates";
import { clean, fetchAllPages, lower, plainText } from "../../utils/records";

// More rounds than fit one segmented bar on a phone are split over several rows of this many.
const ROUNDS_PER_ROW = 3;
const chunk = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));

const STATE_LABEL = {
  due: { label: "Awaiting decision", tone: "attention" },
  upcoming: { label: "Upcoming", tone: "progress" },
  unscheduled: { label: "Needs a date", tone: "neutral" },
  selected: { label: "Selected", tone: "success" },
  decided: { label: "Failed", tone: "closed" },
};
// Status filters double as the board summary (web pages/Interview.jsx STATUS_FILTERS), so counts and filtering agree.
const STATUS_FILTERS = [
  ["", "All"],
  ["due", "Needs a decision"],
  ["upcoming", "Upcoming"],
  ["unscheduled", "Needs a date"],
  ["selected", "Selected"],
  ["decided", "Failed"],
];

export default function InterviewBoardScreen() {
  const interviews = useQuery({ queryKey: ["interviews"], queryFn: fetchInterviews, staleTime: 5 * 60 * 1000 });
  // Candidates and statuses tell which cards belong to rejected candidates (web AdminInterviews).
  const candidates = useQuery({ queryKey: ["candidates", "all-records"], queryFn: async () => (await fetchAllPages(gateway, { action: "fetch", module: "hrc_candidates" })).records, staleTime: 5 * 60 * 1000 });
  const lookups = useWorkflowLookups();
  const [round, setRound] = useState(null);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState(null); // { record, mode: "decide" | "schedule" }

  // "Now" is when the data was fetched, so states stay stable between renders and update on refetch.
  const now = interviews.dataUpdatedAt || Date.now();
  const groups = useMemo(() => groupInterviews(interviews.data || []), [interviews.data]);
  const currentKey = round || groups[0]?.key;
  const current = groups.find((group) => group.key === currentKey);
  const all = useMemo(() => groups.flatMap((group) => group.records), [groups]);
  const stateCounts = useMemo(() => all.reduce((counts, record) => ({ ...counts, [boardState(record, now)]: (counts[boardState(record, now)] || 0) + 1 }), { "": all.length }), [all, now]);
  const cards = useMemo(() => {
    const needle = lower(search);
    const rank = (record) => BOARD_STATES.indexOf(boardState(record, now));
    return (current?.records || [])
      .filter((record) => !status || boardState(record, now) === status)
      .filter((record) => !needle || lower(`${record.name} ${record.email} ${record.job_name}`).includes(needle))
      .sort((a, b) => rank(a) - rank(b) || (interviewDate(a.interview_datetime)?.getTime() || 0) - (interviewDate(b.interview_datetime)?.getTime() || 0));
  }, [current, search, status, now]);
  const rejectedFor = (record) => {
    const candidate = findInterviewCandidate(record, candidates.data || []);
    return Boolean(candidate) && isRejected(candidate, lookups.data.status);
  };
  const refresh = () => {
    interviews.refetch();
    candidates.refetch();
    lookups.refetch();
  };

  return (
    <Screen refreshing={interviews.isFetching && !interviews.isPending} onRefresh={refresh}>
      <PageHeader
        icon="chatbubbles"
        tone="info"
        title="Interviews"
        subtitle={`Passing a round moves the candidate to the next one; passing the final round moves them to ${HIRED_WORKFLOW.stage}. Both decisions need feedback.`}
      />
      {interviews.isPending ? (
        <LoadingState label="Loading interviews…" variant="cards" />
      ) : interviews.isError ? (
        <ErrorState message={interviews.error.message} onRetry={() => interviews.refetch()} />
      ) : (
        <>
          {chunk(groups, ROUNDS_PER_ROW).map((row) => (
            <SegmentedControl key={row[0].key} options={row.map((group) => ({ label: group.name, value: group.key, count: group.records.length }))} value={currentKey} onChange={setRound} />
          ))}
          <SegmentedControl options={STATUS_FILTERS.map(([value, label]) => ({ value, label, count: stateCounts[value] || 0 }))} value={status} onChange={setStatus} />
          <SearchField value={search} onChangeText={setSearch} placeholder="Search candidate or job" />
          {candidates.isError ? <Notice tone="attention" icon="warning-outline" message="Candidate eligibility could not be loaded. Scheduling still re-checks each candidate when you save." action="Retry" onAction={refresh} /> : null}
          {cards.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title={status || search ? "No interviews match these filters" : `No one in ${current?.name || "this round"}`}
              message={status || search ? "Try another name, round or status." : "Candidates appear here when an interview is created."}
              action={status || search ? "Clear filters" : undefined}
              onAction={() => {
                setStatus("");
                setSearch("");
              }}
            />
          ) : (
            cards.map((record) => {
              const state = boardState(record, now);
              const date = interviewDate(record.interview_datetime);
              const rejected = rejectedFor(record);
              const open = !hasOutcome(record);
              const chip = rejected ? { label: "Rejected", tone: "closed" } : STATE_LABEL[state];
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
                    <Chip label={chip.label} tone={chip.tone} small numberOfLines={2} style={styles.stateChip} />
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name={date ? "calendar-outline" : "calendar-clear-outline"} size={16} color={colors.primary} style={styles.noShrink} />
                    <Text style={[type.body, styles.infoText]}>{date ? `${formatDateTime(record.interview_datetime)} · ${relativeDay(date)}` : "Not scheduled yet"}</Text>
                  </View>
                  {clean(record.interview_feedback) ? (
                    <View style={styles.feedback}>
                      <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.mutedForeground} style={styles.feedbackIcon} />
                      <Text style={[type.small, styles.infoText]}>Feedback: {plainText(record.interview_feedback)}</Text>
                    </View>
                  ) : null}
                  {open ? (
                    <Row style={{ flexWrap: "wrap", rowGap: spacing.sm }}>
                      {!rejected ? (
                        <Button title={date ? "Reschedule" : "Schedule"} icon="calendar-outline" small variant="outline" onPress={() => setAction({ record, mode: "schedule" })} style={styles.actionButton} />
                      ) : null}
                      <Button title="Record decision" icon="checkmark-done-outline" small variant="secondary" onPress={() => setAction({ record, mode: "decide" })} style={styles.actionButton} />
                    </Row>
                  ) : null}
                  {rejected && open ? <Text style={[type.small, { color: colors.destructive }]}>Scheduling is unavailable for rejected candidates.</Text> : null}
                </Card>
              );
            })
          )}
        </>
      )}

      <InterviewActionSheet key={action ? `${action.mode}-${action.record.id}` : "closed"} record={action?.record} mode={action?.mode} statusOptions={lookups.data.status} onClose={() => setAction(null)} />
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
  actionButton: { flexGrow: 1, flexBasis: 120, minHeight: 42 },
});
