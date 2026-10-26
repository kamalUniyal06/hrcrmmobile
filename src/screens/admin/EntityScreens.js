// Generic CRM entity screens (web: components/routing/DynamicEntityHandler.jsx →
// pages/entity/EntityListPage.jsx, EntityViewPage.jsx, EntityCreatePage.jsx, EntityEditPage.jsx,
// components/ui/table/Table.jsx, components/detail/blocks, components/create + components/edit).
// Columns, fields and labels all come from the flexibility layout metadata.
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, spacing, tones, type } from "../../theme";
import { Button, Card, Chip, EmptyState, ErrorState, Field, KeyValue, LoadingState, Notice, PageHeader, Row, Screen, SelectField } from "../../components/ui";
import { createEntity, fetchEntityPage, fetchEntityRecord, fetchLayout, nextPageOf, updateEntity } from "../../api/entity.api";
import { getActiveUiModule, setActiveUiModule } from "../../services/crmClient";
import { toast } from "../../store/toastStore";
import { formatDate, formatDateTime } from "../../utils/dates";
import { clean, errorMessage, plainText, readable } from "../../utils/records";

/* ── Layout metadata helpers ────────────────────────────────────────────── */

/** Same reading as the web isColumnVisible: missing / unknown counts as visible. */
const isVisible = (item) => {
  const value = item?.visible;
  if (value === undefined || value === null || value === "") return true;
  if (typeof value === "boolean") return value;
  return String(value) !== "0" && String(value).toLowerCase() !== "false";
};

/** Web utils/layoutRank: ranks are binary strings, unique within one parent. */
function byRank(items) {
  const list = (Array.isArray(items) ? items : []).filter((item) => item && isVisible(item));
  if (!list.every((item) => typeof item.rank === "string" && item.rank)) return list;
  return [...list].sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));
}

const getByPath = (object, path) =>
  !path ? object : String(path).split(".").reduce((current, key) => (current == null ? undefined : current[key]), object);

/** Web resolveSourceRecord: a section/field may read from a nested record (source.path). */
function sourceRecord(record, source) {
  if (!record || !source) return record;
  if (typeof source === "string") return getByPath(record, source);
  return source.path ? getByPath(record, source.path) : record;
}

const fieldValue = (record, field, section) => getByPath(sourceRecord(record, section?.source || field?.source), field?.accessor);

const fieldLabel = (field) => clean(field?.label || field?.header || field?.title) || readable(String(field?.accessor || "").replace(/\./g, " "));

/** Sections of a detail/create layout in order; tabs contribute their sections under the tab label. */
function layoutSections(layout) {
  const sections = [];
  for (const block of byRank(layout?.blocks)) {
    if (block.type === "tabs") {
      for (const tab of byRank(block.tabs)) {
        byRank(tab.sections).forEach((section, index) => sections.push({ ...section, tabLabel: index === 0 ? tab.label : null }));
      }
    } else if (Array.isArray(block.fields)) {
      sections.push(block);
    }
  }
  return sections.map((section) => ({ ...section, fields: byRank(section.fields).filter((field) => field?.accessor) }));
}

const sectionModule = (section, layout, fallback) => section?.source?.module || section?.module || layout?.module || fallback;

/* ── Value display ──────────────────────────────────────────────────────── */

const isEmpty = (value) => value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
const isTruthy = (value) => value === true || value === 1 || value === "1" || value === "true";
const typeOf = (field) => String(field?.type || field?.display?.type || "text").toLowerCase();

const SELECT_TYPES = new Set(["select", "dropdown", "enum", "status", "radio", "multi_select", "multiselect", "multienum"]);
const DATE_TYPES = new Set(["date"]);
const DATETIME_TYPES = new Set(["datetime", "datetimecombo"]);
const BOOL_TYPES = new Set(["boolean", "bool", "checkbox"]);
const NUMBER_TYPES = new Set(["number", "integer", "int", "decimal", "float", "currency", "money", "percent"]);
const TEXT_TYPES = new Set(["text", "string", "varchar", "name", "email", "phone", "url"]);
const LONG_TYPES = new Set(["textarea", "long_text", "text_area", "html", "wysiwyg"]);

