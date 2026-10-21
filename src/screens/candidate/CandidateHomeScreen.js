import { useMemo } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, type } from "../../theme";
import { Button, Card, Chip, ErrorState, ListRow, LoadingState, Notice, PageHeader, Row, Screen, SectionTitle } from "../../components/ui";
import { useCandidateProfile, useEmail } from "../../hooks/queries";
import { applicationStage, fetchJobApplications, fetchJobPostings, fetchMyInterviews, hiringProgress, jobTitle, needsProfile, nextInterview } from "../../api/candidate.api";
import { formatDateTime, interviewDate, timeUntil } from "../../utils/dates";
import { fullName, plainText } from "../../utils/records";
import { greeting } from "../employee/EmployeeHomeScreen";

export default function CandidateHomeScreen({ navigation }) {
  const email = useEmail();
  const profile = useCandidateProfile();
  const candidate = profile.data;

  const applications = useQuery({ queryKey: ["candidate-applications", candidate?.id], queryFn: () => fetchJobApplications(candidate.id), enabled: Boolean(candidate?.id) });
  const postings = useQuery({ queryKey: ["job-postings"], queryFn: fetchJobPostings, staleTime: 5 * 60 * 1000 });
  const interviews = useQuery({ queryKey: ["interviews", "candidate", email, candidate?.id || ""], queryFn: () => fetchMyInterviews({ candidate, email }), enabled: Boolean(candidate?.id && email), retry: false });

  const progress = useMemo(
    () => hiringProgress({ candidate, applications: applications.data?.records || [], interviews: interviews.data || [] }),
    [applications.data, candidate, interviews.data],
  );
  const next = useMemo(() => nextInterview(interviews.data || []), [interviews.data]);
  const jobsById = useMemo(() => new Map((postings.data?.records || []).map((job) => [String(job.id), job])), [postings.data]);
  const openRoles = (postings.data?.records || []).length;

  if (profile.isPending) return <Screen><LoadingState label="Loading your profile…" /></Screen>;
  if (profile.isError) return <Screen><ErrorState message={profile.error.message} onRetry={() => profile.refetch()} /></Screen>;

  return (
    <Screen refreshing={profile.isFetching || applications.isFetching} onRefresh={() => { profile.refetch(); applications.refetch(); interviews.refetch(); }}>
      <PageHeader eyebrow={greeting()} title={candidate ? fullName(candidate, "Welcome") : "Welcome"} subtitle="Track your applications and interviews in one place." />

      {needsProfile(candidate) ? (
        <Notice tone="attention" icon="person-circle-outline" title="Complete your profile" message="Add your name, phone and background so HR can review your application." action="Set up" onAction={() => navigation.navigate("Profile", { screen: "CandidateProfileEdit" })} />
      ) : null}

      <Card style={{ backgroundColor: colors.sidebar, borderColor: colors.sidebar, gap: 14 }}>
        <Text style={[type.tiny, { color: colors.lime }]}>Hiring journey</Text>
        <View style={styles.steps}>
          {progress.steps.map((step, index) => (
            <View key={step.label} style={styles.step}>
              <View style={[styles.dot, step.state === "done" && { backgroundColor: colors.lime }, step.state === "current" && { backgroundColor: colors.success }, step.state === "declined" && { backgroundColor: colors.destructive }]}>
                {step.state === "done" ? <Ionicons name="checkmark" size={12} color={colors.foreground} /> : <Text style={styles.dotText}>{index + 1}</Text>}
              </View>
              <Text style={[styles.stepLabel, step.state === "upcoming" && { color: "rgba(255,255,255,0.45)" }]} numberOfLines={2}>{step.label}</Text>
            </View>
          ))}
        </View>
        <Text style={[type.small, { color: "rgba(255,255,255,0.8)" }]}>{progress.message}</Text>
      </Card>

      {next ? (
        <Card tone="progress">
          <Row style={{ justifyContent: "space-between" }}>
            <Text style={[type.subheading, { color: colors.primary }]}>Next interview</Text>
            <Chip label={timeUntil(next.date)} tone="lime" small />
          </Row>
          <Text style={type.heading}>{next.record.round}</Text>
          <Text style={type.small}>{formatDateTime(next.record.scheduledAt)}{next.record.jobTitle ? ` · ${next.record.jobTitle}` : ""}</Text>
          {next.record.meetingUrl ? <Button title="Join meeting" icon="videocam-outline" small onPress={() => Linking.openURL(next.record.meetingUrl)} /> : null}
        </Card>
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionTitle title="My applications" action="Browse jobs" onAction={() => navigation.navigate("Jobs")} />
        {!candidate?.id ? (
          <Text style={type.small}>Save your profile to start applying.</Text>
        ) : applications.isPending ? (
          <Text style={type.small}>Loading…</Text>
        ) : (applications.data?.records || []).length === 0 ? (
          <Card>
            <Text style={type.subheading}>No applications yet</Text>
            <Text style={type.small}>{openRoles ? `${openRoles} open role${openRoles === 1 ? "" : "s"} waiting for you.` : "New roles will appear in Jobs."}</Text>
            <Button title="See open roles" variant="secondary" small onPress={() => navigation.navigate("Jobs")} />
          </Card>
        ) : (
          applications.data.records.map((record) => {
            const stage = applicationStage(record.status);
            const job = jobsById.get(String(record.jobid));
            return (
              <ListRow
                key={record.id}
                icon="briefcase-outline"
                iconTone={stage.tone}
                title={job ? jobTitle(job) : plainText(record.name) || "Application"}
                subtitle={stage.next}
                right={<Chip label={stage.label} tone={stage.tone} small />}
                onPress={job ? () => navigation.navigate("Jobs", { screen: "JobDetail", params: { id: job.id } }) : undefined}
              />
            );
          })
        )}
      </View>

      <View style={{ gap: 10 }}>
        <SectionTitle title="Interviews" action="All" onAction={() => navigation.navigate("Interviews")} />
        {interviews.isError ? (
          <Text style={type.small}>{interviews.error.message}</Text>
        ) : (interviews.data || []).length === 0 ? (
          <Text style={type.small}>No interviews scheduled yet.</Text>
        ) : (
          interviews.data.slice(0, 3).map((round) => (
            <ListRow key={round.id} icon="people-outline" title={round.round} subtitle={round.scheduledAt ? formatDateTime(round.scheduledAt) : "Date to be confirmed"} right={<Text style={type.small}>{interviewDate(round.scheduledAt) ? "" : ""}</Text>} onPress={() => navigation.navigate("Interviews")} />
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  steps: { flexDirection: "row", gap: 6 },
  step: { flex: 1, alignItems: "center", gap: 6 },
  dot: { width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  dotText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  stepLabel: { color: "#fff", fontSize: 11, textAlign: "center", fontWeight: "500" },
});
