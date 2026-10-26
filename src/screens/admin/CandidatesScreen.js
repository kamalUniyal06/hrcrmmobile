import { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, shadow, tones, type } from "../../theme";
import { Avatar, Button, Card, Chip, EmptyState, ErrorState, KeyValue, LoadingState, PageHeader, Row, Screen, SearchField, SectionTitle, SegmentedControl } from "../../components/ui";
import { candidateName, candidatePhase, candidateStage, candidateStatus, fetchCandidateInterviews, fetchCandidatePage, fetchCandidateRecord, roundName } from "../../api/admin.api";
import { formatDate, formatDateTime } from "../../utils/dates";
import { lower, plainText } from "../../utils/records";

const VIEWS = [{ label: "All", value: "all" }, { label: "Shortlisted", value: "shortlisted" }];

function stageTone(stage) {
  const value = lower(stage);
  if (/short/.test(value)) return "lime";
  if (/join|hired|select/.test(value)) return "success";
  if (/reject/.test(value)) return "closed";
  if (/interview/.test(value)) return "progress";
  return "neutral";
}

// Candidates list (web: pages/candidates/CandidatesPage.jsx). Data: Smart Gateway `fetch` on hrc_candidates,
// 20 per page, newest first — see buildCandidateListRequest in api/admin.api.js.
export function CandidatesScreen({ navigation, route }) {
  const [view, setView] = useState(route?.params?.view === "shortlisted" ? "shortlisted" : "all");
  // The side menu opens this tab with { view } for its "Candidates" and "Shortlisted" links.
  const requestedView = route?.params?.view;
  useEffect(() => {
    if (requestedView) setView(requestedView === "shortlisted" ? "shortlisted" : "all");
  }, [requestedView]);
  const [search, setSearch] = useState("");
  const [submitted, setSubmitted] = useState("");
  // The search runs on the server: send it once typing pauses (or straight away on the keyboard's Search key).
  useEffect(() => {
    const timer = setTimeout(() => setSubmitted(search.trim()), 450);
    return () => clearTimeout(timer);
  }, [search]);

  const shortlisted = view === "shortlisted";
  const query = useInfiniteQuery({
    queryKey: ["candidates", "list", view, shortlisted ? "" : submitted],
    queryFn: ({ pageParam = 1 }) => fetchCandidatePage({ page: pageParam, shortlistedOnly: shortlisted, search: submitted }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    staleTime: 5 * 60 * 1000,
  });

  const loaded = useMemo(() => (query.data?.pages || []).flatMap((page) => page.records), [query.data]);
  // The shortlist request carries no search (as on the web), so it is narrowed on the phone.
  const records = useMemo(() => {
    const needle = lower(submitted);
    if (!shortlisted || !needle) return loaded;
    return loaded.filter((record) => lower([candidateName(record), record.email1, record.phone_mobile, record.current_designation, record.title].map((value) => plainText(value)).join(" ")).includes(needle));
  }, [loaded, submitted, shortlisted]);
  const total = query.data?.pages?.[0]?.total;

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <PageHeader
        icon="person-add"
        tone="info"
        title="Candidates"
        subtitle={total !== undefined ? `${total} ${shortlisted ? "shortlisted" : "in the pipeline"}` : "Everyone in the hiring pipeline."}
      />
      <SegmentedControl options={VIEWS} value={view} onChange={setView} />
      <SearchField value={search} onChangeText={setSearch} onSubmit={setSubmitted} placeholder="Search name, email, phone or role" />
      {query.isPending ? (
        <LoadingState label="Loading candidates…" />
      ) : query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
      ) : records.length === 0 ? (
        <EmptyState icon="person-outline" title="No candidates" message={submitted ? "No one matches that search." : "New candidates appear here as they apply."} />
      ) : (
        <View style={{ gap: 10 }}>
          {records.map((record) => (
            <CandidateCard key={record.id} record={record} onPress={() => navigation.navigate("CandidateDetail", { id: record.id })} />
          ))}
          {query.hasNextPage ? <Button title="Load more" variant="outline" full loading={query.isFetchingNextPage} onPress={() => query.fetchNextPage()} /> : null}
        </View>
      )}
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

export function CandidateDetailScreen({ route }) {
  const { id } = route.params;
  const candidate = useQuery({ queryKey: ["candidates", "record", id], queryFn: () => fetchCandidateRecord(id) });
  const interviews = useQuery({ queryKey: ["candidates", "interviews", id], queryFn: () => fetchCandidateInterviews(id) });
  const record = candidate.data;

  if (candidate.isPending) return <Screen><LoadingState label="Loading candidate…" /></Screen>;
  if (candidate.isError) return <Screen><ErrorState message={candidate.error.message} onRetry={() => candidate.refetch()} /></Screen>;

  const name = candidateName(record);
  const email = plainText(record.email1);
  const phone = plainText(record.phone_mobile || record.phone_work || record.phone);
  const designation = plainText(record.current_designation || record.title);
  const linkedin = plainText(record.linkedin_url);
  const stage = candidateStage(record);
  const about = plainText(record.description);
  const location = [record.primary_address_city, record.primary_address_state, record.primary_address_country].map((value) => plainText(value)).filter(Boolean).join(", ");
  const rounds = interviews.data || [];

  return (
    <Screen refreshing={candidate.isFetching} onRefresh={() => { candidate.refetch(); interviews.refetch(); }}>
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
          <Chip label={candidatePhase(record)} tone="neutral" style={{ alignSelf: "flex-start" }} />
          <Chip label={candidateStatus(record)} tone="progress" style={{ alignSelf: "flex-start" }} />
        </Row>
        {email || phone || linkedin ? (
          <Row style={{ flexWrap: "wrap", rowGap: 8 }}>
            {email ? <Button title="Email" icon="mail-outline" small variant="outline" style={styles.contactButton} onPress={() => Linking.openURL(`mailto:${email}`)} /> : null}
            {phone ? <Button title="Call" icon="call-outline" small variant="outline" style={styles.contactButton} onPress={() => Linking.openURL(`tel:${phone}`)} /> : null}
            {linkedin ? <Button title="LinkedIn" icon="logo-linkedin" small variant="outline" style={styles.contactButton} onPress={() => Linking.openURL(linkedin)} /> : null}
          </Row>
        ) : null}
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

      {/* Parsed-resume JSON is sometimes stored in the description; only real text is shown. */}
      {about && !about.startsWith("{") ? (
        <Card>
          <Text style={type.subheading}>About</Text>
          <Text style={type.body}>{about}</Text>
        </Card>
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionTitle title="Interviews" hint={interviews.isPending ? "Loading…" : `${rounds.length} round${rounds.length === 1 ? "" : "s"}`} />
        {rounds.length === 0 && !interviews.isPending ? (
          <EmptyState icon="calendar-outline" title="No interviews yet" message="Rounds appear here once they are scheduled." />
        ) : (
          rounds.map((interview) => {
            const result = plainText(interview.interview_status) || "Pending";
            const feedback = plainText(interview.interview_feedback);
            return (
              <Card key={interview.id} style={{ gap: 6 }}>
                <Row align="flex-start">
                  <Text style={[type.subheading, { flex: 1, minWidth: 0 }]}>{roundName(interview)}</Text>
                  <Chip label={result} tone={/pass/i.test(result) ? "success" : /fail/i.test(result) ? "closed" : "attention"} small style={{ alignSelf: "flex-start" }} />
                </Row>
                <Row gap={6}>
                  <Ionicons name="time-outline" size={14} color={colors.mutedForeground} style={{ flexShrink: 0 }} />
                  <Text style={[type.small, { flex: 1, minWidth: 0 }]}>{interview.interview_datetime ? formatDateTime(interview.interview_datetime) : "Not scheduled"}</Text>
                </Row>
                {feedback ? <Text style={type.small}>Feedback: {feedback}</Text> : null}
              </Card>
            );
          })
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  tagValue: { flexShrink: 1, fontSize: 12, lineHeight: 16, fontWeight: "600", color: colors.foreground },
  cardFoot: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  open: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 2 },
  openText: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.primary },
});
