// Leave approvals, loaded and saved like the web board (employement/components/leave/admin/AdminLeaveBoard.jsx):
// every pending request (any date) plus the decided ones in the chosen month, searched by employee on the server.
import { useMemo, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, type } from "../../theme";
import { Button, Card, Chip, EmptyState, ErrorState, Field, KeyValue, ListRow, LoadingState, Notice, PageHeader, Row, Screen, SearchField, SegmentedControl, SelectField, Sheet, StatTile } from "../../components/ui";
import { getAllLeaves, getLeave, getLeaveDocuments, leaveApproval, leaveStatusOf, updateLeaveStatus } from "../../api/leaves.api";
import { isExEmployee } from "../../api/admin.api";
import { useEmployeesDirectory, useUserId } from "../../hooks/queries";
import { toast } from "../../store/toastStore";
import { formatDate, monthLabel, timeAgo } from "../../utils/dates";
import { clean, errorMessage, fullName, lower, plainText } from "../../utils/records";

// Same key prefix as the web (ADMIN_LEAVE_QUERY_KEY), so a decision refreshes every leave list.
const ADMIN_LEAVE_KEY = ["leaves", "admin-feed"];
const STATUS_TONE = { Applied: "attention", Accepted: "success", Rejected: "closed" };
const STATUS_LABEL = { Applied: "Awaiting review", Accepted: "Approved", Rejected: "Rejected" };
const SUMMARY = [
  ["All", "All requests", "albums-outline", "neutral"],
  ["Applied", "Awaiting review", "time-outline", "attention"],
  ["Accepted", "Approved", "checkmark-circle-outline", "success"],
  ["Rejected", "Rejected", "close-circle-outline", "closed"],
];
const DATE_MODES = [
  { label: "Applied", value: "applied" },
  { label: "Leave dates", value: "leave" },
  { label: "Approved", value: "approved" },
];
const DATE_FIELDS = { leave: "leave_from", applied: "date_entered", approved: "date_modified" };
const SUGGESTIONS = ["Leave balance is available", "Work handover is arranged", "Reason is genuine and supported"];

const pad = (value) => String(value).padStart(2, "0");
const monthBounds = (cursor) => {
  const last = new Date(cursor.year, cursor.month + 1, 0).getDate();
  return { from: `${cursor.year}-${pad(cursor.month + 1)}-01 00:00:00`, to: `${cursor.year}-${pad(cursor.month + 1)}-${pad(last)} 23:59:59` };
};
const thisMonth = () => ({ year: new Date().getFullYear(), month: new Date().getMonth() });

