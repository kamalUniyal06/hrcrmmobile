// Clock in / lunch / clock out (web: components/employement/api/dailyActivity.api.js).
import { CRM_URL, FETCH_GPC_X_API_KEY } from "../config";
import { apiRequest, gateway } from "../services/api";
import { currentEmail } from "../store/authStore";
import { activeRecords, assertSuccess, fetchAllPages } from "../utils/records";
import { buildAttendanceStatsQueries, readAttendanceStats } from "../utils/adminAttendance";

export const getDailyActivity = async () => {
  const response = assertSuccess(
    await gateway({
      action: "fetch",
      module: "hrc_daily_activity",
      filters: { name: currentEmail() },
      date_range: "today",
      date_field: "date_entered",
      page: 1,
    }),
    "Could not load today's attendance.",
  );
  return activeRecords(response)[0] || null;
};

/** action: "login" | "lunch_in" | "lunch_out" | "logout" */
export const markActivity = (action) =>
  apiRequest({
    endpoint: `${CRM_URL}?entryPoint=hrc&type=daily_activity`,
    method: "POST",
    headers: { "X-Api-Key": FETCH_GPC_X_API_KEY, "Content-Type": "application/json" },
    body: { email: currentEmail(), action },
  });

export const getMyActivityRange = async ({ email, from, to }) => {
  const { records } = await fetchAllPages(gateway, {
    action: "fetch",
    module: "hrc_daily_activity",
    filters: { name: email },
    date_range: "custom",
    date_field: "date_entered",
    date_from: `${from} 00:00:00`,
    date_to: `${to} 23:59:59`,
    order_by: "date_entered",
    order_dir: "DESC",
  });
  return records;
};

export const getWorkingHistory = ({ email, from, to }) => getMyActivityRange({ email, from, to });

/** Organisation-wide activity for one day (admin). */
export const getOrgActivityForDay = async (day) => {
  const { records } = await fetchAllPages(gateway, {
    action: "fetch",
    module: "hrc_daily_activity",
    date_range: "custom",
    date_field: "date_entered",
    date_from: `${day} 00:00:00`,
    date_to: `${day} 23:59:59`,
  });
  return records;
};

/** Overview totals for one day (admin): all, not checked in, on leave, late, on time. */
export const fetchAttendanceStats = async (day) => readAttendanceStats(await gateway({ action: "get_stats", queries: buildAttendanceStatsQueries(day) }));
