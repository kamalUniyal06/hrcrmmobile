// Increment management: requests (with questionnaire progress) and the questionnaire itself.
// Web: employement/pages/IncrementManagementPage.jsx (route /increment-management),
// data: employement/api/incrementAdmin.api.js + incrementAdminData.js.
// Salary: only the requested annual salary is shown, as on the web; current salary is never loaded here.
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, spacing, tones, type } from "../../theme";
import { Avatar, Button, Card, Chip, EmptyState, ErrorState, Field, KeyValue, LoadingState, Notice, PageHeader, Row, Screen, SearchField, SectionTitle, SegmentedControl, StatTile } from "../../components/ui";
import DateField from "../../components/ui/DateField";
import {
  answerProgress,
  fetchAdminQuestions,
  fetchAdminReplies,
  fetchAdminRequest,
  fetchAdminRequests,
  filterRequestRows,
  groupAnswers,
  questionText,
  requestedAnnualSalary,
  requestIdentity,
  requestOverview,
  saveAdminQuestion,
} from "../../api/increment.api";
import { useEmployeesDirectory } from "../../hooks/queries";
import { toast } from "../../store/toastStore";
import { formatDateTime } from "../../utils/dates";
import { clean, errorMessage, fullName, lower } from "../../utils/records";

const ROOT_KEY = ["increment-admin"];
const PAGE_SIZE = 20;

export const money = (value) => (value === null || value === undefined ? "Not recorded" : `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`);
const dateText = (value) => (clean(value) ? formatDateTime(value) : "Not recorded");

const useQuestions = () => useQuery({ queryKey: [...ROOT_KEY, "questions"], queryFn: fetchAdminQuestions });

/** Directory name for a request email, falling back to the web's identity (record name or email). */
function useIdentity() {
  const employees = useEmployeesDirectory();
  const byEmail = useMemo(() => new Map((employees.data || []).map((employee) => [lower(employee.email1), employee])), [employees.data]);
  return (record) => {
    const identity = requestIdentity(record);
    const employee = byEmail.get(lower(record.name));
    return employee ? { ...identity, name: fullName(employee), email: identity.email || clean(employee.email1) } : identity;
  };
}

function ProgressBar({ progress, width = "100%" }) {
  const percent = progress.total ? Math.round((progress.answered / progress.total) * 100) : 0;
  return (
    <View style={[styles.track, { width }]} accessibilityLabel={`${percent}% answered`}>
      <View style={[styles.fill, { width: `${percent}%`, backgroundColor: progress.complete ? colors.success : colors.primary }]} />
    </View>
  );
}

function ProgressChip({ progress }) {
  return (
    <Chip
      small
      icon={progress.complete ? "checkmark-circle" : "chatbox-ellipses-outline"}
      label={progress.total ? `${progress.answered}/${progress.total} answered` : "No questions"}
      tone={progress.complete ? "success" : progress.answered ? "progress" : "neutral"}
    />
  );
}

export function IncrementRequestsScreen({ navigation, route }) {
  const initialFilter = ["complete", "awaiting"].includes(route?.params?.filter) ? route.params.filter : "all";
  const [tab, setTab] = useState(route?.params?.tab === "questions" ? "questions" : "requests");
  const questions = useQuestions();

  return (
    <Screen refreshing={questions.isFetching && !questions.isPending} onRefresh={() => questions.refetch()}>
      <PageHeader
        icon="trending-up-outline"
        tone="success"
        eyebrow="People operations · Compensation"
        title="Increment management"
        subtitle="A clear view of employee requests, their expectations, and their contributions."
      />
      <SegmentedControl
        options={[{ label: "Requests", value: "requests" }, { label: "Questions", value: "questions", count: questions.data?.length }]}
        value={tab}
        onChange={setTab}
      />
      {questions.isError ? (
        <ErrorState message={errorMessage(questions.error)} onRetry={() => questions.refetch()} />
      ) : questions.isPending ? (
        <LoadingState label="Loading increment records…" />
      ) : tab === "questions" ? (
        <QuestionList questions={questions.data} />
      ) : (
        <RequestList
          questions={questions.data}
          initialCompletion={initialFilter}
          initialSearch={clean(route?.params?.email)}
          onSelect={(id) => navigation?.navigate("IncrementRequestDetail", { id })}
          onQuestions={() => setTab("questions")}
        />
      )}
    </Screen>
  );
}

