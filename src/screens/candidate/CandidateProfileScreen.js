// Candidate profile (web pages/Profile.jsx): saved details with an edit form that applies the
// web's validation rules, editable skills / experience / education, photo upload, resume
// upload and government ID verification.
import { useEffect, useMemo, useState } from "react";
import { Image, Text, View } from "react-native";
import { types } from "@react-native-documents/picker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { colors, type } from "../../theme";
import { Avatar, Button, Card, Chip, ErrorState, Field, KeyValue, LoadingState, Notice, Row, Screen, SectionTitle, SelectField, SkeletonRows } from "../../components/ui";
import DateField from "../../components/ui/DateField";
import { pickOneFile } from "../../components/candidate/pickFile";
import { keys, useCandidateProfile, useEmail } from "../../hooks/queries";
import { candidateFields, candidateRelatedKey, fetchCandidateRelated, findCandidate, saveCandidate, uploadCandidateImage } from "../../api/candidate.api";
import { useAuthStore } from "../../store/authStore";
import { toast } from "../../store/toastStore";
import { confirmLogout } from "../../utils/confirmLogout";
import { ABOUT_MIN_LENGTH, genderOptions, governmentIdTypes, localToday, normalizeCandidate, normalizeProfileUrl, photoFileError, requiredPersonalFields, validatePersonalDetails } from "../../utils/candidateProfile";
import { errorMessage, fullName, plainText } from "../../utils/records";
import { formatDate } from "../../utils/dates";
import { missingConfig } from "../../config";

// Side-by-side form fields wrap onto their own lines when large fonts make them too narrow.
const PAIR_ROW = { flexWrap: "wrap", columnGap: 12, rowGap: 12 };
const PAIR_FIELD = { flexGrow: 1, flexShrink: 1, flexBasis: 140, minWidth: 0 };

const sectionTitles = { experiences: "Experience", education: "Education", skills: "Skills" };

export function useRelated(candidateId, section) {
  return useQuery({ queryKey: candidateRelatedKey(candidateId, section), queryFn: () => fetchCandidateRelated(candidateId, section), enabled: Boolean(candidateId), staleTime: 60000 });
}

/** Saves the whole profile the way the web does (normalized draft + candidate source), then refreshes the cache. */
export async function saveProfile({ candidate, draft, email, identification }) {
  const existing = candidate || (await findCandidate(email));
  const saved = await saveCandidate(existing?.id, { ...draft, candidate_source: existing?.candidate_source }, email, identification);
  if (!saved.id) {
    const confirmed = await findCandidate(email);
    if (!confirmed) throw new Error("Save was accepted, but the profile could not be confirmed. Retry saving to check again.");
    saved.id = confirmed.id;
  }
  return { ...existing, ...saved };
}

