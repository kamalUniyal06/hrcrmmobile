import { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { colors, type } from "../../theme";
import { Avatar, Button, Card, Chip, ErrorState, Field, KeyValue, LoadingState, Notice, Row, Screen, SectionTitle, SelectField } from "../../components/ui";
import { keys, useCandidateProfile, useEmail } from "../../hooks/queries";
import { candidateFields, editableCandidateFields, fetchCandidateRelated, saveCandidate } from "../../api/candidate.api";
import { useAuthStore } from "../../store/authStore";
import { toast } from "../../store/toastStore";
import { clean, errorMessage, fullName, plainText } from "../../utils/records";
import { missingConfig } from "../../config";

const GENDERS = ["Male", "Female", "Non-binary", "Other", "Prefer not to say"];

// Side-by-side form fields wrap onto their own lines when large fonts make them too narrow.
const PAIR_ROW = { flexWrap: "wrap", columnGap: 12, rowGap: 12 };
const PAIR_FIELD = { flexGrow: 1, flexShrink: 1, flexBasis: 140, minWidth: 0 };

export function CandidateProfileScreen({ navigation }) {
  const email = useEmail();
  const profile = useCandidateProfile();
  const candidate = profile.data;
  const signOut = useAuthStore((state) => state.signOut);
  const skills = useRelated(candidate?.id, "skills");
  const experiences = useRelated(candidate?.id, "experiences");
  const education = useRelated(candidate?.id, "education");
  const missing = missingConfig();

  const confirmSignOut = () =>
    Alert.alert("Sign out?", "You will need to sign in again.", [{ text: "Cancel", style: "cancel" }, { text: "Sign out", style: "destructive", onPress: () => signOut() }]);

  if (profile.isPending) return <Screen><LoadingState label="Loading your profile…" /></Screen>;

  return (
    <Screen refreshing={profile.isFetching} onRefresh={() => profile.refetch()}>
      <Card style={{ alignItems: "center", gap: 8, paddingVertical: 24 }}>
        <Avatar name={candidate ? fullName(candidate, email) : email} size={64} />
        <Text style={[type.heading, { textAlign: "center" }]} numberOfLines={2}>{candidate ? fullName(candidate, email) : email}</Text>
        <Text style={[type.small, { textAlign: "center", alignSelf: "stretch" }]} numberOfLines={1} ellipsizeMode="tail">{email}</Text>
        <Row style={{ flexWrap: "wrap", justifyContent: "center", columnGap: 8, rowGap: 8, alignSelf: "stretch" }}>
          <Chip label="Candidate" tone="progress" />
          {candidate?.hrc_stages_id_c_name ? <Chip label={candidate.hrc_stages_id_c_name} tone="lime" style={{ maxWidth: "100%" }} /> : null}
        </Row>
        <Button title={candidate?.id ? "Edit profile" : "Set up profile"} icon="create-outline" small variant="secondary" onPress={() => navigation.navigate("CandidateProfileEdit")} />
      </Card>

      {missing.length ? <Notice tone="closed" icon="key-outline" title="App keys missing" message={`Set ${missing.join(" and ")} in .env.`} /> : null}
      {profile.isError ? <ErrorState message={profile.error.message} onRetry={() => profile.refetch()} /> : null}

      {candidate ? (
        <>
          <View style={{ gap: 10 }}>
            <SectionTitle title="Personal details" />
            <Card>
              <KeyValue label="Phone" value={candidate.phone_mobile || candidate.phone} />
              <KeyValue label="Designation" value={candidate.current_designation || candidate.title} />
              <KeyValue label="Department" value={candidate.department} />
              <KeyValue label="Date of birth" value={candidate.dob} />
              <KeyValue label="Gender" value={candidate.gender} />
              <KeyValue label="Location" value={[candidate.primary_address_city, candidate.primary_address_state, candidate.primary_address_country].filter(Boolean).join(", ")} />
              <KeyValue label="LinkedIn" value={candidate.linkedin_url} />
              <KeyValue label="GitHub" value={candidate.github_url} last />
            </Card>
            {plainText(candidate.description) && !candidate.description.trim().startsWith("{") ? (
              <Card>
                <Text style={type.subheading}>About</Text>
                <Text style={type.body}>{plainText(candidate.description)}</Text>
              </Card>
            ) : null}
          </View>
          <RelatedSection title="Skills" query={skills} render={(item) => item.skill_name || item.skill || item.name} chips />
          <RelatedSection title="Experience" query={experiences} render={(item) => `${item.position || item.designation || item.name || "Role"}${item.company_name || item.company ? ` · ${item.company_name || item.company}` : ""}`} sub={(item) => [item.joining_date, item.leaving_date || "Present"].filter(Boolean).join(" – ")} />
          <RelatedSection title="Education" query={education} render={(item) => item.qualification || item.name || "Qualification"} sub={(item) => [item.institution || item.university || item.school, item.specialization].filter(Boolean).join(" · ")} />
        </>
      ) : (
        <Notice tone="attention" icon="person-add-outline" title="No candidate record yet" message="Set up your profile so HR can find you and you can apply to roles." action="Set up" onAction={() => navigation.navigate("CandidateProfileEdit")} />
      )}

      <Button title="Sign out" icon="log-out-outline" variant="outline" full onPress={confirmSignOut} style={{ borderColor: colors.destructive }} />
    </Screen>
  );
}

function useRelated(candidateId, section) {
  return useQuery({ queryKey: ["candidate-related", candidateId, section], queryFn: () => fetchCandidateRelated(candidateId, section), enabled: Boolean(candidateId), staleTime: 60000 });
}

function RelatedSection({ title, query, render, sub, chips }) {
  const items = query.data || [];
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle title={title} hint={query.isPending ? "Loading…" : `${items.length} item${items.length === 1 ? "" : "s"}`} />
      {items.length === 0 && !query.isPending ? (
        <Text style={type.small}>Nothing added yet. Complete this on app.hrcrm.ai with your resume.</Text>
      ) : chips ? (
        <Row style={{ flexWrap: "wrap", columnGap: 8, rowGap: 8 }}>{items.map((item, index) => <Chip key={`${index}`} label={plainText(render(item)) || "Skill"} tone="neutral" style={{ maxWidth: "100%" }} />)}</Row>
      ) : (
        items.map((item, index) => (
          <Card key={item.id || index} style={{ gap: 2 }}>
            <Text style={type.subheading}>{plainText(render(item))}</Text>
            {sub ? <Text style={type.small}>{plainText(sub(item))}</Text> : null}
            {item.description ? <Text style={type.small} numberOfLines={3}>{plainText(item.description)}</Text> : null}
          </Card>
        ))
      )}
    </View>
  );
}

