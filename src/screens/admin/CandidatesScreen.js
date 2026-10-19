import { useMemo, useState } from "react";
import { Linking, Text, View } from "react-native";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { colors, type } from "../../theme";
import { Button, Card, Chip, EmptyState, ErrorState, Field, KeyValue, ListRow, LoadingState, PageHeader, Row, Screen, SectionTitle, SegmentedControl } from "../../components/ui";
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

export function CandidatesScreen({ navigation }) {
  const [view, setView] = useState("all");
  const [search, setSearch] = useState("");
  const [submitted, setSubmitted] = useState("");

  const query = useInfiniteQuery({
    queryKey: ["candidates", "list", view, submitted],
    queryFn: ({ pageParam = 1 }) => fetchCandidatePage({ page: pageParam, shortlistedOnly: view === "shortlisted", search: submitted }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    staleTime: 5 * 60 * 1000,
  });

  const records = useMemo(() => (query.data?.pages || []).flatMap((page) => page.records), [query.data]);
  const total = query.data?.pages?.[0]?.total;

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <PageHeader title="Candidates" subtitle={total !== undefined ? `${total} in the pipeline` : "Everyone in the hiring pipeline."} />
      <SegmentedControl options={VIEWS} value={view} onChange={setView} />
      <Row>
        <Field style={{ flex: 1 }} value={search} onChangeText={setSearch} placeholder="Search name or email" autoCapitalize="none" />
        <Button title="Search" small variant="secondary" onPress={() => setSubmitted(search.trim())} />
      </Row>
      {query.isPending ? (
        <LoadingState label="Loading candidates…" />
      ) : query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
      ) : records.length === 0 ? (
        <EmptyState icon="person-outline" title="No candidates" message={submitted ? "No one matches that search." : "New candidates appear here as they apply."} />
      ) : (
        <>
          {records.map((record) => (
            <ListRow
              key={record.id}
              avatar={candidateName(record)}
              title={candidateName(record)}
              subtitle={[record.email1, record.current_designation || record.title].filter(Boolean).join(" · ")}
              meta={`${candidatePhase(record)} · ${candidateStatus(record)}`}
              right={<Chip label={candidateStage(record)} tone={stageTone(candidateStage(record))} small />}
              onPress={() => navigation.navigate("CandidateDetail", { id: record.id })}
            />
          ))}
          {query.hasNextPage ? <Button title="Load more" variant="outline" full loading={query.isFetchingNextPage} onPress={() => query.fetchNextPage()} /> : null}
        </>
      )}
    </Screen>
  );
}

export function CandidateDetailScreen({ route }) {
  const { id } = route.params;
  const candidate = useQuery({ queryKey: ["candidates", "record", id], queryFn: () => fetchCandidateRecord(id) });
  const interviews = useQuery({ queryKey: ["candidates", "interviews", id], queryFn: () => fetchCandidateInterviews(id) });
  const record = candidate.data;

  if (candidate.isPending) return <Screen><LoadingState /></Screen>;
  if (candidate.isError) return <Screen><ErrorState message={candidate.error.message} onRetry={() => candidate.refetch()} /></Screen>;

  const phone = record.phone_mobile || record.phone_work || record.phone;
  return (
    <Screen refreshing={candidate.isFetching} onRefresh={() => { candidate.refetch(); interviews.refetch(); }}>
      <Card>
        <Text style={type.title}>{candidateName(record)}</Text>
        <Text style={type.small}>{record.current_designation || record.title || "Candidate"}</Text>
        <Row style={{ flexWrap: "wrap" }}>
          <Chip label={candidateStage(record)} tone={stageTone(candidateStage(record))} />
          <Chip label={candidatePhase(record)} tone="neutral" />
          <Chip label={candidateStatus(record)} tone="progress" />
        </Row>
        <Row style={{ flexWrap: "wrap" }}>
          {record.email1 ? <Button title="Email" icon="mail-outline" small variant="outline" onPress={() => Linking.openURL(`mailto:${record.email1}`)} /> : null}
          {phone ? <Button title="Call" icon="call-outline" small variant="outline" onPress={() => Linking.openURL(`tel:${phone}`)} /> : null}
          {record.linkedin_url ? <Button title="LinkedIn" icon="logo-linkedin" small variant="outline" onPress={() => Linking.openURL(record.linkedin_url)} /> : null}
        </Row>
      </Card>

      <Card>
        <KeyValue label="Email" value={record.email1} />
        <KeyValue label="Phone" value={phone} />
        <KeyValue label="Location" value={[record.primary_address_city, record.primary_address_state, record.primary_address_country].filter(Boolean).join(", ")} />
        <KeyValue label="Experience" value={record.total_experience || record.experience} />
        <KeyValue label="Current CTC" value={record.current_ctc || record.ctc} />
        <KeyValue label="Expected CTC" value={record.expected_ctc} />
        <KeyValue label="Notice period" value={record.notice_period} />
        <KeyValue label="Source" value={record.candidate_source} />
        <KeyValue label="Added" value={formatDate(record.date_entered)} last />
      </Card>

      {plainText(record.description) && !record.description.trim().startsWith("{") ? (
        <Card>
          <Text style={type.subheading}>About</Text>
          <Text style={type.body}>{plainText(record.description)}</Text>
        </Card>
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionTitle title="Interviews" hint={interviews.isPending ? "Loading…" : `${(interviews.data || []).length} round(s)`} />
        {(interviews.data || []).length === 0 && !interviews.isPending ? (
          <Text style={type.small}>No interviews scheduled. Schedule one from app.hrcrm.ai.</Text>
        ) : (
          (interviews.data || []).map((interview) => (
            <Card key={interview.id} style={{ gap: 2 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Text style={type.subheading}>{roundName(interview)}</Text>
                <Chip label={interview.interview_status || "Pending"} tone={/pass/i.test(interview.interview_status) ? "success" : /fail/i.test(interview.interview_status) ? "closed" : "attention"} small />
              </Row>
              <Text style={type.small}>{interview.interview_datetime ? formatDateTime(interview.interview_datetime) : "Not scheduled"}</Text>
              {interview.interview_feedback ? <Text style={type.small}>Feedback: {plainText(interview.interview_feedback)}</Text> : null}
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}
