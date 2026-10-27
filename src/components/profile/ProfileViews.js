// Read-only pieces of "My profile" (web: Profile.jsx ProfileSection + profile/ProfileSectionContent.jsx views).
import { useState } from "react";
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, tones, type } from "../../theme";
import { Button, Card, ErrorState, Row, SkeletonRows } from "../ui";
import { profileFields } from "../../api/profile.api";
import { capitalize, displayUrl, formatAddress, formatProfileDate, isWebUrl, relatedEntryView } from "./profileFormat";

export const SECTION_META = {
  personal: { icon: "person-outline", title: "Personal details", singular: "detail" },
  experiences: { icon: "briefcase-outline", title: "Experience", singular: "experience" },
  education: { icon: "school-outline", title: "Education", singular: "education" },
  skills: { icon: "sparkles-outline", title: "Skills", singular: "skill" },
  photo: { icon: "camera-outline", title: "Profile photo", singular: "photo" },
};

/** One section of the saved profile: icon, title, count and its own Edit button. */
export function ProfileSection({ icon, title, count, onEdit, editLabel = "Edit", busy, children }) {
  return (
    <Card style={styles.section}>
      <Row gap={10}>
        <View style={styles.sectionIcon}>
          <Ionicons name={icon} size={17} color={colors.primary} />
        </View>
        <Text style={[type.subheading, { flex: 1, minWidth: 0 }]} numberOfLines={2}>
          {title}
          {count !== undefined ? <Text style={type.small}>{`  · ${count}`}</Text> : null}
        </Text>
        {onEdit ? (
          <Button title={editLabel} icon="pencil" variant="ghost" small disabled={busy} onPress={onEdit} style={{ flexShrink: 0 }} />
        ) : null}
      </Row>
      <View style={styles.sectionBody}>{children}</View>
    </Card>
  );
}

/** Square photo, or the initials / a fallback icon when there is none (or it fails to load). */
export function ProfilePhoto({ uri, label, size = 88, icon = "person" }) {
  const [failed, setFailed] = useState("");
  const shown = uri && failed !== uri;
  return (
    <View style={[styles.photo, { width: size, height: size, borderRadius: size / 4 }]}>
      {shown ? (
        <Image source={{ uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" onError={() => setFailed(uri)} accessibilityLabel="Profile photo" />
      ) : label ? (
        <Text style={[styles.photoText, { fontSize: size * 0.32, lineHeight: size * 0.42 }]} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
      ) : (
        <Ionicons name={icon} size={size * 0.36} color={colors.primary} />
      )}
    </View>
  );
}

const open = (url) => Linking.openURL(url).catch(() => {});

function FieldValue({ field, value }) {
  if (field === "email1") return <LinkText onPress={() => open(`mailto:${value}`)}>{value}</LinkText>;
  if (field === "phone_mobile") return <LinkText onPress={() => open(`tel:${value.replace(/[^\d+]/g, "")}`)}>{value}</LinkText>;
  if (field.endsWith("_url") && isWebUrl(value)) return <LinkText onPress={() => open(value)} icon="open-outline">{displayUrl(value)}</LinkText>;
  const shown = field === "dob" ? formatProfileDate(value, "full") : field === "gender" ? capitalize(value) : value;
  return <Text style={styles.value} selectable>{shown}</Text>;
}

function LinkText({ children, onPress, icon }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={6} style={({ pressed }) => [styles.link, pressed && { opacity: 0.7 }]}>
      <Text style={[styles.value, { color: colors.primary, flexShrink: 1 }]}>{children}</Text>
      {icon ? <Ionicons name={icon} size={13} color={colors.primary} style={{ flexShrink: 0 }} /> : null}
    </Pressable>
  );
}

const PERSONAL_GROUPS = [
  { title: "Contact and personal", icon: "person-outline", keys: ["email1", "phone_mobile", "dob", "gender"] },
  { title: "Address", icon: "location-outline", keys: [] },
  { title: "Professional", icon: "briefcase-outline", keys: ["current_designation", "title", "department", "linkedin_url", "github_url"] },
];

/** Personal details grouped like the web: contact, address, professional. */
export function PersonalView({ draft }) {
  const address = formatAddress(draft);
  const designation = String(draft.current_designation || "").trim().toLowerCase();
  const groups = PERSONAL_GROUPS.map((group) => ({
    ...group,
    // Hide the title when it only repeats the current designation.
    keys: group.keys.filter((key) => draft[key] && !(key === "title" && draft[key].trim().toLowerCase() === designation)),
  })).filter((group) => group.keys.length || (group.title === "Address" && address.length));
  if (!groups.length) return <Text style={type.small}>No personal details added yet.</Text>;
  return (
    <View style={{ gap: 14 }}>
      {groups.map((group, index) => (
        <View key={group.title} style={[{ gap: 10 }, index > 0 && styles.groupBorder]}>
          <Row gap={8}>
            <Ionicons name={group.icon} size={15} color={colors.mutedForeground} />
            <Text style={styles.groupTitle}>{group.title}</Text>
          </Row>
          {group.title === "Address" ? (
            <View>
              {address.map((line) => <Text key={line} style={styles.value} selectable>{line}</Text>)}
            </View>
          ) : (
            group.keys.map((key) => (
              <View key={key} style={{ gap: 2 }}>
                <Text style={styles.label}>{profileFields[key]}</Text>
                <FieldValue field={key} value={draft[key]} />
              </View>
            ))
          )}
        </View>
      ))}
    </View>
  );
}

function EmptySection({ section }) {
  const meta = SECTION_META[section];
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={meta.icon} size={20} color={colors.primary} />
      </View>
      <Text style={[type.subheading, { textAlign: "center" }]}>No {meta.singular} added yet</Text>
      <Text style={[type.small, { textAlign: "center" }]}>Your {meta.singular} details will appear here once they are added to your profile.</Text>
    </View>
  );
}

