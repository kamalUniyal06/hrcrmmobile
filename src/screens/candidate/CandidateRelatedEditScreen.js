// Edit skills, work experience or education (web CandidateResumeBuilder.jsx steps 2–4):
// existing records are updated with only their changed fields, new ones are created and
// linked to the candidate. Saved records cannot be removed here, matching the web.
import { useEffect, useRef, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { colors, type } from "../../theme";
import { Button, Card, Chip, EmptyState, ErrorState, Field, LoadingState, Notice, Row, Screen } from "../../components/ui";
import DateField from "../../components/ui/DateField";
import { useCandidateProfile } from "../../hooks/queries";
import { candidateRelatedKey, createCandidateRelated, saveCandidateRelated } from "../../api/candidate.api";
import { toast } from "../../store/toastStore";
import { educationForOnboarding, localToday, relatedFieldLabels, validateRelatedEntries } from "../../utils/candidateProfile";
import { errorMessage } from "../../utils/records";
import { useRelated } from "./CandidateProfileScreen";

const entryLabels = { skills: "skill", experiences: "role", education: "education" };
const titles = { skills: "Skills", experiences: "Work experience", education: "Education" };
const hints = { skills: "Add your key skills.", experiences: "Add your past and current roles.", education: "Add your degrees and qualifications." };
const placeholders = { total_years_total_months: "For example, 2 years 6 months", from_time: "For example, 2018", to_time: "For example, 2022 or Present" };

/** Rows as the editor works on them: experience rows without an end date read as current roles. */
export function editableRows(section, records, description = "") {
  const rows = section === "education" ? educationForOnboarding(records, description) : records.map((row) => ({ ...row }));
  return section === "experiences" ? rows.map((row) => ({ ...row, currentlyWorking: Boolean(row.id && row.joining_date && !row.leaving_date) })) : rows;
}

/** Saves each row in order: update when it has an ID, otherwise create. Returns the saved rows. */
export async function saveRelatedRows(section, candidateId, rows, originals) {
  const saved = [];
  for (const row of rows) {
    const { currentlyWorking, clientKey, ...value } = row;
    if (section === "experiences" && currentlyWorking) value.leaving_date = "";
    if (value.id) {
      await saveCandidateRelated(section, value, originals[value.id]);
      saved.push({ ...value, currentlyWorking });
    } else {
      const created = await createCandidateRelated(section, candidateId, value);
      saved.push({ ...created, currentlyWorking });
    }
  }
  return saved;
}

export default function CandidateRelatedEditScreen({ navigation, route }) {
  const section = route?.params?.section || "skills";
  const profile = useCandidateProfile();
  const candidate = profile.data;
  const query = useRelated(candidate?.id, section);
  const queryClient = useQueryClient();
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState({});
  const [noExperience, setNoExperience] = useState(false);
  const [entryError, setEntryError] = useState(null);
  const [newSkill, setNewSkill] = useState("");
  const originals = useRef({});

  useEffect(() => {
    if (items || !query.data) return;
    query.data.forEach((row) => {
      if (row.id) originals.current[row.id] = { ...row };
    });
    setItems(editableRows(section, query.data, candidate?.description));
  }, [candidate?.description, items, query.data, section]);

  const save = useMutation({
    mutationFn: () => saveRelatedRows(section, candidate.id, items, originals.current),
    onSuccess: (saved) => {
      saved.forEach((row) => {
        originals.current[row.id] = { ...row };
      });
      setItems(saved);
      queryClient.invalidateQueries({ queryKey: candidateRelatedKey(candidate.id, section) });
      toast.success(`${titles[section]} saved.`);
      navigation.goBack();
    },
    // Rows saved before a failure keep their IDs on the server; reload to continue from there.
    onError: (err) => {
      toast.error(errorMessage(err, "Couldn't save. Try again."));
      queryClient.invalidateQueries({ queryKey: candidateRelatedKey(candidate?.id, section) });
    },
  });

  if (profile.isPending || (candidate?.id && query.isPending)) return <Screen><LoadingState variant="cards" /></Screen>;
  if (!candidate?.id) {
    return <Screen><EmptyState icon="person-circle-outline" title="Save your personal information first" message="Skills, experience and education are linked to your saved profile." action="Edit profile" onAction={() => navigation.navigate("CandidateProfileEdit")} /></Screen>;
  }
  if (query.isError) return <Screen><ErrorState message={query.error.message} onRetry={() => query.refetch()} /></Screen>;
  if (!items) return <Screen><LoadingState variant="cards" /></Screen>;

  const keyOf = (row, index) => row.id || row.clientKey || `row-${index}`;
  const update = (index, key, value) => {
    setEntryError(null);
    setItems((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };
  const remove = (index) => {
    setEntryError(null);
    setItems((prev) => prev.filter((_, i) => i !== index));
  };
  const add = (rows) => {
    setEntryError(null);
    setNoExperience(false);
    const stamp = Date.now();
    const fresh = rows.map((row, i) => ({ ...row, clientKey: `new-${stamp}-${i}` }));
    setItems((prev) => [...prev, ...fresh]);
    setOpen((prev) => ({ ...prev, ...Object.fromEntries(fresh.map((row) => [row.clientKey, true])) }));
  };
  const addSkills = () => {
    const known = new Set(items.map((row) => String(row.name || "").trim().toLowerCase()));
    const names = newSkill.split(",").map((part) => part.trim()).filter((name) => name && !known.has(name.toLowerCase()) && known.add(name.toLowerCase()));
    if (names.length) add(names.map((name) => ({ name })));
    setNewSkill("");
  };
  const submit = () => {
    if (section === "skills" && newSkill.trim()) {
      toast.error("Tap Add to add the skill you typed, or clear it.");
      return;
    }
    const invalid = validateRelatedEntries(section, items, noExperience);
    if (invalid) {
      setEntryError(invalid);
      if (invalid.index >= 0) setOpen((prev) => ({ ...prev, [keyOf(items[invalid.index], invalid.index)]: true }));
      toast.error(invalid.message);
      return;
    }
    if (!items.length) {
      navigation.goBack();
      return;
    }
    save.mutate();
  };

  const today = localToday();
  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Text style={type.title}>{titles[section]}</Text>
        <Text style={type.small}>{hints[section]} Fields marked * are required.</Text>
      </View>

      {section === "skills" ? (
        <Row align="flex-end">
          <Field style={{ flex: 1, minWidth: 0 }} label="Add skills" value={newSkill} onChangeText={setNewSkill} placeholder="React, SQL, Figma" hint="Use commas to add several." />
          <Button title="Add" icon="add" onPress={addSkills} disabled={!newSkill.trim()} style={{ marginBottom: 24 }} />
        </Row>
      ) : null}

      {!items.length ? (
        <EmptyState
          icon={section === "skills" ? "sparkles-outline" : section === "experiences" ? "briefcase-outline" : "school-outline"}
          title={`No ${section === "experiences" ? "work experience" : section} yet`}
          message={section === "experiences" ? "Add a role, or select “I have no work experience yet”." : `Add your ${section === "skills" ? "skills" : "education"}, or go back.`}
        />
      ) : null}

      {section === "experiences" && !items.length ? (
        <Row style={{ justifyContent: "space-between" }}>
          <Text style={[type.body, { flex: 1 }]}>I have no work experience yet</Text>
          <Switch value={noExperience} onValueChange={(value) => { setNoExperience(value); setEntryError(null); }} trackColor={{ true: colors.primary }} accessibilityLabel="I have no work experience yet" />
        </Row>
      ) : null}
      {entryError?.index === -1 ? <Notice tone="closed" icon="alert-circle-outline" message={entryError.message} /> : null}

      {items.map((row, index) => {
        const key = keyOf(row, index);
        const expanded = Boolean(open[key] || !row.id || entryError?.index === index);
        const summary = section === "education"
          ? [row.qualification, row.institution || row.university || row.school, [row.from_time, row.to_time].filter(Boolean).join(" to ")].filter(Boolean).join(" / ") || "Add qualification and institution"
          : section === "experiences"
            ? [row.company_name, row.joining_date && `${row.joining_date} to ${row.currentlyWorking ? "present" : row.leaving_date || "end date required"}`].filter(Boolean).join(" / ") || "Add company and dates"
            : [row.version, row.total_years_total_months].filter(Boolean).join(" · ");
        return (
          <Card key={key}>
            <Pressable onPress={() => setOpen((prev) => ({ ...prev, [key]: !expanded }))} accessibilityRole="button" accessibilityState={{ expanded }} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={type.subheading}>{row.name || `New ${entryLabels[section]}`}</Text>
                {summary ? <Text style={type.small}>{summary}</Text> : null}
              </View>
              {!row.id ? <Chip label="New" tone="lime" small /> : null}
              <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
            </Pressable>
            {expanded ? (
              <View style={{ gap: 12, marginTop: 4 }}>
                {Object.entries(relatedFieldLabels[section]).map(([field, label]) => {
                  const required = field === "name" || field === "joining_date" || (field === "leaving_date" && !row.currentlyWorking);
                  const error = entryError?.index === index && entryError.field === field ? entryError.message : undefined;
                  const title = `${label}${required ? " *" : field === "leaving_date" ? " (current role)" : ""}`;
                  if (field.endsWith("_date")) {
                    if (field === "leaving_date" && row.currentlyWorking) return null;
                    return (
                      <View key={field}>
                        <DateField label={title} value={row[field] || ""} onChange={(value) => update(index, field, value)} placeholder="Select date" maxKey={today} minKey={field === "leaving_date" ? row.joining_date || undefined : undefined} />
                        {error ? <Text style={[type.small, { color: colors.destructive, marginTop: 6 }]}>{error}</Text> : null}
                      </View>
                    );
                  }
                  return (
                    <Field
                      key={field}
                      label={title}
                      value={row[field] || ""}
                      onChangeText={(value) => update(index, field, value)}
                      multiline={field === "description"}
                      placeholder={placeholders[field]}
                      error={error}
                    />
                  );
                })}
                {section === "experiences" ? (
                  <Row style={{ justifyContent: "space-between" }}>
                    <Text style={[type.body, { flex: 1 }]}>Currently working here</Text>
                    <Switch value={Boolean(row.currentlyWorking)} onValueChange={(value) => update(index, "currentlyWorking", value)} trackColor={{ true: colors.primary }} accessibilityLabel="Currently working here" />
                  </Row>
                ) : null}
                {!row.id ? <Button title="Remove" icon="trash-outline" variant="ghost" small onPress={() => remove(index)} style={{ marginLeft: -12 }} /> : null}
              </View>
            ) : null}
          </Card>
        );
      })}

      {section !== "skills" ? <Button title={`Add ${entryLabels[section]}`} icon="add" variant="outline" full onPress={() => add([{ name: "" }])} /> : null}
      <Button title="Save" icon="save-outline" full loading={save.isPending} onPress={submit} style={{ minHeight: 50 }} />
    </Screen>
  );
}