function RequestList({ questions, onSelect, onQuestions, initialCompletion, initialSearch }) {
  const identityOf = useIdentity();
  const [search, setSearch] = useState(initialSearch || "");
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch || "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [completion, setCompletion] = useState(initialCompletion);
  const invalidRange = Boolean(from && to && from > to);
  // The two date pickers sit side by side at normal text size and stack at large font scales.
  const dateBasis = 130 * useWindowDimensions().fontScale;

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setShown(PAGE_SIZE);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const query = useQuery({
    queryKey: [...ROOT_KEY, "request-collection", { search: debouncedSearch, from, to }],
    queryFn: () => fetchAdminRequests({ search: debouncedSearch, from, to }),
    enabled: !invalidRange,
  });
  const overview = useMemo(() => requestOverview(query.data?.records || [], questions, query.data?.replies || []), [query.data, questions]);
  const visibleRows = filterRequestRows(overview.rows, completion);
  const rows = visibleRows.slice(0, shown);
  const hasSearchFilters = Boolean(search || from || to);
  const hasFilters = hasSearchFilters || completion !== "all";
  const hasData = Boolean(query.data) && !invalidRange && !query.isError;
  const countHint = hasSearchFilters ? "Matching email and dates" : "Across all requests";
  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setFrom("");
    setTo("");
    setCompletion("all");
    setShown(PAGE_SIZE);
  };
  const selectCompletion = (value) => {
    setCompletion((current) => (current === value ? "all" : value));
    setShown(PAGE_SIZE);
  };
  const tile = (key) => [styles.tile, completion === key && styles.tileActive];

  return (
    <>
      <View style={styles.tiles}>
        <StatTile loading={query.isPending} icon="file-tray-full-outline" label={hasSearchFilters ? "Matching requests" : "Total requests"} value={hasData ? overview.total.toLocaleString() : "—"} hint={countHint} onPress={hasData ? () => selectCompletion("all") : undefined} style={tile("all")} />
        <StatTile loading={query.isPending} icon="checkmark-circle-outline" tone="success" label="Fully answered" value={hasData ? overview.complete : "—"} hint={countHint} onPress={hasData ? () => selectCompletion("complete") : undefined} style={tile("complete")} />
        <StatTile loading={query.isPending} icon="hourglass-outline" tone="attention" label="Awaiting answers" value={hasData ? overview.awaiting : "—"} hint={countHint} onPress={hasData ? () => selectCompletion("awaiting") : undefined} style={tile("awaiting")} />
        <StatTile icon="list-outline" tone="neutral" label="Questionnaire" value={questions.length} hint="View and edit questions" onPress={onQuestions} style={styles.tile} />
      </View>

      <Card>
        <SearchField value={search} onChangeText={setSearch} placeholder="Search by employee email" keyboardType="email-address" />
        <Row align="flex-start" style={styles.wrapRow}>
          <DateField label="Submitted from" value={from} maxKey={to} onChange={(value) => { setFrom(value); setShown(PAGE_SIZE); }} style={[styles.dateField, { flexBasis: dateBasis }]} />
          <DateField label="Submitted to" value={to} minKey={from} onChange={(value) => { setTo(value); setShown(PAGE_SIZE); }} style={[styles.dateField, { flexBasis: dateBasis }]} />
        </Row>
        <Row style={{ flexWrap: "wrap" }}>
          {completion !== "all" ? <Button title={completion === "complete" ? "Fully answered ×" : "Awaiting answers ×"} small variant="secondary" onPress={() => selectCompletion(completion)} /> : null}
          {hasFilters ? <Button title="Clear" icon="close" small variant="ghost" onPress={clearFilters} /> : null}
        </Row>
      </Card>

      {invalidRange ? (
        <Notice tone="closed" icon="alert-circle-outline" message="The end date must be on or after the start date." />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : query.isPending ? (
        <LoadingState label="Loading increment requests…" />
      ) : !rows.length ? (
        <EmptyState
          icon="clipboard-outline"
          title={hasFilters ? "No matching requests" : "No increment requests yet"}
          message={
            completion !== "all"
              ? `No ${completion === "complete" ? "fully answered requests" : "requests awaiting answers"} match the current email and dates.`
              : hasFilters
                ? "Try a different email or widen the submission dates."
                : "Employee increment requests will appear here when submitted. You can prepare the questionnaire in the Questions tab."
          }
          action={hasFilters ? "Clear filters" : undefined}
          onAction={clearFilters}
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          <Text style={styles.count}>
            {visibleRows.length.toLocaleString()} request{visibleRows.length === 1 ? "" : "s"} · tap one to review the answers
          </Text>
          {rows.map(({ record, progress }) => {
            const identity = identityOf(record);
            const salary = requestedAnnualSalary(record);
            return (
              <Card key={record.id} onPress={() => onSelect(record.id)}>
                <Row>
                  <Avatar name={identity.name.includes("@") ? identity.name.split("@")[0].replace(/[._-]+/g, " ") : identity.name} size={38} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{identity.name}</Text>
                    {identity.email && identity.email !== identity.name ? <Text style={type.small} numberOfLines={1} ellipsizeMode="tail">{identity.email}</Text> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} style={{ flexShrink: 0 }} />
                </Row>
                <View style={styles.salaryLine}>
                  <Row gap={6} style={{ flexShrink: 1, minWidth: 0 }}>
                    <View style={styles.miniIcon}>
                      <Ionicons name="cash-outline" size={12} color={tones.success.fg} />
                    </View>
                    <Text style={[type.small, { flexShrink: 1, minWidth: 0 }]}>Requested annual salary</Text>
                  </Row>
                  {salary === null ? <Text style={type.small}>Not recorded</Text> : <Text style={styles.salary} numberOfLines={1}>{money(salary)}<Text style={type.small}> / year</Text></Text>}
                </View>
                <Row style={styles.wrapRow}>
                  <ProgressBar progress={progress} width={72} />
                  <ProgressChip progress={progress} />
                </Row>
                <Row gap={6} align="flex-start">
                  <Ionicons name="calendar-outline" size={13} color={colors.mutedForeground} style={{ marginTop: 3, flexShrink: 0 }} />
                  <Text style={[type.small, { flex: 1, minWidth: 0 }]}>Submitted {dateText(record.date_entered)}</Text>
                </Row>
              </Card>
            );
          })}
          {visibleRows.length > shown ? <Button title={`Show ${Math.min(PAGE_SIZE, visibleRows.length - shown)} more`} variant="secondary" full onPress={() => setShown(shown + PAGE_SIZE)} /> : null}
        </View>
      )}
    </>
  );
}

