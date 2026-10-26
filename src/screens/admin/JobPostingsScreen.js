// Admin job postings: list + search, detail with delete, and the create form.
// Web source: pages/JobPost.jsx → pages/jobs/JobsPage.jsx (admin branch), JobList.jsx,
// JobDetailsDrawer.jsx, CreateJobDialog.jsx, DeleteJobDialog.jsx.
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, spacing, tones, type } from "../../theme";
import { Button, Card, Chip, EmptyState, ErrorState, Field, KeyValue, ListRow, LoadingState, Notice, PageHeader, Row, Screen, SearchField, SelectField, StatTile } from "../../components/ui";
import { experienceRange, jobLocation, salaryRange } from "../../api/candidate.api";
import {
  buildJobPostingData,
  createJobPosting,
  deleteJobPosting,
  emptyJobDraft,
  fetchJobPostings,
  fieldLabel,
  isChipList,
  jobFieldLabel,
  jobFormSections,
  jobPostingsKey,
  longJobFields,
  numericJobFields,
  postingStatus,
  postingTitle,
  requirementItems,
  requiredJobFields,
  valueOf,
} from "../../api/jobs.api";
import { toast } from "../../store/toastStore";
import { formatDate } from "../../utils/dates";
import { clean, errorMessage, lower, plainText } from "../../utils/records";

const LIST_LIMIT = 6;

// Shares the candidate Jobs cache entry (same key and request), so a refetch updates both.
const useJobPostings = () => useQuery({ queryKey: jobPostingsKey, queryFn: fetchJobPostings, staleTime: 5 * 60 * 1000 });

/* ── List ───────────────────────────────────────────────────────────────── */

export function JobPostingsScreen({ navigation }) {
  const postings = useJobPostings();
  const [search, setSearch] = useState("");
  const jobs = useMemo(() => postings.data?.records || [], [postings.data]);
  const dropdowns = postings.data?.dropdowns || {};

  // Same fields the web search box matches: title, code/department, location and skills.
  const rows = useMemo(() => {
    const needle = lower(search);
    if (!needle) return jobs;
    return jobs.filter((job) =>
      [
        postingTitle(job),
        valueOf(job, ["job_code", "department", "company_name", "company"]),
        valueOf(job, ["job_location", "location", "city", "country"]),
        valueOf(job, ["required_skills", "skills"]),
        valueOf(job, ["preferred_skills"]),
      ].some((value) => lower(plainText(value)).includes(needle)),
    );
  }, [jobs, search]);

  return (
    <Screen refreshing={postings.isRefetching} onRefresh={() => postings.refetch()}>
      <PageHeader icon="briefcase" tone="progress" title="Job postings" subtitle="Create job postings and share the roles your team is hiring for." />
      <Button title="New posting" icon="add-circle-outline" full onPress={() => navigation.navigate("JobPostingForm")} style={styles.bigButton} />
      {!postings.isPending && !postings.isError ? (
        <Row gap={spacing.md} align="stretch" style={{ flexWrap: "wrap" }}>
          <StatTile label="Job postings" value={jobs.length} icon="briefcase-outline" onPress={() => setSearch("")} />
          <StatTile label="Matching search" value={rows.length} icon="search-outline" tone="info" />
        </Row>
      ) : null}
      <SearchField value={search} onChangeText={setSearch} placeholder="Search title, skill or location" />
      {postings.isPending ? (
        <LoadingState label="Loading job postings…" />
      ) : postings.isError ? (
        <ErrorState message={errorMessage(postings.error)} onRetry={() => postings.refetch()} />
      ) : rows.length === 0 ? (
        search.trim() ? (
          <EmptyState icon="search-outline" title={`No matches for “${search.trim()}”`} message="Try another title, skill or location, or clear the search." action="Clear search" onAction={() => setSearch("")} />
        ) : (
          <EmptyState icon="briefcase-outline" title="No job postings yet" message="Create the first posting to start hiring." action="New posting" onAction={() => navigation.navigate("JobPostingForm")} />
        )
      ) : (
        <>
          {rows.map((job) => {
            const status = postingStatus(job, dropdowns);
            return (
              <ListRow
                key={job.id}
                icon="briefcase-outline"
                title={postingTitle(job)}
                subtitle={[job.job_code, fieldLabel(job, ["department"], dropdowns, true)].filter(Boolean).join(" · ") || undefined}
                meta={[fieldLabel(job, ["employment_type", "job_type"], dropdowns, true), experienceRange(job), jobLocation(job) || fieldLabel(job, ["work_mode"], dropdowns, true)].filter(Boolean).join(" · ") || undefined}
                right={status ? <Chip label={status.label} tone={status.tone} small style={styles.statusChip} /> : undefined}
                onPress={() => navigation.navigate("JobPostingDetail", { id: job.id })}
              />
            );
          })}
          <Text style={[type.small, { textAlign: "center" }]}>{`${rows.length} of ${jobs.length} job postings`}</Text>
        </>
      )}
    </Screen>
  );
}

