// Generic CRM list stats and layout action requests.
// Web: src/api/entity.api.js getEntityStats, components/fields/actions/useActionMutation.js.
import { fetchGpc, http } from "../services/api";
import { buildTableRequestBody } from "./entity.api";
import { buildStatsQueries, resolveRequest } from "../utils/entityList";

/**
 * Status tab counts:
 * POST smart_gateway { action: "get_stats", filters?, search?, order_by?, order_dir?, queries: [{ key, module, filters, sum_of? }] }
 * The top-level keys are the table's current preferences, as the web sends them.
 */
export async function fetchEntityStats({ statuses = [], module, filters, search, orderBy, orderDir, email }) {
  return http({
    method: "POST",
    params: email ? { email } : {},
    body: { action: "get_stats", ...buildTableRequestBody({ filters, search, orderBy, orderDir }), queries: buildStatsQueries(statuses, module) },
  });
}

/** A layout "mutation" action: its request (placeholders filled from the record) goes to the Smart Gateway or the hrc entry point. */
export async function runActionRequest({ action, record, context = {} }) {
  const request = action?.request;
  if (!request) throw new Error("Mutation action requires request configuration");
  if (!request.endpoint) throw new Error("Mutation action requires endpoint");
  const { endpoint, method = "POST", params, body, headers } = resolveRequest(request, record, context);
  const target = String(endpoint).toLowerCase();
  if (target === "smartgateway") return http({ method, params, headers, body });
  if (target === "fetchgpc") return fetchGpc({ method, params, body, headers });
  throw new Error(`Unsupported action endpoint: ${endpoint}`);
}