export function CandidateProfileEditScreen({ navigation }) {
  const email = useEmail();
  const profile = useCandidateProfile();
  const candidate = profile.data;
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (draft || profile.isPending) return;
    setDraft(Object.fromEntries(editableCandidateFields.map((key) => [key, clean(candidate?.[key])])));
  }, [candidate, draft, profile.isPending]);

  const save = useMutation({
    mutationFn: () => saveCandidate(candidate?.id, draft, email),
    onSuccess: () => {
      toast.success("Profile saved");
      queryClient.invalidateQueries({ queryKey: keys.candidate(email) });
      navigation.goBack();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (!draft) return <Screen><LoadingState /></Screen>;

  const update = (key) => (value) => setDraft({ ...draft, [key]: value });
  const submit = () => {
    if (!clean(draft.first_name)) return setError("Please enter your first name.");
    if (draft.phone_mobile && !/^[+\d][\d\s-]{6,}$/.test(draft.phone_mobile)) return setError("Enter a valid phone number.");
    if (draft.dob && !/^\d{4}-\d{2}-\d{2}$/.test(draft.dob)) return setError("Date of birth must be YYYY-MM-DD.");
    for (const key of ["linkedin_url", "github_url"]) {
      if (draft[key] && !/^https?:\/\//i.test(draft[key])) draft[key] = `https://${draft[key]}`;
    }
    setError("");
    save.mutate();
  };

  return (
    <Screen>
      <Text style={type.small}>Your email ({email}) is linked to your login and cannot be changed here.</Text>
      <Row style={PAIR_ROW} align="flex-start">
        <Field style={PAIR_FIELD} label={candidateFields.first_name} value={draft.first_name} onChangeText={update("first_name")} autoCapitalize="words" />
        <Field style={PAIR_FIELD} label={candidateFields.last_name} value={draft.last_name} onChangeText={update("last_name")} autoCapitalize="words" />
      </Row>
      <Field label={candidateFields.phone_mobile} value={draft.phone_mobile} onChangeText={update("phone_mobile")} keyboardType="phone-pad" />
      <Field label={candidateFields.current_designation} value={draft.current_designation} onChangeText={update("current_designation")} placeholder="e.g. Frontend Developer" />
      <Field label={candidateFields.department} value={draft.department} onChangeText={update("department")} />
      <Row style={PAIR_ROW} align="flex-start">
        <Field style={PAIR_FIELD} label={candidateFields.dob} value={draft.dob} onChangeText={update("dob")} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
        <SelectField style={PAIR_FIELD} label={candidateFields.gender} value={draft.gender} onChange={update("gender")} options={GENDERS} />
      </Row>
      <Field label={candidateFields.primary_address_city} value={draft.primary_address_city} onChangeText={update("primary_address_city")} autoCapitalize="words" />
      <Row style={PAIR_ROW} align="flex-start">
        <Field style={PAIR_FIELD} label={candidateFields.primary_address_state} value={draft.primary_address_state} onChangeText={update("primary_address_state")} autoCapitalize="words" />
        <Field style={PAIR_FIELD} label={candidateFields.primary_address_country} value={draft.primary_address_country} onChangeText={update("primary_address_country")} autoCapitalize="words" />
      </Row>
      <Field label={candidateFields.linkedin_url} value={draft.linkedin_url} onChangeText={update("linkedin_url")} autoCapitalize="none" keyboardType="url" />
      <Field label={candidateFields.github_url} value={draft.github_url} onChangeText={update("github_url")} autoCapitalize="none" keyboardType="url" />
      <Field label={candidateFields.description} value={draft.description?.startsWith("{") ? "" : draft.description} onChangeText={update("description")} multiline placeholder="A short summary of your experience and goals" />
      {error ? <Notice tone="closed" icon="alert-circle-outline" message={error} /> : null}
      <Button title={candidate?.id ? "Save changes" : "Create profile"} icon="save-outline" full loading={save.isPending} onPress={submit} style={{ minHeight: 50 }} />
    </Screen>
  );
}