/* ── Detail ─────────────────────────────────────────────────────────────── */

/** Topic icon for each detail section heading (tile tone, Ionicons name). */
const SECTION_ICONS = {
  "About the role": ["progress", "document-text-outline"],
  "Key responsibilities": ["info", "list-outline"],
  "What you'll bring": ["success", "ribbon-outline"],
  "Nice to have": ["attention", "sparkles-outline"],
  Qualifications: ["info", "school-outline"],
  Benefits: ["success", "gift-outline"],
  "How to apply": ["progress", "send-outline"],
};

function Section({ title, children }) {
  const [tone, icon] = SECTION_ICONS[title] || ["progress", "document-text-outline"];
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={styles.sectionHead}>
        <View style={[styles.tile, { backgroundColor: tones[tone].bg }]}>
          <Ionicons name={icon} size={17} color={tones[tone].fg} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </Card>
  );
}

/** Short phrases as chips, sentences as a bullet list (first six, then "Show all"). */
function Items({ value, checked }) {
  const [expanded, setExpanded] = useState(false);
  const items = requirementItems(value);
  if (!items.length) return null;
  if (isChipList(items)) {
    return (
      <Row style={{ flexWrap: "wrap", rowGap: spacing.sm }}>
        {items.map((item, index) => <Chip key={`${item}-${index}`} label={item} numberOfLines={2} style={styles.wrapChip} />)}
      </Row>
    );
  }
  const shown = expanded ? items : items.slice(0, LIST_LIMIT);
  return (
    <View style={{ gap: spacing.sm }}>
      {shown.map((item, index) => (
        <Row key={index} align="flex-start">
          {checked ? <Ionicons name="checkmark" size={15} color={colors.primary} style={{ marginTop: 3, flexShrink: 0 }} /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: 8, marginHorizontal: 4, flexShrink: 0 }} />}
          <Text style={[type.body, { flex: 1, minWidth: 0 }]}>{item}</Text>
        </Row>
      ))}
      {items.length > LIST_LIMIT ? <Button title={expanded ? "Show less" : `Show all ${items.length}`} variant="ghost" small onPress={() => setExpanded((open) => !open)} /> : null}
    </View>
  );
}