const SKILL_TONES = ["progress", "lime", "info", "attention", "neutral"];

/** Skills as a tag cloud: the name, with experience or version as a quiet suffix. */
function SkillsView({ items }) {
  return (
    <View style={styles.pills}>
      {items.map((item, index) => {
        const entry = relatedEntryView("skills", item);
        const meta = entry.details.map(([label, value]) => `${label === "Experience" ? "" : `${label} `}${value}`).join(" · ");
        const palette = tones[SKILL_TONES[index % SKILL_TONES.length]];
        return (
          <View key={item.id || index} style={[styles.pill, { backgroundColor: palette.bg }]}>
            <Text style={[styles.pillText, { color: palette.fg }]}>
              {entry.title || `Skill ${index + 1}`}
              {meta ? <Text style={styles.pillMeta}>{`  ${meta}`}</Text> : null}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Experience and education as a timeline. */
function TimelineView({ section, items }) {
  const meta = SECTION_META[section];
  return (
    <View>
      {items.map((item, index) => {
        const entry = relatedEntryView(section, item);
        const last = index === items.length - 1;
        return (
          <View key={item.id || index} style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ alignItems: "center" }}>
              <View style={styles.timelineIcon}>
                <Ionicons name={meta.icon} size={16} color={colors.primary} />
              </View>
              {!last ? <View style={styles.timelineLine} /> : null}
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 6, paddingBottom: last ? 0 : 20 }}>
              <View style={{ gap: 2 }}>
                <Text style={type.subheading}>{entry.title || `${capitalize(meta.singular)} ${index + 1}`}</Text>
                {entry.subtitle.length ? <Text style={type.small}>{entry.subtitle.join(" · ")}</Text> : null}
              </View>
              {entry.period ? (
                <View style={styles.period}>
                  <Ionicons name="calendar-outline" size={12} color={colors.mutedForeground} style={{ flexShrink: 0 }} />
                  <Text style={styles.periodText}>{entry.duration ? `${entry.period} · ${entry.duration}` : entry.period}</Text>
                </View>
              ) : null}
              {entry.details.length ? (
                <View style={styles.pills}>
                  {entry.details.map(([label, value]) => (
                    <View key={label} style={styles.detailPill}>
                      <Text style={styles.detailText}>
                        <Text style={{ color: colors.mutedForeground }}>{`${label} `}</Text>
                        {value}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {entry.body.map((body) => <Text key={body} style={type.small} selectable>{body}</Text>)}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** A related section's content for its query state: loading, error, empty or the list. */
export function RelatedView({ section, query }) {
  if (query.isPending) {
    return <SkeletonRows count={2} avatar={section !== "skills"} label={`Loading ${SECTION_META[section].title.toLowerCase()}`} />;
  }
  if (query.isError) return <ErrorState message={query.error?.message} onRetry={() => query.refetch()} />;
  const items = query.data || [];
  if (!items.length) return <EmptySection section={section} />;
  return section === "skills" ? <SkillsView items={items} /> : <TimelineView section={section} items={items} />;
}

/** Profile strength: percent filled and the missing fields, each opening the right editor. */
export function StrengthCard({ strength, onAdd, busy }) {
  return (
    <Card style={{ gap: 10 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Text style={[type.subheading, { flex: 1, minWidth: 0 }]}>Profile strength</Text>
        <Text style={styles.percent}>{strength.percent}%</Text>
      </Row>
      <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: strength.percent }}>
        <View style={[styles.fill, { width: `${strength.percent}%` }]} />
      </View>
      {strength.missing.length ? (
        <>
          <Text style={type.small}>Add these to complete your profile:</Text>
          <View style={styles.pills}>
            {strength.missing.map((item) => (
              <Pressable
                key={item.key}
                disabled={busy}
                onPress={() => onAdd(item.key)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.missing, pressed && { opacity: 0.7 }, busy && { opacity: 0.5 }]}
              >
                <Ionicons name="add" size={14} color={colors.primary} style={{ flexShrink: 0 }} />
                <Text style={styles.missingText}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <Row gap={6} align="flex-start">
          <Ionicons name="checkmark-circle" size={16} color={colors.primary} style={{ marginTop: 1 }} />
          <Text style={[type.small, { flex: 1, minWidth: 0 }]}>Your profile is complete.</Text>
        </Row>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { gap: 0, padding: 0, overflow: "hidden" },
  sectionIcon: { flexShrink: 0, width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  sectionBody: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border },
  photo: { flexShrink: 0, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.border },
  photoText: { fontWeight: "600", color: colors.primary },
  groupBorder: { paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
  groupTitle: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.foreground },
  label: { fontSize: 12, lineHeight: 16, fontWeight: "500", color: colors.mutedForeground },
  value: { fontSize: 14, lineHeight: 20, fontWeight: "500", color: colors.foreground },
  link: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", maxWidth: "100%" },
  empty: { alignItems: "center", gap: 6, paddingVertical: 18, paddingHorizontal: 12, borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, backgroundColor: colors.background },
  emptyIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft, marginBottom: 4 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { maxWidth: "100%", paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.pill },
  pillText: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  pillMeta: { fontSize: 11, lineHeight: 15, fontWeight: "400" },
  timelineIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.border },
  timelineLine: { flex: 1, width: 1, backgroundColor: colors.border },
  period: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", maxWidth: "100%", paddingVertical: 3, paddingHorizontal: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  periodText: { flexShrink: 1, fontSize: 12, lineHeight: 16, fontWeight: "500", color: colors.mutedForeground },
  detailPill: { maxWidth: "100%", paddingVertical: 4, paddingHorizontal: 9, borderRadius: radius.sm, backgroundColor: colors.muted },
  detailText: { fontSize: 12, lineHeight: 16, fontWeight: "500", color: colors.foreground },
  percent: { flexShrink: 0, fontSize: 22, lineHeight: 28, fontWeight: "600", color: colors.primary, fontVariant: ["tabular-nums"] },
  track: { height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: colors.muted },
  fill: { height: "100%", borderRadius: 4, backgroundColor: colors.primary },
  missing: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "100%", paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  missingText: { flexShrink: 1, fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.primary },
});
