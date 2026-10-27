import { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, shadow, tones, type } from "../../theme";
import { Avatar, Button, Card, Chip, EmptyState, ErrorState, KeyValue, LoadingState, Notice, PageHeader, Row, Screen, SearchField, SectionTitle, SegmentedControl, SelectField, SkeletonRows, SkeletonText, StatTile } from "../../components/ui";
import { candidateName, candidatePhase, candidateStage, candidateStatus, changeCandidateWorkflow, fetchCandidatePage, fetchCandidateRecord, fetchInterviews, fetchShortlist, hasOutcome, roundName, workflowValue } from "../../api/admin.api";
import CandidateEditSheet from "../../components/recruitment/CandidateEditSheet";
import CandidateFilterSheet from "../../components/recruitment/CandidateFilterSheet";
import InterviewActionSheet from "../../components/recruitment/InterviewActionSheet";
import ScheduleInterviewSheet from "../../components/recruitment/ScheduleInterviewSheet";
import useWorkflowLookups from "../../components/recruitment/useWorkflowLookups";
import { toast } from "../../store/toastStore";
import { formatDate, formatDateTime } from "../../utils/dates";
import { errorMessage, lower, plainText } from "../../utils/records";
import { NO_FILTERS, SORT_OPTIONS, currentMonthRange, filterShortlist, interviewCounts, interviewsForCandidate, parseSort, readResumeSections, sortRequest } from "../../utils/recruitment";

const VIEWS = [{ label: "All", value: "all" }, { label: "Shortlisted", value: "shortlisted" }];

function stageTone(stage) {
  const value = lower(stage);
  if (/short/.test(value)) return "lime";
  if (/join|hired|select/.test(value)) return "success";
  if (/reject/.test(value)) return "closed";
  if (/interview/.test(value)) return "progress";
  return "neutral";
}

const SHORTLIST_STEP = 20;
const DEFAULT_SORT = { all: { key: "date_entered", direction: -1 }, shortlisted: { key: "name", direction: 1 } };
const sortValue = (sort) => `${sort.key}:${sort.direction}`;

