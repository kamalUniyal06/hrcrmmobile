import { useMemo } from "react";
import { Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { type } from "../../theme";
import { Card, Chip, EmptyState, ErrorState, KeyValue, LoadingState, Row, Screen } from "../../components/ui";
import { fetchResignations } from "../../api/admin.api";
import { fetchAdminIncrementOverview } from "../../api/increment.api";
import { useEmployeesDirectory } from "../../hooks/queries";
import { formatDate } from "../../utils/dates";
import { clean, fullName, lower, plainText } from "../../utils/records";

const isOpen = (record) => !/^(completed|closed|exited|rejected|withdrawn)$/i.test(clean(record.status));

export function OffboardingScreen() {
  const resignations = useQuery({ queryKey: ["resignations", "offboarding"], queryFn: fetchResignations, staleTime: 5 * 60 * 1000 });
  const employees = useEmployeesDirectory();
  const byEmail = useMemo(() => new Map((employees.data || []).map((e) => [lower(e.email1), e])), [employees.data]);
  const rows = useMemo(() => [...(resignations.data || [])].sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || String(b.date_entered).localeCompare(String(a.date_entered))), [resignations.data]);

  return (
    <Screen refreshing={resignations.isFetching} onRefresh={() => resignations.refetch()}>
      <Text style={type.small}>Resignation requests raised by employees. Exit steps are completed on app.hrcrm.ai.</Text>
      {resignations.isPending ? <LoadingState /> : resignations.isError ? <ErrorState message={resignations.error.message} onRetry={() => resignations.refetch()} /> : rows.length === 0 ? (
        <EmptyState icon="exit-outline" title="No offboarding cases" message="Nobody has started a resignation." />
      ) : (
        rows.map((record) => {
          const employee = byEmail.get(lower(record.name));
          return (
            <Card key={record.id}>
              <Row style={{ justifyContent: "space-between" }}>
                <Text style={[type.subheading, { flex: 1, minWidth: 0 }]} numberOfLines={1}>{employee ? fullName(employee) : plainText(record.name)}</Text>
                <Chip label={clean(record.status) || (isOpen(record) ? "Open" : "Closed")} tone={isOpen(record) ? "attention" : "neutral"} small />
              </Row>
              <KeyValue label="Email" value={record.name} />
              <KeyValue label="Raised" value={formatDate(record.date_entered)} />
              <KeyValue label="Last working day" value={record.last_working_day ? formatDate(record.last_working_day) : undefined} />
              <KeyValue label="Reason" value={plainText(record.description || record.reason)} last />
            </Card>
          );
        })
      )}
    </Screen>
  );
}

export function IncrementRequestsScreen() {
  const overview = useQuery({ queryKey: ["increment-admin", "overview"], queryFn: fetchAdminIncrementOverview, staleTime: 5 * 60 * 1000 });
  const employees = useEmployeesDirectory();
  const byEmail = useMemo(() => new Map((employees.data || []).map((e) => [lower(e.email1), e])), [employees.data]);
  const money = (value) => (Number.isFinite(Number(String(value).replace(/,/g, ""))) ? Number(String(value).replace(/,/g, "")).toLocaleString("en-IN") : value);

  return (
    <Screen refreshing={overview.isFetching} onRefresh={() => overview.refetch()}>
      <Text style={type.small}>Employees' increment requests and how many of the HR questions they have answered.</Text>
      {overview.isPending ? <LoadingState /> : overview.isError ? <ErrorState message={overview.error.message} onRetry={() => overview.refetch()} /> : overview.data.length === 0 ? (
        <EmptyState icon="trending-up-outline" title="No increment requests" />
      ) : (
        overview.data.map(({ record, answered, total, complete }) => {
          const employee = byEmail.get(lower(record.name));
          return (
            <Card key={record.id}>
              <Row style={{ justifyContent: "space-between" }}>
                <Text style={[type.subheading, { flex: 1, minWidth: 0 }]} numberOfLines={1}>{employee ? fullName(employee) : record.name}</Text>
                <Chip label={complete ? "Complete" : `${answered}/${total} answered`} tone={complete ? "success" : "attention"} small />
              </Row>
              <KeyValue label="Requested annual salary" value={`₹ ${money(record.description)}`} />
              <KeyValue label="Submitted" value={formatDate(record.date_entered)} last />
            </Card>
          );
        })
      )}
    </Screen>
  );
}
