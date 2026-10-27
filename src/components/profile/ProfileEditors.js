// Editors for "My profile" (web: profile/CandidatePersonalDetails.jsx, the RelatedEditor in
// profile/ProfileSectionContent.jsx and profile/CandidatePhotoUpload.jsx).
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { pick, types, isErrorWithCode, errorCodes } from "@react-native-documents/picker";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, type } from "../../theme";
import { Button, Field, Row, SegmentedControl, Skeleton } from "../ui";
import DateField from "../ui/DateField";
import {
  ABOUT_MIN_LENGTH,
  GENDER_OPTIONS,
  MAX_PHOTO_SIZE,
  localToday,
  photoMimeType,
  relatedFieldLabels,
  relatedFields,
  requiredPersonalFields,
  uploadProfilePhoto,
} from "../../api/profile.api";
import { toast } from "../../store/toastStore";
import { errorMessage } from "../../utils/records";
import { ProfilePhoto, SECTION_META } from "./ProfileViews";
import { capitalize, relatedEntryView } from "./profileFormat";

const PERSONAL_GROUPS = [
  { title: "Personal information", hint: "How people identify and contact you.", icon: "person-outline", keys: ["first_name", "last_name", "phone_mobile", "dob", "gender"] },
  { title: "Address", hint: "Where you live now.", icon: "location-outline", keys: ["primary_address_street", "primary_address_country", "primary_address_state", "primary_address_city", "primary_address_postalcode"] },
  { title: "Professional summary", hint: "Your current role, background, and profile links.", icon: "briefcase-outline", keys: ["current_designation", "description", "linkedin_url", "github_url"] },
];

const PLACEHOLDERS = {
  linkedin_url: "linkedin.com/in/your-name",
  github_url: "github.com/your-name",
  primary_address_country: "Enter your country",
  primary_address_state: "Enter your state or region",
  description: "Your background, strengths, and career goals.",
};

function GroupHead({ icon, title, hint }) {
  return (
    <Row gap={10} align="flex-start">
      <View style={styles.groupIcon}>
        <Ionicons name={icon} size={17} color={colors.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={type.subheading}>{title}</Text>
        {hint ? <Text style={type.small}>{hint}</Text> : null}
      </View>
    </Row>
  );
}

/** Personal details form: the same fields, required marks and validation as the web. */
export function PersonalEditor({ email, draft, setDraft, fieldErrors, setFieldErrors, disabled }) {
  const change = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };
  const labelOf = (key) => {
    const required = Object.hasOwn(requiredPersonalFields, key);
    const label = requiredPersonalFields[key] || (key === "linkedin_url" ? "LinkedIn URL" : "GitHub URL");
    return required ? `${label} *` : `${label} (optional)`;
  };

  const input = (key) => {
    const error = fieldErrors[key];
    if (key === "gender") {
      const known = GENDER_OPTIONS.some((option) => option.toLowerCase() === String(draft.gender || "").toLowerCase());
      const options = known || !draft.gender ? GENDER_OPTIONS : [...GENDER_OPTIONS, draft.gender];
      const value = options.find((option) => option.toLowerCase() === String(draft.gender || "").toLowerCase()) || "";
      return (
        <View key={key} style={{ gap: 6 }}>
          <Text style={styles.label}>{labelOf(key)}</Text>
          <SegmentedControl options={options} value={value} onChange={(next) => !disabled && change(key, next)} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      );
    }
    if (key === "dob") {
      return (
        <View key={key} style={{ gap: 4 }}>
          <DateField label={labelOf(key)} value={draft.dob} onChange={(value) => change(key, value)} placeholder="Choose a date" maxKey={localToday()} allowWeekends clearable={false} disabled={disabled} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      );
    }
    const isUrl = key.endsWith("_url");
    const about = key === "description";
    const length = String(draft.description || "").trim().length;
    return (
      <Field
        key={key}
        label={labelOf(key)}
        value={draft[key] || ""}
        onChangeText={(value) => change(key, value)}
        placeholder={PLACEHOLDERS[key]}
        multiline={about}
        editable={!disabled}
        keyboardType={key === "phone_mobile" ? "phone-pad" : isUrl ? "url" : undefined}
        autoCapitalize={isUrl ? "none" : key.startsWith("primary_address") || key.endsWith("_name") ? "words" : "sentences"}
        error={error}
        hint={about ? `At least ${ABOUT_MIN_LENGTH} characters · ${length} characters` : undefined}
      />
    );
  };

  return (
    <View style={{ gap: 20 }}>
      {PERSONAL_GROUPS.map((group, index) => (
        <View key={group.title} style={[{ gap: 14 }, index > 0 && styles.groupBorder]}>
          <GroupHead icon={group.icon} title={group.title} hint={group.hint} />
          {index === 0 ? <Field label="Account email *" value={email} editable={false} hint="Your sign-in email." /> : null}
          {group.keys.map(input)}
        </View>
      ))}
    </View>
  );
}

const LONG_FIELDS = /description|details|summary|responsibilit/i;

