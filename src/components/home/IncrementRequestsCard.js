// Latest increment requests with questionnaire progress.
// Web: components/home/IncrementRequestsCard.jsx (overview from incrementAdminData.requestOverview).
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";
import { Avatar, Card, SkeletonRows } from "../ui";
import { requestIdentity, requestOverview, requestedAnnualSalary } from "../../api/increment.api";
import { formatDate } from "../../utils/dates";
import { EmptyLine, InlineError, InsightHead, MiniCount, ProgressBar, homeStyles } from "./HomeCardParts";

const COMPLETE_COLOR = colors.success;
const AWAITING_COLOR = "#F59E0B";
const LIMIT = 5;
const rupees = (value) => `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/**
 * `requests` and `questions` are React Query results (fetchAdminRequests / fetchAdminQuestions).
 * `nameFor(email)` returns the directory name for a request's employee email, if known.
 */
export default function IncrementRequestsCard({ requests, questions, nameFor, navigation }) {
  const overview = useMemo(
    () => requestOverview(requests.data?.records || [], questions.data || [], requests.data?.replies || []),
    [requests.data, questions.data],
  );
  const loading = requests.isPending || questions.isPending;
  const error = requests.isError || questions.isError;
  const blank = loading || error;
  const answeredShare = overview.total ? Math.round((overview.complete / overview.total) * 100) : 0;
  const openList = (params) => navigation.navigate("IncrementRequests", params);

  return (
    <Card style={{ gap: 14 }}>
      <InsightHead
        icon="cash-outline"
        tone="success"
        title="Increment requests"
        subtitle="Compensation requests from employees"
        badge={!blank && overview.awaiting ? `${overview.awaiting} open` : null}
        onViewAll={() => openList()}
      />
      <View style={homeStyles.counts}>
        <MiniCount dot={colors.primary} label="Total" loading={loading} value={blank ? "—" : overview.total} onPress={() => openList()} />
        <MiniCount dot={COMPLETE_COLOR} label="Answered" loading={loading} value={blank ? "—" : overview.complete} onPress={() => openList({ filter: "complete" })} />
        <MiniCount dot={AWAITING_COLOR} label="Awaiting" loading={loading} value={blank ? "—" : overview.awaiting} onPress={() => openList({ filter: "awaiting" })} />
      </View>

      {!blank && overview.total > 0 ? (
        <View style={{ gap: 6 }}>
          <View style={styles.shareRow}>
            <Text style={[styles.shareLabel, { flex: 1, minWidth: 0 }]}>Questionnaires completed</Text>
            <Text style={styles.shareValue}>{answeredShare}%</Text>
          </View>
          <ProgressBar percent={answeredShare} color={COMPLETE_COLOR} height={8} />
        </View>
      ) : null}

      {error ? (
        <InlineError message="Increment requests could not be loaded." onRetry={() => { requests.refetch(); questions.refetch(); }} />
      ) : loading ? (
        <SkeletonRows label="Loading increment requests" />
      ) : overview.rows.length === 0 ? (
        <EmptyLine>No increment requests yet. New requests from employees will appear here.</EmptyLine>
      ) : (
        <View style={{ gap: 2 }}>
          {overview.rows.slice(0, LIMIT).map(({ record, progress }) => {
            const identity = requestIdentity(record);
            const name = (identity.email && nameFor(identity.email)) || identity.name;
            const salary = requestedAnnualSalary(record);
            const percent = progress.total ? Math.round((progress.answered / progress.total) * 100) : 0;
            return (
              <Pressable key={record.id} onPress={() => navigation.navigate("IncrementRequestDetail", { id: record.id })} style={({ pressed }) => [homeStyles.row, pressed && { opacity: 0.7 }]}>
                <Avatar name={name} size={38} />
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <Text style={homeStyles.rowTitle} numberOfLines={2}>{name}</Text>
                  <View style={styles.progressRow}>
                    <ProgressBar percent={percent} color={progress.complete ? COMPLETE_COLOR : AWAITING_COLOR} style={{ width: 48, flexShrink: 0 }} />
                    <Text style={[homeStyles.rowSub, { flex: 1, minWidth: 0 }]}>
                      {progress.total ? `${progress.answered}/${progress.total} answered` : "No questions"} · {formatDate(record.date_entered, { year: false })}
                    </Text>
                  </View>
                </View>
                <View style={styles.amountBox}>
                  <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{salary === null ? "—" : rupees(salary)}</Text>
                  <Text style={styles.amountHint} numberOfLines={2}>requested / yr</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  shareRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  shareLabel: { fontSize: 12, lineHeight: 17, color: colors.mutedForeground },
  shareValue: { fontSize: 12, lineHeight: 17, fontWeight: "600", color: colors.foreground, fontVariant: ["tabular-nums"] },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  amountBox: { flexShrink: 0, maxWidth: "38%", alignItems: "flex-end" },
  amount: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: colors.foreground, fontVariant: ["tabular-nums"] },
  amountHint: { fontSize: 11, lineHeight: 15, color: colors.mutedForeground, textAlign: "right" },
});