export function CandidateProfileScreen({ navigation }) {
  const email = useEmail();
  const profile = useCandidateProfile();
  const candidate = profile.data;
  const queryClient = useQueryClient();
  const signOut = useAuthStore((state) => state.signOut);
  const skills = useRelated(candidate?.id, "skills");
  const experiences = useRelated(candidate?.id, "experiences");
  const education = useRelated(candidate?.id, "education");
  const missing = missingConfig();
  const draft = useMemo(() => (candidate ? normalizeCandidate(candidate, email) : null), [candidate, email]);
  const incomplete = useMemo(() => (draft ? Object.keys(validatePersonalDetails(draft)) : []), [draft]);

  const photo = useMutation({
    mutationFn: async (file) => {
      const url = await uploadCandidateImage({ file, email });
      return saveProfile({ candidate, draft: { ...draft, profile_image: url }, email });
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(keys.candidate(email), saved);
      toast.success("Photo uploaded.");
    },
    onError: (err) => toast.error(errorMessage(err, "Photo upload failed. Please try again.")),
  });

  const choosePhoto = async () => {
    // The web saves the photo with the profile, so the profile must be valid first.
    if (incomplete.length) {
      toast.error("Complete your personal details before adding a photo.");
      navigation.navigate("CandidateProfileEdit");
      return;
    }
    let file;
    try {
      file = await pickOneFile([types.images]);
    } catch (err) {
      toast.error(err.message);
      return;
    }
    if (!file) return;
    const problem = photoFileError(file);
    if (problem) return toast.error(problem);
    photo.mutate(file);
  };

  const confirmSignOut = () =>
    confirmLogout(signOut);

  if (profile.isPending) return <Screen><LoadingState label="Loading your profile…" variant="cards" /></Screen>;

  const name = candidate ? fullName(candidate, email) : email;
  const idType = governmentIdTypes[candidate?.government_id_type];

  return (
    <Screen refreshing={profile.isFetching} onRefresh={() => { profile.refetch(); skills.refetch(); experiences.refetch(); education.refetch(); }}>
      <Card style={{ alignItems: "center", gap: 8, paddingVertical: 24 }}>
        {draft?.profile_image ? (
          <Image source={{ uri: draft.profile_image }} style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.muted }} accessibilityLabel={`Profile photo of ${name}`} />
        ) : (
          <Avatar name={name} size={64} />
        )}
        <Text style={[type.heading, { textAlign: "center" }]} numberOfLines={2}>{name}</Text>
        {draft?.current_designation ? <Text style={[type.body, { textAlign: "center" }]}>{draft.current_designation}</Text> : null}
        <Text style={[type.small, { textAlign: "center", alignSelf: "stretch" }]} numberOfLines={1} ellipsizeMode="tail">{email}</Text>
        <Row style={{ flexWrap: "wrap", justifyContent: "center", columnGap: 8, rowGap: 8, alignSelf: "stretch" }}>
          <Chip label="Candidate" tone="progress" />
          {candidate?.hrc_stages_id_c_name ? <Chip label={candidate.hrc_stages_id_c_name} tone="lime" style={{ maxWidth: "100%" }} /> : null}
        </Row>
        <Row style={{ flexWrap: "wrap", justifyContent: "center", columnGap: 8, rowGap: 8 }}>
          <Button title={candidate?.id ? "Edit details" : "Set up profile"} icon="create-outline" small variant="secondary" onPress={() => navigation.navigate("CandidateProfileEdit")} />
          {candidate?.id ? <Button title={draft?.profile_image ? "Change photo" : "Add photo"} icon="camera-outline" small variant="outline" loading={photo.isPending} onPress={choosePhoto} /> : null}
        </Row>
      </Card>

      {missing.length ? <Notice tone="closed" icon="key-outline" title="App keys missing" message={`Set ${missing.join(" and ")} in .env.`} /> : null}
      {profile.isError ? <ErrorState message={profile.error.message} onRetry={() => profile.refetch()} /> : null}

      {candidate && incomplete.length ? (
        <Notice
          tone="attention"
          icon="alert-circle-outline"
          title="Complete your profile"
          message={`Still needed: ${incomplete.map((key) => requiredPersonalFields[key] || candidateFields[key]).slice(0, 4).join(", ")}${incomplete.length > 4 ? ` and ${incomplete.length - 4} more` : ""}.`}
          action="Complete"
          onAction={() => navigation.navigate("CandidateProfileEdit")}
        />
      ) : null}

      <Notice tone="progress" icon="document-attach-outline" title="Upload your resume" message="We read your resume and fill in your skills, experience and education for you to review." action="Upload" onAction={() => navigation.navigate("CandidateResume")} />

      {candidate ? (
        <>
          {draft.description ? (
            <Card>
              <Text style={type.subheading}>About</Text>
              <Text style={type.body}>{draft.description}</Text>
            </Card>
          ) : null}
          <View style={{ gap: 10 }}>
            <SectionTitle title="Personal details" action="Edit" onAction={() => navigation.navigate("CandidateProfileEdit")} />
            <Card>
              <KeyValue label="Phone" value={draft.phone_mobile} />
              <KeyValue label="Date of birth" value={draft.dob ? formatDate(draft.dob) : ""} />
              <KeyValue label="Gender" value={draft.gender} />
              <KeyValue label="Street" value={draft.primary_address_street} />
              <KeyValue label="Location" value={[draft.primary_address_city, draft.primary_address_state, draft.primary_address_country].filter(Boolean).join(", ")} />
              <KeyValue label="Postal code" value={draft.primary_address_postalcode} />
              <KeyValue label="Department" value={draft.department} />
              <KeyValue label="LinkedIn" value={draft.linkedin_url} />
              <KeyValue label="GitHub" value={draft.github_url} last />
            </Card>
          </View>
          <RelatedSection section="experiences" query={experiences} navigation={navigation} render={(item) => `${item.name || item.position || item.designation || "Role"}${item.company_name || item.company ? ` · ${item.company_name || item.company}` : ""}`} sub={(item) => (item.joining_date ? `${formatDate(item.joining_date)} – ${item.leaving_date ? formatDate(item.leaving_date) : "Present"}` : "")} />
          <RelatedSection section="education" query={education} navigation={navigation} render={(item) => item.name || item.qualification || "Qualification"} sub={(item) => [item.qualification !== item.name ? item.qualification : "", item.institution || item.university || item.school, [item.from_time, item.to_time].filter(Boolean).join(" – ")].filter(Boolean).join(" · ")} />
          <RelatedSection section="skills" query={skills} navigation={navigation} render={(item) => item.name || item.skill_name || item.skill} chips />
          <View style={{ gap: 10 }}>
            <SectionTitle title="Government ID" action={idType ? "Update" : "Verify"} onAction={() => navigation.navigate("CandidateGovernmentId")} />
            <Card>
              {idType ? (
                <KeyValue label={idType.label} value={`••••${String(candidate.government_id_number || "").slice(-4)}`} last />
              ) : (
                <Text style={type.small}>Verify a PAN, Aadhaar or driving licence to complete your profile.</Text>
              )}
            </Card>
          </View>
        </>
      ) : (
        <Notice tone="attention" icon="person-add-outline" title="No candidate record yet" message="Set up your profile so HR can find you and you can apply to roles." action="Set up" onAction={() => navigation.navigate("CandidateProfileEdit")} />
      )}

      <Button title="Sign out" icon="log-out-outline" variant="outline" full onPress={confirmSignOut} style={{ borderColor: colors.destructive }} />
    </Screen>
  );
}