/** Options from the field metadata (`options` / `values`) or the gateway's dropdown_lists. */
function optionsOf(field, dropdowns = {}) {
  const raw = field?.options || field?.values || dropdowns?.[field?.options_name] || dropdowns?.[field?.accessor];
  if (Array.isArray(raw)) {
    return raw
      .map((option) => (option && typeof option === "object" ? { label: plainText(option.label ?? option.name ?? option.value), value: String(option.value ?? option.id ?? "") } : { label: plainText(option), value: String(option ?? "") }))
      .filter((option) => option.value !== "" || option.label);
  }
  if (raw && typeof raw === "object") return Object.entries(raw).map(([value, label]) => ({ value: String(value), label: plainText(label) || readable(value) }));
  return [];
}

function optionLabel(field, value, dropdowns) {
  const option = optionsOf(field, dropdowns).find((item) => item.value === String(value));
  return option?.label || plainText(value);
}

function asText(value) {
  if (isEmpty(value)) return "";
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(", ");
  if (typeof value === "object") return asText(value.label ?? value.name ?? value.title ?? value.value ?? "");
  return plainText(value);
}

/** Display string for one field, or "" when there is nothing to show. */
function displayValue(field, record, section, dropdowns) {
  let value = fieldValue(record, field, section);
  const kind = typeOf(field);
  // Relations carry their display name in <accessor>_name (CRM convention).
  if (["relation", "lookup", "user", "owner", "relate"].includes(kind)) value = fieldValue(record, { ...field, accessor: `${field.accessor}_name` }, section) || value;
  if (BOOL_TYPES.has(kind)) return isEmpty(value) ? "" : isTruthy(value) ? "Yes" : "No";
  if (isEmpty(value)) return "";
  if (SELECT_TYPES.has(kind)) {
    const values = Array.isArray(value) ? value : String(value).replace(/^\^|\^$/g, "").split(/\^,\^/);
    return values.map((item) => optionLabel(field, item, dropdowns)).filter(Boolean).join(", ");
  }
  if (DATE_TYPES.has(kind)) return formatDate(value);
  if (DATETIME_TYPES.has(kind)) return formatDateTime(value);
  if (kind === "percent") return `${asText(value)}%`;
  return asText(value);
}

/* ── Shared hooks ───────────────────────────────────────────────────────── */

/**
 * The web sends the active sidebar item's id as ui_module_id on every smart_gateway call
 * (services/crmClient.js). Set it while this screen is focused; clear it on blur/unmount if
 * it is still ours, so other screens' requests are not tagged with it.
 */
function useActiveUiModule(navigation, uiModuleId) {
  useEffect(() => {
    if (!uiModuleId) return undefined;
    const activate = () => setActiveUiModule(uiModuleId);
    const release = () => {
      if (getActiveUiModule() === uiModuleId) setActiveUiModule(null);
    };
    activate();
    const offFocus = navigation?.addListener?.("focus", activate);
    const offBlur = navigation?.addListener?.("blur", release);
    return () => {
      offFocus?.();
      offBlur?.();
      release();
    };
  }, [navigation, uiModuleId]);
}

function useHeaderTitle(navigation, title) {
  useLayoutEffect(() => {
    if (title) navigation?.setOptions?.({ title });
  }, [navigation, title]);
}

const useLayout = (module, viewKey, enabled = true) =>
  useQuery({ queryKey: ["entity", module, "layout", viewKey], queryFn: () => fetchLayout(module, viewKey), enabled: !!module && enabled, staleTime: 5 * 60 * 1000 });

const hasEditableFields = (layout) => layoutSections(layout).some((section) => section.fields.some(isEditable));

