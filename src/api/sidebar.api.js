// Server-driven sidebar (web: src/api/sidebar.api.js). The same layout the web sidebar renders.
import { CRM_URL, FETCH_GPC_X_API_KEY } from "../config";
import { apiRequest, http } from "../services/api";

export async function fetchSidebar() {
  const response = await apiRequest({
    endpoint: CRM_URL,
    params: { entryPoint: "sidebar", _: Date.now() },
    headers: { "X-Api-Key": FETCH_GPC_X_API_KEY },
  });
  if (response?.success === false || response?.status === false) throw new Error(response.error || response.message || "Could not load the menu.");
  const groups = Array.isArray(response) ? response : response?.data;
  if (!Array.isArray(groups)) throw new Error("The menu returned an unexpected response.");
  return groups;
}

/** Counts for the items with show_count, as { stats: { [key]: { count } } }. */
export const getSidebarStats = ({ email, queries = [] }) =>
  http({ method: "POST", params: email ? { email } : {}, body: { action: "get_stats", queries } });
