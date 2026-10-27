// The Round 1 test as a to-do item (web CandidateTestInvitation.jsx): what to do, by when,
// and the button that opens (or continues) the test in the browser.
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, tones, type } from "../../theme";
import { Button, Card, Chip, SkeletonText } from "../ui";
import { testInvitationView } from "../../utils/candidateInvitation";

/** `query` is the React Query result of fetchMyTestInvitation; `onOpen(url)` opens the link. */
export default function TestInvitationCard({ query, roundLabel = "Round 1", jobTitle = "", now = Date.now(), onOpen }) {
  const view = testInvitationView(query.data, now);
  const invitation = query.data;
  return (
    <Card>
      <View style={styles.head}>
        <View style={[styles.icon, view.canOpen ? { backgroundColor: tones.attention.bg } : { backgroundColor: colors.muted }]}>
          <Ionicons name={view.completed ? "checkmark-circle-outline" : "link-outline"} size={22} color={view.completed ? colors.primary : view.canOpen ? tones.attention.fg : colors.mutedForeground} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text style={type.subheading}>{view.completed ? `${roundLabel} test completed` : `Complete the ${roundLabel} test`}</Text>
          {view.canOpen ? <Chip label={`Due ${view.due}`} tone="attention" small style={{ alignSelf: "flex-start" }} /> : null}
        </View>
      </View>
      {query.isPending ? (
        <SkeletonText lines={2} />
      ) : query.isError ? (
        <View style={{ gap: 4 }}>
          <Text style={[type.small, { color: colors.destructive }]}>{query.error.message}</Text>
          <Button title="Retry test link" variant="ghost" small icon="refresh" loading={query.isFetching} onPress={() => query.refetch()} style={{ marginLeft: -12 }} />
        </View>
      ) : view.canOpen ? (
        <>
          <Text style={type.small}>
            {jobTitle ? `${jobTitle} · ` : ""}
            {view.started ? "Started. You can continue" : "Open"} until <Text style={{ fontWeight: "600", color: colors.foreground }}>{view.due}</Text>. Finish it before your {roundLabel} interview.
          </Text>
          <Button title={view.started ? "Continue test" : "Open test"} icon="open-outline" full onPress={() => onOpen(invitation.url)} />
        </>
      ) : (
        <Text style={type.small}>{view.message}</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
});