/* ── List ───────────────────────────────────────────────────────────────── */

const isDateColumn = (column) => /date|time_ago|_at$/i.test(column.accessor) || DATE_TYPES.has(typeOf(column)) || DATETIME_TYPES.has(typeOf(column));

/** Phone card shape from the table columns: a title, up to two subtitle fields, a date and a status. */
function cardColumns(columns) {
  const status = columns.find((column) => typeOf(column) === "status");
  const rest = columns.filter((column) => column !== status && !BOOL_TYPES.has(typeOf(column)));
  const date = rest.find(isDateColumn);
  const plain = rest.filter((column) => column !== date);
  const title = plain[0] || date || columns[0];
  return { title, subtitles: plain.filter((column) => column !== title).slice(0, 2), date: date !== title ? date : null, status };
}

function EntityCard({ record, card, dropdowns, onPress }) {
  const title = card.title ? displayValue(card.title, record, null, dropdowns) : "";
  const subtitle = card.subtitles.map((column) => displayValue(column, record, null, dropdowns)).filter(Boolean).join(" · ");
  const date = card.date ? displayValue(card.date, record, null, dropdowns) : "";
  const status = card.status ? displayValue(card.status, record, null, dropdowns) : "";
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.listCard, pressed && { backgroundColor: colors.muted }]}>
      <View style={[styles.tile, { backgroundColor: tones.progress.bg }]}>
        <Ionicons name="document-text-outline" size={18} color={tones.progress.fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={styles.cardTitle} numberOfLines={2}>{title || clean(record.name) || "Untitled"}</Text>
        {subtitle ? <Text style={type.small} numberOfLines={2}>{subtitle}</Text> : null}
        {date || status ? (
          <Row style={{ marginTop: 4, flexWrap: "wrap" }} gap={6}>
            {status ? <Chip label={status} tone="progress" small style={styles.statusChip} /> : null}
            {date ? <Text style={[type.small, { fontSize: 12, lineHeight: 16, flexShrink: 1 }]} numberOfLines={1} ellipsizeMode="tail">{date}</Text> : null}
          </Row>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} style={{ flexShrink: 0 }} />
    </Pressable>
  );
}

