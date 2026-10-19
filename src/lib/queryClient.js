import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const status = error?.response?.status || error?.status;
        if (status === 401 || status === 403 || error?.code === "SESSION_EXPIRED") return false;
        return failureCount < 1;
      },
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});
