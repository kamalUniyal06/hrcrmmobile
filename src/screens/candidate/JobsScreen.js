import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type } from "../../theme";
import { Button, Card, Chip, EmptyState, ErrorState, Field, KeyValue, ListRow, LoadingState, Notice, PageHeader, Row, Screen } from "../../components/ui";
import { useCandidateProfile } from "../../hooks/queries";
import { applicationStage, applyToJob, experienceRange, fetchJobApplications, fetchJobPostings, jobIsOpen, jobLocation, jobTitle, jobType, salaryRange } from "../../api/candidate.api";
import { toast } from "../../store/toastStore";
import { formatDate } from "../../utils/dates";
import { clean, errorMessage, lower, plainText } from "../../utils/records";

function useJobsData() {
  const profile = useCandidateProfile();
  const candidate = profile.data;
  const postings = useQuery({ queryKey: ["job-postings"], queryFn: fetchJobPostings, staleTime: 5 * 60 * 1000 });
  const applications = useQuery({ queryKey: ["candidate-applications", candidate?.id], queryFn: () => fetchJobApplications(candidate.id), enabled: Boolean(candidate?.id) });
  const appliedByJob = useMemo(() => new Map((applications.data?.records || []).map((record) => [clean(record.jobid), record])), [applications.data]);
  return { profile, candidate, postings, applications, appliedByJob };
}

export function JobsScreen({ navigation }) {
  const { postings, appliedByJob } = useJobsData();
  const [search, setSearch] = useState("");

  const jobs = useMemo(() => {
    const records = (postings.data?.records || []).filter(jobIsOpen);
    const needle = lower(search);
    return records
      .filter((job) => !needle || lower(`${jobTitle(job)} ${jobLocation(job)} ${plainText(job.description)}`).includes(needle))
      .sort((a, b) => String(b.date_entered).localeCompare(String(a.date_entered)));
  }, [postings.data, search]);

  return (
    <Screen refreshing={postings.isFetching} onRefresh={() => postings.refetch()}>
      <PageHeader title="Open roles" subtitle="Apply with one tap. Your profile goes straight to the hiring team." />
      <Field value={search} onChangeText={setSearch} placeholder="Search by title or location" autoCapitalize="none" />
      {postings.isPending ? (
        <LoadingState label="Loading jobs…" />
      ) : postings.isError ? (
        <ErrorState message={postings.error.message} onRetry={() => postings.refetch()} />
      ) : jobs.length === 0 ? (
        <EmptyState icon="briefcase-outline" title="No open roles" message={search ? "Try a different search." : "Check back soon for new openings."} />
      ) : (
        jobs.map((job) => {
          const applied = appliedByJob.get(clean(job.id));
          const stage = applied ? applicationStage(applied.status) : null;
          return (
            <ListRow
              key={job.id}
              icon="briefcase-outline"
              iconTone={applied ? stage.tone : "progress"}
              title={jobTitle(job)}
              subtitle={[jobLocation(job), jobType(job, postings.data.dropdowns), experienceRange(job)].filter(Boolean).join(" · ")}
              meta={salaryRange(job) || undefined}
              right={applied ? <Chip label={stage.label} tone={stage.tone} small /> : undefined}
              onPress={() => navigation.navigate("JobDetail", { id: job.id })}
            />
          );
        })
      )}
    </Screen>
  );
}

export function JobDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const { candidate, postings, appliedByJob } = useJobsData();
  const queryClient = useQueryClient();
  const job = (postings.data?.records || []).find((item) => String(item.id) === String(id));
  const applied = appliedByJob.get(clean(id));

  const apply = useMutation({
    mutationFn: () => applyToJob(candidate, String(id)),
    onSuccess: (records) => {
      queryClient.setQueryData(["candidate-applications", candidate?.id], (previous) => ({ records, dropdowns: previous?.dropdowns || {} }));
      toast.success("Application submitted. HR will review your profile.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (postings.isPending) return <Screen><LoadingState /></Screen>;
  if (!job) return <Screen><EmptyState icon="briefcase-outline" title="Job unavailable" message="This posting may have been closed." action="Back to jobs" onAction={() => navigation.goBack()} /></Screen>;

  const description = plainText(job.description || job.job_description);
  const requirements = plainText(job.requirements || job.skills_required || job.required_skills).split(/\n+|,\s*|\s+[•●▪]\s*/).map((item) => item.trim()).filter(Boolean);
  const stage = applied ? applicationStage(applied.status) : null;

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Text style={type.title}>{jobTitle(job)}</Text>
        <Row style={{ flexWrap: "wrap" }}>
          {jobLocation(job) ? <Chip label={jobLocation(job)} icon="location-outline" /> : null}
          {jobType(job, postings.data.dropdowns) ? <Chip label={jobType(job, postings.data.dropdowns)} icon="time-outline" /> : null}
          {experienceRange(job) ? <Chip label={experienceRange(job)} icon="ribbon-outline" /> : null}
        </Row>
      </View>

      {applied ? (
        <Notice tone={stage.tone} icon="checkmark-circle-outline" title={`Application ${stage.label.toLowerCase()}`} message={stage.next} />
      ) : !candidate?.id ? (
        <Notice tone="attention" icon="person-circle-outline" title="Profile needed" message="Save your profile before applying." action="Set up" onAction={() => navigation.navigate("Profile", { screen: "CandidateProfileEdit" })} />
      ) : (
        <Button title="Apply for this role" icon="paper-plane-outline" full loading={apply.isPending} onPress={() => apply.mutate()} style={{ minHeight: 50 }} />
      )}

      <Card>
        <KeyValue label="Salary" value={salaryRange(job) || "Not disclosed"} />
        <KeyValue label="Openings" value={job.number_of_openings || job.openings} />
        <KeyValue label="Department" value={plainText(job.department)} />
        <KeyValue label="Posted" value={formatDate(job.date_entered)} />
        <KeyValue label="Closes" value={job.closing_date ? formatDate(job.closing_date) : undefined} last />
      </Card>

      {description ? (
        <Card>
          <Text style={type.subheading}>About the role</Text>
          <Text style={type.body}>{description}</Text>
        </Card>
      ) : null}

      {requirements.length ? (
        <Card>
          <Text style={type.subheading}>What we're looking for</Text>
          <Row style={{ flexWrap: "wrap" }}>
            {requirements.map((item, index) => (
              <Chip key={`${item}-${index}`} label={item} tone="neutral" />
            ))}
          </Row>
        </Card>
      ) : null}
    </Screen>
  );
}