function RelatedSection({ section, query, navigation, render, sub, chips }) {
  const items = query.data || [];
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle
        title={sectionTitles[section]}
        hint={query.isPending ? undefined : `${items.length} item${items.length === 1 ? "" : "s"}`}
        action={items.length ? "Edit" : "Add"}
        onAction={() => navigation.navigate("CandidateRelatedEdit", { section })}
      />
      {query.isPending ? (
        <Card><SkeletonRows count={2} avatar={false} label={`Loading ${sectionTitles[section].toLowerCase()}…`} /></Card>
      ) : query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <Text style={type.small}>Nothing added yet.</Text>
      ) : chips ? (
        <Row style={{ flexWrap: "wrap", columnGap: 8, rowGap: 8 }}>{items.map((item, index) => <Chip key={item.id || index} label={plainText(render(item)) || "Skill"} tone="neutral" style={{ maxWidth: "100%" }} />)}</Row>
      ) : (
        items.map((item, index) => (
          <Card key={item.id || index} style={{ gap: 2 }}>
            <Text style={type.subheading}>{plainText(render(item))}</Text>
            {sub && sub(item) ? <Text style={type.small}>{plainText(sub(item))}</Text> : null}
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
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (draft || profile.isPending) return;
    setDraft(normalizeCandidate(candidate || {}, email));
  }, [candidate, draft, email, profile.isPending]);

  const save = useMutation({
    mutationFn: (values) => saveProfile({ candidate, draft: values, email }),
    onSuccess: (saved) => {
      toast.success("Your candidate profile has been saved.");
      queryClient.setQueryData(keys.candidate(email), saved);
      queryClient.invalidateQueries({ queryKey: keys.candidate(email) });
      navigation.goBack();
    },
    onError: (err) => setError(errorMessage(err, "Unable to save your profile.")),
  });

  if (!draft) return <Screen><LoadingState variant="lines" /></Screen>;

  const update = (key) => (value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };
  const submit = () => {
    const values = { ...draft, linkedin_url: normalizeProfileUrl(draft.linkedin_url), github_url: normalizeProfileUrl(draft.github_url) };
    const found = validatePersonalDetails(values);
    setErrors(found);
    if (Object.keys(found).length) {
      setError(`${Object.values(found)[0]}${Object.keys(found).length > 1 ? ` (${Object.keys(found).length} fields need attention)` : ""}`);
      return;
    }
    setError("");
    setDraft(values);
    save.mutate(values);
  };

  const label = (key) => `${requiredPersonalFields[key] || candidateFields[key]}${requiredPersonalFields[key] ? " *" : ""}`;
  const genders = !draft.gender || genderOptions.some((option) => option.toLowerCase() === draft.gender.toLowerCase()) ? genderOptions : [...genderOptions, draft.gender];
  const aboutLength = draft.description.trim().length;

  return (
    <Screen>
      <Text style={type.small}>Your email ({email}) is linked to your login and cannot be changed here. Fields marked * are required.</Text>
      <SectionTitle title="Personal information" />
      <Row style={PAIR_ROW} align="flex-start">
        <Field style={PAIR_FIELD} label={label("first_name")} value={draft.first_name} onChangeText={update("first_name")} autoCapitalize="words" error={errors.first_name} />
        <Field style={PAIR_FIELD} label={label("last_name")} value={draft.last_name} onChangeText={update("last_name")} autoCapitalize="words" error={errors.last_name} />
      </Row>
      <Field label={label("phone_mobile")} value={draft.phone_mobile} onChangeText={update("phone_mobile")} keyboardType="phone-pad" error={errors.phone_mobile} hint="7 to 15 digits, including the country code if needed." />
      <Row style={PAIR_ROW} align="flex-start">
        <View style={PAIR_FIELD}>
          <DateField label={label("dob")} value={draft.dob} onChange={update("dob")} placeholder="Select date" maxKey={localToday()} allowWeekends />
          {errors.dob ? <Text style={[type.small, { color: colors.destructive, marginTop: 6 }]}>{errors.dob}</Text> : null}
        </View>
        <SelectField style={PAIR_FIELD} label={label("gender")} value={draft.gender} onChange={update("gender")} options={genders} error={errors.gender} />
      </Row>

      <SectionTitle title="Address" />
      <Field label={label("primary_address_street")} value={draft.primary_address_street} onChangeText={update("primary_address_street")} autoCapitalize="words" error={errors.primary_address_street} />
      <Row style={PAIR_ROW} align="flex-start">
        <Field style={PAIR_FIELD} label={label("primary_address_city")} value={draft.primary_address_city} onChangeText={update("primary_address_city")} autoCapitalize="words" error={errors.primary_address_city} />
        <Field style={PAIR_FIELD} label={label("primary_address_state")} value={draft.primary_address_state} onChangeText={update("primary_address_state")} autoCapitalize="words" error={errors.primary_address_state} />
      </Row>
      <Row style={PAIR_ROW} align="flex-start">
        <Field style={PAIR_FIELD} label={label("primary_address_postalcode")} value={draft.primary_address_postalcode} onChangeText={update("primary_address_postalcode")} autoCapitalize="characters" error={errors.primary_address_postalcode} />
        <Field style={PAIR_FIELD} label={label("primary_address_country")} value={draft.primary_address_country} onChangeText={update("primary_address_country")} autoCapitalize="words" error={errors.primary_address_country} />
      </Row>

      <SectionTitle title="Professional summary" />
      <Field label={label("current_designation")} value={draft.current_designation} onChangeText={update("current_designation")} placeholder="e.g. Frontend Developer" error={errors.current_designation} />
      <Field
        label={label("description")}
        value={draft.description}
        onChangeText={update("description")}
        multiline
        placeholder="Your background, strengths, and career goals."
        error={errors.description}
        hint={`At least ${ABOUT_MIN_LENGTH} characters · ${aboutLength} so far`}
      />
      <Field label={candidateFields.linkedin_url} value={draft.linkedin_url} onChangeText={update("linkedin_url")} autoCapitalize="none" keyboardType="url" placeholder="linkedin.com/in/your-name" error={errors.linkedin_url} />
      <Field label={candidateFields.github_url} value={draft.github_url} onChangeText={update("github_url")} autoCapitalize="none" keyboardType="url" placeholder="github.com/your-name" error={errors.github_url} />
      {error ? <Notice tone="closed" icon="alert-circle-outline" message={error} /> : null}
      <Button title={candidate?.id ? "Save changes" : "Create profile"} icon="save-outline" full loading={save.isPending} onPress={submit} style={{ minHeight: 50 }} />
    </Screen>
  );
}