// ─── Questionnaire ────────────────────────────────────────────────────────────

function QuestionForm({ question, onClose }) {
  const [name, setName] = useState(clean(question?.name));
  const [description, setDescription] = useState(clean(question?.description));
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => saveAdminQuestion(question?.id, { name, description }),
    onSuccess: async () => {
      toast.success(question?.id ? "Question updated." : "Question added.");
      await client.invalidateQueries({ queryKey: ROOT_KEY });
      onClose();
    },
    onError: () => client.invalidateQueries({ queryKey: ROOT_KEY }),
    retry: false,
  });
  const changed = clean(name) !== clean(question?.name) || clean(description) !== clean(question?.description);
  const edit = (setter) => (value) => {
    setter(value);
    mutation.reset();
  };

  return (
    <Card style={{ borderColor: colors.primary, borderLeftWidth: 4, gap: spacing.md }}>
      <Row gap={spacing.md} align="flex-start">
        <View style={styles.headingIcon}>
          <Ionicons name={question?.id ? "create-outline" : "add-circle-outline"} size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={[type.heading, { color: colors.navy }]}>{question?.id ? "Edit question" : "New question"}</Text>
          <Text style={type.small}>Employees answer the question text. Updates also change how the question appears beside existing responses.</Text>
        </View>
      </Row>
      <Field label="Title (required)" value={name} onChangeText={edit(setName)} editable={!mutation.isPending} placeholder="e.g. Contributions and impact" />
      <Field label="Question text (required)" value={description} onChangeText={edit(setDescription)} editable={!mutation.isPending} multiline placeholder="What contributions have had the greatest impact since your last salary review?" />
      {mutation.isError ? <Notice tone="closed" icon="alert-circle-outline" message={errorMessage(mutation.error)} /> : null}
      {/* Both actions share the row equally; at large font scales each takes its own full-width line. */}
      <View style={styles.formActions}>
        <Button title={question?.id ? "Save changes" : "Add question"} icon="checkmark-circle-outline" style={styles.formAction} loading={mutation.isPending} disabled={!name.trim() || !description.trim() || !changed} onPress={() => mutation.mutate()} />
        <Button title="Cancel" icon="close-outline" variant="outline" style={styles.formAction} disabled={mutation.isPending} onPress={onClose} />
      </View>
    </Card>
  );
}