/** Active employees as { id, name, email }, sorted by name (web systemAlertUtils.employeeOptions). */
function employeeOptions(employees = []) {
  return employees
    .filter((employee) => clean(employee.id) && !isExEmployee(employee))
    .map((employee) => ({ id: clean(employee.id), name: fullName(employee, "Unnamed employee"), email: lower(employee.email1 || employee.email) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function useLeaveEmployee() {
  const employees = useEmployeesDirectory();
  const byEmail = useMemo(() => new Map((employees.data || []).map((e) => [lower(e.email1), e])), [employees.data]);
  const byId = useMemo(() => new Map((employees.data || []).map((e) => [String(e.id), e])), [employees.data]);
  return (leave) => byId.get(String(leave.employee_id || leave.hrc_employees_hrc_leaves_1hrc_employees_ida)) || byEmail.get(lower(leave.name || leave.email));
}

const leaveName = (leave, employee) =>
  (employee && fullName(employee, "")) || [leave.hrc_employees_hrc_leaves_1_name, leave.hrc_candidates_hrc_leaves_1_name, leave.name].map((value) => plainText(value)).find(Boolean) || "Employee";

const leaveDates = (leave) => {
  const from = formatDate(leave.leave_from, { year: false });
  const to = clean(leave.leave_to) && leave.leave_to !== leave.leave_from ? formatDate(leave.leave_to, { year: false }) : "";
  return to ? `${from} – ${to}` : from;
};

export function LeaveApprovalsScreen({ navigation }) {
  const employees = useEmployeesDirectory();
  const employeeFor = useLeaveEmployee();
  const [cursor, setCursor] = useState(thisMonth);
  const [dateMode, setDateMode] = useState("applied");
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");

  // Like the web, search finds the employee first and then asks the server for their leaves.
  const term = lower(search);
  const searchedEmail = useMemo(() => {
    if (!term) return "";
    const match = (employees.data || []).find((employee) => lower(fullName(employee, "")).includes(term) || lower(employee.email1 || employee.email).includes(term));
    return clean(match?.email1 || match?.email);
  }, [employees.data, term]);
  const hasEmployeeMatch = !term || Boolean(searchedEmail);

  const range = monthBounds(cursor);
  const leaveRequest = { from: range.from, to: range.to, dateField: DATE_FIELDS[dateMode], email: searchedEmail || undefined };
  const leaves = useQuery({
    queryKey: [...ADMIN_LEAVE_KEY, leaveRequest],
    queryFn: () => getAllLeaves(leaveRequest),
    enabled: !employees.isPending && hasEmployeeMatch,
  });
  // Pending requests ignore the date range so nothing awaiting a decision is hidden; only search narrows them.
  const pendingRequest = { email: searchedEmail || undefined };
  const pending = useQuery({
    queryKey: [...ADMIN_LEAVE_KEY, pendingRequest],
    queryFn: () => getAllLeaves(pendingRequest),
    enabled: !employees.isPending && hasEmployeeMatch,
  });

  const records = useMemo(() => {
    const decided = (leaves.data || []).filter((record) => leaveStatusOf(record) !== "Applied");
    const inRange = dateMode === "approved" ? decided.filter((record) => leaveStatusOf(record) === "Accepted") : decided;
    const awaiting = (pending.data || []).filter((record) => leaveStatusOf(record) === "Applied");
    const awaitingIds = new Set(awaiting.map((record) => String(record.id)));
    return [...awaiting, ...inRange.filter((record) => !awaitingIds.has(String(record.id)))];
  }, [leaves.data, pending.data, dateMode]);
  const counts = useMemo(
    () => ({ All: records.length, ...Object.fromEntries(["Applied", "Accepted", "Rejected"].map((status) => [status, records.filter((record) => leaveStatusOf(record) === status).length])) }),
    [records],
  );
  const visible = statusFilter === "All" ? records : records.filter((record) => leaveStatusOf(record) === statusFilter);

  const loading = employees.isPending || (hasEmployeeMatch && (leaves.isPending || pending.isPending));
  const failed = leaves.isError || pending.isError || employees.isError;
  const refresh = () => {
    leaves.refetch();
    pending.refetch();
    employees.refetch();
  };
  const moveMonth = (delta) =>
    setCursor(({ year, month }) => {
      const next = new Date(year, month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  const isThisMonth = cursor.year === thisMonth().year && cursor.month === thisMonth().month;

  return (
    <Screen refreshing={(leaves.isFetching || pending.isFetching) && !loading} onRefresh={refresh}>
      <PageHeader
        icon="checkmark-done-circle"
        tone="progress"
        title="Leave approvals"
        subtitle="Pending requests are always listed. Approved and rejected ones follow the month below."
      />

      <View style={styles.tiles}>
        {SUMMARY.map(([status, label, icon, tone]) => (
          <StatTile
            key={status}
            label={label}
            icon={icon}
            tone={tone}
            value={loading ? "—" : counts[status]}
            onPress={() => setStatusFilter(status)}
            style={[styles.tile, statusFilter === status && styles.tileActive]}
          />
        ))}
      </View>

      <SearchField value={search} onChangeText={setSearch} placeholder="Search employee name or email" />

      <Card style={{ gap: 12 }}>
        <View style={styles.monthBar}>
          <Pressable onPress={() => moveMonth(-1)} hitSlop={8} accessibilityLabel="Previous month" style={styles.monthButton}>
            <Ionicons name="chevron-back" size={16} color={colors.foreground} />
          </Pressable>
          <View style={styles.monthLabel}>
            <View style={styles.monthTitleRow}>
              <Ionicons name="calendar-outline" size={15} color={colors.primary} style={styles.noShrink} />
              <Text style={styles.monthTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{monthLabel(cursor.year, cursor.month)}</Text>
            </View>
            {!isThisMonth ? (
              <Pressable onPress={() => setCursor(thisMonth())} hitSlop={6}>
                <Text style={styles.link} numberOfLines={1}>Back to this month</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable onPress={() => moveMonth(1)} hitSlop={8} accessibilityLabel="Next month" style={styles.monthButton}>
            <Ionicons name="chevron-forward" size={16} color={colors.foreground} />
          </Pressable>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={styles.filterLabel}>Filter decided requests by</Text>
          <SegmentedControl options={DATE_MODES} value={dateMode} onChange={setDateMode} />
        </View>
      </Card>

      {loading ? (
        <LoadingState label="Loading leave requests…" />
      ) : failed ? (
        <ErrorState message={errorMessage(leaves.error || pending.error || employees.error, "Could not load leave requests.")} onRetry={refresh} />
      ) : !hasEmployeeMatch ? (
        <EmptyState icon="person-outline" title="No employee found" message="No employee with that name or email was found." />
      ) : visible.length === 0 ? (
        <EmptyState icon="checkmark-done-outline" title={statusFilter === "Applied" ? "No pending requests" : "Nothing here"} message={statusFilter === "Applied" ? "Every leave request has been handled." : "Try another month or filter."} />
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={styles.countLabel}>{visible.length} request{visible.length === 1 ? "" : "s"}</Text>
          {visible.map((leave) => {
            const status = leaveStatusOf(leave);
            const name = leaveName(leave, employeeFor(leave));
            return (
              <ListRow
                key={leave.id}
                avatar={name}
                title={name}
                subtitle={`${plainText(leave.type_of_leave || leave.leave_type) || "Leave"} · ${leaveDates(leave)}`}
                meta={`${clean(leave.leave_days) || "?"} day${Number(leave.leave_days) === 1 ? "" : "s"} · applied ${timeAgo(leave.date_entered)}`}
                right={<Chip label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} small />}
                onPress={() => navigation.navigate("LeaveDetail", { id: leave.id })}
              />
            );
          })}
        </View>
      )}
    </Screen>
  );
}

export function LeaveDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const queryClient = useQueryClient();
  const myId = useUserId();
  const employees = useEmployeesDirectory();
  const leave = useQuery({ queryKey: ["leaves", "record", id], queryFn: () => getLeave(id) });
  const documents = useQuery({ queryKey: ["leaves", "documents", id], queryFn: () => getLeaveDocuments(id) });
  const employeeFor = useLeaveEmployee();
  const [approving, setApproving] = useState(false);

  const options = useMemo(() => employeeOptions(employees.data || []), [employees.data]);
  const nameById = useMemo(() => new Map(options.map((option) => [option.id, option.name])), [options]);

  const decide = useMutation({
    mutationFn: ({ status, details }) => updateLeaveStatus(id, status, details),
    onSuccess: (_, { status }) => {
      toast.success(status === "Accepted" ? "Leave approved" : "Leave rejected");
      setApproving(false);
      queryClient.invalidateQueries({ queryKey: ["leaves"] });
      navigation.goBack();
    },
    onError: (error) => toast.error(errorMessage(error, "Could not update the leave request.")),
  });

  if (leave.isPending) return <Screen><LoadingState label="Loading leave request…" /></Screen>;
  if (leave.isError) return <Screen><ErrorState message={errorMessage(leave.error)} onRetry={() => leave.refetch()} /></Screen>;

  const record = leave.data;
  const employee = employeeFor(record);
  const status = leaveStatusOf(record);
  const approval = leaveApproval(record, nameById);
  const reason = plainText(record.description);
  const name = leaveName(record, employee);

  const reject = () =>
    Alert.alert("Reject this leave?", `${name}'s request will be marked as rejected.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Reject", style: "destructive", onPress: () => decide.mutate({ status: "Rejected" }) },
    ]);

  return (
    <Screen refreshing={leave.isFetching} onRefresh={() => leave.refetch()}>
      <Card>
        <Row align="flex-start">
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.heading, { color: colors.navy }]}>{name}</Text>
            {clean(record.name) && clean(record.name) !== name ? <Text style={type.small} numberOfLines={1}>{record.name}</Text> : null}
          </View>
          <Chip label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} style={{ alignSelf: "flex-start" }} />
        </Row>
        <KeyValue label="Leave type" value={plainText(record.type_of_leave || record.leave_type) || "Leave"} />
        <KeyValue label="From" value={formatDate(record.leave_from, { weekday: true })} />
        <KeyValue label="To" value={formatDate(record.leave_to || record.leave_from, { weekday: true })} />
        <KeyValue label="Working days" value={clean(record.leave_days) || undefined} />
        <KeyValue label="Applied" value={formatDate(record.date_entered)} />
        {employee ? <KeyValue label="Balance (planned / sick)" value={`${employee.available_planned_leaves ?? "—"} / ${employee.available_sick_leaves ?? "—"}`} last /> : null}
      </Card>

      {reason ? (
        <Card>
          <Text style={type.subheading}>Employee's reason</Text>
          <Text style={type.body}>{reason}</Text>
        </Card>
      ) : null}

      {status !== "Applied" ? (
        <Card>
          <Text style={type.subheading}>Decision</Text>
          <KeyValue label="Approved by" value={approval.approvedBy || (status === "Accepted" ? "Not recorded" : undefined)} />
          <KeyValue label="Work handed over to" value={approval.handoverTo || (status === "Accepted" ? "No handover" : undefined)} />
          <KeyValue label={status === "Accepted" ? "Reason for approval" : "Reason"} value={approval.reason || "Not recorded"} />
          <KeyValue label="Decided on" value={approval.decidedOn ? formatDate(approval.decidedOn) : "Not recorded"} last />
        </Card>
      ) : null}

      <Card>
        <Text style={type.subheading}>Supporting documents</Text>
        {documents.isPending ? (
          <Text style={type.small}>Loading…</Text>
        ) : (documents.data || []).length === 0 ? (
          <Text style={type.small}>No documents attached.</Text>
        ) : (
          documents.data.map((doc) => {
            const url = doc.file_url || doc.image_url;
            return <Button key={doc.id} title={doc.filename || doc.name || "Document"} icon="document-attach-outline" variant="outline" small disabled={!url} onPress={() => url && Linking.openURL(url)} />;
          })
        )}
      </Card>

      {status === "Applied" ? (
        <Row style={{ flexWrap: "wrap", rowGap: 8 }}>
          <Button title="Approve" icon="checkmark" style={{ flexGrow: 1, flexBasis: 140 }} onPress={() => setApproving(true)} />
          <Button title="Reject" icon="close" variant="destructive" style={{ flexGrow: 1, flexBasis: 140 }} loading={decide.isPending && decide.variables?.status === "Rejected"} onPress={reject} />
        </Row>
      ) : null}

      <ApproveSheet
        key={approving ? "open" : "closed"}
        visible={approving}
        record={record}
        name={name}
        options={options}
        myId={clean(myId)}
        saving={decide.isPending}
        onCancel={() => setApproving(false)}
        onConfirm={(details) => decide.mutate({ status: "Accepted", details })}
      />
    </Screen>
  );
}

/** Web ApproveLeaveDialog: who approves (defaults to you), who covers the work, and why. */
function ApproveSheet({ visible, record, name, options, myId, saving, onCancel, onConfirm }) {
  const leaveEmployeeId = clean(record.employee_id || record.hrc_employees_hrc_leaves_1hrc_employees_ida);
  const [approvedById, setApprovedById] = useState(() => clean(record.approved_by_id) || (options.some((option) => option.id === myId) ? myId : ""));
  const [handoverToId, setHandoverToId] = useState(() => clean(record.work_handed_over_to_id));
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const trimmed = reason.trim();
  const approverOptions = options.map((option) => ({ label: option.id === myId ? `${option.name} (you)` : option.name, value: option.id }));
  const handoverOptions = [{ label: "No handover", value: "" }, ...options.filter((option) => option.id !== leaveEmployeeId).map((option) => ({ label: option.name, value: option.id }))];

  const submit = () => {
    setSubmitted(true);
    if (trimmed && approvedById) onConfirm({ reason: trimmed, approvedById, handoverToId });
  };

  return (
    <Sheet visible={visible} onClose={() => !saving && onCancel()} title="Approve leave">
      <View style={styles.sheetBody}>
        <Notice tone="info" icon="calendar-outline" message={`${name} · ${plainText(record.type_of_leave || record.leave_type) || "Leave"} · ${leaveDates(record)}`} />
        <SelectField label="Approved by" value={approvedById} onChange={setApprovedById} options={approverOptions} placeholder="Choose an approver" error={submitted && !approvedById ? "Choose who is approving this leave." : undefined} />
        <SelectField label="Work handed over to" value={handoverToId} onChange={setHandoverToId} options={handoverOptions} placeholder="No handover" />
        <Field
          label="Reason for approval"
          value={reason}
          onChangeText={(value) => setReason(value.slice(0, 500))}
          placeholder="e.g. Leave balance is available and the work has been handed over."
          multiline
          error={submitted && !trimmed ? "Add a reason for approving this leave." : undefined}
          hint={`${reason.length}/500`}
        />
        <View style={styles.suggestions}>
          {SUGGESTIONS.map((suggestion) => (
            <Pressable key={suggestion} onPress={() => setReason(suggestion)} style={({ pressed }) => [styles.suggestion, pressed && { opacity: 0.7 }]}>
              <Text style={styles.suggestionText}>{suggestion}</Text>
            </Pressable>
          ))}
        </View>
        <Row style={{ flexWrap: "wrap", rowGap: 8 }}>
          <Button title="Cancel" variant="outline" disabled={saving} style={{ flexGrow: 1, flexBasis: 120 }} onPress={onCancel} />
          <Button title="Approve leave" icon="checkmark" loading={saving} style={{ flexGrow: 1, flexBasis: 140 }} onPress={submit} />
        </Row>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { flexGrow: 1, flexBasis: "45%", minWidth: 0 },
  tileActive: { borderColor: colors.primary, borderWidth: 1.5, backgroundColor: colors.primarySoft },
  monthBar: { flexDirection: "row", alignItems: "center", gap: 10 },
  monthButton: { flexShrink: 0, width: 36, height: 36, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.card },
  monthLabel: { flex: 1, minWidth: 0, alignItems: "center", gap: 2, paddingVertical: 6, paddingHorizontal: 8, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  monthTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, maxWidth: "100%" },
  monthTitle: { ...type.subheading, flexShrink: 1, minWidth: 0, color: colors.navy },
  link: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: colors.primary },
  countLabel: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.mutedForeground },
  noShrink: { flexShrink: 0 },
  filterLabel: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: colors.mutedForeground },
  sheetBody: { paddingHorizontal: 16, paddingBottom: 16, gap: 14 },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: -6 },
  suggestion: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  suggestionText: { fontSize: 12, lineHeight: 16, color: colors.foreground },
});
