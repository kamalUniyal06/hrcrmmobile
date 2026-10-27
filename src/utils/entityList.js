// Generic CRM list helpers: status tabs, column filters, sorting and layout actions.
// Web: components/ui/table/StatusRow.jsx, FilterColumn.jsx, SortDropDown.jsx, utils/tableLayout.js (toStatus),
// components/fields/actions/ActionEngine.js, actionResolver.js, actionConditions.js.
import { clean, plainText, readable } from "./records";

const isRank = (value) => typeof value === "string" && value !== "";

const toBoolean = (value, fallback = true) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return String(value) !== "0" && String(value).toLowerCase() !== "false";
};

// The compiler's presentation.<kind>.currentValue wins over the plain field (web presentationValue).
const presented = (raw, kind) => {
  const value = raw?.presentation?.[kind]?.currentValue;
  return value !== undefined && value !== null ? value : raw?.[kind];
};

/** layout.config.statusConfig → visible statuses in rank order, as the web table shows them. */
export function normalizeStatuses(rawStatuses) {
  const statuses = (Array.isArray(rawStatuses) ? rawStatuses : [])
    .filter((raw) => raw && typeof raw === "object")
    .map((raw) => {
      const key = raw.key ?? "";
      return {
        ...raw,
        key,
        label: clean(presented(raw, "label")) || key,
        color: clean(presented(raw, "color")),
        filters: raw.filters ?? {},
        amountKey: raw.amountKey ?? "",
        visible: toBoolean(presented(raw, "visible"), true),
        rank: isRank(presented(raw, "rank")) ? presented(raw, "rank") : null,
      };
    })
    .filter((status) => status.visible && status.key !== "");
  if (!statuses.every((status) => status.rank)) return statuses;
  return [...statuses].sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));
}

/** get_stats `queries` for the status tabs (web getEntityStats). */
export const buildStatsQueries = (statuses = [], module) =>
  statuses.map((status) => ({
    key: status.key,
    module,
    filters: status.filters ?? {},
    ...(status.amountKey ? { sum_of: [status.amountKey] } : {}),
  }));

export const statusCount = (summary, key) => Number(summary?.stats?.[key]?.count || 0);

/** Every filter key a status tab controls (filters, legacy filter/field, otherFilters, neqFilter). */
function statusFilterKeys(statuses) {
  const keys = new Set();
  for (const status of statuses) {
    Object.keys(status.filters || {}).forEach((key) => keys.add(key));
    if (status.filter) keys.add(status.filter);
    if (status.field) keys.add(status.field);
    Object.keys(status.otherFilters || {}).forEach((key) => keys.add(key));
    Object.keys(status.neqFilter || {}).forEach((key) => keys.add(key));
  }
  return keys;
}

/** The filters one status applies. */
export function statusFiltersOf(status) {
  const result = { ...(status.filters || {}) };
  if (!Object.keys(status.filters || {}).length && (status.filter || status.field)) result[status.filter || status.field] = status.value;
  if (status.otherFilters) Object.assign(result, status.otherFilters);
  if (status.neqFilter) Object.entries(status.neqFilter).forEach(([field, value]) => { result[field] = { neq: value }; });
  return result;
}

const sameFilter = (current, value) =>
  value && typeof value === "object" && value.neq !== undefined ? current?.neq === value.neq : current === value;

/** Web StatusRow isStatusActive. */
export function isStatusActive(filters = {}, status) {
  const own = status.filters && Object.keys(status.filters).length ? status.filters : null;
  if (own) return Object.entries(own).every(([key, value]) => filters?.[key] === value);
  if (status.field || status.filter) return filters?.[status.field || status.filter] === status.value;
  return Object.entries(statusFiltersOf(status)).every(([key, value]) => sameFilter(filters?.[key], value));
}

/** Web StatusRow toggleStatus: clear every status-controlled key, then apply this one unless it was already on. */
export function toggleStatusFilters(filters = {}, statuses = [], status) {
  const updated = { ...filters };
  statusFilterKeys(statuses).forEach((key) => delete updated[key]);
  const own = statusFiltersOf(status);
  const alreadyApplied = Object.entries(own).every(([key, value]) => sameFilter(filters?.[key], value));
  return alreadyApplied ? updated : Object.assign(updated, own);
}

/** layout.config.filterColumns → { accessor, label, values: [{ value, label }] } with at least one value. */
export function filterColumnsOf(config) {
  return (Array.isArray(config?.filterColumns) ? config.filterColumns : [])
    .filter((column) => column?.accessor && toBoolean(column.visible, true))
    .map((column) => ({
      accessor: column.accessor,
      label: clean(column.label) || readable(column.accessor),
      values: (Array.isArray(column.values) ? column.values : [])
        .map((item) => (item && typeof item === "object" ? { value: item.value, label: plainText(item.label ?? item.value) } : { value: item, label: plainText(item) }))
        .filter((item) => item.value !== undefined && item.value !== null),
    }))
    .filter((column) => column.values.length);
}

/** User filters set from the filter sheet (status-controlled keys excluded). */
export const activeFilterCount = (filters = {}, filterColumns = []) => filterColumns.filter((column) => filters[column.accessor] !== undefined).length;

