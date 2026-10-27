// Step trackers for the candidate screens: a compact row of stage bars for list rows, and a
// vertical timeline (numbered dots joined by a line) for an application's or interview's progress.
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, tones, type } from "../../theme";

/** `steps`: [{ label, state: done | current | upcoming, tone }] (utils/candidateJourney applicationSteps). */
export function StageBars({ steps, style }) {
  return (
    <View style={[styles.bars, style]} accessibilityRole="progressbar" accessibilityLabel={`Step ${steps.findIndex((s) => s.state === "current") + 1 || steps.length} of ${steps.length}`}>
      {steps.map((step) => (
        <View
          key={step.label}
          style={[
            styles.bar,
            step.state === "done" && { backgroundColor: step.tone === "closed" ? colors.destructive : colors.primary },
            step.state === "current" && { backgroundColor: (tones[step.tone] || tones.progress).fg, opacity: 0.55 },
          ]}
        />
      ))}
    </View>
  );
}

function StepDot({ state, tone, index }) {
  const closed = tone === "closed";
  const filled = state === "done";
  const background = filled ? (closed ? colors.destructive : colors.primary) : state === "current" ? colors.primarySoft : colors.muted;
  return (
    <View style={[styles.dot, { backgroundColor: background }, state === "current" && { borderWidth: 2, borderColor: colors.primary }]}>
      {filled ? (
        <Ionicons name={closed ? "close" : "checkmark"} size={14} color="#fff" />
      ) : (
        <Text style={[styles.dotText, state === "current" && { color: colors.primary }]}>{index + 1}</Text>
      )}
    </View>
  );
}

/**
 * Vertical tracker. Each item: { key, label, state, tone, caption, detail, footer }.
 * `caption` sits beside the label ("Done", "Up next"); `detail` and `footer` (a node) below it.
 */
export function StepTimeline({ items }) {
  return (
    <View>
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          <View key={item.key || item.label} style={styles.timelineRow} accessibilityState={{ selected: item.state === "current" }}>
            <View style={styles.rail}>
              <StepDot state={item.state} tone={item.tone} index={index} />
              {!last ? <View style={[styles.line, item.state === "done" && { backgroundColor: colors.primary }]} /> : null}
            </View>
            <View style={[styles.timelineBody, !last && { paddingBottom: 18 }]}>
              <Text style={type.subheading}>
                {item.label}
                {item.caption ? <Text style={[type.small, item.state === "current" && { color: colors.primary, fontWeight: "600" }]}>{`  ${item.caption}`}</Text> : null}
              </Text>
              {item.detail ? <Text style={type.small}>{item.detail}</Text> : null}
              {item.footer || null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: "row", gap: 4 },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.muted },
  timelineRow: { flexDirection: "row", gap: 12 },
  rail: { alignItems: "center", width: 28, flexShrink: 0 },
  line: { width: 2, flex: 1, minHeight: 12, marginVertical: 4, backgroundColor: colors.border },
  timelineBody: { flex: 1, minWidth: 0, paddingTop: 3, gap: 2 },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  dotText: { fontSize: 12, lineHeight: 17, fontWeight: "600", color: colors.mutedForeground },
});
