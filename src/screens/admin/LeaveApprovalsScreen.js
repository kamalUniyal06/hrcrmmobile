import { useMemo, useState } from "react";
import { Alert, Linking, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { colors, type } from "../../theme";
import { Button, Card, Chip, EmptyState, ErrorState, Field, KeyValue, ListRow, LoadingState, PageHeader, Row, Screen, SegmentedControl } from "../../components/ui";
import { getAllLeaves, getLeaveDocuments, leaveStatusOf, updateLeaveStatus } from "../../api/leaves.api";
import { useEmployeesDirectory } from "../../hooks/queries";
import { toast } from "../../store/toastStore";
import { calendarDateKey, formatDate, timeAgo } from "../../utils/dates";
import { errorMessage, fullName, lower, plainText } from "../../utils/records";

const STATUS_TONE = { Applied: "attention", Accepted: "success", Rejected: "closed" };
const FILTERS = [{ label: "Pending", value: "Applied" }, { label: "Accepted", value: "Accepted" }, { label: "Rejected", value: "Rejected" }, { label: "All", value: "all" }];

export function useLeaveEmployee() {
  const employees = useEmployeesDirectory();
  const byEmail = useMemo(() => new Map((employees.data || []).map((e) => [lower(e.email1), e])), [employees.data]);
  const byId = useMemo(() => new Map((employees.data || []).map((e) => [String(e.id), e])), [employees.data]);
  return (leave) => byId.get(String(leave.employee_id || leave.hrc_employees_hrc_leaves_1hrc_employees_ida)) || byEmail.get(lower(leave.name || leave.email));
}

export function LeaveApprovalsScreen({ navigation }) {
  const leaves = useQuery({ queryKey: ["leaves", "admin", "all"], queryFn: () => getAllLeaves(), staleTime: 5 * 60 * 1000 });
  const employeeFor = useLeaveEmployee();
  const [filter, setFilter] = useState("Applied");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const needle = lower(search);
    return (leaves.data || [])
      .filter((leave) => filter === "all" || leaveStatusOf(leave) === filter)
      .filter((leave) => !needle || lower(`${leave.name} ${fullName(employeeFor(leave) || {})} ${leave.type_of_leave}`).includes(needle))
      .sort((a, b) => String(b.date_entered).localeCompare(String(a.date_entered)));
  }, [employeeFor, filter, leaves.data, search]);

  const counts = useMemo(() => {
    const all = leaves.data || [];
    return { Applied: all.filter((l) => leaveStatusOf(l) === "Applied").length, Accepted: all.filter((l) => leaveStatusOf(l) === "Accepted").length, Rejected: all.filter((l) => leaveStatusOf(l) === "Rejected").length, all: all.length };
  }, [leaves.data]);

  return (
    <Screen refreshing={leaves.isFetching} onRefresh={() => leaves.refetch()}>
      <PageHeader title="Leave approvals" subtitle="Review requests and decide in a tap." />
      <SegmentedControl options={FILTERS.map((f) => ({ ...f, count: counts[f.value] }))} value={filter} onChange={setFilter} />
      <Field value={search} onChangeText={setSearch} placeholder="Search by name or leave type" autoCapitalize="none" />
      {leaves.isPending ? (
        <LoadingState label="Loading requests…" />
      ) : leaves.isError ? (
        <ErrorState message={leaves.error.message} onRetry={() => leaves.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon="checkmark-done-outline" title={filter === "Applied" ? "No pending requests" : "Nothing here"} message={filter === "Applied" ? "Every leave request has been handled." : "Try another filter."} />
      ) : (
        rows.map((leave) => {
          const status = leaveStatusOf(leave);
          const employee = employeeFor(leave);
          const from = formatDate(leave.leave_from, { year: false });
          const to = formatDate(leave.leave_to, { year: false });
          return (
            <ListRow
              key={leave.id}
              avatar={fullName(employee || { name: leave.name })}
              title={employee ? fullName(employee) : plainText(leave.name) || "Employee"}
              subtitle={`${plainText(leave.type_of_leave || leave.leave_type) || "Leave"} · ${from === to ? from : `${from} – ${to}`}`}
              meta={`${leave.leave_days || "?"} day(s) · ${timeAgo(leave.date_entered)}`}
              right={<Chip label={status} tone={STATUS_TONE[status]} small />}
              onPress={() => navigation.navigate("LeaveDetail", { id: leave.id })}
            />
          );
        })
      )}
    </Screen>
  );
}

