// Hiring overview: candidates added this month by stage, the newest candidates and the next
// interviews. Web: components/home/HiringPipelineCard.jsx (fed by AdminHomePage).
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors } from "../../theme";
import { Avatar, Card, Chip, SkeletonRows } from "../ui";
import { candidateName, candidateStage, hasOutcome, roundName, uniqueInterviews } from "../../api/admin.api";
import { formatDate, interviewDate } from "../../utils/dates";
import { candidateStageTone, friendlyDateTime, hiringSummary } from "../../utils/homeDashboard";
import { EmptyLine, IconSquare, InlineError, InsightHead, MiniCount, SectionLabel, homeStyles } from "./HomeCardParts";

// Distinct colours for the stage bar; "Other" and "Unassigned" use the muted tone.
const STAGE_COLORS = [colors.primary, colors.success, colors.info, "#F59E0B", colors.destructive];
const stageColor = (label, index) => (/^(other|unassigned)$/i.test(label) ? colors.mutedForeground : STAGE_COLORS[index % STAGE_COLORS.length]);
const LIST_LIMIT = 4;

/** `candidates` and `interviews` are React Query results (this month's candidates; every interview). */
export default function HiringPipelineCard({ candidates, interviews, navigation }) {
  const hiring = useMemo(
    () => hiringSummary(candidates.data || [], { stageOf: candidateStage, nameOf: candidateName, recent: LIST_LIMIT }),
    [candidates.data],
  );
  const upcoming = useMemo(() => {
    const now = Date.now();
    return uniqueInterviews(interviews.data || [])
      .filter((record) => !hasOutcome(record))
      .map((record) => ({ id: record.id, name: record.name || record.email || "Candidate", round: roundName(record), date: interviewDate(record.interview_datetime) }))
      .filter((item) => item.date && item.date.getTime() >= now)
      .sort((a, b) => a.date - b.date);
  }, [interviews.data]);

  const loading = candidates.isPending;
  const blank = loading || candidates.isError;
  const openAll = () => navigation.navigate("Candidates", { view: "all" });
  const openInterviews = () => navigation.navigate("InterviewBoard");

  return (
    <Card style={{ gap: 14 }}>
      <InsightHead icon="person-add-outline" title="Hiring pipeline" subtitle="Candidates added this month" onViewAll={openAll} />
      <View style={homeStyles.counts}>
        <MiniCount dot={colors.primary} label="New candidates" loading={loading} value={blank ? "—" : hiring.total} onPress={openAll} />
        <MiniCount dot={colors.success} label="Shortlisted" loading={loading} value={blank ? "—" : hiring.shortlisted} onPress={() => navigation.navigate("Candidates", { view: "shortlisted" })} />
        <MiniCount dot={colors.info} label="Upcoming interviews" loading={interviews.isPending} value={interviews.isPending || interviews.isError ? "—" : upcoming.length} onPress={openInterviews} />
      </View>

      {candidates.isError ? (
        <InlineError message="Candidates could not be loaded." onRetry={() => candidates.refetch()} />
      ) : (
        <>
          <View style={{ gap: 8 }}>
            <SectionLabel>By stage</SectionLabel>
            {loading ? (
              <SkeletonRows label="Loading candidates" />
            ) : hiring.total === 0 ? (
              <EmptyLine>No candidates added this month yet.</EmptyLine>
            ) : (
              <>
                <View style={styles.stageBar}>
                  {hiring.stages.map((stage, index) => (
                    <View key={stage.label} style={{ flex: stage.count, backgroundColor: stageColor(stage.label, index) }} />
                  ))}
                </View>
                <View style={styles.legend}>
                  {hiring.stages.map((stage, index) => (
                    <View key={stage.label} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: stageColor(stage.label, index) }]} />
                      <Text style={styles.legendLabel}>{stage.label}</Text>
                      <Text style={styles.legendCount}>{stage.count}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>

          {loading ? null : (
          <View style={{ gap: 4 }}>
            <SectionLabel>Newest candidates</SectionLabel>
            {hiring.recent.length === 0 ? (
              <EmptyLine>Applications added this month will appear here.</EmptyLine>
            ) : (
              hiring.recent.map((candidate) => (
                <Pressable key={candidate.id} onPress={() => navigation.navigate("CandidateDetail", { id: candidate.id })} style={({ pressed }) => [homeStyles.row, pressed && { opacity: 0.7 }]}>
                  <Avatar name={candidate.name} size={38} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={homeStyles.rowTitle} numberOfLines={2}>{candidate.name}</Text>
                    <Text style={homeStyles.rowSub} numberOfLines={2}>{candidate.designation || `Applied ${formatDate(candidate.record.date_entered, { year: false })}`}</Text>
                  </View>
                  <Chip label={candidate.stage} tone={candidateStageTone(candidate.stage)} small style={{ maxWidth: "40%", flexShrink: 0 }} />
                </Pressable>
              ))
            )}
          </View>
          )}
        </>
      )}

      <View style={{ gap: 4 }}>
        <SectionLabel>Next interviews</SectionLabel>
        {interviews.isPending ? (
          <SkeletonRows label="Loading interviews" />
        ) : interviews.isError ? (
          <InlineError message="Interviews could not be loaded." onRetry={() => interviews.refetch()} />
        ) : upcoming.length === 0 ? (
          <EmptyLine>Nothing scheduled. Upcoming interviews will appear here.</EmptyLine>
        ) : (
          upcoming.slice(0, LIST_LIMIT).map((interview) => (
            <Pressable key={interview.id} onPress={openInterviews} style={({ pressed }) => [homeStyles.row, pressed && { opacity: 0.7 }]}>
              <IconSquare icon="calendar-clear-outline" tone="info" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={homeStyles.rowTitle} numberOfLines={2}>{interview.name}</Text>
                <Text style={homeStyles.rowSub}>{interview.round} · {friendlyDateTime(interview.date)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} style={{ flexShrink: 0 }} />
            </Pressable>
          ))
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stageBar: { flexDirection: "row", height: 10, gap: 2, borderRadius: 5, overflow: "hidden", backgroundColor: colors.muted },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%" },
  legendDot: { flexShrink: 0, width: 8, height: 8, borderRadius: 4 },
  legendLabel: { flexShrink: 1, fontSize: 12, lineHeight: 17, color: colors.mutedForeground },
  legendCount: { fontSize: 12, lineHeight: 17, fontWeight: "600", color: colors.foreground, fontVariant: ["tabular-nums"] },
});