/** Edits the related records already on the profile, field by field (web RelatedEditor). */
export function RelatedEditor({ section, items, onChange, disabled }) {
  const meta = SECTION_META[section];
  const update = (index, key, value) => onChange(items.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  if (!items.length) {
    return (
      <View style={styles.empty}>
        <Ionicons name={meta.icon} size={22} color={colors.primary} />
        <Text style={[type.subheading, { textAlign: "center" }]}>No {meta.singular} added yet</Text>
        <Text style={[type.small, { textAlign: "center" }]}>There are no {meta.singular} records to edit yet.</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 16 }}>
      {items.map((item, index) => {
        const entry = relatedEntryView(section, item);
        return (
          <View key={item.id || index} style={styles.entry}>
            <Row gap={10}>
              <View style={styles.groupIcon}>
                <Ionicons name={meta.icon} size={17} color={colors.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={type.small}>{capitalize(meta.singular)} {index + 1} of {items.length}</Text>
                <Text style={type.subheading}>{entry.title || `New ${meta.singular}`}</Text>
              </View>
            </Row>
            {relatedFields[section]
              .filter((key) => Object.hasOwn(item, key))
              .map((key) => {
                const label = relatedFieldLabels[section]?.[key] || capitalize(key.replace(/_/g, " "));
                // Experience dates load as YYYY-MM-DD; anything else stays editable as text.
                if (key.endsWith("_date") && /^\d{4}-\d{2}-\d{2}$/.test(item[key] || "")) {
                  return <DateField key={key} label={label} value={item[key]} onChange={(value) => update(index, key, value)} disabled={disabled} />;
                }
                return (
                  <Field
                    key={key}
                    label={label}
                    value={item[key] || ""}
                    onChangeText={(value) => update(index, key, value)}
                    multiline={LONG_FIELDS.test(key)}
                    editable={!disabled}
                  />
                );
              })}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Photo picker: the photo uploads as soon as it is chosen (like the web); `onUploaded(url)`
 * hands the hosted URL back so "Save profile" stores it as profile_image.
 */
export function PhotoEditor({ email, existingUrl, disabled, onBusyChange, onUploaded }) {
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const uploading = status === "uploading";
  const shownUrl = file?.uri || existingUrl;
  const done = status === "uploaded" || (!file && !!existingUrl);

  const upload = async (picked) => {
    setStatus("uploading");
    setMessage("");
    onBusyChange?.(true);
    try {
      const url = await uploadProfilePhoto({ email, file: picked });
      if (!alive.current) return;
      onUploaded?.(url);
      setStatus("uploaded");
      toast.success("Photo uploaded.");
    } catch (err) {
      if (!alive.current) return;
      const text = errorMessage(err, "Photo upload failed. Please try again.");
      setStatus("error");
      setMessage(text);
      toast.error(text);
    } finally {
      onBusyChange?.(false);
    }
  };

  const choose = async () => {
    let picked;
    try {
      // `import` mode copies the file into the app so the upload can read it.
      [picked] = await pick({ type: [types.images], allowMultiSelection: false, mode: "import" });
    } catch (err) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) return;
      toast.error(errorMessage(err, "Could not open the photo picker."));
      return;
    }
    if (!picked) return;
    const mimeType = photoMimeType(picked);
    if (!mimeType || picked.size === 0) {
      toast.error("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (picked.size && picked.size > MAX_PHOTO_SIZE) {
      toast.error("The photo must be 10 MB or smaller.");
      return;
    }
    const next = { uri: picked.uri, name: picked.name || "profile-photo", type: mimeType };
    setFile(next);
    upload(next);
  };

  const title = uploading ? "Uploading…" : status === "error" ? "Upload failed" : done ? "Photo added" : "Add your profile photo";
  const subtitle = uploading
    ? "Keep this screen open."
    : status === "error"
      ? message
      : done
        ? "To replace it, choose another photo."
        : "Clear, front-facing photo. JPG, PNG, or WebP.";

  return (
    <View style={[styles.dropzone, done && styles.dropzoneDone, status === "error" && styles.dropzoneError]}>
      <View>
        {/* Shimmer while the photo uploads (no spinners). */}
        {uploading ? <Skeleton width={120} height={120} radius={30} /> : <ProfilePhoto uri={shownUrl} size={120} />}
      </View>
      <Text style={[type.subheading, { textAlign: "center" }]}>{title}</Text>
      <Text style={[type.small, { textAlign: "center" }, status === "error" && { color: colors.destructive }]}>{subtitle}</Text>
      {file?.name && !uploading ? <Text style={[type.small, { textAlign: "center" }]} numberOfLines={1}>{file.name}</Text> : null}
      <Row style={{ flexWrap: "wrap", justifyContent: "center", columnGap: 10, rowGap: 10 }}>
        {status === "error" && file ? <Button title="Try again" icon="refresh" small disabled={disabled || uploading} onPress={() => upload(file)} /> : null}
        <Button
          title={shownUrl ? "Replace photo" : "Choose photo"}
          icon="image-outline"
          small
          variant={status === "error" || done ? "outline" : "primary"}
          disabled={disabled || uploading}
          onPress={choose}
        />
      </Row>
      <Row gap={6}>
        <Ionicons name="mail-outline" size={14} color={colors.mutedForeground} />
        <Text style={[type.small, { flexShrink: 1 }]} numberOfLines={1}>Linked to {email}</Text>
      </Row>
    </View>
  );
}


const styles = StyleSheet.create({
  groupIcon: { flexShrink: 0, width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  groupBorder: { paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.border },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.foreground },
  error: { fontSize: 13, lineHeight: 18, color: colors.destructive },
  entry: { gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  empty: { alignItems: "center", gap: 6, paddingVertical: 24, paddingHorizontal: 12, borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border },
  dropzone: { alignItems: "center", gap: 8, padding: 18, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.border, backgroundColor: colors.background },
  dropzoneDone: { borderStyle: "solid", borderColor: "rgba(16,185,129,0.45)", backgroundColor: "#F3FBF7" },
  dropzoneError: { borderColor: "rgba(212,24,61,0.5)" },
});
