// Stage, phase and status options for candidates (web CandidatesPage lookupResults), cached for five minutes
// under the web's ["candidate-workflow", kind] keys.
import { useQueries } from "@tanstack/react-query";
import { fetchWorkflowOptions } from "../../api/admin.api";
import { WORKFLOW_KINDS } from "../../utils/recruitment";

/** Returns { data: { stage, phase, status } (undefined until loaded), isError, refetch }. */
export default function useWorkflowLookups() {
  const results = useQueries({
    queries: WORKFLOW_KINDS.map((kind) => ({ queryKey: ["candidate-workflow", kind], queryFn: () => fetchWorkflowOptions(kind), staleTime: 5 * 60 * 1000 })),
  });
  return {
    data: Object.fromEntries(WORKFLOW_KINDS.map((kind, index) => [kind, results[index].data])),
    isError: results.some((result) => result.isError),
    refetch: () => results.forEach((result) => result.refetch()),
  };
}
