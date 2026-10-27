// HR system alerts (web: pages/SystemAlertsPage.jsx, components/alerts/AlertForm.jsx, AlertStatusDialog.jsx).
import { useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, spacing, tones, type } from "../../theme";
import { Button, Card, Chip, EmptyState, ErrorState, Field, KeyValue, LoadingState, Notice, PageHeader, Row, Screen, SearchField, SectionTitle, SegmentedControl, SelectField, Sheet } from "../../components/ui";
import DateField from "../../components/ui/DateField";
import {
  createSystemAlert,
  deleteSystemAlert,
  fetchAlertStatus,
  fetchAlertTargets,
  fetchSystemAlertResponses,
  setSystemAlertActive,
  updateSystemAlert,
} from "../../api/systemAlerts.api";
import { useEmployeesDirectory } from "../../hooks/queries";
import { toast } from "../../store/toastStore";
import { formatDate, todayKey } from "../../utils/dates";
import { alertExpiresAt, isAlertActive } from "../../utils/homeDashboard";
import { errorMessage, firstImage, lower, plainText } from "../../utils/records";
import {
  AUDIENCES,
  EXPIRY_TIMES,
  RESPONSE_TYPES,
  RESPONSE_TYPE_KEYS,
  STATUS_LABELS,
  alertFormFromRecord,
  alertStatus,
  alertTitle,
  answerButtonLabel,
  answerLabel,
  answerTone,
  audienceOf,
  countAnswers,
  emptyAlertForm,
  employeeOptions,
  formatExpiry,
  formatUtcTime,
  localExpiry,
  messageHtml,
  responseTypeOf,
  textToHtml,
  validateAlertForm,
} from "../../utils/systemAlerts";

const SELECTED_CHIPS = 6;
const TYPE_ICONS = { none: "information-circle-outline", acknowledge: "checkmark-done-outline", yes_no: "help-circle-outline" };
export default function SystemAlertsScreen({ navigation }) {
  const groups = useQuery({ queryKey: ["system-alerts", "responses"], queryFn: fetchSystemAlertResponses });
  // null = list; { alert: null } = create; { alert, responseCount } = edit.
  const [editor, setEditor] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFor, setStatusFor] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const shown = useMemo(() => {
    const query = lower(search);
    return (groups.data || []).filter(({ alert }) => !query || lower(plainText(alert.name)).includes(query));
  }, [groups.data, search]);

  if (editor) {
    return (
      <Screen>
        <PageHeader icon={editor.alert ? "create" : "megaphone"} tone="attention" title={editor.alert ? "Edit announcement" : "New announcement"} subtitle="Choose who gets it, how they respond and how long it shows." />
        <AlertForm alert={editor.alert} responseCount={editor.responseCount || 0} onClose={() => setEditor(null)} />
      </Screen>
    );
  }

  return (
    <Screen refreshing={groups.isFetching} onRefresh={() => groups.refetch()}>
      <PageHeader icon="megaphone" tone="attention" title="Announcements" subtitle="Send alerts to your team and see who has responded." />
      <Button title="New announcement" icon="add-circle-outline" full onPress={() => setEditor({ alert: null })} style={styles.bigButton} />

      <View style={{ gap: spacing.md }}>
        <SectionTitle title="All announcements" hint={groups.data ? `${shown.length} of ${groups.data.length}` : undefined} />
        <SearchField value={search} onChangeText={setSearch} placeholder="Search announcements" />
        {groups.isPending ? (
          <LoadingState />
        ) : groups.isError ? (
          <ErrorState message={groups.error.message} onRetry={() => groups.refetch()} />
        ) : groups.data.length === 0 ? (
          <EmptyState icon="megaphone-outline" title="No announcements yet" message="Create one to notify your employees." />
        ) : shown.length === 0 ? (
          <EmptyState icon="search-outline" title="No matching announcements" message="Try another search." />
        ) : (
          shown.map(({ alert, responses }) => (
            <AlertCard
              key={alert.id || "orphans"}
              alert={alert}
              responses={responses}
              onOpen={() => navigation?.navigate("AnnouncementDetail", { alert })}
              onEdit={() => setEditor({ alert, responseCount: responses.length })}
              onStatus={() => setStatusFor(alert)}
              onDelete={() => setDeleting(alert)}
            />
          ))
        )}
      </View>

      <StatusSheet key={statusFor?.id || "none"} alert={statusFor} onClose={() => setStatusFor(null)} />
      <DeleteSheet key={deleting?.id || "none"} alert={deleting} onClose={() => setDeleting(null)} />
    </Screen>
  );
}

