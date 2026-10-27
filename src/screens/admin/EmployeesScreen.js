// Employee directory, profile and add/edit form.
// Web: pages/employees/EmployeesPage.jsx (route /employees), EmployeeDetails.jsx, employeesApi.js.
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, spacing, type } from "../../theme";
import { Avatar, Button, Card, Chip, EmptyState, ErrorState, Field, KeyValue, LoadingState, Notice, PageHeader, Row, Screen, ScreenChrome, SearchField, SegmentedControl, SelectField, Sheet, StatTile } from "../../components/ui";
import DateField from "../../components/ui/DateField";
import { employeeDate, employeeDepartment, employeeDesignation, employeePhone, fetchEmployee, isExEmployee, saveEmployee, tenure } from "../../api/admin.api";
import { useEmployeesDirectory } from "../../hooks/queries";
import { toast } from "../../store/toastStore";
import { formatDate } from "../../utils/dates";
import { clean, errorMessage, fullName, lower } from "../../utils/records";

const PAGE_SIZE = 20;

/** Web employeeName: first + last, else the record name. */
const employeeName = (record = {}) =>
  [record.first_name, record.last_name].map(clean).filter(Boolean).join(" ") || clean(record.name) || "Unnamed employee";
const joinDate = (value) => {
  const key = employeeDate(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? formatDate(key) : "—";
};
const thisMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};
const CARD_FILTERS = {
  all: () => true,
  newThisMonth: (record) => employeeDate(record.joining_date).startsWith(thisMonth()),
  missingContact: (record) => !clean(record.email1) || !employeePhone(record),
};
const SORTS = [
  { label: "Name", value: "name" },
  { label: "Email", value: "email1" },
  { label: "Department", value: "department" },
  { label: "Joining date", value: "joining_date" },
];
const sortValue = (record, key) =>
  key === "name" ? employeeName(record) : key === "department" ? employeeDepartment(record) : key === "joining_date" ? employeeDate(record.joining_date) : clean(record[key]);
// Not on the web page: a quick split between current and former (Ex Employee / Exit) staff.
const VIEWS = [{ label: "All", value: "all" }, { label: "Active", value: "active" }, { label: "Former", value: "former" }];

