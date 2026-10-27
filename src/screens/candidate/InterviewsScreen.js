// Candidate interviews (web pages/interviews/CandidateInterviewPage.jsx): summary tiles, a "To do"
// card for the Round 1 test link, upcoming / unscheduled / past rounds and the round tracker.
import { useEffect, useMemo, useState } from "react";
import { Linking, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { colors, type } from "../../theme";
import { Button, Card, Chip, EmptyState, ErrorState, LoadingState, Notice, PageHeader, Row, Screen, SectionTitle, StatTile } from "../../components/ui";
import { StepTimeline } from "../../components/candidate/StepTracker";
import TestInvitationCard from "../../components/candidate/TestInvitationCard";
import { useCandidateProfile, useEmail } from "../../hooks/queries";
import { fetchMyInterviews, fetchMyTestInvitation } from "../../api/candidate.api";
import { interviewJourney, isFirstRound } from "../../utils/candidateJourney";
import { testIsDue } from "../../utils/candidateInvitation";
import { formatDateTime, relativeDay, timeUntil } from "../../utils/dates";
import { toast } from "../../store/toastStore";

const shortDate = (date) => date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const clockTime = (date) => date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

// Re-render every minute so countdowns and "Up next" stay current while the screen is open.
function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export const openLink = (url) => Linking.openURL(url).catch(() => toast.error("Could not open the link. Please try again."));

export default function InterviewsScreen({ navigation }) {
  const email = useEmail();
  const profile = useCandidateProfile();
  const candidate = profile.data;
  const interviews = useQuery({
    queryKey: ["interviews", "candidate", email, candidate?.id || ""],
    queryFn: () => fetchMyInterviews({ candidate, email }),
    enabled: Boolean(candidate?.id && email),
    retry: false,
  });
  const records = useMemo(() => interviews.data || [], [interviews.data]);
  const firstRound = records.find((record) => isFirstRound(record.round));
  const testInvitation = useQuery({
    queryKey: ["candidate-test-invitation", email, candidate?.id || ""],
    queryFn: () => fetchMyTestInvitation({ candidate, email }),
    enabled: Boolean(candidate?.id && email && interviews.isSuccess && firstRound),
    retry: false,
    staleTime: 15000,
    // Poll while a test exists, except when HR still has to enable test-link access.
    refetchInterval: (query) => (firstRound && query.state.error?.code !== "HRCRM_CANDIDATE_EMAIL_REQUIRED" ? 60000 : false),
  });
  const now = useNow();
  const journey = useMemo(() => interviewJourney(records, now), [records, now]);
  const groups = useMemo(() => {
    const upcoming = journey.rounds.filter((r) => r.status.key === "scheduled").sort((a, b) => a.date - b.date);
    const unscheduled = journey.rounds.filter((r) => r.status.key === "pending" && !r.date);
    const past = journey.rounds.filter((r) => !upcoming.includes(r) && !unscheduled.includes(r)).sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
    return { upcoming, unscheduled, past };
  }, [journey]);

  const invitation = testInvitation.data;
  const testDue = testIsDue(invitation, now);
  const refresh = () => {
    if (profile.isError || !candidate?.id) profile.refetch();
    else {
      interviews.refetch();
      if (firstRound) testInvitation.refetch();
    }
  };

  if (profile.isPending || (interviews.isPending && candidate?.id)) return <Screen><LoadingState label="Loading interviews…" variant="cards" /></Screen>;

  const ready = Boolean(candidate?.id) && !interviews.isError && records.length > 0;
  const roles = new Set(records.map((record) => record.jobTitle).filter(Boolean)).size || 1;

  return (
    <Screen refreshing={interviews.isFetching || testInvitation.isFetching} onRefresh={refresh}>
      <PageHeader title="My interviews" subtitle="What you need to do, and when each round happens." />
      {!candidate?.id ? (
        <Notice tone="attention" icon="person-circle-outline" message="Save your profile first. Interviews are linked to your candidate record." />
      ) : interviews.isError ? (
        <ErrorState message={interviews.error.message} onRetry={() => interviews.refetch()} />
      ) : !ready ? (
        <EmptyState icon="people-outline" title="No interviews yet" message="Your interview rounds and schedule will appear here when HR adds them." action={navigation ? "Browse open roles" : undefined} onAction={() => navigation?.navigate("Jobs")} />
      ) : (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {journey.next ? (
              <StatTile label="Next interview" value={shortDate(journey.next.date)} hint={clockTime(journey.next.date)} icon="calendar-outline" tone="progress" />
            ) : (
              <StatTile label="Next interview" value="None yet" hint="HR will confirm dates" icon="calendar-outline" tone="neutral" />
            )}
            {testDue ? (
              <StatTile label="To do" value={1} hint={timeUntil(new Date(invitation.expiresAt), now).replace(/^In /, "due in ").replace(/^Today.*/, "due today")} icon="list-outline" tone="attention" />
            ) : (
              <StatTile label="To do" value={0} hint="nothing due" icon="list-outline" tone="success" />
            )}
            <StatTile label="Rounds completed" value={journey.completed} hint={`of ${journey.rounds.length}`} icon="checkmark-done-outline" tone="info" />
            <StatTile label="Roles in interviews" value={roles} icon="briefcase-outline" tone="progress" onPress={navigation ? () => navigation.navigate("Home", { screen: "MyApplications" }) : undefined} />
          </View>

          <View style={{ gap: 10 }}>
            <SectionTitle title="To do" hint="Tasks with a deadline" />
            {firstRound ? (
              <TestInvitationCard query={testInvitation} roundLabel={firstRound.round} jobTitle={firstRound.jobTitle} now={now} onOpen={openLink} />
            ) : (
              <Card style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={type.small}>✓ Nothing due right now.</Text>
              </Card>
            )}
          </View>

          <Group title="Upcoming" rounds={groups.upcoming} empty={groups.unscheduled.length ? undefined : "New dates will appear here as soon as HR confirms them."} now={now} testDue={testDue} />
          <Group title="Awaiting a date" rounds={groups.unscheduled} now={now} />
          <Group title="Past rounds" rounds={groups.past} empty="After each round, you'll see it here with its outcome." now={now} />

          <View style={{ gap: 10 }}>
            <SectionTitle title="Your rounds" hint={`${journey.completed} of ${journey.rounds.length} ${journey.rounds.length === 1 ? "round" : "rounds"} complete`} />
            <Card>
              <StepTimeline
                items={journey.rounds.map((round) => {
                  const done = ["passed", "completed"].includes(round.status.key);
                  const closed = ["failed", "cancelled"].includes(round.status.key);
                  const state = done || closed ? "done" : round.upNext ? "current" : "upcoming";
                  return {
                    key: round.record.id,
                    label: round.record.round,
                    state,
                    tone: closed ? "closed" : "progress",
                    detail: `${state === "current" ? "Up next" : round.status.label}${round.date ? ` · ${shortDate(round.date)}, ${clockTime(round.date)}` : ""}`,
                  };
                })}
              />
            </Card>
          </View>
          <Notice tone="progress" icon="information-circle-outline" title="Can't make it?" message="Ask to reschedule at least 24 hours before the interview. Reply to your interview email or contact HR." />
        </>
      )}
    </Screen>
  );
}

function Group({ title, rounds, empty, now, testDue }) {
  if (!rounds.length && !empty) return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle title={title} />
      {rounds.length === 0 ? <Text style={type.small}>{empty}</Text> : rounds.map(({ record, date, status }) => {
        const needsTest = testDue && status.key === "scheduled" && isFirstRound(record.round);
        return (
          <Card key={record.id}>
            <Row style={{ justifyContent: "space-between" }} align="flex-start">
              <Text style={[type.heading, { flex: 1, minWidth: 0 }]} numberOfLines={2}>{record.round}</Text>
              <Chip label={status.label} tone={status.tone} small style={{ flexShrink: 0, maxWidth: "45%", marginTop: 3 }} />
            </Row>
            {record.jobTitle ? <Text style={type.small}>{record.jobTitle}</Text> : null}
            <Text style={type.body}>{date ? `${formatDateTime(record.scheduledAt)}` : "Date and time to be confirmed. HR will confirm the schedule for this round."}</Text>
            {date && status.key === "scheduled" ? <Text style={[type.small, { color: colors.primary, fontWeight: "600" }]}>{timeUntil(date, now) || relativeDay(date)}</Text> : null}
            {record.location ? <Text style={type.small}>📍 {record.location}</Text> : null}
            {record.feedback && status.key !== "scheduled" ? <Text style={type.small}>Feedback: {record.feedback}</Text> : null}
            {needsTest ? <Text style={[type.small, { color: colors.attention, fontWeight: "600" }]}>Before this round: finish the {record.round} test</Text> : null}
            {record.meetingUrl && status.key === "scheduled" ? <Button title="Join meeting" icon="videocam-outline" small variant={needsTest ? "secondary" : "primary"} onPress={() => openLink(record.meetingUrl)} /> : null}
          </Card>
        );
      })}
    </View>
  );
}
