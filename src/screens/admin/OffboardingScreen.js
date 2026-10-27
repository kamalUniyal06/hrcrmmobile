// Employee offboarding: resignation cases, their three approvals and the exit checklist.
// Web: employement/pages/OffboardingPage.jsx (route /offboarding), data: employement/api/resignation.api.js.
// Increment management lives in IncrementManagementScreen.js; it is re-exported here for the navigator.
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, spacing, tones, type } from "../../theme";
import { Avatar, Button, Card, Chip, EmptyState, ErrorState, KeyValue, LoadingState, Notice, PageHeader, Row, Screen, SearchField, StatTile } from "../../components/ui";
import { fetchResignations } from "../../api/admin.api";
import { CHECKOUT_TASKS, isNotified, OFFBOARDING_APPROVALS, offboardingState, updateResignationRecord } from "../../api/resignation.api";
import { useEmployeesDirectory } from "../../hooks/queries";
import { toast } from "../../store/toastStore";
import { formatDate } from "../../utils/dates";
import { clean, errorMessage, fullName, lower, plainText } from "../../utils/records";

import { IncrementRequestDetailScreen as IncrementDetail, IncrementRequestsScreen as IncrementRequests } from "./IncrementManagementScreen";

export function IncrementRequestsScreen(props) {
  return <IncrementRequests {...props} />;
}

/** Route "IncrementRequestDetail", params { id }. */
export function IncrementRequestDetailScreen(props) {
  return <IncrementDetail {...props} />;
}

const RESIGNATIONS_KEY = ["resignations", "offboarding"];
const STATUS_FILTERS = ["all", "pending", "progress", "complete"];
const STATE_TONE = { complete: "success", progress: "info", pending: "attention" };

const useResignations = () => useQuery({ queryKey: RESIGNATIONS_KEY, queryFn: fetchResignations });

/** Employee directory lookup by the case email (resignation.name). */
function useCasePeople() {
  const employees = useEmployeesDirectory();
  const byEmail = useMemo(() => new Map((employees.data || []).map((employee) => [lower(employee.email1 || employee.email), employee])), [employees.data]);
  const personOf = (record) => {
    const employee = byEmail.get(lower(record.name)) || null;
    return { employee, name: employee ? fullName(employee, "Employee") : clean(record.name) || "Employee", email: employee?.email1 || record.name || "" };
  };
  return { employees, personOf };
}

function Checklist({ done, total, width = "100%" }) {
  return (
    <View style={[styles.track, { width }]} accessibilityLabel={`${done} of ${total} checkout tasks`}>
      <View style={[styles.fill, { width: `${total ? (done / total) * 100 : 0}%` }]} />
    </View>
  );
}