export function LeaveDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const queryClient = useQueryClient();
  const leaves = useQuery({ queryKey: ["leaves", "admin", "all"], queryFn: () => getAllLeaves(), staleTime: 5 * 60 * 1000 });
  const documents = useQuery({ queryKey: ["leaves", "documents", id], queryFn: () => getLeaveDocuments(id) });
  const employeeFor = useLeaveEmployee();
  const leave = (leaves.data || []).find((item) => String(item.id) === String(id));
  const employee = leave ? employeeFor(leave) : null;

  const decide = useMutation({
    mutationFn: (status) => updateLeaveStatus(id, status),
    onSuccess: (_, status) => {
      toast.success(`Leave ${status.toLowerCase()}`);
      queryClient.invalidateQueries({ queryKey: ["leaves"] });
      navigation.goBack();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const confirm = (status) =>
    Alert.alert(`${status === "Accepted" ? "Approve" : "Reject"} this leave?`, `${employee ? fullName(employee) : leave.name} will be notified of the decision.`, [
      { text: "Cancel", style: "cancel" },
      { text: status === "Accepted" ? "Approve" : "Reject", style: status === "Accepted" ? "default" : "destructive", onPress: () => decide.mutate(status) },
    ]);

  if (leaves.isPending) return <Screen><LoadingState /></Screen>;
  if (!leave) return <Screen><EmptyState icon="calendar-outline" title="Request not found" action="Back" onAction={() => navigation.goBack()} /></Screen>;
  const status = leaveStatusOf(leave);

  return (
    <Screen>
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Text style={type.heading}>{employee ? fullName(employee) : plainText(leave.name)}</Text>
            <Text style={type.small}>{leave.name || employee?.email1}</Text>
          </View>
          <Chip label={status} tone={STATUS_TONE[status]} />
        </Row>
        <KeyValue label="Leave type" value={plainText(leave.type_of_leave || leave.leave_type)} />
        <KeyValue label="From" value={formatDate(leave.leave_from, { weekday: true })} />
        <KeyValue label="To" value={formatDate(leave.leave_to, { weekday: true })} />
        <KeyValue label="Working days" value={leave.leave_days} />
        <KeyValue label="Requested" value={formatDate(leave.date_entered)} />
        {employee ? <KeyValue label="Balance (planned / sick)" value={`${employee.available_planned_leaves ?? "—"} / ${employee.available_sick_leaves ?? "—"}`} last /> : null}
      </Card>

      {plainText(leave.description) ? (
        <Card>
          <Text style={type.subheading}>Reason</Text>
          <Text style={type.body}>{plainText(leave.description)}</Text>
        </Card>
      ) : null}

      <Card>
        <Text style={type.subheading}>Supporting documents</Text>
        {documents.isPending ? <Text style={type.small}>Loading…</Text> : (documents.data || []).length === 0 ? <Text style={type.small}>No documents attached.</Text> : documents.data.map((doc) => {
          const url = doc.file_url || doc.image_url;
          return <Button key={doc.id} title={doc.filename || doc.name || "Document"} icon="document-attach-outline" variant="outline" small disabled={!url} onPress={() => url && Linking.openURL(url)} />;
        })}
      </Card>

      {status === "Applied" ? (
        <Row>
          <Button title="Approve" icon="checkmark" style={{ flex: 1 }} loading={decide.isPending && decide.variables === "Accepted"} onPress={() => confirm("Accepted")} />
          <Button title="Reject" icon="close" variant="destructive" style={{ flex: 1 }} loading={decide.isPending && decide.variables === "Rejected"} onPress={() => confirm("Rejected")} />
        </Row>
      ) : (
        <Text style={[type.small, { textAlign: "center" }]}>This request was {status.toLowerCase()} on {formatDate(leave.date_modified)}.</Text>
      )}
    </Screen>
  );
}
