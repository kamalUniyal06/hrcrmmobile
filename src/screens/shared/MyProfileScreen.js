// "My profile" for employees and admins (web: components/pages/Profile.jsx, view + edit phases).
// About, personal details, experience, education, skills and photo, each with its own Edit
// button. Editing swaps the page to one section's editor; "Save profile" saves the record and
// any changed related records, the same requests as the web.
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, spacing, type } from "../../theme";
import { Button, Card, Chip, ErrorState, LoadingState, Notice, Row, Screen } from "../../components/ui";
import {
  RELATED_SECTIONS,
  fetchProfileRelated,
  findProfile,
  normalizeProfile,
  profileKeys,
  saveMyProfile,
  validatePersonalDetails,
} from "../../api/profile.api";
import { PersonalEditor, PhotoEditor, RelatedEditor } from "../../components/profile/ProfileEditors";
import { PersonalView, ProfilePhoto, ProfileSection, RelatedView, SECTION_META, StrengthCard } from "../../components/profile/ProfileViews";
import { displayUrl, isWebUrl, profileCompletion } from "../../components/profile/profileFormat";
import { selectEmail, useAuthStore } from "../../store/authStore";
import { toast } from "../../store/toastStore";
import { errorMessage, initials } from "../../utils/records";

const EDITOR_COPY = {
  personal: { subtitle: "Personal details", description: "Your introduction, contact details and professional links." },
  education: { subtitle: "Education details", description: "Your qualifications, institutions and academic achievements." },
  experiences: { subtitle: "Work experience", description: "Your roles, responsibilities and career milestones." },
  skills: { subtitle: "Professional skills", description: "Highlight your strengths and the tools you know best." },
  photo: { subtitle: "Profile photograph", description: "Personalize your saved profile with a photo." },
};