/** "Approvals 2/3" with its bar; turns green once every step is done. */
function ProgressBox({ icon, label, done, total }) {
  const complete = total > 0 && done >= total;
  return (
    <View style={[styles.progressBox, complete && styles.progressBoxDone]}>
      <View style={styles.progressHead}>
        <Ionicons name={complete ? "checkmark-circle" : icon} size={14} color={complete ? "#047857" : colors.mutedForeground} style={styles.fixed} />
        <Text style={styles.progressLabel} numberOfLines={2}>{label}</Text>
        <Text style={[styles.progressValue, complete && { color: "#047857" }]} numberOfLines={1}>{done}/{total}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${total ? Math.min(done / total, 1) * 100 : 0}%` }, complete && { backgroundColor: colors.success }]} />
      </View>
    </View>
  );
}

function MetaItem({ icon, text }) {
  return (
    <View style={styles.metaItem}>
      <Ionicons name={icon} size={13} color={colors.mutedForeground} style={styles.fixed} />
      <Text style={styles.metaText}>{text}</Text>
    </View>
  );
}

export function OffboardingScreen({ navigation, route }) {
  const resignations = useResignations();
  const { employees, personOf } = useCasePeople();
  const [search, setSearch] = useState(clean(route?.params?.email));
  const [statusFilter, setStatusFilter] = useState(() => (STATUS_FILTERS.includes(route?.params?.status) ? route.params.status : "all"));

  const records = useMemo(() => resignations.data || [], [resignations.data]);
  const counts = useMemo(() => {
    const states = records.map(offboardingState);
    return {
      all: records.length,
      pending: states.filter((state) => state.key === "pending").length,
      progress: states.filter((state) => state.key === "progress").length,
      complete: states.filter((state) => state.key === "complete").length,
    };
  }, [records]);
  const needle = lower(search);
  const rows = records.filter((record) => {
    const state = offboardingState(record);
    if (statusFilter !== "all" && state.key !== statusFilter) return false;
    return !needle || [personOf(record).name, record.name, record.status].some((value) => lower(value).includes(needle));
  });
  const refresh = () => {
    resignations.refetch();
    employees.refetch();
  };
  const filtered = Boolean(search || statusFilter !== "all");

  return (
    <Screen refreshing={(resignations.isFetching || employees.isFetching) && !resignations.isPending} onRefresh={refresh}>
      <PageHeader icon="exit-outline" tone="attention" title="Offboarding" subtitle="Manage approvals, handovers, and every step of an employee's exit." />
      <View style={styles.tiles}>
        {[
          ["all", "Total cases", "people-outline", "progress"],
          ["pending", "Awaiting approvals", "time-outline", "attention"],
          ["progress", "Checkout in progress", "clipboard-outline", "info"],
          ["complete", "Completed", "checkmark-circle-outline", "success"],
        ].map(([key, label, icon, tone]) => (
          <StatTile
            key={key}
            label={label}
            icon={icon}
            tone={tone}
            loading={resignations.isPending}
            value={resignations.data ? counts[key] : "—"}
            onPress={() => setStatusFilter(key)}
            style={[styles.tile, statusFilter === key && styles.tileActive]}
          />
        ))}
      </View>
      <SearchField value={search} onChangeText={setSearch} placeholder="Search name or email" />

      {employees.isError ? <Notice tone="attention" icon="warning-outline" message="Employee profiles could not be loaded. Showing saved case details. Pull to refresh to retry." /> : null}

      {resignations.isPending || employees.isPending ? (
        <LoadingState label="Loading offboarding records…" />
      ) : resignations.isError ? (
        <ErrorState message={errorMessage(resignations.error, "Could not load offboarding records.")} onRetry={() => resignations.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="clipboard-outline"
          title={records.length ? "No matching cases" : "No offboarding cases yet"}
          message={records.length ? "Try another search or status filter." : "Employee resignation requests will appear here."}
          action={filtered ? "Clear filters" : undefined}
          onAction={() => {
            setSearch("");
            setStatusFilter("all");
          }}
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          <Text style={styles.count}>{rows.length} case{rows.length === 1 ? "" : "s"} · open a case to review approvals and update its checklist</Text>
          {rows.map((record) => {
            const person = personOf(record);
            const state = offboardingState(record);
            return (
              <Card key={record.id} onPress={() => navigation?.navigate("OffboardingDetail", { id: record.id })} style={styles.caseCard}>
                <View style={styles.caseHead}>
                  <Avatar name={person.name} size={42} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{person.name}</Text>
                    {person.email && person.email !== person.name ? <Text style={styles.caseEmail} numberOfLines={1}>{person.email}</Text> : null}
                  </View>
                  <Chip small label={state.label} tone={STATE_TONE[state.key]} style={styles.caseChip} />
                </View>
                <View style={styles.progressRow}>
                  <ProgressBox icon="shield-checkmark-outline" label="Approvals" done={state.approvalsDone} total={OFFBOARDING_APPROVALS.length} />
                  <ProgressBox icon="clipboard-outline" label="Checklist" done={state.doneTasks} total={CHECKOUT_TASKS.length} />
                </View>
                <View style={styles.caseMeta}>
                  <MetaItem icon="time-outline" text={record.notice_period ? `${record.notice_period} days notice` : "No notice period set"} />
                  {record.last_working_day ? <MetaItem icon="calendar-outline" text={`Last day ${formatDate(record.last_working_day)}`} /> : null}
                  <View style={styles.openCase}>
                    <Text style={styles.openCaseText}>Open case</Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                  </View>
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

/** Route "OffboardingDetail", params { id } (a hrc_resignation record id). */
export function OffboardingDetailScreen({ route }) {
  const id = route?.params?.id;
  const queryClient = useQueryClient();
  const resignations = useResignations();
  const { personOf } = useCasePeople();
  const mutation = useMutation({
    mutationFn: ({ field, value }) => updateResignationRecord(id, { [field]: value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RESIGNATIONS_KEY }),
    onError: (error) => toast.error(errorMessage(error, "Could not save checklist update.")),
  });

  if (resignations.isPending) return <Screen><LoadingState label="Loading offboarding case…" /></Screen>;
  if (resignations.isError) return <Screen><ErrorState message={errorMessage(resignations.error, "Could not load offboarding records.")} onRetry={() => resignations.refetch()} /></Screen>;
  const record = (resignations.data || []).find((item) => item.id === id);
  if (!record) return <Screen><EmptyState icon="exit-outline" title="Case not found" message="This offboarding case is no longer available. Refresh the list." /></Screen>;

  const person = personOf(record);
  const state = offboardingState(record);
  const busy = mutation.isPending ? mutation.variables : null;
  const designation = person.employee ? clean(person.employee.current_designation || person.employee.title) : "";

  return (
    <Screen refreshing={resignations.isFetching} onRefresh={() => resignations.refetch()}>
      <Card>
        <Row>
          <Avatar name={person.name} size={52} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.heading, { color: colors.navy }]}>{person.name}</Text>
            {person.email && person.email !== person.name ? <Text style={type.small} selectable>{person.email}</Text> : null}
            {designation ? <Text style={type.small}>{designation}</Text> : null}
          </View>
        </Row>
        <Row style={{ flexWrap: "wrap" }}>
          <Chip small label={state.label} tone={STATE_TONE[state.key]} />
          <Chip small icon="time-outline" label={record.notice_period ? `${record.notice_period} days notice` : "Notice period not specified"} />
        </Row>
        <KeyValue label="Submitted" value={record.date_entered_uni_format || record.date_entered || "Date unavailable"} />
        <KeyValue label="Last working day" value={record.last_working_day ? formatDate(record.last_working_day) : undefined} />
        <KeyValue label="Reason" value={plainText(record.description || record.reason) || undefined} last />
      </Card>

      <Card>
        <Row style={styles.cardHead}>
          <Row gap={spacing.md} style={styles.cardHeadTitle}>
            <View style={[styles.headingIcon, { backgroundColor: tones.info.bg }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color={tones.info.fg} />
            </View>
            <Text style={[type.heading, styles.headingText]}>Approvals</Text>
          </Row>
          <Text style={[styles.headCount, styles.fixed]}>{state.approvalsDone}/{OFFBOARDING_APPROVALS.length} verified</Text>
        </Row>
        {OFFBOARDING_APPROVALS.map((item, index) => {
          const done = isNotified(record[item.field]);
          return (
            <View key={item.field} style={[styles.approval, index === OFFBOARDING_APPROVALS.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={[type.body, { flex: 1, minWidth: 0 }]}>{item.label}</Text>
              <Ionicons name={done ? "checkmark-circle" : "time-outline"} size={15} color={done ? "#047857" : colors.mutedForeground} style={styles.fixed} />
              <Text style={[type.small, styles.fixed, done && { color: "#047857" }]}>{done ? "Verified" : "Pending"}</Text>
            </View>
          );
        })}
      </Card>

      <Card>
        <Row style={styles.cardHead}>
          <Row gap={spacing.md} style={styles.cardHeadTitle}>
            <View style={[styles.headingIcon, { backgroundColor: tones.progress.bg }]}>
              <Ionicons name="clipboard-outline" size={18} color={tones.progress.fg} />
            </View>
            <Text style={[type.heading, styles.headingText]}>Exit checklist</Text>
          </Row>
          <Text style={[styles.headCount, styles.fixed]}>{state.doneTasks}/{CHECKOUT_TASKS.length}</Text>
        </Row>
        <Text style={type.small}>
          {state.approvalsReady ? "Mark each task complete as the employee finishes their handover." : "Checklist updates unlock after all three approvals are verified."}
        </Text>
        <Checklist done={state.doneTasks} total={CHECKOUT_TASKS.length} />
        {CHECKOUT_TASKS.map((task) => {
          const checked = isNotified(record[task.field]);
          const saving = busy?.field === task.field;
          const disabled = !state.approvalsReady || Boolean(busy);
          return (
            <Pressable
              key={task.field}
              disabled={disabled}
              onPress={() => mutation.mutate({ field: task.field, value: checked ? "0" : "1" })}
              accessibilityRole="checkbox"
              accessibilityState={{ checked, disabled }}
              style={({ pressed }) => [styles.task, checked && styles.taskDone, disabled && !saving && { opacity: 0.55 }, pressed && { opacity: 0.8 }]}
            >
              <Ionicons name={checked ? "checkbox" : "square-outline"} size={20} color={checked ? colors.primary : colors.mutedForeground} style={styles.fixed} />
              <Text style={[type.body, { flex: 1, minWidth: 0 }]}>{task.label}</Text>
              {saving ? <ActivityIndicator size="small" color={colors.primary} style={styles.fixed} /> : null}
            </Pressable>
          );
        })}
        {mutation.isError ? <Notice tone="closed" icon="alert-circle-outline" message={errorMessage(mutation.error, "Could not save checklist update.")} /> : null}
      </Card>

      <Button title="Refresh" icon="refresh" small variant="outline" loading={resignations.isFetching} onPress={() => resignations.refetch()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  tile: { minWidth: "45%" },
  tileActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  caseCard: { gap: 12 },
  caseHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  caseEmail: { fontSize: 12, lineHeight: 17, color: colors.mutedForeground },
  caseChip: { alignSelf: "flex-start", flexShrink: 0, maxWidth: "42%" },
  fixed: { flexShrink: 0 },
  cardTitle: { fontSize: 16, lineHeight: 23, fontWeight: "600", color: colors.navy },
  count: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.mutedForeground },
  cardHead: { justifyContent: "space-between", flexWrap: "wrap", columnGap: spacing.sm, rowGap: spacing.sm },
  cardHeadTitle: { flexShrink: 1, minWidth: 0 },
  headingIcon: { flexShrink: 0, width: 36, height: 36, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  headingText: { flexShrink: 1, minWidth: 0, color: colors.navy },
  headCount: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.navy, fontVariant: ["tabular-nums"], paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.muted, overflow: "hidden" },
  // Two boxes per row on phones; each wraps to its own line before its label gets squeezed.
  progressRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  progressBox: { flexGrow: 1, flexBasis: "40%", minWidth: 120, gap: 8, padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  progressBoxDone: { borderColor: "#A7F3D0", backgroundColor: "#ECFDF5" },
  progressHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  progressLabel: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 17, fontWeight: "600", color: colors.foreground },
  progressValue: { flexShrink: 0, fontSize: 12, lineHeight: 17, fontWeight: "600", color: colors.mutedForeground, fontVariant: ["tabular-nums"] },
  caseMeta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 14, rowGap: 6 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5, maxWidth: "100%" },
  metaText: { flexShrink: 1, fontSize: 12, lineHeight: 17, color: colors.mutedForeground },
  openCase: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: "auto", flexShrink: 0 },
  openCaseText: { fontSize: 12, lineHeight: 17, fontWeight: "600", color: colors.primary },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3, backgroundColor: colors.primary },
  approval: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  task: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  taskDone: { borderColor: colors.primarySoft, backgroundColor: colors.primarySoft },
});
