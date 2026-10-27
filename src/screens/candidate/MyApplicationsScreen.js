// My applications (web /job-application, pages/jobs/JobsPage.jsx with applicationsOnly):
// every application with Active / In interviews / Closed filters, stage bars per row and a
// step tracker in a detail sheet.
import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { colors, type } from "../../theme";
import { Button, Card, Chip, EmptyState, ErrorState, LoadingState, Notice, PageHeader, Row, Screen, SearchField, SegmentedControl, Sheet } from "../../components/ui";
import { StageBars, StepTimeline } from "../../components/candidate/StepTracker";
import { useCandidateProfile } from "../../hooks/queries";
import { applicationStage, fetchJobApplications, fetchJobPostings, jobLocation, jobTitle, jobType } from "../../api/candidate.api";
import { applicationFilters, applicationStepDetails, applicationSteps, appliedOn, countApplications } from "../../utils/candidateJourney";
import { clean, lower, plainText, readable } from "../../utils/records";

export default function MyApplicationsScreen({ navigation, route }) {
  const profile = useCandidateProfile();
  const candidate = profile.data;
  const postings = useQuery({ queryKey: ["job-postings"], queryFn: fetchJobPostings, staleTime: 5 * 60 * 1000 });
  const applications = useQuery({ queryKey: ["candidate-applications", candidate?.id], queryFn: () => fetchJobApplications(candidate.id), enabled: Boolean(candidate?.id) });
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(route?.params?.applicationId || null);

  // Opening from the home list passes the application to show.
  useEffect(() => {
    if (route?.params?.applicationId) setSelectedId(route.params.applicationId);
  }, [route?.params?.applicationId]);

  const records = useMemo(() => applications.data?.records || [], [applications.data]);
  const jobsById = useMemo(() => new Map((postings.data?.records || []).map((job) => [clean(job.id), job])), [postings.data]);
  const counts = useMemo(() => countApplications(records), [records]);

  const rows = useMemo(() => {
    const needle = lower(search);
    const statusLabels = applications.data?.dropdowns?.status || {};
    return records
      .map((application) => {
        const job = jobsById.get(clean(application.jobid));
        const stage = applicationStage(application.status);
        const status = clean(application.status);
        return {
          application,
          job,
          stage,
          steps: applicationSteps(status),
          title: job ? jobTitle(job) : "Job posting unavailable",
          statusLabel: status ? plainText(statusLabels[status]) || readable(status) : "Applied",
        };
      })
      .filter((row) => applicationFilters[filter].test(row.stage))
      .filter((row) => !needle || lower(`${row.title} ${row.job ? jobLocation(row.job) : ""} ${row.job?.job_code || ""} ${plainText(row.job?.required_skills)} ${row.application.jobid}`).includes(needle));
  }, [applications.data, filter, jobsById, records, search]);

  const selected = rows.find((row) => row.application.id === selectedId) || null;
  const loading = profile.isPending || postings.isPending || (Boolean(candidate?.id) && applications.isPending);
  const error = profile.error || postings.error || applications.error;
  const refresh = () => {
    profile.refetch();
    postings.refetch();
    if (candidate?.id) applications.refetch();
  };

  const filterLabel = filter === "all" ? "" : applicationFilters[filter].label.toLowerCase();

  return (
    <Screen refreshing={postings.isFetching || applications.isFetching} onRefresh={refresh}>
      <PageHeader icon="document-text-outline" title="My applications" subtitle="Follow every application from submission to decision." />
      {loading ? (
        <LoadingState label="Loading your applications…" variant="cards" />
      ) : error ? (
        <ErrorState message={error.message} onRetry={refresh} />
      ) : !candidate?.id ? (
        <Notice tone="attention" icon="person-circle-outline" title="Your profile isn't ready yet" message="Complete your candidate profile to apply for jobs." action="Complete profile" onAction={() => navigation.navigate("Profile", { screen: "CandidateProfileEdit" })} />
      ) : (
        <>
          <SegmentedControl
            options={Object.entries(applicationFilters).map(([value, entry]) => ({ value, label: entry.label, count: counts[value] }))}
            value={filter}
            onChange={setFilter}
          />
          {records.length ? <SearchField value={search} onChangeText={setSearch} placeholder="Search your applications" /> : null}
          {rows.length === 0 ? (
            <EmptyState
              icon="document-text-outline"
              title={search.trim() ? `No matches for “${search.trim()}”` : filterLabel ? `No ${filterLabel === "in interviews" ? "applications in interviews" : `${filterLabel} applications`}` : "No applications yet"}
              message={search.trim() ? "Try another title, skill or location." : filterLabel ? "Clear the filter to see every application." : "When you apply for a role, you can follow its progress here."}
              action={search.trim() ? "Clear search" : filterLabel ? "Clear filter" : "Browse job postings"}
              onAction={() => (search.trim() ? setSearch("") : filterLabel ? setFilter("all") : navigation.navigate("Jobs"))}
            />
          ) : (
            <>
              {rows.map((row) => (
                <ApplicationCard key={row.application.id} row={row} dropdowns={postings.data?.dropdowns} onPress={() => setSelectedId(row.application.id)} />
              ))}
              <Text style={type.small}>{`Showing ${rows.length} of ${records.length} applications${filterLabel ? ` · ${filterLabel}` : ""}`}</Text>
            </>
          )}
        </>
      )}
      <Sheet visible={Boolean(selected)} onClose={() => setSelectedId(null)} title={selected?.title || "Application"}>
        {selected ? (
          <ApplicationDetail
            row={selected}
            onInterviews={() => {
              setSelectedId(null);
              navigation.navigate("Interviews");
            }}
            onJob={() => {
              setSelectedId(null);
              navigation.navigate("Jobs", { screen: "JobDetail", params: { id: selected.job.id } });
            }}
          />
        ) : null}
      </Sheet>
    </Screen>
  );
}