function QuestionList({ questions }) {
  const [editing, setEditing] = useState(null);
  return (
    <>
      <SectionTitle title={`Review questionnaire · ${questions.length}`} hint="Questions employees answer to support their increment request." />
      <Button title="Add question" icon="add" small disabled={editing !== null} onPress={() => setEditing({})} />
      {editing !== null ? <QuestionForm key={editing.id || "new"} question={editing} onClose={() => setEditing(null)} /> : null}
      {questions.length ? (
        questions.map((question, index) => (
          <Card key={question.id} style={editing?.id === question.id ? { backgroundColor: colors.primarySoft } : undefined}>
            <Row align="flex-start">
              <View style={styles.number}>
                <Text style={styles.numberText}>{String(index + 1).padStart(2, "0")}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Text style={styles.cardTitle}>{clean(question.name) || "Untitled question"}</Text>
                <Text style={type.small}>{clean(question.description) || questionText(question)}</Text>
              </View>
            </Row>
            <Button title="Edit" icon="create-outline" small variant="outline" style={{ alignSelf: "flex-end" }} disabled={editing !== null} onPress={() => setEditing(question)} />
          </Card>
        ))
      ) : editing === null ? (
        <EmptyState icon="help-circle-outline" title="Build your review questionnaire" message="Add questions about contributions, responsibilities, and salary expectations to give reviewers useful context." />
      ) : null}
      {questions.length ? (
        <Notice icon="information-circle-outline" tone="neutral" message="All configured questions are part of the employee questionnaire. Adding a question may change the completion count for earlier requests." />
      ) : null}
    </>
  );
}

// ─── Request detail ───────────────────────────────────────────────────────────

