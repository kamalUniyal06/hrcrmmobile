// Salary management: read-only list of hrc_salaries with search, month filter and a detail view.
// Web: pages/salaries/SalariesPage.jsx + salaryUtils.js (the web has no edit, so neither does this).
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, spacing, tones, type } from "../../theme";
import { Avatar, Button, Card, Chip, EmptyState, ErrorState, KeyValue, LoadingState, Notice, PageHeader, Row, Screen, SearchField, SelectField, StatTile } from "../../components/ui";
import { fetchSalaries, salaryListKey } from "../../api/salaries.api";
import { clean, plainText } from "../../utils/records";

const PAGE_SIZE = 20;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/* ── salaryUtils.js ─────────────────────────────────────────────────────── */

export const salaryName = (record) =>
  clean(record.hrc_employees_hrc_salaries_1_name) || clean(record.hrc_candidates_hrc_salaries_1_name) || clean(record.name) || "Unnamed employee";

function amount(value) {
  const text = clean(value);
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export const formatAmount = (value) => {
  const number = amount(value);
  return number === null ? "—" : number.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function difference(record) {
  const offered = amount(record.offered_salary);
  const paid = amount(record.paid_amount);
  return offered === null || paid === null ? null : offered - paid;
}

const useSalaries = () => useQuery({ queryKey: salaryListKey, queryFn: fetchSalaries });

/* ── List ───────────────────────────────────────────────────────────────── */

export function SalariesScreen({ navigation }) {
  const query = useSalaries();
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const records = useMemo(() => query.data || [], [query.data]);

  const availableMonths = useMemo(
    () => [...new Set(records.map((record) => clean(record.month)).filter(Boolean))].sort((a, b) => MONTHS.indexOf(a) - MONTHS.indexOf(b) || a.localeCompare(b)),
    [records],
  );
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return records.filter(
      (record) => (!month || clean(record.month) === month) && [salaryName(record), record.name, record.month].some((value) => clean(value).toLowerCase().includes(needle)),
    );
  }, [records, month, search]);
  const rows = filtered.slice(0, shown);

  const total = (field) => {
    const values = filtered.map((record) => amount(record[field])).filter((value) => value !== null);
    return values.length ? formatAmount(values.reduce((sum, value) => sum + value, 0)) : "—";
  };
  const statValue = (value) => (query.isPending || (query.isError && !query.data) ? "—" : value);
  const setFilter = (setter) => (value) => {
    setter(value);
    setShown(PAGE_SIZE);
  };

  return (
    <Screen refreshing={query.isFetching && !query.isPending} onRefresh={() => query.refetch()}>
      <PageHeader icon="wallet-outline" tone="progress" eyebrow="People workspace" title="Salary management" subtitle="Review employee salaries, paid amounts and monthly attendance details." />

      <View style={styles.stats}>
        <StatTile label="Salary records" loading={query.isPending} value={statValue(filtered.length.toLocaleString())} hint="Current filtered records" icon="wallet-outline" />
        <StatTile label="Total offered salary" loading={query.isPending} value={statValue(total("offered_salary"))} hint="Current filtered records" icon="cash-outline" style={styles.wideTile} />
        <StatTile label="Total paid amount" loading={query.isPending} value={statValue(total("paid_amount"))} hint="Current filtered records" icon="checkmark-done-outline" tone="success" style={styles.wideTile} />
      </View>

      <View style={{ gap: spacing.sm }}>
        <SearchField value={search} onChangeText={setFilter(setSearch)} placeholder="Search employee, email or month" />
        <SelectField
          value={month}
          onChange={setFilter(setMonth)}
          placeholder="All months"
          options={[{ label: "All months", value: "" }, ...availableMonths]}
        />
        {search || month ? (
          <Button title="Clear filters" icon="close" variant="outline" small onPress={() => { setSearch(""); setMonth(""); setShown(PAGE_SIZE); }} />
        ) : null}
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={15} color={tones.info.fg} style={styles.noteIcon} />
          <Text style={[type.small, styles.shrink]}>Amounts shown as supplied. Difference is offered salary minus paid amount.</Text>
        </View>
      </View>

      {query.isError ? <Notice tone="closed" icon="alert-circle-outline" message={query.error.message} action="Retry" onAction={() => query.refetch()} /> : null}

      {query.isPending ? (
        <LoadingState label="Loading salary records…" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="wallet-outline"
          title={query.isError ? "Salary records unavailable." : search || month ? "No matching salary records" : "No salary records yet."}
          message={!query.isError && (search || month) ? "Try clearing your filters." : undefined}
        />
      ) : (
        <>
          {rows.map((record, index) => (
            <SalaryCard
              key={record.id || index}
              record={record}
              onPress={record.id ? () => navigation.navigate("SalaryDetail", { id: record.id }) : undefined}
            />
          ))}
          <Text style={[styles.count, { textAlign: "center" }]}>
            {rows.length} of {filtered.length} records
          </Text>
          {rows.length < filtered.length ? (
            <Button title="Show more" variant="secondary" icon="chevron-down" style={{ alignSelf: "center" }} onPress={() => setShown((count) => count + PAGE_SIZE)} />
          ) : null}
        </>
      )}
    </Screen>
  );
}