function ApplicationCard({ row, dropdowns, onPress }) {
  const { application, job, stage, steps, title, statusLabel } = row;
  const subline = [job?.job_code, job ? jobType(job, dropdowns) : ""].filter(Boolean).join(" · ");
  const date = appliedOn(application);
  return (
    <Card onPress={onPress}>
      <Row style={{ justifyContent: "space-between" }} align="flex-start">
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={type.subheading} numberOfLines={2}>{title}</Text>
          {subline ? <Text style={type.small} numberOfLines={1}>{subline}</Text> : null}
        </View>
        <Chip label={statusLabel} tone={stage.tone} small style={{ flexShrink: 0, maxWidth: "45%" }} />
      </Row>
      <StageBars steps={steps} />
      <Text style={type.small}>
        {`${stage.closed ? "Closed" : steps[stage.index].label} · step ${stage.index + 1} of ${steps.length}`}
        {date ? ` · Applied ${date}` : ""}
      </Text>
      <Text style={[type.small, { color: colors.foreground }]}>{stage.next}</Text>
    </Card>
  );
}

function ApplicationDetail({ row, onInterviews, onJob }) {
  const { application, job, steps } = row;
  const details = applicationStepDetails(application.status, appliedOn(application));
  const items = steps.map((step) => ({
    ...step,
    caption: step.state === "done" ? "Done" : step.state === "current" ? "In progress" : "Up next",
    detail: details[step.label],
    footer: step.label === "Interview" && step.state !== "upcoming" ? <Button title="View interview details" variant="ghost" small icon="arrow-forward" onPress={onInterviews} style={{ marginLeft: -12 }} /> : null,
  }));
  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 8, gap: 16 }}>
      {job ? <Text style={type.small}>{[jobLocation(job), job.job_code].filter(Boolean).join(" · ")}</Text> : null}
      <Text style={type.heading}>Progress</Text>
      <StepTimeline items={items} />
      {job ? <Button title="View job posting" icon="briefcase-outline" variant="secondary" full onPress={onJob} /> : <Notice tone="neutral" message="This job posting is no longer available." />}
    </View>
  );
}