/* ── List ─────────────────────────────────────────────────────────────── */

function AlertCard({ alert, responses, onOpen, onEdit, onStatus, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const status = alert.unavailable ? null : STATUS_LABELS[alertStatus(alert)];
  const responseType = responseTypeOf(alert);
  const expiresAt = alertExpiresAt(alert);
  const answers = Object.entries(countAnswers(responses));
  const image = firstImage(alert.description);
  const preview = plainText(alert.description).replace(/\s+/g, " ");
  // Close the menu first so the next sheet or screen opens cleanly.
  const run = (action) => () => {
    setMenuOpen(false);
    action();
  };
  const menuButton = !alert.unavailable ? (
    <Pressable onPress={() => setMenuOpen(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Announcement actions" style={[styles.moreButton, image && styles.moreButtonOnImage]}>
      <Ionicons name="ellipsis-horizontal" size={18} color={image ? "#FFFFFF" : colors.foreground} />
    </Pressable>
  ) : null;

  return (
    <Card onPress={alert.unavailable ? undefined : onOpen} style={styles.alertCard}>
      {/* The picture leads the card, like a post; the status and the menu sit on top of it. */}
      {image ? (
        <View>
          <Image source={{ uri: image }} style={styles.banner} resizeMode="cover" accessibilityIgnoresInvertColors />
          <View style={styles.bannerShade} />
          {status ? <Chip label={status.label} tone={status.tone} small style={styles.bannerChip} /> : null}
          <View style={styles.bannerMenu}>{menuButton}</View>
        </View>
      ) : null}

      <View style={styles.cardBody}>
        <View style={styles.cardHead}>
          {!image ? (
            <View style={[styles.tile, { backgroundColor: tones.attention.bg }]}>
              <Ionicons name={alert.unavailable ? "alert-circle-outline" : "megaphone-outline"} size={18} color={tones.attention.fg} />
            </View>
          ) : null}
          <View style={styles.headText}>
            <Text style={styles.alertTitle} numberOfLines={2}>{alertTitle(alert)}</Text>
            <Text style={[type.small, { flexShrink: 1 }]} numberOfLines={1}>
              {[alert.date_entered ? `Posted ${formatDate(alert.date_entered)}` : "", !image && status ? status.label : ""].filter(Boolean).join(" · ")}
            </Text>
          </View>
          {!image ? menuButton : null}
        </View>

        {preview ? <Text style={styles.preview} numberOfLines={2}>{preview}</Text> : null}

        {!alert.unavailable ? (
          <View style={styles.metaRow}>
            <Meta icon="people-outline" label={AUDIENCES[audienceOf(alert)]} />
            <Meta icon={TYPE_ICONS[responseType]} label={RESPONSE_TYPES[responseType].label} />
            {expiresAt ? <Meta icon="time-outline" label={`${expiresAt < new Date() ? "Ended" : "Until"} ${formatExpiry(expiresAt)}`} /> : null}
          </View>
        ) : null}
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.answerRow}>
          <Text style={styles.responseCount}>{responses.length} response{responses.length === 1 ? "" : "s"}</Text>
          {answers.map(([answer, count]) => (
            <Chip key={answer} label={`${count} ${answerLabel(answer).toLowerCase()}`} tone={answerTone(answer)} small style={styles.chip} />
          ))}
        </View>
        {!alert.unavailable ? (
          <Pressable onPress={onStatus} hitSlop={8} accessibilityRole="button" style={styles.footerLink}>
            <Text style={styles.readMore}>Who responded</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>

      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} title={alertTitle(alert)}>
        <View style={styles.menuList}>
          <MenuItem icon="reader-outline" label="View announcement" onPress={run(onOpen)} />
          <MenuItem icon="people-outline" label="Who responded" onPress={run(onStatus)} />
          <MenuItem icon="create-outline" label="Edit" onPress={run(onEdit)} />
          <View style={styles.menuDivider} />
          <MenuItem icon="trash-outline" label="Delete" destructive onPress={run(onDelete)} />
        </View>
      </Sheet>
    </Card>
  );
}

function Meta({ icon, label }) {
  return (
    <View style={styles.meta}>
      <Ionicons name={icon} size={13} color={colors.mutedForeground} style={styles.noShrink} />
      <Text style={[type.small, { flexShrink: 1 }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function MenuItem({ icon, label, onPress, destructive = false }) {
  const color = destructive ? colors.destructive : colors.foreground;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.muted }]}>
      <View style={[styles.menuIcon, destructive && { backgroundColor: colors.destructiveSoft }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={[type.body, { flex: 1, color, fontWeight: "500" }]}>{label}</Text>
    </Pressable>
  );
}

/* ── Create / edit ────────────────────────────────────────────────────── */

function AlertForm({ alert, responseCount, onClose }) {
  // Editing loads the alert's current employees first, so the picker and the link diff start from them.
  const targets = useQuery({ queryKey: ["system-alerts", "targets", alert?.id], queryFn: () => fetchAlertTargets(alert.id), enabled: Boolean(alert), gcTime: 0 });
  if (!alert) return <AlertFormBody initial={emptyAlertForm()} currentTargetIds={[]} responseCount={0} onClose={onClose} />;
  if (targets.isPending) return <LoadingState label="Loading the announcement…" />;
  if (targets.isError) return <ErrorState message={errorMessage(targets.error)} onRetry={() => targets.refetch()} />;
  return <AlertFormBody alert={alert} initial={alertFormFromRecord(alert, targets.data)} currentTargetIds={targets.data} responseCount={responseCount} onClose={onClose} />;
}

function AlertFormBody({ alert, initial, currentTargetIds, responseCount, onClose }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const employees = useEmployeesDirectory();
  const options = useMemo(() => employeeOptions(employees.data), [employees.data]);

  const set = (patch) => {
    setValues((current) => ({ ...current, ...patch }));
    setErrors((current) => {
      const next = { ...current };
      Object.keys(patch).forEach((key) => delete next[key === "employeeIds" ? "employees" : key === "expiresTime" ? "expiresOn" : key]);
      return next;
    });
  };

  const switchMode = (mode) => {
    if (mode === values.messageMode) return;
    set({ messageMode: mode, message: mode === "html" ? textToHtml(values.message) : plainText(values.message) });
  };

  const save = useMutation({
    mutationFn: () => (alert ? updateSystemAlert({ id: alert.id, values, currentTargetIds }) : createSystemAlert(values)),
    onSuccess: () => {
      const count = values.employeeIds.length;
      toast.success(
        alert ? "Announcement updated."
          : !values.active ? "Announcement saved as inactive."
            : values.audience === "selected" ? `Announcement sent to ${count} employee${count === 1 ? "" : "s"}.`
              : "Announcement sent to all employees.",
      );
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error, "Could not save the announcement.")),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["system-alerts"] }),
  });

  const submit = () => {
    const found = validateAlertForm(values);
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error("Check the highlighted fields.");
      return;
    }
    save.mutate();
  };

  const typeChanged = Boolean(alert) && responseCount > 0 && values.responseType !== initial.responseType;
  const submitLabel = alert ? "Save changes" : values.active ? "Publish announcement" : "Save as inactive";

  return (
    <View style={{ gap: spacing.md }}>
      <Card style={styles.step}>
        <StepHead number={1} title="Write the announcement" />
        <Field label="Title" value={values.name} onChangeText={(name) => set({ name })} placeholder="e.g. Office closed on Friday" error={errors.name} />
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>Message</Text>
          <SegmentedControl options={[{ value: "text", label: "Write" }, { value: "html", label: "Paste HTML" }]} value={values.messageMode} onChange={switchMode} />
        </View>
        <Field
          value={values.message}
          onChangeText={(message) => set({ message })}
          placeholder={values.messageMode === "html" ? "<p>Paste the HTML here</p>" : "What do employees need to know?"}
          multiline
          autoCapitalize={values.messageMode === "html" ? "none" : "sentences"}
          error={errors.message}
          hint={values.messageMode === "html" ? "Employees see this formatted, as on the web." : "Blank lines start a new paragraph."}
        />
      </Card>

      <Card style={styles.step}>
        <StepHead number={2} title="Who gets it" />
        <RadioGroup
          value={values.audience}
          onChange={(audience) => set({ audience })}
          options={[
            { value: "all", label: AUDIENCES.all, hint: "Every current employee." },
            { value: "selected", label: AUDIENCES.selected, hint: "Only the people you pick." },
          ]}
        />
        {values.audience === "selected" ? (
          <EmployeePicker employees={employees} options={options} selected={values.employeeIds} onChange={(employeeIds) => set({ employeeIds })} error={errors.employees} />
        ) : null}
      </Card>

      <Card style={styles.step}>
        <StepHead number={3} title="How employees respond" />
        <RadioGroup
          value={values.responseType}
          onChange={(responseType) => set({ responseType })}
          options={RESPONSE_TYPE_KEYS.map((key) => ({ value: key, label: RESPONSE_TYPES[key].label, hint: RESPONSE_TYPES[key].hint }))}
        />
        {typeChanged ? (
          <Notice tone="attention" icon="warning-outline" message={`${responseCount} employee${responseCount === 1 ? " has" : "s have"} already answered. Their earlier answers stay as they are.`} />
        ) : null}
      </Card>

      <Card style={styles.step}>
        <StepHead number={4} title="When it shows" />
        <View style={styles.switchRow}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={type.subheading}>Active</Text>
            <Text style={type.small}>{values.active ? "Employees see it as soon as it is saved." : "Saved, but hidden from employees."}</Text>
          </View>
          <Switch value={values.active} onValueChange={(active) => set({ active })} trackColor={{ true: colors.primary }} style={styles.noShrink} accessibilityLabel="Active" />
        </View>
        <DateField label="Stop showing on (optional)" value={values.expiresOn} onChange={(expiresOn) => set({ expiresOn, ...(expiresOn ? {} : { expiresTime: "" }) })} placeholder="Keep showing until turned off" minKey={todayKey()} />
        {values.expiresOn ? <SelectField label="At" value={values.expiresTime} onChange={(expiresTime) => set({ expiresTime })} options={EXPIRY_TIMES} /> : null}
        {errors.expiresOn ? <Text style={[type.small, { color: colors.destructive }]}>{errors.expiresOn}</Text> : null}
      </Card>

      <Preview values={values} />

      <View style={styles.actions}>
        <Button title={submitLabel} icon={values.active ? "megaphone-outline" : "save-outline"} loading={save.isPending} onPress={submit} style={styles.actionMain} />
        <Button title="Cancel" variant="outline" icon="close-outline" disabled={save.isPending} onPress={onClose} style={styles.actionSide} />
      </View>
    </View>
  );
}

function StepHead({ number, title }) {
  return (
    <View style={styles.stepHead}>
      <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{number}</Text></View>
      <Text style={[type.heading, { flex: 1, minWidth: 0 }]}>{title}</Text>
    </View>
  );
}

function RadioGroup({ options, value, onChange }) {
  return (
    <View style={{ gap: spacing.sm }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable key={option.value} onPress={() => onChange(option.value)} accessibilityRole="radio" accessibilityState={{ selected: active }} style={[styles.radio, active && styles.radioActive]}>
            <Ionicons name={active ? "radio-button-on" : "radio-button-off"} size={20} color={active ? colors.primary : colors.mutedForeground} style={styles.noShrink} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={[type.subheading, active && { color: colors.primary }]}>{option.label}</Text>
              {option.hint ? <Text style={type.small}>{option.hint}</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function EmployeePicker({ employees, options, selected, onChange, error }) {
  const [query, setQuery] = useState("");
  const chosen = new Set(selected);
  const needle = lower(query);
  const matches = needle ? options.filter((option) => option.name.toLowerCase().includes(needle) || option.email.includes(needle)) : options;
  const names = options.filter((option) => chosen.has(option.id));

  if (employees.isPending) return <LoadingState label="Loading employees…" />;
  if (employees.isError) return <ErrorState message={errorMessage(employees.error)} onRetry={() => employees.refetch()} />;

  const toggle = (id) => onChange(chosen.has(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  const selectMatches = () => onChange([...new Set([...selected, ...matches.map((option) => option.id)])]);

  return (
    <View style={{ gap: spacing.sm }}>
      <Row style={styles.wrap}>
        <Text style={[type.small, { flexGrow: 1 }]}>{selected.length} of {options.length} selected</Text>
        <Button title={needle ? "Select matches" : "Select all"} variant="ghost" small onPress={selectMatches} disabled={!matches.length} />
        <Button title="Clear" variant="ghost" small onPress={() => onChange([])} disabled={!selected.length} />
      </Row>
      {names.length ? (
        <Row style={styles.wrap}>
          {names.slice(0, SELECTED_CHIPS).map((option) => <Chip key={option.id} label={option.name} tone="progress" small style={styles.chip} />)}
          {names.length > SELECTED_CHIPS ? <Chip label={`+${names.length - SELECTED_CHIPS} more`} small style={styles.chip} /> : null}
        </Row>
      ) : null}
      <SearchField value={query} onChangeText={setQuery} placeholder="Search by name or email" />
      <ScrollView style={[styles.box, styles.pickerList]} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {matches.length ? matches.map((option, index) => {
          const on = chosen.has(option.id);
          return (
            <Pressable key={option.id} onPress={() => toggle(option.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={[styles.personRow, index === matches.length - 1 && { borderBottomWidth: 0 }]}>
              <Ionicons name={on ? "checkbox" : "square-outline"} size={20} color={on ? colors.primary : colors.mutedForeground} style={styles.noShrink} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={type.body} numberOfLines={1}>{option.name}</Text>
                {option.email ? <Text style={type.small} numberOfLines={1}>{option.email}</Text> : null}
              </View>
            </Pressable>
          );
        }) : <Text style={[type.small, styles.more]}>No employees match.</Text>}
      </ScrollView>
      {error ? <Text style={[type.small, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}

/** What employees will see, plus a summary of the choices (web AlertForm side panel). */
function Preview({ values }) {
  const responseType = RESPONSE_TYPES[values.responseType];
  const expiresAt = localExpiry(values.expiresOn, values.expiresTime);
  const message = plainText(messageHtml(values));
  return (
    <Card style={styles.step}>
      <SectionTitle title="What employees see" />
      <View style={[styles.box, { padding: spacing.md, gap: 6 }]}>
        <Text style={type.subheading}>{values.name.trim() || "Announcement title"}</Text>
        <Text style={[type.body, !message && { color: colors.mutedForeground }]} numberOfLines={8}>{message || "Your message appears here."}</Text>
        <Row style={styles.wrap}>
          {responseType.answers.map((answer, index) => (
            <Chip key={answer} label={answerButtonLabel(answer)} tone={index === 0 ? "progress" : "neutral"} small style={styles.chip} />
          ))}
        </Row>
      </View>
      <View>
        <KeyValue label="Sent to" value={values.audience === "selected" ? `${values.employeeIds.length} selected employee${values.employeeIds.length === 1 ? "" : "s"}` : AUDIENCES.all} />
        <KeyValue label="Response" value={responseType.label} />
        <KeyValue label="Answer required" value={responseType.blocksLogout ? "Yes" : "No"} />
        <KeyValue label="Shows" value={!values.active ? "Hidden (inactive)" : expiresAt ? `Until ${formatExpiry(expiresAt)}` : "Until turned off"} last />
      </View>
    </Card>
  );
}

/* ── Who responded ────────────────────────────────────────────────────── */

function StatusSheet({ alert, onClose }) {
  const [tab, setTab] = useState("responded");
  const [query, setQuery] = useState("");
  const status = useQuery({ queryKey: ["system-alerts", "status", alert?.id], queryFn: () => fetchAlertStatus(alert.id), enabled: Boolean(alert?.id), gcTime: 0 });
  const data = status.data;
  const needle = lower(query);
  const people = (data?.[tab] || []).filter((person) => !needle || lower(person.name).includes(needle) || lower(person.email).includes(needle));
  const percent = data?.targetCount ? Math.round((data.respondedCount / data.targetCount) * 100) : 0;

  return (
    <Sheet visible={Boolean(alert)} onClose={onClose} title={alert ? `Who responded: ${alertTitle(alert)}` : "Who responded"}>
      <View style={styles.sheetBody}>
        {status.isPending ? (
          <LoadingState />
        ) : status.isError ? (
          <ErrorState message={status.error.status === 403 ? "Only HR can see who responded to an announcement." : errorMessage(status.error)} onRetry={status.error.status === 403 ? undefined : () => status.refetch()} />
        ) : (
          <>
            <Text style={type.subheading}>{data.respondedCount} of {data.targetCount} responded</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${percent}%` }]} />
            </View>
            <Row style={styles.wrap}>
              {Object.entries(data.answerCounts).map(([answer, count]) => (
                <Chip key={answer} label={`${count} ${answerLabel(answer).toLowerCase()}`} tone={answerTone(answer)} small style={styles.chip} />
              ))}
              <Chip label={`${data.pendingCount} pending`} tone="attention" small style={styles.chip} />
            </Row>
            <SegmentedControl
              options={[{ value: "responded", label: "Responded", count: data.respondedCount }, { value: "pending", label: "Pending", count: data.pendingCount }]}
              value={tab}
              onChange={setTab}
            />
            <SearchField value={query} onChangeText={setQuery} placeholder="Search by name or email" />
            {people.length ? (
              <View style={styles.box}>
                {people.map((person, index) => (
                  <View key={person.id || person.email || index} style={[styles.personRow, index === people.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={type.body} numberOfLines={1}>{person.name}</Text>
                      {person.email ? <Text style={type.small} numberOfLines={1}>{person.email}</Text> : null}
                      {person.answeredAt ? <Text style={type.small}>{formatUtcTime(person.answeredAt)}</Text> : null}
                    </View>
                    {person.answer ? <Chip label={answerLabel(person.answer)} tone={answerTone(person.answer)} small style={styles.noShrink} /> : null}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[type.small, styles.more]}>{tab === "pending" ? "Nobody is pending." : "No responses yet."}</Text>
            )}
          </>
        )}
      </View>
    </Sheet>
  );
}

/* ── Delete ───────────────────────────────────────────────────────────── */

function DeleteSheet({ alert, onClose }) {
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const done = (message) => {
    toast.success(message);
    queryClient.invalidateQueries({ queryKey: ["system-alerts"] });
    onClose();
  };
  const remove = useMutation({ mutationFn: () => deleteSystemAlert(alert.id), onSuccess: () => done("Announcement deleted."), onError: (error) => toast.error(errorMessage(error)) });
  const turnOff = useMutation({ mutationFn: () => setSystemAlertActive(alert.id, false), onSuccess: () => done("Announcement turned off."), onError: (error) => toast.error(errorMessage(error)) });
  const busy = remove.isPending || turnOff.isPending;

  return (
    <Sheet visible={Boolean(alert)} onClose={onClose} title="Delete this announcement?">
      <View style={styles.sheetBody}>
        <Text style={type.body}>Deleting removes the announcement and every employee response saved against it. This cannot be undone.</Text>
        {alert && isAlertActive(alert) ? (
          <Notice tone="info" icon="information-circle-outline" message="To stop showing it but keep the responses, turn it off instead." action="Turn off" onAction={() => !busy && turnOff.mutate()} />
        ) : null}
        <Pressable onPress={() => setConfirmed(!confirmed)} accessibilityRole="checkbox" accessibilityState={{ checked: confirmed }} style={styles.confirmRow}>
          <Ionicons name={confirmed ? "checkbox" : "square-outline"} size={22} color={confirmed ? colors.destructive : colors.mutedForeground} style={styles.noShrink} />
          <Text style={[type.body, { flex: 1, minWidth: 0 }]}>I have collected the response data I need.</Text>
        </Pressable>
        <View style={styles.actions}>
          <Button title="Delete" variant="destructive" icon="trash-outline" disabled={!confirmed || turnOff.isPending} loading={remove.isPending} onPress={() => remove.mutate()} style={styles.actionMain} />
          <Button title="Cancel" variant="outline" disabled={busy} onPress={onClose} style={styles.actionSide} />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  headText: { flex: 1, minWidth: 0, gap: 2, alignSelf: "center" },
  tile: { flexShrink: 0, width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  alertTitle: { fontSize: 16, lineHeight: 22, fontWeight: "600", color: colors.navy },
  noShrink: { flexShrink: 0 },
  wrap: { flexWrap: "wrap", rowGap: 6 },
  chip: { alignSelf: "flex-start", flexShrink: 0 },
  alertCard: { padding: 0, gap: 0, overflow: "hidden" },
  banner: { width: "100%", height: 180, backgroundColor: colors.muted },
  bannerShade: { position: "absolute", left: 0, right: 0, top: 0, height: 56, backgroundColor: "rgba(11,19,16,0.28)" },
  bannerChip: { position: "absolute", left: spacing.md, top: spacing.md },
  bannerMenu: { position: "absolute", right: spacing.md, top: spacing.md },
  moreButton: { flexShrink: 0, width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.muted },
  moreButtonOnImage: { backgroundColor: "rgba(11,19,16,0.45)" },
  cardBody: { padding: spacing.lg, gap: spacing.sm },
  preview: { fontSize: 14, lineHeight: 20, color: colors.mutedForeground },
  metaRow: { flexDirection: "row", flexWrap: "wrap", columnGap: spacing.md, rowGap: 4, marginTop: 2 },
  meta: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "100%" },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
  answerRow: { flex: 1, minWidth: 0, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  responseCount: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.foreground },
  footerLink: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 2 },
  menuList: { paddingHorizontal: spacing.sm, paddingBottom: spacing.lg },
  menuItem: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 12, paddingHorizontal: spacing.md, borderRadius: radius.md },
  menuIcon: { flexShrink: 0, width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.muted },
  menuDivider: { height: 1, backgroundColor: colors.border, marginVertical: 6, marginHorizontal: spacing.md },
  readMore: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.primary },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  actionMain: { flexGrow: 1, flexBasis: 140, minHeight: 44 },
  actionSide: { flexGrow: 1, flexBasis: 110, minHeight: 44 },
  bigButton: { minHeight: 50 },
  box: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, backgroundColor: colors.background },
  personRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  more: { paddingVertical: 8, textAlign: "center" },
  step: { gap: spacing.md },
  stepHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepNumber: { flexShrink: 0, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  stepNumberText: { fontSize: 13, fontWeight: "700", color: colors.primary },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.foreground },
  radio: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  radioActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pickerList: { maxHeight: 320 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  sheetBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.muted, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  confirmRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 4 },
});
