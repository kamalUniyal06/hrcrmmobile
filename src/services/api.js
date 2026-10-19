/**
 * Request helpers (port of the web app's services/api.js).
 *
 *   apiRequest  – plain request through the shared client (auth backend, misc).
 *   http        – Smart Gateway call: POST { action, module, ... } with a signed X-Api-Token.
 *   smartGateway– same as http, kept for parity with the web code.
 *   fetchGpc    – `hrc` entry point calls (clock in/out, leave create) with X-Api-Key.
 */
import CryptoJS from "crypto-js";
import { CRM_URL, FETCH_GPC_X_API_KEY, SMARTGATEWAY_SECRET_KEY } from "../config";
import { crmClient } from "./crmClient";

const isFormData = (body) => typeof FormData !== "undefined" && body instanceof FormData;

const generateToken = () => {
  const json = JSON.stringify({ ts: Math.floor(Date.now() / 1000), source: "claude-mcp" });
  const signature = CryptoJS.HmacSHA256(json, SMARTGATEWAY_SECRET_KEY).toString(CryptoJS.enc.Hex);
  return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(`${json}||${signature}`));
};

export const apiRequest = async ({ endpoint, method = "GET", body = null, headers = {}, params = {}, withCredentials = false }) => {
  const response = await crmClient({ url: endpoint, method, data: body, headers, params, withCredentials });
  return response.data;
};

export const http = async ({ endpoint = "", method = "POST", body = null, params = {}, headers = {} }) => {
  const requestHeaders = { "X-Api-Token": generateToken(), ...headers };
  if (!isFormData(body) && !requestHeaders["Content-Type"]) requestHeaders["Content-Type"] = "application/json";
  const response = await crmClient({
    url: `${endpoint || CRM_URL}?entryPoint=smart_gateway`,
    method,
    data: body,
    params,
    headers: requestHeaders,
  });
  return response.data;
};

export const smartGateway = (options) => http(options);

export const fetchGpc = async ({ endpoint = "", method = "GET", body = null, params = {}, headers = {} }) => {
  const requestHeaders = { "X-Api-Key": FETCH_GPC_X_API_KEY, ...headers };
  if (!isFormData(body) && !requestHeaders["Content-Type"]) requestHeaders["Content-Type"] = "application/json";
  const response = await crmClient({
    url: endpoint || `${CRM_URL}?entryPoint=hrc`,
    method,
    data: body,
    params,
    headers: requestHeaders,
  });
  return response.data;
};

/** Smart Gateway request body shortcut: `gateway({ action: "fetch", module: "hrc_leaves" })`. */
export const gateway = (body) => http({ method: "POST", body });