export function EmployeesScreen({ navigation, route }) {
  const query = useEmployeesDirectory();
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [cardFilter, setCardFilter] = useState("all");
  const [view, setView] = useState("all");
  const [sort, setSort] = useState({ key: "name", direction: 1 });
  const [shown, setShown] = useState(PAGE_SIZE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const records = useMemo(() => query.data || [], [query.data]);
  const departments = useMemo(() => [...new Set(records.map(employeeDepartment).filter(Boolean))].sort(), [records]);

  const term = lower(search);
  const visible = records
    .filter(
      (record) =>
        CARD_FILTERS[cardFilter](record) &&
        (view === "all" || (view === "former") === isExEmployee(record)) &&
        (!department || employeeDepartment(record) === department) &&
        [employeeName(record), record.email1, employeePhone(record), employeeDesignation(record), employeeDepartment(record)].some((item) => lower(item).includes(term)),
    )
    .sort((a, b) => sortValue(a, sort.key).localeCompare(sortValue(b, sort.key), undefined, { numeric: true, sensitivity: "base" }) * sort.direction);
  const rows = visible.slice(0, shown);
  const filtered = Boolean(search || department || cardFilter !== "all" || view !== "all");
  const reset = (update) => {
    update();
    setShown(PAGE_SIZE);
  };
  const clearFilters = () =>
    reset(() => {
      setSearch("");
      setDepartment("");
      setCardFilter("all");
      setView("all");
    });
  const overview = [
    ["all", "Total employees", records.length, "people-outline", "progress"],
    ["departments", "Departments", departments.length, "business-outline", "info"],
    ["newThisMonth", "Joined this month", records.filter(CARD_FILTERS.newThisMonth).length, "person-add-outline", "success"],
    ["missingContact", "Missing contact info", records.filter(CARD_FILTERS.missingContact).length, "person-remove-outline", "attention"],
  ];
  // Pushed with a native "Employees" header, or a tab under the HRCRM app bar (which shows no page title).
  const chrome = useContext(ScreenChrome);
  const underHeader = chrome.headerShown && !chrome.appHeader;

  return (
    <Screen refreshing={query.isFetching && !query.isPending} onRefresh={() => query.refetch()}>
      <PageHeader
        icon="people"
        title="Employees"
        subtitle="Find your people, review their profiles and keep records up to date."
        showTitle={!underHeader}
        right={<Button title="Add" icon="add" small onPress={() => navigation?.navigate("EmployeeEdit", { departments })} style={styles.noShrink} />}
      />

      <View style={styles.tiles}>
        {overview.map(([id, label, count, icon, tone]) => {
          const selectable = id in CARD_FILTERS;
          return (
            <StatTile
              key={id}
              label={label}
              icon={icon}
              tone={tone}
              loading={query.isPending}
              value={query.isPending ? "—" : count.toLocaleString()}
              onPress={selectable ? () => reset(() => setCardFilter(id)) : undefined}
              style={[styles.tile, selectable && cardFilter === id && styles.tileActive]}
            />
          );
        })}
      </View>

      {/* Search on its own; department and sort live behind the filter button. */}
      <View style={styles.searchRow}>
        <SearchField value={search} onChangeText={(value) => reset(() => setSearch(value))} placeholder="Search name, email or phone" style={{ flex: 1, minWidth: 0 }} />
        <Pressable onPress={() => setFiltersOpen(true)} accessibilityRole="button" accessibilityLabel="Filter and sort" style={({ pressed }) => [styles.filterButton, (department || sort.key !== "name" || sort.direction !== 1) && styles.filterButtonOn, pressed && { opacity: 0.8 }]}>
          <Ionicons name="options-outline" size={20} color={department || sort.key !== "name" || sort.direction !== 1 ? colors.primaryForeground : colors.foreground} />
        </Pressable>
      </View>
      <SegmentedControl options={VIEWS} value={view} onChange={(value) => reset(() => setView(value))} />
      {department || filtered ? (
        <View style={styles.activeFilters}>
          {department ? (
            <Pressable onPress={() => reset(() => setDepartment(""))} style={styles.filterChip} accessibilityLabel="Remove department filter">
              <Text style={styles.filterChipText}>{departments.find((item) => item.value === department)?.label || department}</Text>
              <Ionicons name="close" size={13} color={colors.primary} />
            </Pressable>
          ) : null}
          {filtered ? (
            <Pressable onPress={clearFilters} hitSlop={6}>
              <Text style={styles.clearText}>Clear all</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Sheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter and sort">
        <View style={styles.sheetBody}>
          <SelectField
            label="Department"
            value={department}
            onChange={(value) => reset(() => setDepartment(value))}
            options={[{ label: "All departments", value: "" }, ...departments]}
            placeholder="All departments"
          />
          <View style={{ gap: 6 }}>
            <Text style={styles.sheetLabel}>Sort by</Text>
            <Row>
              <SelectField value={sort.key} onChange={(key) => setSort({ key, direction: 1 })} options={SORTS} style={{ flex: 1, minWidth: 0 }} />
              <Button
                title={sort.direction === 1 ? "A → Z" : "Z → A"}
                icon={sort.direction === 1 ? "arrow-up" : "arrow-down"}
                small
                variant="outline"
                style={styles.noShrink}
                onPress={() => setSort((current) => ({ ...current, direction: -current.direction }))}
              />
            </Row>
          </View>
          <Button title="Done" full onPress={() => setFiltersOpen(false)} />
        </View>
      </Sheet>

      {query.isError ? <Notice tone="closed" icon="alert-circle-outline" message={errorMessage(query.error)} action="Retry" onAction={() => query.refetch()} /> : null}

      {query.isPending ? (
        <LoadingState label="Loading employees…" />
      ) : !rows.length ? (
        <EmptyState
          icon="people-outline"
          title={query.isError ? "Employees unavailable" : filtered ? "No matching employees" : "No employees yet"}
          message={filtered ? "Try another search or clear your filters." : "Add an employee to get started."}
          action={filtered ? "Clear filters" : undefined}
          onAction={clearFilters}
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          <Text style={type.small}>
            {rows.length} of {visible.length} employee{visible.length === 1 ? "" : "s"}
          </Text>
          {rows.map((record, index) => (
            <EmployeeCard key={record.id || index} record={record} onPress={record.id ? () => navigation?.navigate("EmployeeDetail", { id: record.id }) : undefined} />
          ))}
          {visible.length > shown ? <Button title={`Show ${Math.min(PAGE_SIZE, visible.length - shown)} more`} variant="secondary" full onPress={() => setShown(shown + PAGE_SIZE)} /> : null}
        </View>
      )}
    </Screen>
  );
}

function ContactLine({ icon, value, missing, tint }) {
  return (
    <Row gap={8}>
      <View style={[styles.contactIcon, { backgroundColor: value ? tint.bg : colors.muted }]}>
        <Ionicons name={icon} size={11} color={value ? tint.fg : colors.mutedForeground} />
      </View>
      <Text style={[type.small, { flex: 1, minWidth: 0 }, value && { color: tint.fg, fontWeight: "600" }]} numberOfLines={1} ellipsizeMode="tail">{value || missing}</Text>
    </Row>
  );
}

const EMAIL_TINT = { bg: "#E0F2FE", fg: "#0369A1" };
const PHONE_TINT = { bg: "#D1FAE5", fg: "#047857" };

function DepartmentChip({ name, style }) {
  return name ? <Chip small icon="business-outline" label={name} tone="progress" style={style} /> : <Chip small label="Unassigned" style={style} />;
}

function EmployeeCard({ record, onPress }) {
  const designation = employeeDesignation(record);
  const time = tenure(record.joining_date);
  return (
    <Card onPress={onPress}>
      <Row align="flex-start">
        <Avatar name={employeeName(record)} size={42} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={type.subheading} numberOfLines={2}>{employeeName(record)}</Text>
          <Text style={[type.small, designation ? { color: "#7C3AED", fontWeight: "600" } : null]} numberOfLines={2}>{designation || "No designation"}</Text>
        </View>
        {record.status === "admin" || isExEmployee(record) ? (
          <View style={styles.badges}>
            {record.status === "admin" ? <Chip label="Admin" tone="lime" small /> : null}
            {isExEmployee(record) ? <Chip label="Former" tone="closed" small /> : null}
          </View>
        ) : null}
      </Row>
      <ContactLine icon="mail" value={clean(record.email1)} missing="No email" tint={EMAIL_TINT} />
      <ContactLine icon="call" value={employeePhone(record)} missing="No phone" tint={PHONE_TINT} />
      <Row style={styles.cardFoot}>
        <DepartmentChip name={employeeDepartment(record)} style={styles.chipStart} />
        <Text style={[type.small, styles.footDate]}>
          {joinDate(record.joining_date)}
          {time ? ` · ${time}` : ""}
        </Text>
      </Row>
    </Card>
  );
}

// ─── Profile ──────────────────────────────────────────────────────────────────

const GROUPS = [
  ["Personal & contact", "person-outline", [["first_name", "First name"], ["last_name", "Last name"], ["email1", "Email", "email"], ["phone_mobile", "Mobile phone", "tel"], ["phone_work", "Work phone", "tel"]]],
  ["Employment", "briefcase-outline", [["current_designation", "Designation"], ["title", "Title"], ["department", "Department"], ["joining_date", "Joining date", "date"]]],
  ["Location", "location-outline", [["primary_address_street", "Street"], ["primary_address_city", "City"], ["primary_address_state", "State"], ["primary_address_postalcode", "Postal code"], ["primary_address_country", "Country"]]],
  ["Additional information", "information-circle-outline", [["linkedin_url", "LinkedIn URL", "url"], ["description", "Notes", "textarea"]]],
];
const FIELDS = [...GROUPS.flatMap(([, , entries]) => entries), ["do_not_call", "Do not call"]];
const normalize = (record) =>
  Object.fromEntries(FIELDS.map(([key]) => [key, key === "joining_date" ? employeeDate(record[key]) : String(record[key] || (key === "do_not_call" ? "0" : "")).trim()]));
const linkedinHref = (value) => (/^https?:\/\//.test(value) ? value : `https://${value}`);
const detailKey = (id) => ["employees", "detail", id];

function FieldValue({ field, value }) {
  if (!value) return <Text style={[type.body, { color: colors.mutedForeground }]}>—</Text>;
  const link = field === "email1" ? `mailto:${value}` : field === "phone_mobile" || field === "phone_work" ? `tel:${value}` : field === "linkedin_url" ? linkedinHref(value) : null;
  if (link) return <Text style={[type.body, { color: colors.primary }]} onPress={() => Linking.openURL(link)} selectable>{value}</Text>;
  if (field === "joining_date") return <Text style={type.body}>{joinDate(value)}</Text>;
  return <Text style={type.body} selectable>{value}</Text>;
}

export function EmployeeDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const employee = useQuery({ queryKey: detailKey(id), queryFn: () => fetchEmployee(id) });
  const directory = useEmployeesDirectory();
  const record = employee.data;

  if (employee.isPending) return <Screen><LoadingState label="Loading employee…" /></Screen>;
  if (employee.isError) return <Screen><ErrorState message={employee.error.message} onRetry={() => employee.refetch()} /></Screen>;

  const values = normalize(record);
  const name = employeeName(record);
  const phone = values.phone_mobile || values.phone_work;
  const doNotCall = values.do_not_call === "1";
  const time = tenure(values.joining_date);
  const departments = [...new Set((directory.data || []).map(employeeDepartment).filter(Boolean))].sort();

  return (
    <Screen refreshing={employee.isFetching} onRefresh={() => employee.refetch()}>
      <Card>
        <Text style={[type.tiny, { color: colors.primaryDeep }]}>Employee profile</Text>
        <Row>
          <Avatar name={name} size={56} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={type.title} numberOfLines={2}>{name}</Text>
            <Text style={type.small}>{values.current_designation || values.title || "No designation"}</Text>
          </View>
        </Row>
        <Row style={styles.wrapRow}>
          {values.department ? <Chip small icon="business-outline" label={values.department} tone="progress" style={styles.chipStart} /> : null}
          {values.joining_date ? <Chip small icon="calendar-outline" label={`Joined ${joinDate(values.joining_date)}${time ? ` · ${time}` : ""}`} style={styles.chipStart} /> : null}
          {doNotCall ? <Chip small icon="call-outline" label="Do not call" tone="closed" style={styles.chipStart} /> : null}
          {record.stage_id_name ? <Chip small label={record.stage_id_name} tone={isExEmployee(record) ? "closed" : "info"} style={styles.chipStart} /> : null}
          {record.hrc_phase_id_name ? <Chip small label={record.hrc_phase_id_name} style={styles.chipStart} /> : null}
          {record.status === "admin" ? <Chip small label="Admin" tone="lime" style={styles.chipStart} /> : null}
        </Row>
        <Row style={styles.wrapRow}>
          {values.email1 ? <Button title="Email" icon="mail-outline" small variant="outline" onPress={() => Linking.openURL(`mailto:${values.email1}`)} /> : null}
          {phone && !doNotCall ? <Button title="Call" icon="call-outline" small variant="outline" onPress={() => Linking.openURL(`tel:${phone}`)} /> : null}
          {values.linkedin_url ? <Button title="LinkedIn" icon="logo-linkedin" small variant="outline" onPress={() => Linking.openURL(linkedinHref(values.linkedin_url))} /> : null}
          <Button title="Attendance" icon="calendar-outline" small onPress={() => navigation.navigate("EmployeeAttendance", { email: record.email1, employeeId: record.id, name: fullName(record) })} />
          <Button title="Edit employee" icon="pencil" small variant="secondary" onPress={() => navigation.navigate("EmployeeEdit", { id: record.id, departments })} />
        </Row>
      </Card>

      {GROUPS.map(([title, icon, entries]) => (
        <Card key={title}>
          <Row>
            <View style={styles.groupIcon}>
              <Ionicons name={icon} size={15} color={colors.primary} />
            </View>
            <Text style={[type.subheading, styles.shrink]}>{title}</Text>
          </Row>
          {entries.map(([key, label], index) => (
            <View key={key} style={[styles.detailRow, index === entries.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={[type.small, { fontSize: 12, lineHeight: 17 }]}>{label}</Text>
              <FieldValue field={key} value={values[key]} />
            </View>
          ))}
        </Card>
      ))}

      <Card>
        <Text style={type.subheading}>Leave balance</Text>
        <KeyValue label="Planned leave" value={record.available_planned_leaves ?? "—"} />
        <KeyValue label="Sick leave" value={record.available_sick_leaves ?? "—"} last />
      </Card>
    </Screen>
  );
}


// ─── Add / edit ───────────────────────────────────────────────────────────────

/** Route "EmployeeEdit", params { id?, departments? }. Without an id it creates an employee. */
export function EmployeeEditScreen({ route, navigation }) {
  const id = route?.params?.id;
  const isNew = !id;
  const client = useQueryClient();
  const query = useQuery({ queryKey: detailKey(id), queryFn: () => fetchEmployee(id), enabled: !isNew });
  const directory = useEmployeesDirectory();
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const leaving = useRef(false);
  const original = useMemo(() => normalize(query.data || {}), [query.data]);
  const values = draft || original;
  const changed = FIELDS.filter(([key]) => values[key] !== original[key]);
  const departments = route?.params?.departments || [...new Set((directory.data || []).map(employeeDepartment).filter(Boolean))].sort();
  const departmentHints = departments.filter((item) => item !== values.department && (!values.department || lower(item).includes(lower(values.department)))).slice(0, 8);

  useEffect(() => {
    navigation?.setOptions?.({ title: isNew ? "Add employee" : "Edit employee" });
  }, [navigation, isNew]);

  // Unsaved changes: confirm before leaving, as the web drawer does.
  const dirty = changed.length > 0;
  useEffect(() => {
    if (!navigation?.addListener) return undefined;
    return navigation.addListener("beforeRemove", (event) => {
      if (!dirty || leaving.current) return;
      event.preventDefault();
      Alert.alert("Discard changes?", "You have unsaved changes.", [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => navigation.dispatch(event.data.action) },
      ]);
    });
  }, [navigation, dirty]);

  const update = (key, value) => setDraft({ ...values, [key]: value });

  async function save() {
    if (busy) return;
    if (!values.last_name.trim()) {
      setError("Last name is required.");
      return;
    }
    setBusy(true);
    setError("");
    const data = Object.fromEntries((isNew ? FIELDS : changed).map(([key]) => [key, values[key].trim()]));
    if (isNew || "first_name" in data || "last_name" in data) data.name = employeeName(values);
    if (data.joining_date) {
      const [year, month, day] = data.joining_date.split("-");
      data.joining_date = `${day}/${month}/${year}`;
    }
    try {
      await saveEmployee(id, data);
      await client.invalidateQueries({ queryKey: ["employees"] });
      toast.success(isNew ? "Employee created" : "Employee updated");
      leaving.current = true;
      navigation?.goBack?.();
    } catch (err) {
      setError(errorMessage(err, "Could not save employee. Please retry."));
    } finally {
      setBusy(false);
    }
  }

  if (!isNew && query.isPending) return <Screen><LoadingState label="Loading employee…" /></Screen>;
  if (!isNew && query.isError) return <Screen><ErrorState message={query.error.message} onRetry={() => query.refetch()} /></Screen>;

  return (
    <Screen>
      <Text style={type.small}>{isNew ? "Fill in the details below to create a profile." : `Editing ${employeeName(query.data)}`}</Text>
      {error ? <Notice tone="closed" icon="alert-circle-outline" message={error} /> : null}
      {GROUPS.map(([title, icon, entries]) => (
        <Card key={title}>
          <Row>
            <View style={styles.groupIcon}>
              <Ionicons name={icon} size={15} color={colors.primary} />
            </View>
            <Text style={[type.subheading, styles.shrink]}>{title}</Text>
          </Row>
          {entries.map(([key, label, kind]) =>
            kind === "date" ? (
              <DateField key={key} label={label} value={values[key]} onChange={(value) => update(key, value)} placeholder="Not set" disabled={busy} />
            ) : (
              <View key={key} style={{ gap: 6 }}>
                <Field
                  label={key === "last_name" ? `${label} *` : label}
                  value={values[key]}
                  onChangeText={(value) => update(key, value)}
                  editable={!busy}
                  multiline={kind === "textarea"}
                  keyboardType={kind === "email" ? "email-address" : kind === "tel" ? "phone-pad" : kind === "url" ? "url" : undefined}
                  autoCapitalize={kind === "email" || kind === "url" ? "none" : "sentences"}
                />
                {key === "department" && departmentHints.length ? (
                  <Row style={{ flexWrap: "wrap", rowGap: 6 }} gap={6}>
                    {departmentHints.map((item) => (
                      <Pressable key={item} onPress={() => update("department", item)} hitSlop={4} style={{ maxWidth: "100%" }}>
                        <Chip small label={item} tone="progress" style={styles.chipStart} />
                      </Pressable>
                    ))}
                  </Row>
                ) : null}
              </View>
            ),
          )}
          {title === "Personal & contact" ? (
            <Pressable
              onPress={() => update("do_not_call", values.do_not_call === "1" ? "0" : "1")}
              disabled={busy}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: values.do_not_call === "1" }}
              style={styles.checkbox}
            >
              <Ionicons name={values.do_not_call === "1" ? "checkbox" : "square-outline"} size={20} color={values.do_not_call === "1" ? colors.primary : colors.mutedForeground} style={styles.noShrink} />
              <Text style={[type.body, styles.shrink]}>Do not call this employee</Text>
            </Pressable>
          ) : null}
        </Card>
      ))}
      {!isNew ? <Text style={type.small}>{changed.length ? `${changed.length} unsaved change${changed.length > 1 ? "s" : ""}` : "No changes yet"}</Text> : null}
      {/* Two equal buttons sharing the row, so neither label is squeezed against the other. */}
      <View style={styles.formActions}>
        <Button title="Cancel" variant="outline" disabled={busy} onPress={() => navigation?.goBack?.()} style={styles.formAction} />
        <Button title={isNew ? "Create employee" : "Save changes"} icon="checkmark-circle-outline" loading={busy} disabled={!isNew && !changed.length} onPress={save} style={styles.formAction} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  filterButton: { flexShrink: 0, width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  filterButtonOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  activeFilters: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: -4 },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%", paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  filterChipText: { flexShrink: 1, fontSize: 12, lineHeight: 17, fontWeight: "600", color: colors.primary },
  clearText: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.primary },
  sheetBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.lg },
  sheetLabel: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.foreground },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  tile: { minWidth: "45%" },
  tileActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  contactIcon: { flexShrink: 0, width: 20, height: 20, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  cardFoot: { flexWrap: "wrap", columnGap: spacing.sm, rowGap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: 2 },
  groupIcon: { flexShrink: 0, width: 28, height: 28, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  detailRow: { gap: 2, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  wrapRow: { flexWrap: "wrap", rowGap: spacing.sm },
  formActions: { flexDirection: "row", gap: spacing.md },
  formAction: { flex: 1, alignSelf: "stretch", minHeight: 50 },
  badges: { flexShrink: 0, maxWidth: "40%", alignItems: "flex-end", gap: 4 },
  chipStart: { alignSelf: "flex-start" },
  footDate: { marginLeft: "auto", flexShrink: 1, textAlign: "right" },
  shrink: { flex: 1, minWidth: 0 },
  noShrink: { flexShrink: 0 },
  checkbox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 4 },
});
