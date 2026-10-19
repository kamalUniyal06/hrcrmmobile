/**
 * Axios instance for the CRM (port of the web app's services/crmClient.js).
 *
 * - Attaches `Authorization: Bearer <token>` only for requests to flight.hrcrm.ai
 *   with an allowed entry point (smart_gateway, flexibility, sidebar, hrc).
 * - Injects the active UI module id into smart_gateway JSON bodies.
 * - On a CRM 401, clears the cached token and retries exactly once. 403 is never retried.
 */
import axios from "axios";
import { CRM_ALLOWED_ENTRY_POINTS, CRM_URL_PREFIX } from "../config";
import { clearCrmToken, getCrmToken } from "./crmAuth";

const ALLOWED = new Set(CRM_ALLOWED_ENTRY_POINTS);

let activeUiModuleId = null;
export const setActiveUiModule = (id) => {
  activeUiModuleId = id || null;
};
export const getActiveUiModule = () => activeUiModuleId;

function entryPointOf(url = "") {
  const index = url.indexOf("?");
  if (index === -1) return null;
  const query = url.slice(index + 1);
  for (const pair of query.split("&")) {
    const [key, value = ""] = pair.split("=");
    if (decodeURIComponent(key) === "entryPoint") return decodeURIComponent(value);
  }
  return null;
}

function crmEntryPoint(config) {
  const url = config.url || "";
  if (!url.startsWith(CRM_URL_PREFIX)) return null;
  const entryPoint = config.params?.entryPoint || entryPointOf(url);
  return entryPoint && ALLOWED.has(entryPoint) ? entryPoint : null;
}

export const crmClient = axios.create({ timeout: 45000 });

crmClient.interceptors.request.use(async (config) => {
  const entryPoint = crmEntryPoint(config);
  if (!entryPoint) return config;

  const token = await getCrmToken();
  config.headers = config.headers || {};
  config.headers.Authorization = `Bearer ${token}`;

  if (entryPoint === "sidebar" && config.params) {
    const { email, ...rest } = config.params;
    config.params = rest;
  }

  if (
    entryPoint === "smart_gateway" &&
    activeUiModuleId &&
    config.data &&
    typeof config.data === "object" &&
    !(typeof FormData !== "undefined" && config.data instanceof FormData)
  ) {
    config.data = { ...config.data, ui_module_id: activeUiModuleId };
  }
  return config;
});

crmClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (!config || !crmEntryPoint(config)) return Promise.reject(error);
    if (error.response?.status !== 401 || config.__crmRetried) return Promise.reject(error);
    config.__crmRetried = true;
    clearCrmToken();
    const token = await getCrmToken();
    config.headers.Authorization = `Bearer ${token}`;
    return crmClient(config);
  },
);
