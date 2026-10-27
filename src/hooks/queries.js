// React Query hooks shared across screens. Keys mirror the web app so the same
// mutations invalidate the same data.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore, selectEmail, selectUserId } from "../store/authStore";
import { toast } from "../store/toastStore";
import { getDailyActivity, getMyActivityRange } from "../api/dailyActivity.api";
import { fetchAttendanceLimits } from "../api/limits.api";
import { getLeaveHistory, getMyEmployeeRecord, getMyLeaves, getPublicHolidays } from "../api/leaves.api";
import { MY_ALERTS_KEY, fetchMyAlerts, fetchSystemAlerts, respondToAlert } from "../api/systemAlerts.api";
import { markAlertAnswered, respondErrorKind } from "../utils/systemAlerts";
import { findCandidate } from "../api/candidate.api";
import { fetchEmployees } from "../api/admin.api";
import { DEFAULT_LIMITS, timeToMinutes } from "../utils/attendance";
import { errorMessage } from "../utils/records";

const FIVE_MINUTES = 5 * 60 * 1000;

export const keys = {
  dailyActivity: ["dailyActivity"],
  activityRange: (email, from, to) => ["dailyActivity", "mine", email, from, to],
  limits: ["limit-management", "attendance-limits"],
  employeeRecord: (email) => ["users", "email", email],
  myLeaves: (id, email) => ["leaves", "employee", id || email],
  holidays: ["leaves", "public-holidays"],
  leaveHistory: (id) => ["leaves", "history", id],
  alerts: ["system-alerts", "all"],
  myAlerts: MY_ALERTS_KEY,
  candidate: (email) => ["candidate-profile", email],
  employees: ["employees", "list"],
};

export const useEmail = () => useAuthStore(selectEmail);
export const useUserId = () => useAuthStore(selectUserId);

export function useAttendanceLimits() {
  const query = useQuery({ queryKey: keys.limits, queryFn: fetchAttendanceLimits, staleTime: Infinity, placeholderData: DEFAULT_LIMITS });
  const limits = query.data || DEFAULT_LIMITS;
  const loginMinutes = timeToMinutes(limits.actualLoginTime) ?? 570;
  return { ...limits, loginMinutes, lateAfter: loginMinutes + limits.loginDelayMinutes };
}

export const useDailyActivity =() => useQuery({ queryKey: keys.dailyActivity, queryFn: getDailyActivity, staleTime: FIVE_MINUTES });

export const useMyActivityRange = ({ from, to }) => {
  const email = useEmail();
  return useQuery({
    queryKey: keys.activityRange(email, from, to),
    queryFn: () => getMyActivityRange({ email, from, to }),
    enabled: Boolean(email && from && to),
    staleTime: FIVE_MINUTES,
  });
};

export const useMyEmployeeRecord = () => {
  const email = useEmail();
  return useQuery({ queryKey: keys.employeeRecord(email), queryFn: getMyEmployeeRecord, enabled: Boolean(email), staleTime: FIVE_MINUTES });
};

export const useMyLeaves = () => {
  const email = useEmail();
  const employeeId = useUserId();
  return useQuery({
    queryKey: keys.myLeaves(employeeId, email),
    queryFn: () => getMyLeaves({ employeeId, email }),
    enabled: Boolean(employeeId || email),
    staleTime: FIVE_MINUTES,
  });
};

export const useLeaveHistory = (enabled = true) => {
  const employeeId = useUserId();
  return useQuery({
    queryKey: keys.leaveHistory(employeeId),
    queryFn: () => getLeaveHistory({ employeeId }),
    enabled: Boolean(employeeId) && enabled,
    staleTime: FIVE_MINUTES,
  });
};

export const usePublicHolidays =() => useQuery({ queryKey: keys.holidays, queryFn: getPublicHolidays, staleTime: 30 * 60 * 1000 });

export const useAnnouncements = () => useQuery({ queryKey: keys.alerts, queryFn: fetchSystemAlerts, staleTime: FIVE_MINUTES });

/** The signed-in employee's alerts from hrc my_alerts: only ones aimed at them, active and not expired. */
export const useMyAlerts = () => {
  const employeeId = useUserId();
  return useQuery({ queryKey: keys.myAlerts, queryFn: fetchMyAlerts, enabled: Boolean(employeeId), staleTime: 60 * 1000 });
};

export function useAnswerAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ alert, answer }) => respondToAlert({ alert, answer }),
    onSuccess: (_, { alert, answer }) => {
      queryClient.setQueryData(keys.myAlerts, (data) => (data ? markAlertAnswered(data, alert.id, answer) : data));
      toast.success("Your response has been saved.");
      queryClient.invalidateQueries({ queryKey: ["system-alerts"] });
    },
    onError: (error) => {
      if (respondErrorKind(error) === "unavailable") {
        toast.error("This alert is no longer available.");
        queryClient.invalidateQueries({ queryKey: keys.myAlerts });
        return;
      }
      toast.error(errorMessage(error, "Could not save your response."));
    },
  });
}

export const useCandidateProfile = () => {
  const email = useEmail();
  return useQuery({ queryKey: keys.candidate(email), queryFn: () => findCandidate(email), enabled: Boolean(email), staleTime: 0 });
};

export const useEmployeesDirectory = (enabled = true) =>
  useQuery({ queryKey: keys.employees, queryFn: fetchEmployees, enabled, staleTime: 10 * 60 * 1000 });