// Candidates list (web: pages/candidates/CandidatesPage.jsx). Data: Smart Gateway `fetch` on hrc_candidates,
// 20 per page — see buildCandidateListRequest in api/admin.api.js. "All" is searched, filtered (stage, phase,
// status, source), dated and sorted on the server; the shortlist is loaded whole and narrowed on the phone.
export function CandidatesScreen({ navigation, route }) {
  const [view, setView] = useState(route?.params?.view === "shortlisted" ? "shortlisted" : "all");
  const [search, setSearch] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [filters, setFilters] = useState(NO_FILTERS);
  const [sort, setSort] = useState(DEFAULT_SORT[view]);
  const [defaultRange] = useState(() => currentMonthRange());
  const [dateRange, setDateRange] = useState(defaultRange);
  const [filtering, setFiltering] = useState(false);
  const [shown, setShown] = useState(SHORTLIST_STEP);

  // Like the web, switching views starts from a clean search, filters and the view's default order.
  const switchView = (next) => {
    setView(next);
    setSearch("");
    setSubmitted("");
    setFilters(NO_FILTERS);
    setSort(DEFAULT_SORT[next]);
    setShown(SHORTLIST_STEP);
  };
  // The side menu opens this tab with { view } for its "Candidates" and "Shortlisted" links.
  const requestedView = route?.params?.view;
  useEffect(() => {
    if (requestedView) switchView(requestedView === "shortlisted" ? "shortlisted" : "all");
  }, [requestedView]);
  // The search runs on the server: send it once typing pauses (or straight away on the keyboard's Search key).
  useEffect(() => {
    const timer = setTimeout(() => setSubmitted(search.trim()), 450);
    return () => clearTimeout(timer);
  }, [search]);

  const shortlisted = view === "shortlisted";
  const lookups = useWorkflowLookups();
  const serverFilters = shortlisted ? {} : { search: submitted, workflow: { stage: filters.stage, phase: filters.phase, status: filters.status }, source: filters.source };
  const serverFilterActive = Boolean(serverFilters.search || Object.values(serverFilters.workflow || {}).some(Boolean) || serverFilters.source);
  const request = { ...sortRequest(sort), dateRange, ...serverFilters };
  const directory = useInfiniteQuery({
    queryKey: ["candidates", "list", "page", request],
    queryFn: ({ pageParam = 1 }) => fetchCandidatePage({ ...request, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    staleTime: 5 * 60 * 1000,
  });
  // The "this period" tile counts everyone in the period, so a filtered list needs its own unfiltered total.
  const periodTotal = useQuery({
    queryKey: ["candidates", "list", "period-total", dateRange],
    queryFn: async () => (await fetchCandidatePage({ dateRange, perPage: 1 })).total,
    enabled: serverFilterActive,
  });
  const shortlist = useQuery({ queryKey: ["candidates", "list", "shortlisted", dateRange], queryFn: () => fetchShortlist({ dateRange }), staleTime: 5 * 60 * 1000 });
  const interviews = useQuery({ queryKey: ["interviews"], queryFn: fetchInterviews, staleTime: 5 * 60 * 1000 });

  const firstPage = directory.data?.pages?.[0];
  const periodCount = serverFilterActive ? periodTotal.data : firstPage?.total;
  const counts = useMemo(() => interviewCounts(interviews.data || []), [interviews.data]);
  const sources = useMemo(
    () => Object.entries(firstPage?.dropdownLists?.candidate_source || {}).filter(([key, label]) => key && label).map(([value, label]) => ({ value, label: plainText(label) })),
    [firstPage],
  );
  const loaded = useMemo(() => (directory.data?.pages || []).flatMap((page) => page.records), [directory.data]);
  const narrowed = useMemo(
    () => (shortlisted ? filterShortlist(shortlist.data || [], { search, filters, sort, lookups: lookups.data }) : []),
    // lookups.data is rebuilt every render; its option lists are what matter.
    [shortlisted, shortlist.data, search, filters, sort, lookups.data.stage, lookups.data.phase, lookups.data.status], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const records = shortlisted ? narrowed.slice(0, shown) : loaded;
  const source = shortlisted ? shortlist : directory;
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const filtered = Boolean((shortlisted ? search.trim() : submitted) || activeFilters);
  const total = shortlisted ? narrowed.length : firstPage?.total;
  const customRange = dateRange.fromDate !== defaultRange.fromDate || dateRange.toDate !== defaultRange.toDate;

  const refresh = () => {
    source.refetch();
    if (serverFilterActive) periodTotal.refetch();
    interviews.refetch();
    lookups.refetch();
  };
  const clearAll = () => {
    setSearch("");
    setSubmitted("");
    setFilters(NO_FILTERS);
  };

  return (
    <Screen refreshing={source.isRefetching} onRefresh={refresh}>
      <PageHeader icon="person-add" tone="info" title="Candidates" subtitle="Manage candidates, interviews and decisions in one place." />

      <View style={styles.tiles}>
        <StatTile icon="people-outline" tone="info" label="Candidates this period" hint="Assigned to the pipeline" loading={serverFilterActive ? periodTotal.isPending : directory.isPending} value={periodCount ?? "—"} onPress={() => switchView("all")} style={styles.tile} />
        <StatTile icon="bookmark-outline" tone="success" label="Shortlisted" hint="Ready for interviews" loading={shortlist.isPending} value={shortlist.data?.length ?? "—"} onPress={() => switchView("shortlisted")} style={styles.tile} />
        <StatTile icon="calendar-outline" tone="progress" label="Upcoming interviews" hint="Scheduled ahead" loading={interviews.isPending} value={interviews.isPending ? "—" : counts.upcoming} onPress={() => navigation.navigate("InterviewBoard")} style={styles.tile} />
        <StatTile icon="time-outline" tone="attention" label="Awaiting a date" hint="Rounds to schedule" loading={interviews.isPending} value={interviews.isPending ? "—" : counts.unscheduled} onPress={() => navigation.navigate("InterviewBoard")} style={styles.tile} />
      </View>

      <SegmentedControl options={VIEWS} value={view} onChange={switchView} />
      <SearchField
        value={search}
        onChangeText={(value) => {
          setSearch(value);
          setShown(SHORTLIST_STEP);
        }}
        onSubmit={setSubmitted}
        placeholder={shortlisted ? "Search shortlist" : "Search name, role, phone or email"}
      />
      <View style={styles.toolbar}>
        <Button title={activeFilters ? `Filter · ${activeFilters}` : "Filter & sort"} icon="options-outline" variant={activeFilters ? "secondary" : "outline"} small onPress={() => setFiltering(true)} />
        <Pressable onPress={() => setFiltering(true)} accessibilityRole="button" accessibilityLabel="Change date range" style={styles.period}>
          <Ionicons name="calendar-outline" size={14} color={customRange ? colors.primary : colors.mutedForeground} style={{ flexShrink: 0 }} />
          <Text style={[type.small, { flexShrink: 1 }, customRange && { color: colors.primary }]} numberOfLines={1}>
            {formatDate(dateRange.fromDate, { year: false })} – {formatDate(dateRange.toDate)}
          </Text>
        </Pressable>
      </View>
      <Text style={type.small}>
        {total === undefined ? " " : `${total} ${filtered ? "matching " : ""}${shortlisted ? "shortlisted" : "candidates"} · ${SORT_OPTIONS.find((option) => option.value === sortValue(sort))?.label || ""}`}
      </Text>
      {lookups.isError ? <Notice tone="attention" icon="warning-outline" message="Some workflow names could not be loaded." action="Retry" onAction={lookups.refetch} /> : null}

      {source.isPending ? (
        <LoadingState label="Loading candidates…" variant="cards" />
      ) : source.isError ? (
        <ErrorState message={source.error.message} onRetry={() => source.refetch()} />
      ) : records.length === 0 ? (
        <EmptyState
          icon="person-outline"
          title={filtered ? "No matching candidates" : shortlisted ? "Your shortlist starts here" : "No candidates in this period"}
          message={filtered ? "Try a different search or clear your filters." : shortlisted ? "Shortlisted candidates appear here." : "Try a wider date range. Candidates appear once their stage, phase and status are assigned."}
          action={filtered ? "Clear filters" : undefined}
          onAction={clearAll}
        />
      ) : (
        <View style={{ gap: 10 }}>
          {records.map((record) => (
            <CandidateCard key={record.id} record={record} onPress={() => navigation.navigate("CandidateDetail", { id: record.id })} />
          ))}
          {shortlisted ? (
            narrowed.length > shown ? <Button title="Show more" variant="outline" full onPress={() => setShown((count) => count + SHORTLIST_STEP)} /> : null
          ) : directory.hasNextPage ? (
            <Button title="Load more" variant="outline" full loading={directory.isFetchingNextPage} onPress={() => directory.fetchNextPage()} />
          ) : null}
        </View>
      )}

      <CandidateFilterSheet
        key={filtering ? "open" : "closed"}
        visible={filtering}
        initial={{ filters, sort: sortValue(sort), dateRange }}
        defaultRange={defaultRange}
        lookups={lookups.data}
        sources={sources}
        onClose={() => setFiltering(false)}
        onApply={(next) => {
          setFilters(next.filters);
          setSort(parseSort(next.sort));
          setDateRange(next.dateRange);
          setShown(SHORTLIST_STEP);
          setFiltering(false);
        }}
      />
    </Screen>
  );
}

function CandidateCard({ record, onPress }) {
  const name = candidateName(record);
  const stage = candidateStage(record);
  const designation = plainText(record.current_designation || record.title);
  const email = plainText(record.email1);
  const phone = plainText(record.phone_mobile || record.phone_work);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
      <View style={styles.cardHead}>
        <Avatar name={name} size={44} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={styles.name} numberOfLines={2}>{name}</Text>
          <Text style={type.small} numberOfLines={2}>{designation || "Candidate"}</Text>
        </View>
        <View style={styles.stage}>
          <Chip label={stage} tone={stageTone(stage)} small numberOfLines={2} />
        </View>
      </View>

      {email || phone ? (
        <View style={styles.contact}>
          {email ? <ContactLine icon="mail-outline" text={email} /> : null}
          {phone ? <ContactLine icon="call-outline" text={phone} /> : null}
        </View>
      ) : null}

      <View style={styles.tags}>
        <Tag label="Phase" value={candidatePhase(record)} />
        <Tag label="Status" value={candidateStatus(record)} />
      </View>

      <View style={styles.cardFoot}>
        <View style={styles.added}>
          <Ionicons name="time-outline" size={13} color={colors.mutedForeground} style={{ flexShrink: 0 }} />
          <Text style={[type.small, { flexShrink: 1, minWidth: 0 }]} numberOfLines={1}>Added {formatDate(record.date_entered)}</Text>
        </View>
        <View style={styles.open}>
          <Text style={styles.openText} numberOfLines={1}>Open</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} style={{ flexShrink: 0 }} />
        </View>
      </View>
    </Pressable>
  );
}

function ContactLine({ icon, text }) {
  return (
    <View style={styles.contactLine}>
      <View style={styles.contactIcon}>
        <Ionicons name={icon} size={13} color={tones.info.fg} />
      </View>
      <Text style={styles.contactText} numberOfLines={1} ellipsizeMode="tail">{text}</Text>
    </View>
  );
}

function Tag({ label, value }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.tagValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

/** CRM values can be (escaped) HTML; show them as plain text, or nothing when empty. */
const text = (value) => plainText(value) || undefined;

// Candidate profile (web CandidatePanel.jsx): change stage or status in place, schedule Round 1, reschedule or
// decide open rounds, and edit the profile (CandidateDetails.jsx). Rejected candidates can't be scheduled.
export function CandidateDetailScreen({ route }) {
  const { id } = route.params;
  const queryClient = useQueryClient();
  const candidate = useQuery({ queryKey: ["candidates", "record", id], queryFn: () => fetchCandidateRecord(id) });
  // Same interview list as the board, so a decision here and there read and write the same records.
  const interviews = useQuery({ queryKey: ["interviews"], queryFn: fetchInterviews, staleTime: 5 * 60 * 1000 });
  const lookups = useWorkflowLookups();
  const [scheduling, setScheduling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [action, setAction] = useState(null); // { record, mode } for an interview round
  const record = candidate.data;

  const workflow = useMutation({
    mutationFn: ({ kind, name }) => changeCandidateWorkflow(record, kind, name, lookups.data[kind] || []),
    onSuccess: (data, { name }) => {
      queryClient.setQueryData(["candidates", "record", id], (previous) => (previous ? { ...previous, ...data } : previous));
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["candidate-profile"] });
      toast.success(`${candidateName(record)} moved to ${name}`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (candidate.isPending) return <Screen><LoadingState label="Loading candidate…" variant="cards" /></Screen>;
  if (candidate.isError) return <Screen><ErrorState message={candidate.error.message} onRetry={() => candidate.refetch()} /></Screen>;

  const name = candidateName(record);
  const email = plainText(record.email1);
  const phone = plainText(record.phone_mobile || record.phone_work || record.phone);
  const designation = plainText(record.current_designation || record.title);
  const linkedin = plainText(record.linkedin_url);
  const stage = workflowValue(record, "stage", lookups.data.stage);
  const status = workflowValue(record, "status", lookups.data.status);
  const rejected = lower(status) === "rejected";
  const about = plainText(readResumeSections(record.description || "").about);
  const location = [record.primary_address_city, record.primary_address_state, record.primary_address_country].map((value) => plainText(value)).filter(Boolean).join(", ");
  const rounds = interviewsForCandidate(interviews.data || [], record);
  // Web: the current value first, then every option, without duplicates.
  const choices = (kind, current) => [...new Set([current, ...(lookups.data[kind] || []).map((option) => plainText(option.name))])].filter(Boolean);
  const changeTo = (kind, current) => (next) => {
    if (next !== current && !workflow.isPending) workflow.mutate({ kind, name: next });
  };

  return (
    <Screen refreshing={candidate.isFetching} onRefresh={() => { candidate.refetch(); interviews.refetch(); lookups.refetch(); }}>
      <Card style={{ gap: 12 }}>
        <Row align="flex-start" gap={12}>
          <Avatar name={name} size={56} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={[type.heading, { color: colors.navy }]}>{name}</Text>
            <Text style={type.small}>{designation || "Candidate"}</Text>
          </View>
        </Row>
        <Row style={{ flexWrap: "wrap", rowGap: 6 }}>
          <Chip label={stage} tone={stageTone(stage)} style={{ alignSelf: "flex-start" }} />
          <Chip label={workflowValue(record, "phase", lookups.data.phase)} tone="neutral" style={{ alignSelf: "flex-start" }} />
          <Chip label={status} tone={rejected ? "closed" : "progress"} style={{ alignSelf: "flex-start" }} />
        </Row>
        {email || phone || linkedin ? (
          <Row style={{ flexWrap: "wrap", rowGap: 8 }}>
            {email ? <Button title="Email" icon="mail-outline" small variant="outline" style={styles.contactButton} onPress={() => Linking.openURL(`mailto:${email}`)} /> : null}
            {phone ? <Button title="Call" icon="call-outline" small variant="outline" style={styles.contactButton} onPress={() => Linking.openURL(`tel:${phone}`)} /> : null}
            {linkedin ? <Button title="LinkedIn" icon="logo-linkedin" small variant="outline" style={styles.contactButton} onPress={() => Linking.openURL(linkedin)} /> : null}
          </Row>
        ) : null}
        <Row style={{ flexWrap: "wrap", rowGap: 8 }}>
          <Button title="Schedule interview" icon="calendar-outline" small style={styles.contactButton} disabled={rejected} onPress={() => setScheduling(true)} />
          <Button title="Edit profile" icon="create-outline" small variant="secondary" style={styles.contactButton} onPress={() => setEditing(true)} />
        </Row>
      </Card>

      <Card style={{ gap: 10 }}>
        <Text style={type.subheading}>Current stage</Text>
        {/* Changing either saves straight away, like the web panel's inline selects. */}
        <SelectField label="Stage" value={stage} options={choices("stage", stage)} onChange={changeTo("stage", stage)} />
        <SelectField label="Status" value={status} options={choices("status", status)} onChange={changeTo("status", status)} />
        {workflow.isPending ? <Text style={type.small}>Saving…</Text> : !lookups.data.stage || !lookups.data.status ? <SkeletonText lines={1} /> : null}
      </Card>

      <Card style={{ gap: 0 }}>
        <Text style={[type.subheading, { marginBottom: 4 }]}>Profile</Text>
        <KeyValue label="Email" value={email || undefined} />
        <KeyValue label="Phone" value={phone || undefined} />
        <KeyValue label="Location" value={location || undefined} />
        <KeyValue label="Experience" value={text(record.total_experience || record.experience)} />
        <KeyValue label="Current CTC" value={text(record.current_ctc || record.ctc)} />
        <KeyValue label="Expected CTC" value={text(record.expected_ctc)} />
        <KeyValue label="Notice period" value={text(record.notice_period)} />
        <KeyValue label="Source" value={text(record.candidate_source)} />
        <KeyValue label="Added" value={formatDate(record.date_entered)} last />
      </Card>

      {/* Parsed-resume JSON is often stored in the description; only its readable "about" is shown. */}
      {about ? (
        <Card>
          <Text style={type.subheading}>About</Text>
          <Text style={type.body}>{about}</Text>
        </Card>
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionTitle title="Interviews" hint={interviews.isPending ? undefined : `${rounds.length} round${rounds.length === 1 ? "" : "s"}`} />
        {rejected ? <Notice tone="closed" icon="alert-circle-outline" message="This candidate is rejected, so interviews can't be scheduled." /> : null}
        {interviews.isPending ? (
          <Card><SkeletonRows count={2} avatar={false} label="Loading interviews…" /></Card>
        ) : interviews.isError ? (
          <ErrorState message={interviews.error.message} onRetry={() => interviews.refetch()} />
        ) : rounds.length === 0 ? (
          <EmptyState icon="calendar-outline" title="No interviews yet" message="Rounds appear here once they are scheduled." />
        ) : (
          rounds.map((interview) => {
            const result = plainText(interview.interview_status) || "Pending";
            const feedback = plainText(interview.interview_feedback);
            const scheduled = Boolean(interview.interview_datetime);
            return (
              <Card key={interview.id} style={{ gap: 6 }}>
                <Row align="flex-start">
                  <Text style={[type.subheading, { flex: 1, minWidth: 0 }]}>{roundName(interview)}</Text>
                  <Chip label={result} tone={/pass/i.test(result) ? "success" : /fail/i.test(result) ? "closed" : "attention"} small style={{ alignSelf: "flex-start" }} />
                </Row>
                <Row gap={6}>
                  <Ionicons name="time-outline" size={14} color={colors.mutedForeground} style={{ flexShrink: 0 }} />
                  <Text style={[type.small, { flex: 1, minWidth: 0 }]}>{scheduled ? formatDateTime(interview.interview_datetime) : "Not scheduled"}</Text>
                </Row>
                {feedback ? <Text style={type.small}>Feedback: {feedback}</Text> : null}
                {!hasOutcome(interview) && !rejected ? (
                  <Row style={{ flexWrap: "wrap", rowGap: 8, marginTop: 4 }}>
                    <Button title={scheduled ? "Reschedule" : "Schedule"} icon="calendar-outline" small variant="outline" style={styles.contactButton} onPress={() => setAction({ record: interview, mode: "schedule" })} />
                    <Button title="Record decision" icon="checkmark-done-outline" small variant="secondary" style={styles.contactButton} onPress={() => setAction({ record: interview, mode: "decide" })} />
                  </Row>
                ) : null}
              </Card>
            );
          })
        )}
      </View>

      <ScheduleInterviewSheet key={scheduling ? `schedule-${id}` : "schedule-closed"} candidate={scheduling ? record : null} statusOptions={lookups.data.status} onClose={() => setScheduling(false)} />
      <CandidateEditSheet key={editing ? `edit-${id}` : "edit-closed"} record={editing ? record : null} lookups={lookups.data} onClose={() => setEditing(false)} />
      <InterviewActionSheet key={action ? `${action.mode}-${action.record.id}` : "action-closed"} record={action?.record} mode={action?.mode} statusOptions={lookups.data.status} onClose={() => setAction(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { flexGrow: 1, flexBasis: "45%", minWidth: 0 },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 10 },
  period: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  card: { gap: 12, padding: 14, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, ...shadow.card },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  stage: { flexShrink: 0, maxWidth: "36%", alignItems: "flex-end" },
  contact: { gap: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.background },
  name: { ...type.subheading, color: colors.navy },
  contactLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  contactIcon: { flexShrink: 0, width: 24, height: 24, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: tones.info.bg },
  contactButton: { flexGrow: 1, flexBasis: 90 },
  added: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 4 },
  contactText: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18, color: colors.foreground },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 4, maxWidth: "100%", paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.muted },
  tagLabel: { fontSize: 11, lineHeight: 15, color: colors.mutedForeground },
  tagValue: { flexShrink: 1, fontSize: 12, lineHeight: 17, fontWeight: "600", color: colors.foreground },
  cardFoot: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  open: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 2 },
  openText: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.primary },
});