export default function MyProfileScreen() {
  const email = useAuthStore(selectEmail);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: profileKeys.record(email), queryFn: () => findProfile(email), enabled: Boolean(email) });
  const record = profile.data || null;
  const relatedQueries = useQueries({
    queries: RELATED_SECTIONS.map((section) => ({
      queryKey: profileKeys.related(record?.id, section),
      queryFn: () => fetchProfileRelated(record.id, section),
      enabled: Boolean(record?.id),
      staleTime: 60 * 1000,
    })),
  });
  const related = Object.fromEntries(RELATED_SECTIONS.map((section, index) => [section, relatedQueries[index]]));

  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [relatedDraft, setRelatedDraft] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [photoBusy, setPhotoBusy] = useState(false);

  const saved = useMemo(() => normalizeProfile(record || {}, email), [record, email]);
  const shown = editing && draft ? draft : saved;

  const mutation = useMutation({
    mutationFn: (variables) => saveMyProfile(variables),
    onSuccess: ({ record: savedRecord, related: savedRelated }) => {
      queryClient.setQueryData(profileKeys.record(email), savedRecord);
      for (const [section, items] of Object.entries(savedRelated)) {
        queryClient.setQueryData(profileKeys.related(savedRecord.id, section), items);
      }
      setEditing(null);
      setDraft(null);
      setRelatedDraft({});
      toast.success("Your profile has been saved.");
    },
    onError: (err) => toast.error(errorMessage(err, "Unable to save your profile.")),
  });

  const locked = mutation.isPending || photoBusy;

  const startEditing = (section) => {
    if (locked) return;
    setDraft(saved);
    // Every loaded related list is carried into the edit, like the web's shared related cache.
    setRelatedDraft(Object.fromEntries(RELATED_SECTIONS.filter((key) => Array.isArray(related[key].data)).map((key) => [key, related[key].data])));
    setFieldErrors({});
    setEditing(section);
  };

  const cancelEditing = () => {
    if (locked) return;
    setEditing(null);
    setDraft(null);
    setRelatedDraft({});
    setFieldErrors({});
  };

  const save = () => {
    if (locked || !draft) return;
    const errors = validatePersonalDetails(draft);
    setFieldErrors(errors);
    const keys = Object.keys(errors);
    if (keys.length) {
      // As on the web, the personal details must be valid before anything is saved.
      setEditing("personal");
      toast.error(errors[keys[0]]);
      return;
    }
    mutation.mutate({
      record,
      draft,
      email,
      related: Object.entries(relatedDraft).map(([section, items]) => ({ section, items, original: related[section].data || [] })),
    });
  };

  if (!email) return <Screen><ErrorState message="Your login email is unavailable. Please sign in again." /></Screen>;
  if (profile.isPending) return <Screen><LoadingState label="Loading your profile…" variant="cards" rows={4} /></Screen>;
  if (profile.isError) {
    return (
      <Screen>
        <ErrorState message={`Your profile could not be loaded. ${errorMessage(profile.error, "")}`.trim()} onRetry={() => profile.refetch()} />
      </Screen>
    );
  }

  const name = [shown.first_name, shown.last_name].filter(Boolean).join(" ") || "My profile";
  const nameInitials = [shown.first_name, shown.last_name].filter(Boolean).length ? initials(name) : "";

  const hero = (
    <Card style={styles.hero}>
      <Row gap={14} align="flex-start">
        <ProfilePhoto uri={shown.profile_image} label={nameInitials} size={76} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text style={type.heading}>{name}</Text>
          <Text style={[type.body, !shown.current_designation && { color: colors.mutedForeground }]}>
            {shown.current_designation || "Professional title not added"}
          </Text>
          {record?.status ? <Chip label={record.status} tone="progress" icon="ribbon-outline" small style={{ alignSelf: "flex-start" }} /> : null}
        </View>
      </Row>
      <View style={{ gap: 6 }}>
        {shown.primary_address_city ? (
          <Meta icon="location-outline" text={[shown.primary_address_city, shown.primary_address_country].filter(Boolean).join(", ")} />
        ) : null}
        <Meta icon="mail-outline" text={email} />
        {shown.phone_mobile ? <Meta icon="call-outline" text={shown.phone_mobile} /> : null}
        {isWebUrl(shown.linkedin_url) ? <Meta icon="logo-linkedin" text={displayUrl(shown.linkedin_url)} /> : null}
      </View>
      {editing ? (
        <Chip
          label={record?.id ? `Editing ${SECTION_META[editing].title.toLowerCase()}` : "Draft, review before saving"}
          tone="attention"
          icon="pencil"
          style={{ alignSelf: "flex-start" }}
        />
      ) : (
        <Button title="Edit details" icon="pencil" variant="secondary" full disabled={locked} onPress={() => startEditing("personal")} />
      )}
    </Card>
  );

  if (editing) {
    const copy = EDITOR_COPY[editing];
    return (
      <Screen scroll={false} padded={false}>
        {/* The footer rides above the keyboard and clears the phone's navigation bar. */}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {hero}
          <Card style={{ gap: 16 }}>
            <View style={{ gap: 2 }}>
              <Text style={styles.eyebrow}>Editing</Text>
              <Text style={type.heading}>{copy.subtitle}</Text>
              <Text style={type.small}>{copy.description}</Text>
            </View>
            {editing === "personal" ? (
              <PersonalEditor email={email} draft={draft} setDraft={setDraft} fieldErrors={fieldErrors} setFieldErrors={setFieldErrors} disabled={locked} />
            ) : editing === "photo" ? (
              <PhotoEditor
                email={email}
                existingUrl={draft?.profile_image}
                disabled={mutation.isPending}
                onBusyChange={setPhotoBusy}
                onUploaded={(url) => setDraft((prev) => ({ ...prev, profile_image: url }))}
              />
            ) : related[editing].isError || !relatedDraft[editing] ? (
              <ErrorState
                message={related[editing].error?.message || "This section is still loading. Cancel and try again in a moment."}
                onRetry={related[editing].isError ? () => related[editing].refetch() : undefined}
              />
            ) : (
              <RelatedEditor
                section={editing}
                items={relatedDraft[editing]}
                onChange={(items) => setRelatedDraft((prev) => ({ ...prev, [editing]: items }))}
                disabled={locked}
              />
            )}
          </Card>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: 14 + insets.bottom }]}>
          <Text style={[type.small, { alignSelf: "stretch" }]}>Changes apply to your profile as soon as you save.</Text>
          <Row gap={10} style={{ alignSelf: "stretch" }}>
            <Button title="Cancel" variant="outline" disabled={locked} onPress={cancelEditing} style={{ flex: 1 }} />
            <Button title={mutation.isPending ? "Saving..." : "Save profile"} icon="save-outline" disabled={photoBusy || mutation.isPending} onPress={save} style={{ flex: 1 }} />
          </Row>
        </View>
        </KeyboardAvoidingView>
      </Screen>
    );
  }

  const strength = profileCompletion(saved);
  const count = (section) => related[section].data?.length;
  const refreshing = profile.isRefetching || relatedQueries.some((query) => query.isRefetching);
  const refresh = () => {
    profile.refetch();
    if (record?.id) relatedQueries.forEach((query) => query.refetch());
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      {hero}
      {!record ? (
        <Notice tone="info" icon="information-circle-outline" title="No profile yet" message="Add your personal details and save to create your profile. Experience, education, skills and photo open up once it is saved." />
      ) : null}

      <ProfileSection icon="chatbox-ellipses-outline" title="About" onEdit={() => startEditing("personal")} busy={locked}>
        {saved.description ? (
          <Text style={styles.about} selectable>{saved.description}</Text>
        ) : (
          <Text style={type.small}>A short introduction in your own words: what you do, the tools you like, and what you want to work on next.</Text>
        )}
      </ProfileSection>

      <ProfileSection icon={SECTION_META.personal.icon} title="Personal details" onEdit={() => startEditing("personal")} busy={locked}>
        <PersonalView draft={saved} />
      </ProfileSection>

      {RELATED_SECTIONS.map((section) => (
        <ProfileSection
          key={section}
          icon={SECTION_META[section].icon}
          title={SECTION_META[section].title}
          count={count(section)}
          onEdit={record?.id ? () => startEditing(section) : undefined}
          busy={locked || !Array.isArray(related[section].data)}
        >
          {record?.id ? <RelatedView section={section} query={related[section]} /> : <Text style={type.small}>Save your personal details first.</Text>}
        </ProfileSection>
      ))}

      {record?.id ? (
        <ProfileSection icon={SECTION_META.photo.icon} title="Profile photo" onEdit={() => startEditing("photo")} editLabel={saved.profile_image ? "Change" : "Add"} busy={locked}>
          <Row gap={14}>
            <ProfilePhoto uri={saved.profile_image} size={64} icon="camera-outline" />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={type.subheading}>{saved.profile_image ? "Shown next to your name" : "No photo yet"}</Text>
              <Text style={type.small}>
                {saved.profile_image ? "Want a fresh look? Change it any time." : "A clear, friendly photo helps colleagues put a face to your name."}
              </Text>
            </View>
          </Row>
        </ProfileSection>
      ) : null}

      <StrengthCard strength={strength} busy={locked} onAdd={(key) => startEditing(key === "profile_image" && record?.id ? "photo" : "personal")} />
    </Screen>
  );
}

function Meta({ icon, text }) {
  return (
    <Row gap={8}>
      <Ionicons name={icon} size={14} color={colors.mutedForeground} style={{ flexShrink: 0 }} />
      <Text style={[type.small, { flex: 1, minWidth: 0, color: colors.foreground }]} numberOfLines={1} ellipsizeMode="tail">{text}</Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  hero: { gap: 14 },
  eyebrow: { ...type.tiny, fontSize: 10, letterSpacing: 0.8, color: colors.primary },
  about: { fontSize: 15, lineHeight: 23, color: colors.foreground },
  footer: { gap: 8, paddingHorizontal: spacing.lg, paddingTop: 12, paddingBottom: 14, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
});
