// Generic CRM entities (web: src/api/layouts.api.js, src/api/entity.api.js, src/hooks/useEntity.js,
// src/utils/preferenceStorage.js buildTableRequestBody). Layout metadata comes from the
// `flexibility` entry point; records come from the Smart Gateway.
import { CRM_URL } from "../config";
import { apiRequest, http } from "../services/api";
import { assertSuccess, isDeleted } from "../utils/records";

/**
 * Layout metadata for one module and view (web getLayout):
 * GET index.php?entryPoint=flexibility&api_version=v1&module_key=<module>&view_key=<view>&_=<ts>
 * view_key is "table" for the list, "detail" for detail/edit and "create" for create.
 */
export async function fetchLayout(module, viewKey = "table") {
  const response = await apiRequest({
    endpoint: `${CRM_URL}?entryPoint=flexibility&api_version=v1`,
    params: { module_key: module, view_key: viewKey, _: Date.now() },
  });
  if (response?.success === false || response?.status === false) {
    throw new Error(response.error || response.message || "Could not load the layout.");
  }
  // The web reads the response as the layout itself; accept a { data } envelope too.
  const layout = response?.config || response?.blocks ? response : response?.data?.config || response?.data?.blocks ? response.data : response;
  if (!layout || typeof layout !== "object") throw new Error("No layout has been configured for this module.");
  return layout;
}

/** Web buildTableRequestBody: only the keys the user actually set are sent. */
export function buildTableRequestBody({ search = "", searchFields = [], filters = {}, orderBy, orderDir } = {}) {
  const body = {};
  if (filters && Object.keys(filters).length) body.filters = filters;
  if (String(search).trim()) body.search = String(search).trim();
  if (searchFields.length) body.search_fields = searchFields;
  if (orderBy) {
    body.order_by = orderBy;
    body.order_dir = orderDir || "DESC";
  }
  return body;
}

/**
 * One list page (web fetchInfiniteList):
 * POST smart_gateway { action: "fetch", module, page, filters?, search?, search_fields?, order_by?, order_dir? }
 * `module` is layout.module; ui_module_id is added by the crm client while the screen is focused.
 */
export async function fetchEntityPage({ module, page = 1, search, searchFields, filters, orderBy, orderDir, email }) {
  const response = await http({
    method: "POST",
    params: email ? { email } : {},
    body: { action: "fetch", module, page, ...buildTableRequestBody({ search, searchFields, filters, orderBy, orderDir }) },
  });
  assertSuccess(response, "Could not load records.");
  return {
    ...response,
    records: (Array.isArray(response.records) ? response.records : []).filter((record) => record && !isDeleted(record)),
  };
}

/** Next page number, as the web getNextPageParam (page < total_pages). */
export function nextPageOf(lastPage) {
  const page = Number(lastPage?.page ?? lastPage?.pagination?.page) || 1;
  const total = Number(lastPage?.total_pages ?? lastPage?.pagination?.total_pages) || 0;
  return page < total ? page + 1 : undefined;
}

/**
 * One record (web fetchOne for request.endpoint "smartgateway"). The web looks records up by
 * `?email=`; the phone app opens them from the list by id, so the id goes in as a filter.
 * POST smart_gateway { action: "fetch", module, filters: { id }, page: 1, per_page: 1 }
 */
export async function fetchEntityRecord({ module, id, email }) {
  const response = await http({
    method: "POST",
    params: email ? { email } : {},
    body: id ? { action: "fetch", module, filters: { id }, page: 1, per_page: 1 } : { action: "fetch", module },
  });
  assertSuccess(response, "Could not load the record.");
  const records = Array.isArray(response.records) ? response.records : [];
  const record = (id ? records.find((item) => String(item?.id) === String(id)) : null) || records[0];
  if (!record) throw new Error("Record not found.");
  return { record, dropdowns: response.dropdown_lists || {} };
}

/** Web updateOne: POST smart_gateway { action: "update", module, id, data }. */
export async function updateEntity({ module, id, data }) {
  return assertSuccess(await http({ method: "POST", body: { action: "update", module, id, data } }), "Could not save the record.");
}

/**
 * Create. The web createOne posts to an unconfigured REST endpoint; the phone uses the Smart
 * Gateway create action the other modules use: POST smart_gateway { action: "create", module, data }.
 */
export async function createEntity({ module, data }) {
  return assertSuccess(await http({ method: "POST", body: { action: "create", module, data } }), "Could not create the record.");
}