/** Columns the web sort dropdown offers: an accessor and `sortable`. */
export const sortableColumns = (columns = []) => columns.filter((column) => column?.accessor && toBoolean(column.sortable, false));

/* ── Actions (web ActionEngine / actionResolver / actionConditions) ───── */

export function getPathValue(path, record = {}, context = {}) {
  const keys = path.split(".");
  const value = keys.reduce((current, key) => current?.[key], record);
  return value !== undefined ? value : keys.reduce((current, key) => current?.[key], context);
}

/** "/orders/{id}/edit" → "/orders/123/edit"; values are URI-encoded like the web. */
export function resolveTemplate(value, record = {}, context = {}) {
  if (typeof value !== "string") return value;
  return value.replace(/\{([^{}]+)\}/g, (_, expression) => {
    const result = getPathValue(expression.trim(), record, context);
    return result === undefined || result === null ? "" : encodeURIComponent(String(result));
  });
}

export function resolveDynamicValue(value, record = {}, context = {}) {
  if (typeof value === "string") return resolveTemplate(value, record, context);
  if (Array.isArray(value)) return value.map((item) => resolveDynamicValue(item, record, context));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, resolveDynamicValue(child, record, context)]));
  }
  return value;
}

export function resolveRequest(request, record = {}, context = {}) {
  if (!request) return {};
  return {
    ...request,
    endpoint: request.endpoint ? resolveTemplate(request.endpoint, record, context) : request.endpoint,
    params: resolveDynamicValue(request.params, record, context),
    body: resolveDynamicValue(request.body, record, context),
    headers: resolveDynamicValue(request.headers, record, context),
  };
}

function evaluateSingle(condition, record) {
  const raw = record?.[condition.field];
  const value = typeof raw === "string" ? raw.toLowerCase() : raw;
  const expected = typeof condition.value === "string" ? condition.value.toLowerCase() : condition.value;
  switch (condition.operator) {
    case "eq": return value === expected;
    case "neq": return value !== expected;
    case "gt": return value > expected;
    case "gte": return value >= expected;
    case "lt": return value < expected;
    case "lte": return value <= expected;
    case "in": return Array.isArray(expected) && expected.includes(value);
    case "not_in": return Array.isArray(expected) && !expected.includes(value);
    case "contains": return String(value ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
    case "not_contains": return !String(value ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
    case "exists": return value !== undefined && value !== null;
    case "empty": return value === undefined || value === null || value === "";
    case "not_empty": return !(value === undefined || value === null || value === "");
    default: return true;
  }
}

export function evaluateCondition(condition, record) {
  if (!condition) return true;
  if (Array.isArray(condition.all)) return condition.all.every((child) => evaluateCondition(child, record));
  if (Array.isArray(condition.any)) return condition.any.some((child) => evaluateCondition(child, record));
  return evaluateSingle(condition, record);
}

const evaluateVisibility = (visibility, record) =>
  !Array.isArray(visibility) || !visibility.length || visibility.every((condition) => evaluateCondition(condition, record));

export const isActionVisible = (action, record) => Boolean(action) && action.visible !== false && evaluateVisibility(action.visibility, record);

export function isActionDisabled(action, record) {
  if (!action) return false;
  if (action.disabled === true) return true;
  return Array.isArray(action.disabled) && action.disabled.length > 0 && evaluateVisibility(action.disabled, record);
}

/** Action types the phone can run. modal/callback need web-only components / registered handlers. */
export const PHONE_ACTION_TYPES = new Set(["navigate", "mutation"]);

/** Visible actions of a layout field / header, in rank order when every action has one. */
export function layoutActions(actions, record) {
  const list = (Array.isArray(actions) ? actions : []).filter((action) => action?.type && isActionVisible(action, record));
  if (!list.every((action) => isRank(action.rank))) return list;
  return [...list].sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));
}

/**
 * Web route for a navigate action → the phone screen that shows it, or null.
 * `base` is the web path of the current screen ("/<module>" or "/<module>/<id>") for relative targets.
 *   /<module>/<id>/edit → EntityForm (edit) · /<module>/create|new → EntityForm (create)
 *   /<module>/<id> → EntityDetail · /<module> → EntityList
 */
export function mobileRouteFor(action, record, { base = "", module, title, uiModuleId } = {}) {
  if (!action?.target) return null;
  const target = resolveTemplate(action.target, record);
  const path = action.targetType === "relative" ? `${base.replace(/\/$/, "")}/${target.replace(/^\//, "")}` : target;
  const segments = path.split(/[?#]/)[0].split("/").filter(Boolean).map(decodeURIComponent);
  if (!segments.length) return null;
  const [targetModule, second, third] = segments;
  const params = { module: targetModule, title: targetModule === module ? title : readable(targetModule), uiModuleId: targetModule === module ? uiModuleId : undefined };
  if (segments.length === 1) return { name: "EntityList", params };
  if (segments.length === 2 && ["create", "new"].includes(second)) return { name: "EntityForm", params: { ...params, mode: "create" } };
  if (segments.length === 2) return { name: "EntityDetail", params: { ...params, id: second } };
  if (segments.length === 3 && third === "edit") return { name: "EntityForm", params: { ...params, id: second, mode: "edit" } };
  return null;
}
