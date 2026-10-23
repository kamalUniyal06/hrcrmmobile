import { useMemo } from "react";
import { Linking, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { colors, type } from "../../theme";
import { Button, Card, Chip, EmptyState, ErrorState, LoadingState, Notice, PageHeader, Row, Screen, SectionTitle } from "../../components/ui";
import { useCandidateProfile, useEmail } from "../../hooks/queries";
import { candidateInterviewStatus, fetchMyInterviews } from "../../api/candidate.api";
import { formatDateTime, interviewDate, relativeDay, timeUntil } from "../../utils/dates";

export default function InterviewsScreen() {
  const email = useEmail();
  const profile = useCandidateProfile();
  const candidate = profile.data;
  const interviews = useQuery({
    queryKey: ["interviews", "candidate", email, candidate?.id || ""],
    queryFn: () => fetchMyInterviews({ candidate, email }),
    enabled: Boolean(candidate?.id && email),
    retry: false,
  });

  const groups = useMemo(() => {
    const rounds = (interviews.data || []).map((record) => ({
      record,
      date: interviewDate(record.scheduledAt),
      status: candidateInterviewStatus({ interview_status: record.status, interview_datetime: record.scheduledAt }),
    }));
    const upcoming = rounds.filter((r) => r.status.key === "scheduled").sort((a, b) => a.date - b.date);
    const unscheduled = rounds.filter((r) => r.status.key === "pending" && !r.date);
    const past = rounds.filter((r) => !upcoming.includes(r) && !unscheduled.includes(r)).sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
    return { upcoming, unscheduled, past };
  }, [interviews.data]);

  if (profile.isPending || (interviews.isPending && candidate?.id)) return <Screen><LoadingState label="Loading interviews…" /></Screen>;

  return (
    <Screen refreshing={interviews.isFetching} onRefresh={() => interviews.refetch()}>
      <PageHeader title="My interviews" subtitle="Every round, with dates, locations and meeting links." />
      {!candidate?.id ? (
        <Notice tone="attention" icon="person-circle-outline" message="Save your profile first. Interviews are linked to your candidate record." />
      ) : interviews.isError ? (
        <ErrorState message={interviews.error.message} onRetry={() => interviews.refetch()} />
      ) : (interviews.data || []).length === 0 ? (
        <EmptyState icon="people-outline" title="No interviews yet" message="Once HR schedules a round you'll see it here." />
      ) : (
        <>
          <Group title="Upcoming" rounds={groups.upcoming} empty="Nothing scheduled right now." />
          <Group title="Awaiting a date" rounds={groups.unscheduled} />
          <Group title="Past rounds" rounds={groups.past} />
        </>
      )}
    </Screen>
  );
}

function Group({ title, rounds, empty }) {
  if (!rounds.length && !empty) return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle title={title} />
      {rounds.length === 0 ? <Text style={type.small}>{empty}</Text> : rounds.map(({ record, date, status }) => (
        <Card key={record.id}>
          <Row style={{ justifyContent: "space-between" }}>
            <Text style={[type.heading, { flex: 1, minWidth: 0 }]} numberOfLines={2}>{record.round}</Text>
            <Chip label={status.label} tone={status.tone} small />
          </Row>
          {record.jobTitle ? <Text style={type.small}>{record.jobTitle}</Text> : null}
          <Text style={type.body}>{date ? `${formatDateTime(record.scheduledAt)}` : "Date to be confirmed by HR"}</Text>
          {date && status.key === "scheduled" ? <Text style={[type.small, { color: colors.primary, fontWeight: "600" }]}>{timeUntil(date) || relativeDay(date)}</Text> : null}
          {record.location ? <Text style={type.small}>📍 {record.location}</Text> : null}
          {record.feedback && status.key !== "scheduled" ? <Text style={type.small}>Feedback: {record.feedback}</Text> : null}
          {record.meetingUrl && status.key === "scheduled" ? <Button title="Join meeting" icon="videocam-outline" small onPress={() => Linking.openURL(record.meetingUrl)} /> : null}
        </Card>
      ))}
    </View>
  );
}