/** Params: { module, title, uiModuleId? }. */
export function EntityListScreen({ route, navigation }) {
  const { module, title, uiModuleId } = route?.params || {};
  useHeaderTitle(navigation, title);
  useActiveUiModule(navigation, uiModuleId);

  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchText]);

  const layout = useLayout(module, "table");
  const createLayout = useLayout(module, "create", layout.isSuccess);
  const gatewayModule = layout.data?.module || module;
  const config = layout.data?.config || {};

  const records = useInfiniteQuery({
    queryKey: ["entity", module, "list", gatewayModule, search],
    queryFn: ({ pageParam }) => fetchEntityPage({ module: gatewayModule, page: pageParam, search, filters: layout.data?.dataFilters || {} }),
    initialPageParam: 1,
    getNextPageParam: nextPageOf,
    enabled: layout.isSuccess,
  });

  const columns = useMemo(() => byRank(config.columns).filter((column) => column?.accessor), [config.columns]);
  const card = useMemo(() => cardColumns(columns), [columns]);
  const pages = records.data?.pages || [];
  const rows = pages.flatMap((page) => page.records);
  const dropdowns = pages.reduce((all, page) => ({ ...all, ...(page.dropdown_lists || {}) }), {});
  const total = Number(pages[0]?.total ?? pages[0]?.pagination?.total) || 0;
  const searchEnabled = config.search?.enabled !== false;
  const canCreate = createLayout.isSuccess && hasEditableFields(createLayout.data);

  useLayoutEffect(() => {
    navigation?.setOptions?.({
      headerRight: canCreate
        ? () => (
            <Pressable hitSlop={10} accessibilityLabel="New record" onPress={() => navigation.navigate("EntityForm", { module, title, uiModuleId, mode: "create" })}>
              <Ionicons name="add" size={26} color={colors.primary} />
            </Pressable>
          )
        : undefined,
    });
  }, [navigation, canCreate, module, title, uiModuleId]);

  if (!module) return <Screen><ErrorState message="No module was given for this page." /></Screen>;
  if (layout.isPending) return <Screen><LoadingState label="Loading layout…" /></Screen>;
  if (layout.isError) return <Screen><ErrorState message={`Unable to load the layout. ${errorMessage(layout.error, "")}`.trim()} onRetry={() => layout.refetch()} /></Screen>;

  const countLabel = `${total ? `${rows.length} of ${total}` : `${rows.length}`} record${(total || rows.length) === 1 ? "" : "s"}`;
  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.sm }}>
      {records.isSuccess ? <PageHeader icon="albums" tone="progress" title={title || "Records"} subtitle={countLabel} /> : null}
      {searchEnabled ? (
        <Field value={searchText} onChangeText={setSearchText} placeholder={clean(config.search?.placeholder) || `Search ${title || "records"}`} autoCapitalize="none" />
      ) : null}
    </View>
  );

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.listHeader}>{header}</View>
      {records.isPending ? (
        <LoadingState label="Loading records…" />
      ) : records.isError ? (
        <View style={{ padding: spacing.lg }}><ErrorState message={errorMessage(records.error)} onRetry={() => records.refetch()} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item, index) => String(item.id || index)}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          refreshing={records.isRefetching && !records.isFetchingNextPage}
          onRefresh={() => records.refetch()}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (records.hasNextPage && !records.isFetchingNextPage) records.fetchNextPage();
          }}
          renderItem={({ item }) => (
            <EntityCard
              record={item}
              card={card}
              dropdowns={dropdowns}
              onPress={() => navigation.navigate("EntityDetail", { module, id: item.id, title, uiModuleId })}
            />
          )}
          ListEmptyComponent={<EmptyState title="No records" message={search ? "Nothing matches that search." : "There is nothing here yet."} />}
          ListFooterComponent={
            records.hasNextPage ? (
              <Button title="Load more" variant="outline" small loading={records.isFetchingNextPage} onPress={() => records.fetchNextPage()} style={{ alignSelf: "center", marginTop: spacing.sm }} />
            ) : null
          }
        />
      )}
    </Screen>
  );
}

/* ── Detail ─────────────────────────────────────────────────────────────── */

function DetailRow({ label, value, last }) {
  if (!value) return null;
  if (value.length <= 40 && !value.includes("\n")) return <KeyValue label={label} value={value} last={last} />;
  return (
    <View style={[styles.stackedRow, last && { borderBottomWidth: 0 }]}>
      <Text style={type.small}>{label}</Text>
      <Text style={type.body} selectable>{value}</Text>
    </View>
  );
}

