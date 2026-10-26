// Limit management: time/workflow limits (hrc_limit_management) used by attendance, with an editor.
// Web: pages/LimitManagementPage.jsx (routes /limit-management and /limit-management/:recordId/edit).
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, spacing, tones, type } from "../../theme";
import { Button, Card, Chip, EmptyState, ErrorState, Field, LoadingState, Notice, PageHeader, Row, Screen, SearchField, SegmentedControl } from "../../components/ui";
import { fetchLimitRecords, limitListKey, updateLimitRecord } from "../../api/limits.api";
import { toast } from "../../store/toastStore";
import { timeToMinutes } from "../../utils/attendance";
import { clean, errorMessage } from "../../utils/records";

const DURATION_FIELDS = [
  ["year", "Years", "y"],
  ["month", "Months", "mo"],
  ["day", "Days", "d"],
  ["hour", "Hours", "h"],
  ["minutes", "Minutes", "min"],
];
const EDITABLE_FIELDS = ["name", "status", ...DURATION_FIELDS.map(([field]) => field), "actual_time", "description"];

// "1 h 30 min" from the record's year/month/day/hour/minutes parts.
const durationLabel = (record) =>
  DURATION_FIELDS.filter(([field]) => Number(record[field]) > 0)
    .map(([field, , unit]) => `${Number(record[field])} ${unit}`)
    .join(" ") || "No duration";

const clockLabel = (minutes) => {
  const hour = Math.floor(minutes / 60) % 24;
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
};

// Icon and a plain-language explanation for the limits attendance relies on.
function limitMeaning(record) {
  const name = clean(record.name).toLowerCase();
  const start = timeToMinutes(record.actual_time);
  const minutes = Number(record.minutes) || 0;
  if (name.includes("login")) {
    return {
      icon: "log-in-outline",
      tone: "progress",
      text:
        start === null
          ? `Check-ins get ${minutes} min of grace before they count as late.`
          : `Shift starts at ${clockLabel(start)}. Check-ins after ${clockLabel(start + minutes)} are marked late.`,
    };
  }
  if (name.includes("lunch")) {
    return { icon: "restaurant-outline", tone: "success", text: `Lunch breaks longer than ${durationLabel(record)} are flagged on the attendance board.` };
  }
  return { icon: "timer-outline", tone: "info", text: clean(record.description) };
}

function statusTone(value) {
  if (/^(active|enabled?|yes|on)$/i.test(value)) return "success";
  if (/^(inactive|disabled?|no|off)$/i.test(value)) return "neutral";
  return "progress";
}

const useLimitRecords = () => useQuery({ queryKey: limitListKey, queryFn: fetchLimitRecords });

/* ── List ───────────────────────────────────────────────────────────────── */

export function LimitManagementScreen({ navigation }) {
  const query = useLimitRecords();
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const records = (query.data || []).filter((record) =>
    [...EDITABLE_FIELDS, "created_by_name", "assigned_user_name"].some((field) => clean(record[field]).toLowerCase().includes(term)),
  );

  return (
    <Screen refreshing={query.isFetching && !query.isPending} onRefresh={() => query.refetch()}>
      <PageHeader icon="speedometer-outline" tone="progress" eyebrow="People workspace" title="Limit management" subtitle="Time and workflow limits used across attendance and HR workflows." />
      <SearchField value={search} onChangeText={setSearch} placeholder="Search limits" />
      <Text style={styles.count}>{query.isPending ? "Loading…" : `${records.length} of ${query.data?.length ?? 0} limits`}</Text>

      {query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
      ) : query.isPending ? (
        <LoadingState label="Loading limit records…" />
      ) : records.length === 0 ? (
        <EmptyState
          icon="options-outline"
          title={search ? "No matching limits" : "No limits configured"}
          message={search ? "Try another search." : "Limits added in the CRM will appear here."}
        />
      ) : (
        records.map((record, index) => (
          <LimitCard key={record.id || index} record={record} onEdit={record.id ? () => navigation.navigate("LimitEdit", { recordId: String(record.id) }) : undefined} />
        ))
      )}
    </Screen>
  );
}