export function JobPostingDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const postings = useJobPostings();
  const queryClient = useQueryClient();
  const dropdowns = postings.data?.dropdowns || {};
  const job = (postings.data?.records || []).find((item) => String(item.id) === String(id));

  const remove = useMutation({
    mutationFn: () => deleteJobPosting(job.id),
    onSuccess: () => {
      queryClient.setQueryData(jobPostingsKey, (previous) => previous && { ...previous, records: previous.records.filter((item) => item.id !== job.id) });
      toast.success("Job posting deleted successfully.");
      navigation.goBack();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (postings.isPending) return <Screen><LoadingState /></Screen>;
  if (postings.isError && !job) return <Screen><ErrorState message={errorMessage(postings.error)} onRetry={() => postings.refetch()} /></Screen>;
  if (!job) return <Screen><EmptyState icon="briefcase-outline" title="Job posting unavailable" message="This posting may have been deleted." action="Back to postings" onAction={() => navigation.goBack()} /></Screen>;

  const confirmDelete = () => {
    Alert.alert("Delete job posting?", `“${postingTitle(job)}” will be removed from job postings. Candidates will no longer be able to apply to this posting.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete posting", style: "destructive", onPress: () => remove.mutate() },
    ]);
  };

  const status = postingStatus(job, dropdowns);
  const tags = [
    fieldLabel(job, ["employment_type", "job_type"], dropdowns, true),
    experienceRange(job),
    jobLocation(job) || fieldLabel(job, ["work_mode"], dropdowns, true),
    fieldLabel(job, ["department", "company_name", "company"], dropdowns, true),
  ].filter(Boolean);
  const closing = plainText(valueOf(job, ["closing_date", "application_deadline", "last_date"]));
  const about = plainText(valueOf(job, ["job_description", "description"]));
  const instructions = plainText(job.application_instructions);
  const postingUrl = plainText(job.job_posting_url);
  const hasUrl = /^https?:\/\//i.test(postingUrl);
  const requiredSkills = valueOf(job, ["required_skills", "skills"]);

  return (
    <Screen refreshing={postings.isRefetching} onRefresh={() => postings.refetch()}>
      <View style={{ gap: spacing.md }}>
        <View style={styles.titleRow}>
          <View style={[styles.titleIcon, { backgroundColor: tones.progress.bg }]}>
            <Ionicons name="briefcase" size={22} color={tones.progress.fg} />
          </View>
          <View style={styles.titleText}>
            {job.job_code ? <Text style={[type.tiny, { color: colors.primary }]}>{`Job posting · ${clean(job.job_code)}`}</Text> : null}
            <Text style={styles.title}>{postingTitle(job)}</Text>
          </View>
        </View>
        <Row style={{ flexWrap: "wrap", rowGap: spacing.sm }}>
          {status ? <Chip label={status.label} tone={status.tone} style={styles.wrapChip} /> : null}
          {tags.map((tag) => <Chip key={tag} label={tag} numberOfLines={2} style={styles.wrapChip} />)}
        </Row>
      </View>

      <Card style={{ gap: 0 }}>
        <KeyValue label="Salary" value={salaryRange(job)} />
        <KeyValue label="Apply by" value={closing ? formatDate(closing) : undefined} />
        <KeyValue label="Experience" value={experienceRange(job)} />
        <KeyValue label="Work mode" value={fieldLabel(job, ["work_mode", "workplace_type"], dropdowns, true)} />
        <KeyValue label="Employment" value={fieldLabel(job, ["employment_type", "job_type"], dropdowns, true)} />
        <KeyValue label="Openings" value={plainText(job.number_of_positions)} />
        <KeyValue label="Education" value={fieldLabel(job, ["education_required"], dropdowns, true)} />
        <KeyValue label="Posting status" value={status?.label || "Not set"} last />
      </Card>

      {about ? <Section title="About the role"><Text style={type.body} selectable>{about}</Text></Section> : null}
      {plainText(job.job_responsibilities) ? <Section title="Key responsibilities"><Items value={job.job_responsibilities} /></Section> : null}
      {plainText(requiredSkills) ? <Section title="What you'll bring"><Items value={requiredSkills} checked /></Section> : null}
      {plainText(job.preferred_skills) ? <Section title="Nice to have"><Items value={job.preferred_skills} /></Section> : null}
      {plainText(job.qualifications) ? <Section title="Qualifications"><Items value={job.qualifications} checked /></Section> : null}
      {plainText(job.benefits) ? <Section title="Benefits"><Items value={job.benefits} /></Section> : null}
      {instructions || hasUrl ? (
        <Section title="How to apply">
          {instructions ? <Text style={type.body} selectable>{instructions}</Text> : null}
          {hasUrl ? <Button title="View original posting" icon="open-outline" variant="ghost" small onPress={() => Linking.openURL(postingUrl)} /> : null}
        </Section>
      ) : null}

      <Button title="Delete posting" icon="trash-outline" variant="outline" full loading={remove.isPending} onPress={confirmDelete} style={[styles.bigButton, { borderColor: colors.destructive, backgroundColor: colors.destructiveSoft }]} />
    </Screen>
  );
}

/* ── Create form ────────────────────────────────────────────────────────── */

// Descriptions are plain text: the web dialog uses <textarea>s (no rich editor), so a multiline
// Field sends exactly what the web would.
function JobField({ name, value, onChange, dropdowns }) {
  const label = `${jobFieldLabel(name)}${requiredJobFields.has(name) ? " *" : ""}`;
  const options = dropdowns[name];
  const entries = options && !Array.isArray(options) && typeof options === "object" ? Object.entries(options) : [];
  if (!longJobFields.has(name) && entries.length) {
    // Keep a value that is not in the dropdown selectable, as the web <select> does.
    const items = [{ label: "Not set", value: "" }, ...(value && !Object.hasOwn(options, value) ? [{ label: value, value }] : []), ...entries.map(([key, text]) => ({ label: String(text), value: key }))];
    return <SelectField label={label} value={value || ""} onChange={onChange} options={items} placeholder={`Select ${jobFieldLabel(name).toLowerCase()}`} />;
  }
  const isDate = name.endsWith("_date");
  return (
    <Field
      label={label}
      value={value || ""}
      onChangeText={onChange}
      multiline={longJobFields.has(name)}
      keyboardType={numericJobFields.has(name) ? "numeric" : name.endsWith("_email") ? "email-address" : name.endsWith("_url") ? "url" : undefined}
      autoCapitalize={isDate || name.endsWith("_email") || name.endsWith("_url") ? "none" : "sentences"}
      placeholder={isDate ? "YYYY-MM-DD" : undefined}
    />
  );
}

export function JobPostingFormScreen({ navigation }) {
  const postings = useJobPostings();
  const queryClient = useQueryClient();
  const dropdowns = postings.data?.dropdowns || {};
  const [draft, setDraft] = useState(emptyJobDraft);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const saved = useRef(false);

  const change = (key, value) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
  };

  const create = useMutation({
    mutationFn: (data) => createJobPosting(data),
    onSuccess: () => {
      saved.current = true;
      queryClient.invalidateQueries({ queryKey: jobPostingsKey });
      toast.success("Job posting created successfully.");
      navigation.goBack();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  // Same guard as the web dialog's "Discard your unsaved job posting?".
  useEffect(() => {
    if (!dirty) return undefined;
    return navigation.addListener?.("beforeRemove", (event) => {
      if (saved.current) return;
      event.preventDefault();
      Alert.alert("Discard your unsaved job posting?", "Your changes will be lost.", [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => navigation.dispatch(event.data.action) },
      ]);
    });
  }, [dirty, navigation]);

  const submit = () => {
    if (create.isPending) return;
    let data;
    try {
      data = buildJobPostingData(draft);
    } catch (err) {
      setError(err.message);
      return;
    }
    setError("");
    create.mutate(data);
  };

  return (
    <Screen>
      <PageHeader icon="briefcase" tone="progress" title="New job posting" subtitle="Define the role, requirements, and application details. Fields marked * are required." />
      {jobFormSections.map(([title, fields]) => (
        <Card key={title} style={{ gap: spacing.md }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {fields.map((name) => <JobField key={name} name={name} value={draft[name]} onChange={(value) => change(name, value)} dropdowns={dropdowns} />)}
          {title === "Compensation" ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: draft.salary_negotiable === "1" }}
              onPress={() => change("salary_negotiable", draft.salary_negotiable === "1" ? "0" : "1")}
              style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 4 }}
            >
              <Ionicons name={draft.salary_negotiable === "1" ? "checkbox" : "square-outline"} size={22} color={colors.primary} style={{ flexShrink: 0 }} />
              <Text style={[type.body, { flex: 1, minWidth: 0 }]}>Salary negotiable</Text>
            </Pressable>
          ) : null}
        </Card>
      ))}
      {error ? <Notice tone="closed" icon="alert-circle-outline" message={error} /> : null}
      <Button title={create.isPending ? "Creating…" : "Create job posting"} icon="checkmark-circle-outline" full loading={create.isPending} onPress={submit} style={styles.bigButton} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bigButton: { minHeight: 50 },
  statusChip: { maxWidth: 120, flexShrink: 0 },
  wrapChip: { maxWidth: "100%", flexShrink: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  titleIcon: { flexShrink: 0, width: 48, height: 48, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  titleText: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "600", letterSpacing: -0.4, color: colors.navy },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  tile: { flexShrink: 0, width: 34, height: 34, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  sectionTitle: { flex: 1, minWidth: 0, fontSize: 17, lineHeight: 23, fontWeight: "600", color: colors.navy },
});