/** Params: { module, id, title, uiModuleId? }. */
export function EntityDetailScreen({ route, navigation }) {
  const { module, id, title, uiModuleId, email } = route?.params || {};
  useHeaderTitle(navigation, title);
  useActiveUiModule(navigation, uiModuleId);

  const layout = useLayout(module, "detail");
  const recordModule = layout.data?.request?.body?.module || layout.data?.module || module;
  const record = useQuery({
    queryKey: ["entity", module, "detail", id || email],
    queryFn: () => fetchEntityRecord({ module: recordModule, id, email }),
    enabled: layout.isSuccess && !!(id || email),
  });

  if (layout.isPending || (layout.isSuccess && record.isPending)) return <Screen><LoadingState /></Screen>;
  if (layout.isError) return <Screen><ErrorState message={errorMessage(layout.error, "Unable to load the layout.")} onRetry={() => layout.refetch()} /></Screen>;
  if (record.isError) return <Screen><ErrorState message={errorMessage(record.error)} onRetry={() => record.refetch()} /></Screen>;

  const { record: data, dropdowns } = record.data;
  const header = layout.data.header || {};
  const sections = layoutSections(layout.data);
  const heading = header.titleField ? displayValue(header.titleField, data, null, dropdowns) : "";
  const subtitle = header.subtitleField ? displayValue(header.subtitleField, data, null, dropdowns) : "";
  const description = header.descriptionField ? displayValue(header.descriptionField, data, null, dropdowns) : "";
  const editAction = (header.actions || []).find((action) => action?.type === "navigate" && /(^|\/)edit$/.test(String(action.target || "")));
  const canEdit = !!editAction || hasEditableFields(layout.data);

  return (
    <Screen refreshing={record.isRefetching} onRefresh={() => record.refetch()}>
      <Card style={{ gap: spacing.md }}>
        <View style={styles.headRow}>
          <View style={[styles.headIcon, { backgroundColor: tones.progress.bg }]}>
            <Ionicons name="albums" size={22} color={tones.progress.fg} />
          </View>
          <View style={styles.headText}>
            <Text style={styles.heading} selectable>{heading || clean(data.name) || title || "Record"}</Text>
            {subtitle ? <Text style={type.small}>{subtitle}</Text> : null}
          </View>
        </View>
        {description ? <Text style={type.small}>{description}</Text> : null}
        {canEdit ? (
          <Button
            title={clean(editAction?.label) || "Edit"}
            icon="create-outline"
            variant="secondary"
            full
            style={styles.editButton}
            onPress={() => navigation.navigate("EntityForm", { module, id: data.id, title, uiModuleId, mode: "edit" })}
          />
        ) : null}
      </Card>

      {sections.length === 0 ? <EmptyState title="No fields" message="No detail layout has been configured for this module." /> : null}
      {sections.map((section, index) => {
        const rows = section.fields.map((field) => ({ field, value: displayValue(field, data, section, dropdowns) })).filter((row) => row.value);
        if (!rows.length) return null;
        return (
          <View key={section.id || index} style={{ gap: spacing.sm }}>
            {section.tabLabel ? <Text style={styles.tabLabel}>{section.tabLabel}</Text> : null}
            <Card style={{ gap: 0 }}>
              {section.title ? <Text style={[styles.sectionTitle, { marginBottom: 4 }]}>{section.title}</Text> : null}
              {rows.map((row, rowIndex) => (
                <DetailRow key={row.field.accessor} label={fieldLabel(row.field)} value={row.value} last={rowIndex === rows.length - 1} />
              ))}
            </Card>
          </View>
        );
      })}
    </Screen>
  );
}

/* ── Create / edit ──────────────────────────────────────────────────────── */

const EDITABLE_TYPES = new Set([...TEXT_TYPES, ...LONG_TYPES, ...NUMBER_TYPES, ...DATE_TYPES, ...DATETIME_TYPES, ...BOOL_TYPES, "select", "dropdown", "enum", "status", "radio"]);

function isEditable(field) {
  if (!field?.accessor || field.editable === false || field.readonly === true || String(field.readonly) === "1") return false;
  return EDITABLE_TYPES.has(typeOf(field));
}

const isRequired = (field) => field?.required === true || String(field?.required) === "1" || field?.validation?.required === true;

const keyboardFor = (kind) =>
  NUMBER_TYPES.has(kind) ? "decimal-pad" : kind === "email" ? "email-address" : kind === "phone" ? "phone-pad" : kind === "url" ? "url" : undefined;

function initialValue(field, record, section) {
  if (!record) return field.defaultValue ?? (BOOL_TYPES.has(typeOf(field)) ? false : "");
  const value = fieldValue(record, field, section);
  if (BOOL_TYPES.has(typeOf(field))) return isTruthy(value);
  if (LONG_TYPES.has(typeOf(field))) return plainText(value);
  return value === null || value === undefined ? "" : typeof value === "object" ? asText(value) : String(value);
}