/** Route "IncrementRequestDetail", params { id }. */
export function IncrementRequestDetailScreen({ route }) {
  const id = route?.params?.id;
  const identityOf = useIdentity();
  const questions = useQuestions();
  const recordQuery = useQuery({ queryKey: [...ROOT_KEY, "request", id], queryFn: () => fetchAdminRequest(id) });
  const repliesQuery = useQuery({ queryKey: [...ROOT_KEY, "replies", id], queryFn: () => fetchAdminReplies(id) });
  const refresh = () => {
    recordQuery.refetch();
    repliesQuery.refetch();
    questions.refetch();
  };

  if (recordQuery.isError) return <Screen><ErrorState message={errorMessage(recordQuery.error)} onRetry={() => recordQuery.refetch()} /></Screen>;
  if (recordQuery.isPending || questions.isPending) return <Screen><LoadingState label="Loading request…" /></Screen>;
  if (questions.isError) return <Screen><ErrorState message={errorMessage(questions.error)} onRetry={() => questions.refetch()} /></Screen>;

  const record = recordQuery.data;
  const replies = repliesQuery.data || [];
  const identity = identityOf(record);
  const salary = requestedAnnualSalary(record);
  const groups = groupAnswers(questions.data, replies, id);
  const progress = answerProgress(questions.data, replies, id);
  const repliesReady = !repliesQuery.isError && !repliesQuery.isPending;
  const percent = progress.total ? Math.round((progress.answered / progress.total) * 100) : 0;

  return (
    <Screen refreshing={recordQuery.isFetching || repliesQuery.isFetching} onRefresh={refresh}>
      <Card>
        <Text style={type.tiny}>Increment request</Text>
        <Row>
          <Avatar name={identity.name.includes("@") ? identity.name.split("@")[0].replace(/[._-]+/g, " ") : identity.name} size={52} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.heading, { color: colors.navy }]}>{identity.name}</Text>
            {identity.email && identity.email !== identity.name ? <Text style={type.small} selectable>{identity.email}</Text> : null}
          </View>
        </Row>
        <Row style={{ flexWrap: "wrap" }}>
          <Chip small icon="calendar-outline" label={`Submitted ${dateText(record.date_entered)}`} />
          {repliesReady ? <ProgressChip progress={progress} /> : null}
        </Row>
        <View style={styles.salaryBox}>
          <View style={styles.salaryIcon}>
            <Ionicons name="cash-outline" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={type.small}>Requested annual salary</Text>
            <Text style={salary === null ? type.small : styles.salaryBig} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{money(salary)}</Text>
          </View>
        </View>
      </Card>

      <Card>
        <Row style={{ justifyContent: "space-between" }} align="flex-start" gap={spacing.md}>
          <View style={[styles.headingIcon, { backgroundColor: tones.info.bg }]}>
            <Ionicons name="chatbubbles-outline" size={18} color={tones.info.fg} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.heading, { color: colors.navy }]}>Questionnaire</Text>
            <Text style={type.small}>Employee responses, shown as submitted.</Text>
          </View>
          {repliesReady ? <Text style={[styles.percent, { flexShrink: 0 }]} numberOfLines={1}>{percent}%</Text> : null}
        </Row>
        {repliesReady ? (
          <>
            <ProgressBar progress={progress} />
            <Text style={type.small}>
              {progress.total ? `${progress.answered} of ${progress.total} answered · ` : "No questions configured · "}
              {progress.complete ? "Questionnaire complete" : progress.answered ? "Partially answered" : "Awaiting responses"}
            </Text>
          </>
        ) : null}
      </Card>

      {repliesQuery.isError ? (
        <ErrorState message={errorMessage(repliesQuery.error)} onRetry={() => repliesQuery.refetch()} />
      ) : repliesQuery.isPending ? (
        <LoadingState label="Loading answers…" />
      ) : groups.length ? (
        groups.map((group, index) => {
          const answered = group.replies.some((reply) => clean(reply.description));
          return (
            <Card key={group.id}>
              <Row align="flex-start">
                <View style={[styles.number, answered && { backgroundColor: tones.success.bg }]}>
                  {answered ? <Ionicons name="checkmark" size={15} color={tones.success.fg} /> : <Text style={styles.numberText}>{index + 1}</Text>}
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <Text style={type.tiny}>Question {index + 1}</Text>
                  <Text style={styles.cardTitle}>{group.missing ? "Archived or unavailable question" : questionText(group.question)}</Text>
                  {group.missing ? <Text style={type.small}>The original question is unavailable. Its saved responses are preserved below.</Text> : null}
                </View>
              </Row>
              {group.replies.length ? (
                group.replies.map((reply) => (
                  <View key={reply.id} style={styles.reply}>
                    <Text style={[type.body, !clean(reply.description) && { fontStyle: "italic", color: colors.mutedForeground }]} selectable>
                      {clean(reply.description) || "Empty response"}
                    </Text>
                    {reply.date_entered || clean(reply.name).includes("@") ? (
                      <Text style={[type.small, { fontSize: 12, lineHeight: 16 }]}>
                        {[reply.date_entered ? dateText(reply.date_entered) : "", clean(reply.name).includes("@") ? reply.name : ""].filter(Boolean).join(" · ")}
                      </Text>
                    ) : null}
                  </View>
                ))
              ) : (
                <View style={styles.unanswered}>
                  <Ionicons name="hourglass-outline" size={13} color={colors.mutedForeground} style={{ flexShrink: 0 }} />
                  <Text style={[type.small, { fontStyle: "italic", flexShrink: 1 }]}>Not answered yet</Text>
                </View>
              )}
            </Card>
          );
        })
      ) : (
        <EmptyState icon="help-circle-outline" title="No questionnaire responses" message="This request has no saved responses and there are no questions configured." />
      )}

      <Card>
        <Row gap={spacing.md}>
          <View style={styles.headingIcon}>
            <Ionicons name="document-text-outline" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.cardTitle, { flex: 1, minWidth: 0 }]}>Request details</Text>
        </Row>
        <KeyValue label="Requested annual salary · INR" value={money(salary)} />
        <KeyValue label="Submitted" value={dateText(record.date_entered)} />
        <KeyValue label="Last updated" value={dateText(record.date_modified)} />
        <KeyValue label="Questionnaire" value={repliesReady ? (progress.total ? `${progress.answered} of ${progress.total} answered` : "No questions") : "Loading…"} last />
        {salary === null && clean(record.description) ? (
          <View style={styles.reply}>
            <Text style={type.tiny}>Request notes</Text>
            <Text style={type.body}>{record.description}</Text>
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  tile: { minWidth: "45%" },
  tileActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
  wrapRow: { flexWrap: "wrap", rowGap: spacing.sm },
  dateField: { flexGrow: 1, minWidth: 0 },
  // Label and figure share a line when they fit, otherwise the figure wraps under the label.
  salaryLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", columnGap: spacing.sm, rowGap: 2 },
  salary: { flexShrink: 0, maxWidth: "100%", fontSize: 17, lineHeight: 22, fontWeight: "600", color: colors.navy, fontVariant: ["tabular-nums"] },
  salaryBox: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  salaryIcon: { flexShrink: 0, width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  salaryBig: { fontSize: 22, lineHeight: 28, fontWeight: "600", color: colors.navy, fontVariant: ["tabular-nums"] },
  percent: { fontSize: 20, lineHeight: 26, fontWeight: "600", color: colors.navy, fontVariant: ["tabular-nums"] },
  cardTitle: { fontSize: 16, lineHeight: 22, fontWeight: "600", color: colors.navy },
  count: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.mutedForeground },
  headingIcon: { flexShrink: 0, width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  miniIcon: { flexShrink: 0, width: 20, height: 20, borderRadius: 6, backgroundColor: tones.success.bg, alignItems: "center", justifyContent: "center" },
  formActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  formAction: { flexGrow: 1, flexBasis: 140, minWidth: 0, minHeight: 50, paddingHorizontal: spacing.md, alignSelf: "stretch" },
  number: { flexShrink: 0, width: 32, height: 32, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  numberText: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: colors.primary, fontVariant: ["tabular-nums"] },
  reply: { gap: 6, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  unanswered: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", maxWidth: "100%", paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border },
});