function SalaryCard({ record, onPress }) {
  const name = salaryName(record);
  const recordName = clean(record.name);
  const diff = difference(record);
  return (
    <Card onPress={onPress} style={{ gap: spacing.md }}>
      <Row style={{ justifyContent: "space-between" }} align="flex-start" gap={spacing.md}>
        <Avatar name={name} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.cardTitle} numberOfLines={2}>{name}</Text>
          {recordName && recordName !== name ? <Text style={type.small} numberOfLines={2}>{recordName}</Text> : null}
        </View>
        <Chip label={clean(record.month) || "—"} tone="progress" small icon="calendar-outline" style={styles.monthChip} />
      </Row>
      <View style={styles.figures}>
        <Figure icon="cash-outline" tone="progress" label="Offered" value={formatAmount(record.offered_salary)} />
        <Figure icon="checkmark-done-outline" tone="success" label="Paid" value={formatAmount(record.paid_amount)} />
        <Figure icon="swap-vertical-outline" tone={diff !== null && diff !== 0 ? "attention" : "neutral"} label="Difference" value={formatAmount(diff)} highlight={diff !== null && diff !== 0} />
      </View>
      <Row style={styles.footer}>
        <Row gap={6} align="flex-start" style={{ flex: 1, minWidth: 0 }}>
          <Ionicons name="calendar-number-outline" size={14} color={colors.mutedForeground} style={styles.noteIcon} />
          <Text style={[type.small, styles.shrink]}>
            Working days {clean(record.total_working_days) || "—"} · Leaves {clean(record.leaves_of_month) || "—"}
          </Text>
        </Row>
        {onPress ? (
          <View style={styles.linkWrap}>
            <Text style={styles.link}>Details</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </View>
        ) : null}
      </Row>
    </Card>
  );
}

function Figure({ icon, tone = "progress", label, value, highlight = false }) {
  return (
    <View style={styles.figure}>
      <Row gap={6}>
        <View style={[styles.figureIcon, { backgroundColor: tones[tone].bg }]}>
          <Ionicons name={icon} size={12} color={tones[tone].fg} />
        </View>
        <Text style={[type.small, styles.shrink, { fontSize: 12, lineHeight: 17 }]} numberOfLines={2}>{label}</Text>
      </Row>
      <Text style={[styles.figureValue, highlight && { color: colors.attention }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {value}
      </Text>
    </View>
  );
}

/* ── Detail (web: the "Salary details" dialog) ──────────────────────────── */

export function SalaryDetailScreen({ route, navigation }) {
  const id = route?.params?.id;
  const query = useSalaries();
  const record = (query.data || []).find((item) => String(item.id) === String(id));

  if (query.isPending) return <Screen><LoadingState label="Loading salary record…" /></Screen>;
  if (query.isError && !record) return <Screen><ErrorState message={query.error.message} onRetry={() => query.refetch()} /></Screen>;
  if (!record) {
    return (
      <Screen>
        <EmptyState icon="wallet-outline" title="Salary record not found" message="It may have been removed." action="Back" onAction={() => navigation.goBack()} />
      </Screen>
    );
  }

  const show = (value) => clean(value) || "—";
  const details = [
    ["Employee / record", salaryName(record)],
    ["Record name", record.name],
    ["Month", record.month],
    ["Offered salary", formatAmount(record.offered_salary)],
    ["Paid amount", formatAmount(record.paid_amount)],
    ["Difference (offered − paid)", formatAmount(difference(record))],
    ["Total working days", record.total_working_days],
    ["Leaves of month", record.leaves_of_month],
    ["Account number", record.account_number],
    ["Assigned to", record.assigned_user_name],
    ["Created", record.date_entered_uni_format || record.date_entered],
    ["Created by", record.created_by_name],
    ["Last modified", record.date_modified_uni_format || record.date_modified],
    ["Modified by", record.modified_by_name],
  ];
  const description = plainText(record.description);

  return (
    <Screen refreshing={query.isFetching} onRefresh={() => query.refetch()}>
      <PageHeader icon="wallet-outline" tone="progress" showTitle title={salaryName(record)} subtitle="Salary, attendance and record information for the selected employee." />
      <Card>
        {details.map(([label, value], index) => (
          <KeyValue key={label} label={label} value={show(value)} last={index === details.length - 1} />
        ))}
      </Card>
      <Card style={{ gap: spacing.sm }}>
        <Row gap={spacing.md}>
          <View style={[styles.headingIcon, { backgroundColor: tones.info.bg }]}>
            <Ionicons name="document-text-outline" size={17} color={tones.info.fg} />
          </View>
          <Text style={[styles.cardTitle, styles.shrink]}>Description</Text>
        </Row>
        <Text style={type.body} selectable>{description || "—"}</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  wideTile: { minWidth: "100%" },
  monthChip: { alignSelf: "flex-start", flexShrink: 0, maxWidth: "38%" },
  cardTitle: { fontSize: 16, lineHeight: 23, fontWeight: "600", color: colors.navy },
  count: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.mutedForeground },
  shrink: { flexShrink: 1, minWidth: 0 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 6, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.infoSoft },
  noteIcon: { flexShrink: 0, marginTop: 2 },
  headingIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  // Three figures share a row when they fit; at large font scales they wrap instead of squeezing.
  figures: { flexDirection: "row", flexWrap: "wrap", columnGap: spacing.sm, rowGap: spacing.sm },
  figure: { flexGrow: 1, flexBasis: "30%", minWidth: 92, backgroundColor: colors.background, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, gap: 6 },
  figureIcon: { width: 20, height: 20, borderRadius: 6, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  figureValue: { fontSize: 15, lineHeight: 21, fontWeight: "600", color: colors.navy, fontVariant: ["tabular-nums"] },
  footer: { flexWrap: "wrap", columnGap: spacing.sm, rowGap: 4, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  linkWrap: { flexDirection: "row", alignItems: "center", gap: 2, flexShrink: 0, marginLeft: "auto" },
  link: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.primary },
});