function FormField({ field, value, onChange, error, dropdowns }) {
  const kind = typeOf(field);
  const label = `${fieldLabel(field)}${isRequired(field) ? " *" : ""}`;
  if (BOOL_TYPES.has(kind)) {
    return (
      <Row style={styles.switchRow}>
        <Text style={[type.body, { flex: 1, minWidth: 0 }]}>{label}</Text>
        <Switch value={!!value} onValueChange={onChange} trackColor={{ true: colors.primary }} style={{ flexShrink: 0 }} />
      </Row>
    );
  }
  if (SELECT_TYPES.has(kind)) {
    const options = optionsOf(field, dropdowns);
    if (options.length) {
      return <SelectField label={label} value={String(value ?? "")} onChange={onChange} options={[{ label: "None", value: "" }, ...options]} error={error} />;
    }
  }
  const hint = DATE_TYPES.has(kind) ? "Format: YYYY-MM-DD" : DATETIME_TYPES.has(kind) ? "Format: YYYY-MM-DD HH:mm" : undefined;
  return (
    <Field
      label={label}
      value={String(value ?? "")}
      onChangeText={onChange}
      placeholder={clean(field.placeholder) || undefined}
      multiline={LONG_TYPES.has(kind)}
      keyboardType={keyboardFor(kind)}
      autoCapitalize={["email", "url"].includes(kind) ? "none" : "sentences"}
      error={error}
      hint={hint}
    />
  );
}