function LimitCard({ record, onEdit }) {
  const { icon, tone, text } = limitMeaning(record);
  const created = clean(record.date_entered_uni_format || record.date_entered);
  const status = clean(record.status);
  return (
    <Card style={{ gap: spacing.md }}>
      <Row align="flex-start" style={{ justifyContent: "space-between" }}>
        <Row style={{ flex: 1, minWidth: 0 }} gap={spacing.md}>
          <View style={[styles.icon, { backgroundColor: tones[tone].bg }]}>
            <Ionicons name={icon} size={20} color={tones[tone].fg} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.cardTitle} numberOfLines={2}>{clean(record.name) || "Untitled limit"}</Text>
            {created ? (
              <Row gap={4} style={{ marginTop: 2 }}>
                <Ionicons name="calendar-clear-outline" size={11} color={colors.mutedForeground} style={{ flexShrink: 0 }} />
                <Text style={[type.small, styles.shrinkText, { fontSize: 11, lineHeight: 15 }]} numberOfLines={2}>Created {created}</Text>
              </Row>
            ) : null}
          </View>
        </Row>
        {status ? <Chip label={status} tone={statusTone(status)} small style={styles.statusChip} /> : null}
      </Row>
      <View style={styles.miniStats}>
        <MiniStat icon="timer-outline" tone="progress" label="Limit" value={durationLabel(record)} />
        <MiniStat icon="time-outline" tone="info" label="Reference time" value={clean(record.actual_time) || "—"} />
      </View>
      {text ? (
        <View style={styles.meaning}>
          <Ionicons name="information-circle-outline" size={15} color={tones[tone].fg} style={styles.inlineIcon} />
          <Text style={[type.small, styles.meaningText]}>{text}</Text>
        </View>
      ) : null}
      {onEdit ? <Button title="Edit limit" icon="create-outline" variant="outline" small style={{ alignSelf: "flex-end", flexShrink: 0 }} onPress={onEdit} /> : null}
    </Card>
  );
}

