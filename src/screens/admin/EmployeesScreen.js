import { useMemo, useState } from "react";
import { Linking, Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { type } from "../../theme";
import { Button, Card, Chip, EmptyState, ErrorState, Field, KeyValue, ListRow, LoadingState, PageHeader, Row, Screen, SegmentedControl } from "../../components/ui";
import { fetchEmployee, isExEmployee } from "../../api/admin.api";
import { useEmployeesDirectory } from "../../hooks/queries";
import { formatDate } from "../../utils/dates";
import { fullName, lower } from "../../utils/records";

const VIEWS = [{ label: "Active", value: "active" }, { label: "Former", value: "former" }];

export function EmployeesScreen({ navigation }) {
  const employees = useEmployeesDirectory();
  const [view, setView] = useState("active");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const needle = lower(search);
    return (employees.data || [])
      .filter((employee) => (view === "former") === isExEmployee(employee))
      .filter((employee) => !needle || lower(`${fullName(employee)} ${employee.email1} ${employee.current_designation} ${employee.department}`).includes(needle))
      .sort((a, b) => fullName(a).localeCompare(fullName(b)));
  }, [employees.data, search, view]);

  return (
    <Screen refreshing={employees.isFetching} onRefresh={() => employees.refetch()}>
      <PageHeader title="People" subtitle={employees.data ? `${rows.length} ${view} employee${rows.length === 1 ? "" : "s"}` : "Employee directory"} />
      <SegmentedControl options={VIEWS} value={view} onChange={setView} />
      <Field value={search} onChangeText={setSearch} placeholder="Search name, email or role" autoCapitalize="none" />
      {employees.isPending ? (
        <LoadingState label="Loading directory…" />
      ) : employees.isError ? (
        <ErrorState message={employees.error.message} onRetry={() => employees.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon="people-outline" title="No employees" message={search ? "No one matches that search." : "The directory is empty."} />
      ) : (
        rows.map((employee) => (
          <ListRow
            key={employee.id}
            avatar={fullName(employee)}
            title={fullName(employee)}
            subtitle={[employee.current_designation || employee.title, employee.department].filter(Boolean).join(" · ") || employee.email1}
            right={employee.status === "admin" ? <Chip label="Admin" tone="lime" small /> : undefined}
            onPress={() => navigation.navigate("EmployeeDetail", { id: employee.id })}
          />
        ))
      )}
    </Screen>
  );
}

export function EmployeeDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const employee = useQuery({ queryKey: ["employees", "record", id], queryFn: () => fetchEmployee(id) });
  const record = employee.data;

  if (employee.isPending) return <Screen><LoadingState /></Screen>;
  if (employee.isError) return <Screen><ErrorState message={employee.error.message} onRetry={() => employee.refetch()} /></Screen>;

  const phone = record.phone_mobile || record.phone_work;
  return (
    <Screen>
      <Card>
        <Text style={type.title}>{fullName(record)}</Text>
        <Text style={type.small}>{[record.current_designation || record.title, record.department].filter(Boolean).join(" · ")}</Text>
        <Row style={{ flexWrap: "wrap" }}>
          {record.stage_id_name ? <Chip label={record.stage_id_name} tone={isExEmployee(record) ? "closed" : "progress"} /> : null}
          {record.hrc_phase_id_name ? <Chip label={record.hrc_phase_id_name} tone="neutral" /> : null}
          {record.status === "admin" ? <Chip label="Admin" tone="lime" /> : null}
        </Row>
        <Row style={{ flexWrap: "wrap" }}>
          {record.email1 ? <Button title="Email" icon="mail-outline" small variant="outline" onPress={() => Linking.openURL(`mailto:${record.email1}`)} /> : null}
          {phone ? <Button title="Call" icon="call-outline" small variant="outline" onPress={() => Linking.openURL(`tel:${phone}`)} /> : null}
          <Button title="Attendance" icon="calendar-outline" small onPress={() => navigation.navigate("EmployeeAttendance", { email: record.email1, employeeId: record.id, name: fullName(record) })} />
        </Row>
      </Card>

      <Card>
        <KeyValue label="Email" value={record.email1} />
        <KeyValue label="Phone" value={phone} />
        <KeyValue label="Employee ID" value={record.employee_id || record.emp_code} />
        <KeyValue label="Joined" value={record.joining_date ? formatDate(record.joining_date) : undefined} />
        <KeyValue label="Date of birth" value={record.dob || record.birthdate} />
        <KeyValue label="Reports to" value={record.reporting_manager || record.assigned_user_name} />
        <KeyValue label="Location" value={[record.primary_address_city, record.primary_address_state].filter(Boolean).join(", ")} last />
      </Card>

      <Card>
        <Text style={type.subheading}>Leave balance</Text>
        <KeyValue label="Planned leave" value={record.available_planned_leaves ?? "—"} />
        <KeyValue label="Sick leave" value={record.available_sick_leaves ?? "—"} last />
      </Card>
    </Screen>
  );
}