/** Params: { module, title, uiModuleId?, mode: "create" | "edit", id? (edit) }. */
export function EntityFormScreen({ route, navigation }) {
  const { module, id, title, uiModuleId, mode = id ? "edit" : "create" } = route?.params || {};
  const editing = mode === "edit";
  useHeaderTitle(navigation, `${editing ? "Edit" : "New"} ${title || "record"}`);
  useActiveUiModule(navigation, uiModuleId);
  const queryClient = useQueryClient();

  // Web: create uses the "create" layout; edit reuses the "detail" layout with the record.
  const layout = useLayout(module, editing ? "detail" : "create");
  const recordModule = layout.data?.request?.body?.module || layout.data?.module || module;
  const record = useQuery({
    queryKey: ["entity", module, "detail", id],
    queryFn: () => fetchEntityRecord({ module: recordModule, id }),
    enabled: editing && layout.isSuccess && !!id,
  });

  const sections = useMemo(() => (layout.data ? layoutSections(layout.data) : []), [layout.data]);
  const source = record.data?.record;
  const dropdowns = record.data?.dropdowns;
  const [values, setValues] = useState(null);
  const [dirty, setDirty] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const ready = layout.isSuccess && (!editing || record.isSuccess);
  useEffect(() => {
    if (!ready || values) return;
    const state = {};
    sections.forEach((section) => {
      section.fields.filter(isEditable).forEach((field) => {
        state[`${sectionModule(section, layout.data, module)}|${field.accessor}`] = initialValue(field, source, section);
      });
    });
    setValues(state);
  }, [ready, values, sections, source, layout.data, module]);

  if (layout.isPending || (editing && layout.isSuccess && record.isPending) || (ready && !values)) return <Screen><LoadingState /></Screen>;
  if (layout.isError) return <Screen><ErrorState message={errorMessage(layout.error, "Unable to load the form layout.")} onRetry={() => layout.refetch()} /></Screen>;
  if (record.isError) return <Screen><ErrorState message={errorMessage(record.error)} onRetry={() => record.refetch()} /></Screen>;

  const editableCount = sections.reduce((count, section) => count + section.fields.filter(isEditable).length, 0);

  const save = async () => {
    const nextErrors = {};
    const changes = {};
    sections.forEach((section) => {
      const target = sectionModule(section, layout.data, module);
      const recordId = editing ? sourceRecord(source, section.source)?.id : null;
      section.fields.filter(isEditable).forEach((field) => {
        const key = `${target}|${field.accessor}`;
        const value = values[key];
        if (isRequired(field) && (value === "" || value === null || value === undefined)) nextErrors[key] = `${fieldLabel(field)} is required.`;
        // Web buildCreatePayload / buildMutationPayload: only dirty fields are sent, per module.
        if (!dirty[key]) return;
        const group = (changes[target] = changes[target] || { module: target, id: recordId, data: {} });
        group.data[field.accessor] = BOOL_TYPES.has(typeOf(field)) ? (value ? 1 : 0) : value;
      });
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const list = Object.values(changes);
    if (!list.length) {
      toast.info("Nothing to save.");
      return;
    }
    setSaving(true);
    try {
      await Promise.all(list.map((change) => (editing ? updateEntity({ ...change, id: change.id || id }) : createEntity({ module: change.module, data: change.data }))));
      await queryClient.invalidateQueries({ queryKey: ["entity", module] });
      toast.success(editing ? "Changes saved." : "Record created.");
      navigation.goBack();
    } catch (error) {
      toast.error(errorMessage(error, "Could not save."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      {editableCount === 0 ? <Notice tone="attention" icon="information-circle-outline" message="This form has no fields that can be edited on the phone." /> : null}
      {sections.map((section, index) => {
        const target = sectionModule(section, layout.data, module);
        const editable = section.fields.filter(isEditable);
        const readOnly = editing ? section.fields.filter((field) => !isEditable(field)).map((field) => ({ field, value: displayValue(field, source, section, dropdowns) })).filter((row) => row.value) : [];
        if (!editable.length && !readOnly.length) return null;
        return (
          <Card key={section.id || index} style={{ gap: spacing.md }}>
            {section.title ? <Text style={styles.sectionTitle}>{section.title}</Text> : null}
            {editable.map((field) => {
              const key = `${target}|${field.accessor}`;
              return (
                <FormField
                  key={key}
                  field={field}
                  value={values[key]}
                  error={errors[key]}
                  dropdowns={dropdowns}
                  onChange={(value) => {
                    setValues((current) => ({ ...current, [key]: value }));
                    setDirty((current) => ({ ...current, [key]: true }));
                  }}
                />
              );
            })}
            {readOnly.length ? (
              <View>
                {readOnly.map((row, rowIndex) => (
                  <DetailRow key={row.field.accessor} label={fieldLabel(row.field)} value={row.value} last={rowIndex === readOnly.length - 1} />
                ))}
              </View>
            ) : null}
          </Card>
        );
      })}
      {editableCount ? (
        <View style={styles.footer}>
          <Button title={editing ? "Save changes" : "Create"} icon="checkmark-circle-outline" full loading={saving} onPress={save} style={styles.saveButton} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  listHeader: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm, flexGrow: 1 },
  listCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  tile: { flexShrink: 0, width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 15, lineHeight: 21, fontWeight: "600", color: colors.navy },
  statusChip: { alignSelf: "flex-start", maxWidth: "60%", flexShrink: 0 },
  headRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headIcon: { flexShrink: 0, width: 48, height: 48, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  headText: { flex: 1, minWidth: 0, gap: 2 },
  heading: { fontSize: 24, lineHeight: 30, fontWeight: "600", letterSpacing: -0.4, color: colors.navy },
  editButton: { minHeight: 46 },
  sectionTitle: { fontSize: 17, lineHeight: 23, fontWeight: "600", color: colors.navy },
  footer: { paddingTop: spacing.sm },
  saveButton: { minHeight: 52, borderRadius: radius.lg, paddingHorizontal: spacing.xl },
  stackedRow: { gap: 4, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabLabel: { ...type.tiny, color: colors.primary, marginTop: spacing.sm },
  switchRow: { justifyContent: "space-between", paddingVertical: 4 },
});