function MiniStat({ icon, tone = "progress", label, value }) {
  return (
    <View style={styles.miniStat}>
      <Row gap={6}>
        <View style={[styles.miniIcon, { backgroundColor: tones[tone].bg }]}>
          <Ionicons name={icon} size={12} color={tones[tone].fg} />
        </View>
        <Text style={[type.small, { fontSize: 11, lineHeight: 15, flex: 1, minWidth: 0 }]} numberOfLines={2}>{label}</Text>
      </Row>
      <Text style={styles.miniValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

/* ── Editor (web: LimitEditor drawer) ───────────────────────────────────── */

// Split "9:30 AM" into editable hour / minute / meridiem parts.
function timeParts(value) {
  const minutes = timeToMinutes(value);
  if (minutes === null) return { hour: "", minute: "", meridiem: "AM" };
  const hour = Math.floor(minutes / 60);
  return { hour: String(hour % 12 || 12), minute: String(minutes % 60).padStart(2, "0"), meridiem: hour >= 12 ? "PM" : "AM" };
}

function partsToLabel({ hour, minute, meridiem }) {
  const h = Number(hour);
  const m = Number(minute);
  if (!clean(hour) || !clean(minute) || !Number.isInteger(h) || !Number.isInteger(m) || h < 1 || h > 12 || m < 0 || m > 59) return null;
  return clockLabel(((h % 12) + (meridiem === "PM" ? 12 : 0)) * 60 + m);
}

export function LimitEditScreen({ route, navigation }) {
  const recordId = route?.params?.recordId;
  const queryClient = useQueryClient();
  const query = useLimitRecords();
  const record = (query.data || []).find((item) => String(item.id) === String(recordId));
  const statuses = useMemo(() => [...new Set((query.data || []).map((item) => clean(item.status)).filter(Boolean))], [query.data]);

  const original = useMemo(() => (record ? Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, clean(record[field])])) : {}), [record]);
  const [form, setForm] = useState(null);
  const [time, setTime] = useState(null);
  const values = form || original;
  const timeInput = time || timeParts(original.actual_time);
  const timeInvalid = Boolean(time && (clean(time.hour) || clean(time.minute)) && partsToLabel(time) === null);
  const changed = EDITABLE_FIELDS.filter((field) => clean(values[field]) !== original[field]);
  const preview = record ? limitMeaning({ ...record, ...values }) : null;
  const leaving = useRef(false);

  const save = useMutation({
    mutationFn: () => updateLimitRecord(record.id, Object.fromEntries(changed.map((field) => [field, clean(values[field])]))),
    onSuccess: async () => {
      // Covers the list and the attendance-limits query that check-in/lunch rules read.
      await queryClient.invalidateQueries({ queryKey: ["limit-management"] });
      toast.success("Limit updated");
      leaving.current = true;
      navigation.goBack();
    },
  });

  // Unsaved-changes guard on back (web: "You have unsaved changes" banner).
  const dirty = changed.length > 0;
  const saving = save.isPending;
  useEffect(
    () =>
      navigation.addListener("beforeRemove", (event) => {
        if (leaving.current || (!dirty && !saving)) return;
        event.preventDefault();
        if (saving) return;
        Alert.alert("Discard changes?", "You have unsaved changes.", [
          { text: "Keep editing", style: "cancel" },
          { text: "Discard and close", style: "destructive", onPress: () => navigation.dispatch(event.data.action) },
        ]);
      }),
    [navigation, dirty, saving],
  );

  const update = (field, value) => setForm({ ...values, [field]: value });
  const updateTime = (patch) => {
    const next = { ...timeInput, ...patch };
    setTime(next);
    const label = partsToLabel(next);
    if (label) update("actual_time", label);
    else if (!clean(next.hour) && !clean(next.minute)) update("actual_time", "");
  };
  const clearTime = () => {
    setTime({ hour: "", minute: "", meridiem: "AM" });
    update("actual_time", "");
  };

  if (query.isPending) return <Screen><LoadingState label="Loading record…" /></Screen>;
  if (query.isError && !record) return <Screen><ErrorState message={query.error.message} onRetry={() => query.refetch()} /></Screen>;
  if (!record) {
    return (
      <Screen>
        <Notice tone="attention" icon="alert-circle-outline" message="This limit record could not be found. It may have been removed." />
        <Button title="Back" variant="outline" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  const storedInvalid = values.actual_time && timeToMinutes(values.actual_time) === null;

  return (
    <Screen>
      <PageHeader icon="create-outline" tone="progress" showTitle eyebrow="Edit limit" title={clean(values.name) || "Limit record"} subtitle="Changes apply to attendance as soon as they are saved." />

      {preview?.text ? (
        <Card tone="progress" style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.md }}>
          <View style={[styles.icon, { backgroundColor: colors.card, width: 38, height: 38 }]}>
            <Ionicons name={preview.icon} size={18} color={tones[preview.tone].fg} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={[type.tiny, { color: colors.primary }]}>Preview</Text>
            <Text style={[type.small, { color: colors.navy }]}>{preview.text}</Text>
          </View>
        </Card>
      ) : null}

      <Card style={{ gap: spacing.md }}>
        <CardHeading icon="document-text-outline" title="Details" />
        <Field label="Name" value={values.name} onChangeText={(value) => update("name", value)} />
        <Field label="Status" value={values.status} onChangeText={(value) => update("status", value)} autoCapitalize="words" />
        {statuses.length ? (
          <Row style={{ flexWrap: "wrap" }} gap={6}>
            {statuses.map((status) => (
              <Pressable key={status} onPress={() => update("status", status)} hitSlop={4}>
                <Chip label={status} tone={clean(values.status) === status ? "progress" : "neutral"} small />
              </Pressable>
            ))}
          </Row>
        ) : null}
      </Card>

      <Card style={{ gap: spacing.md }}>
        <CardHeading icon="timer-outline" title="Limit duration" hint="Leave a part at 0 when it isn't used." />
        <View style={styles.durationGrid}>
          {DURATION_FIELDS.map(([field, label]) => (
            <Field
              key={field}
              label={label}
              value={values[field]}
              onChangeText={(value) => update(field, value.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              style={styles.durationField}
            />
          ))}
        </View>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <CardHeading icon="alarm-outline" tone="info" title="Reference time" hint="The time the limit counts from, such as the shift start for login delay." />
        {/* Hour : Minute stay together; AM/PM drops below them when the row is too narrow. */}
        <View style={styles.timeRow}>
          <Row gap={spacing.sm} align="flex-end" style={styles.timeFields}>
            <Field label="Hour" value={timeInput.hour} onChangeText={(hour) => updateTime({ hour: hour.replace(/[^0-9]/g, "").slice(0, 2) })} keyboardType="number-pad" placeholder="9" style={styles.timeField} />
            <Text style={[type.heading, { paddingBottom: 10, flexShrink: 0 }]}>:</Text>
            <Field label="Minute" value={timeInput.minute} onChangeText={(minute) => updateTime({ minute: minute.replace(/[^0-9]/g, "").slice(0, 2) })} keyboardType="number-pad" placeholder="30" style={styles.timeField} />
          </Row>
          <SegmentedControl options={["AM", "PM"]} value={timeInput.meridiem} onChange={(meridiem) => updateTime({ meridiem })} style={styles.meridiem} />
        </View>
        {timeInvalid ? <Text style={[type.small, { color: colors.destructive }]}>Enter an hour from 1–12 and minutes from 00–59.</Text> : null}
        {storedInvalid && !time ? <Text style={[type.small, { color: colors.attention }]}>Stored as “{values.actual_time}”, which isn't a valid time. Pick a new one.</Text> : null}
        {values.actual_time || clean(timeInput.hour) || clean(timeInput.minute) ? (
          <Button title="Clear time" variant="ghost" small icon="close-circle-outline" onPress={clearTime} />
        ) : null}
      </Card>

      <Card>
        <Field
          label="Description"
          value={values.description}
          onChangeText={(value) => update("description", value)}
          placeholder="Explain what this limit controls"
          multiline
        />
      </Card>

      {save.isError ? <Notice tone="closed" icon="alert-circle-outline" message={errorMessage(save.error, "Could not save this limit record.")} /> : null}

      <Text style={[styles.count, { textAlign: "center", color: changed.length ? colors.primary : colors.mutedForeground }]}>
        {changed.length ? `${changed.length} unsaved change${changed.length > 1 ? "s" : ""}` : "No changes yet"}
      </Text>
      <View style={styles.actions}>
        <Button title="Cancel" icon="close-outline" variant="outline" style={styles.action} disabled={saving} onPress={() => navigation.goBack()} />
        <Button title="Save changes" icon="checkmark-circle-outline" style={styles.action} loading={saving} disabled={!changed.length || timeInvalid} onPress={() => save.mutate()} />
      </View>
    </Screen>
  );
}

// Card section heading: topic icon in a tinted tile, bold title and an optional hint.
function CardHeading({ icon, tone = "progress", title, hint }) {
  return (
    <Row gap={spacing.md} align={hint ? "flex-start" : "center"}>
      <View style={[styles.headingIcon, { backgroundColor: tones[tone].bg }]}>
        <Ionicons name={icon} size={17} color={tones[tone].fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        {hint ? <Text style={type.small}>{hint}</Text> : null}
      </View>
    </Row>
  );
}

const styles = StyleSheet.create({
  icon: { width: 42, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  statusChip: { alignSelf: "flex-start", flexShrink: 0, maxWidth: "45%" },
  inlineIcon: { flexShrink: 0, marginTop: 2 },
  shrinkText: { flexShrink: 1, minWidth: 0 },
  headingIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  miniIcon: { width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  cardTitle: { fontSize: 16, lineHeight: 22, fontWeight: "600", color: colors.navy },
  count: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.mutedForeground },
  meaning: { flexDirection: "row", alignItems: "flex-start", gap: 6, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.background },
  meaningText: { flex: 1, minWidth: 0, color: colors.foreground },
  miniStats: { flexDirection: "row", flexWrap: "wrap", columnGap: spacing.sm, rowGap: spacing.sm },
  miniStat: { flexGrow: 1, flexBasis: "40%", minWidth: 130, backgroundColor: colors.background, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 6 },
  miniValue: { fontSize: 17, lineHeight: 22, fontWeight: "600", color: colors.navy },
  durationGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  durationField: { flexBasis: "30%", flexGrow: 1, minWidth: 88 },
  timeRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", columnGap: spacing.sm, rowGap: spacing.md },
  timeFields: { flexGrow: 2, flexBasis: 160, minWidth: 0 },
  timeField: { flex: 1, minWidth: 0 },
  meridiem: { flexGrow: 1, flexBasis: 110, minWidth: 110 },
  // Cancel and Save share the row equally; at large font scales each takes its own full-width line.
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  action: { flexGrow: 1, flexBasis: 140, minWidth: 0, minHeight: 50, paddingHorizontal: spacing.md, alignSelf: "stretch" },
});
