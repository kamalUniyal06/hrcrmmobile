// Candidate list filters (web CandidatesPage filter popover, DateRangeFilter and sortable columns):
// stage, phase, status and source, the "applied" date range, and the sort order. Changes apply together.
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, type } from "../../theme";
import { Button, Row, SelectField, Sheet } from "../ui";
import DateField from "../ui/DateField";
import { NO_FILTERS, SORT_OPTIONS, WORKFLOW_KINDS, filterOptions } from "../../utils/recruitment";

const ALL_LABEL = { stage: "All stages", phase: "All phases", status: "All statuses" };
const LABELS = { stage: "Stage", phase: "Phase", status: "Status" };

/**
 * `initial` = { filters, sort ("key:direction"), dateRange }; `lookups` = { stage, phase, status } option lists;
 * `sources` = [{ value, label }]. Mount with a `key` that changes on open so it starts from `initial`.
 */
export default function CandidateFilterSheet({ visible, initial, defaultRange, lookups, sources = [], onClose, onApply }) {
  const [value, setValue] = useState(initial);
  const set = (patch) => setValue((current) => ({ ...current, ...patch }));
  const setFilter = (key, next) => setValue((current) => ({ ...current, filters: { ...current.filters, [key]: next } }));
  const range = value.dateRange;
  const invalid = !range.fromDate || !range.toDate || range.fromDate > range.toDate;

  return (
    <Sheet visible={visible} onClose={onClose} title="Filter candidates">
      <View style={styles.body}>
        {WORKFLOW_KINDS.map((kind) => (
          <SelectField
            key={kind}
            label={LABELS[kind]}
            value={value.filters[kind]}
            onChange={(next) => setFilter(kind, next)}
            options={[{ value: "", label: ALL_LABEL[kind] }, ...filterOptions(lookups?.[kind] || [])]}
          />
        ))}
        {sources.length ? (
          <SelectField label="Source" value={value.filters.source} onChange={(next) => setFilter("source", next)} options={[{ value: "", label: "All sources" }, ...sources]} />
        ) : null}

        <SelectField label="Sort by" value={value.sort} onChange={(sort) => set({ sort })} options={SORT_OPTIONS} />

        <Text style={styles.label}>Applied between</Text>
        <Row align="flex-end" style={{ gap: spacing.sm }}>
          <DateField label="From" value={range.fromDate} onChange={(fromDate) => set({ dateRange: { ...range, fromDate, fromTime: "00:00" } })} clearable={false} style={styles.half} />
          <DateField label="To" value={range.toDate} onChange={(toDate) => set({ dateRange: { ...range, toDate, toTime: "23:59" } })} clearable={false} minKey={range.fromDate} style={styles.half} />
        </Row>
        <Button title="This month" variant="outline" small onPress={() => set({ dateRange: defaultRange })} />
        {invalid ? <Text style={[type.small, { color: colors.destructive }]}>Choose a valid date range with the start before the end.</Text> : null}

        <Row style={{ flexWrap: "wrap", rowGap: spacing.sm }}>
          <Button title="Clear filters" variant="outline" style={styles.action} onPress={() => set({ filters: NO_FILTERS })} />
          <Button title="Apply" icon="checkmark" disabled={invalid} style={styles.action} onPress={() => onApply(value)} />
        </Row>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.foreground },
  half: { flex: 1, minWidth: 0 },
  action: { flexGrow: 1, flexBasis: 120, minHeight: 48 },
});
