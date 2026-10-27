// Building blocks shared by the admin home cards (web: components/home/InsightCard.jsx —
// InsightCard header, MiniMetric, InsightEmpty, InsightError).
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, tones, type } from "../../theme";
import { Button, Skeleton } from "../ui";

/** Card title with an optional topic `icon` (tinted by `tone`) and a "View all"-style link. */
export function CardHead({ title, action, onAction, icon, tone = "progress" }) {
  return (
    <View style={styles.headRow}>
      {icon ? <IconSquare icon={icon} tone={tone} size={38} /> : null}
      <Text style={[styles.headTitle, { flex: 1, minWidth: 0 }]} numberOfLines={2}>{title}</Text>
      {action ? <HeadLink label={action} onPress={onAction} /> : null}
    </View>
  );
}

/** Tinted icon square, title with an optional count badge, subtitle and a "View all" link. */
export function InsightHead({ icon, tone = "progress", title, subtitle, badge, onViewAll }) {
  const palette = tones[tone] || tones.progress;
  return (
    <View style={styles.headRow}>
      <IconSquare icon={icon} tone={tone} size={42} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.titleRow}>
          <Text style={[styles.headTitle, { flexShrink: 1, minWidth: 0 }]} numberOfLines={2}>{title}</Text>
          {badge ? (
            <View style={[styles.badge, { backgroundColor: palette.bg }]}>
              <Text style={[styles.badgeText, { color: palette.fg }]} numberOfLines={1}>{badge}</Text>
            </View>
          ) : null}
        </View>
        {subtitle ? <Text style={type.small}>{subtitle}</Text> : null}
      </View>
      {onViewAll ? <HeadLink label="View all" onPress={onViewAll} /> : null}
    </View>
  );
}

function HeadLink({ label, onPress }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" style={styles.link}>
      <Text style={styles.linkText} numberOfLines={1}>{label}</Text>
      <Ionicons name="chevron-forward" size={14} color={colors.primary} style={{ flexShrink: 0 }} />
    </Pressable>
  );
}

export function IconSquare({ icon, tone = "progress", size = 36 }) {
  const palette = tones[tone] || tones.progress;
  return (
    <View style={[styles.iconSquare, { width: size, height: size, backgroundColor: palette.bg }]}>
      <Ionicons name={icon} size={Math.round(size * 0.45)} color={palette.fg} />
    </View>
  );
}

/** Small bordered count box; `dot` is the accent colour. */
export function MiniCount({ dot, label, value, onPress, loading = false }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.mini, pressed && { opacity: 0.8 }]}>
      <View style={styles.miniTop}>
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <Text style={styles.miniLabel} numberOfLines={2}>{label}</Text>
      </View>
      {loading ? (
        <Skeleton width="45%" height={22} style={{ marginTop: 4 }} />
      ) : (
        <Text style={styles.miniValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
      )}
    </Pressable>
  );
}

export const SectionLabel = ({ children, style }) => <Text style={[type.tiny, style]}>{children}</Text>;

/** Dashed one-liner for empty lists and loading text. */
export const EmptyLine = ({ children }) => (
  <View style={styles.emptyLine}>
    <Text style={[type.small, { textAlign: "center" }]}>{children}</Text>
  </View>
);

export function InlineError({ message, onRetry }) {
  return (
    <View style={styles.error}>
      <Ionicons name="alert-circle-outline" size={18} color={colors.destructive} style={{ flexShrink: 0 }} />
      <Text style={[type.small, { flex: 1, minWidth: 0, color: colors.destructive }]}>{message}</Text>
      {onRetry ? <Button title="Retry" icon="refresh" variant="outline" small onPress={onRetry} style={{ flexShrink: 0 }} /> : null}
    </View>
  );
}

/** Thin horizontal bar filled to `percent`. */
export function ProgressBar({ percent, color = colors.primary, height = 6, style }) {
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }, style]}>
      <View style={{ width: `${Math.max(0, Math.min(100, percent))}%`, height, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

export const homeStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  rowTitle: { ...type.subheading },
  rowSub: { fontSize: 12, lineHeight: 16, color: colors.mutedForeground },
  counts: { flexDirection: "row", gap: 8 },
});

const styles = StyleSheet.create({
  headRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  headTitle: { ...type.heading, color: colors.navy },
  titleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 },
  link: { flexDirection: "row", alignItems: "center", gap: 2, flexShrink: 0, maxWidth: "40%" },
  linkText: { flexShrink: 1, fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.primary },
  badge: { alignSelf: "flex-start", maxWidth: "100%", paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  badgeText: { fontSize: 12, lineHeight: 16, fontWeight: "600" },
  iconSquare: { flexShrink: 0, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  mini: { flex: 1, minWidth: 0, gap: 6, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  miniTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { flexShrink: 0, width: 7, height: 7, borderRadius: 4 },
  miniLabel: { flexShrink: 1, minWidth: 0, fontSize: 12, lineHeight: 16, color: colors.mutedForeground },
  miniValue: { fontSize: 20, lineHeight: 26, fontWeight: "600", color: colors.navy, fontVariant: ["tabular-nums"] },
  emptyLine: { paddingVertical: 14, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border },
  error: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: colors.destructiveSoft },
  track: { flexDirection: "row", overflow: "hidden", backgroundColor: colors.muted },
});
