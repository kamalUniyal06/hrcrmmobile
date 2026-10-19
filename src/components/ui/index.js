import { createContext, useContext, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, shadow, spacing, tones, type } from "../../theme";
import { initials } from "../../utils/records";

/* ── Layout ─────────────────────────────────────────────────────────────── */

/** Set by the navigator so screens under a native header do not add the status-bar inset twice. */
export const ScreenChrome = createContext({ headerShown: false });

export function Screen({ children, scroll = true, refreshing = false, onRefresh, padded = true, style, edges, contentStyle }) {
  const chrome = useContext(ScreenChrome);
  const safeEdges = edges || (chrome.headerShown ? [] : ["top"]);
  const inner = padded ? [styles.screenContent, contentStyle] : contentStyle;
  return (
    <SafeAreaView edges={safeEdges} style={[styles.screen, style]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={inner}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function PageHeader({ title, subtitle, eyebrow, right, dark = false }) {
  return (
    <View style={[styles.pageHeader, dark && styles.pageHeaderDark]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {eyebrow ? <Text style={[type.tiny, { color: dark ? colors.lime : colors.primary }]}>{eyebrow}</Text> : null}
        <Text style={[type.title, dark && { color: "#fff" }]} numberOfLines={2}>{title}</Text>
        {subtitle ? <Text style={[type.small, { marginTop: 4 }, dark && { color: "rgba(255,255,255,0.72)" }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style, onPress, tone }) {
  const toneStyle = tone ? { backgroundColor: tones[tone].bg, borderColor: "transparent" } : null;
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, toneStyle, pressed && { opacity: 0.85 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, toneStyle, style]}>{children}</View>;
}

export function SectionTitle({ title, hint, action, onAction, style }) {
  return (
    <View style={[styles.sectionTitle, style]}>
      <View style={{ flex: 1 }}>
        <Text style={type.heading}>{title}</Text>
        {hint ? <Text style={type.small}>{hint}</Text> : null}
      </View>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.link}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export const Divider = ({ style }) => <View style={[styles.divider, style]} />;

export function Row({ children, style, gap = spacing.sm, align = "center" }) {
  return <View style={[{ flexDirection: "row", alignItems: align, gap }, style]}>{children}</View>;
}

/* ── Controls ───────────────────────────────────────────────────────────── */

export function Button({ title, onPress, variant = "primary", loading = false, disabled = false, icon, style, small = false, full = false }) {
  const palette = {
    primary: { bg: colors.primary, fg: colors.primaryForeground, border: colors.primary },
    secondary: { bg: colors.primarySoft, fg: colors.primary, border: colors.primarySoft },
    outline: { bg: colors.card, fg: colors.foreground, border: colors.border },
    ghost: { bg: "transparent", fg: colors.primary, border: "transparent" },
    destructive: { bg: colors.destructive, fg: "#fff", border: colors.destructive },
    lime: { bg: colors.lime, fg: colors.foreground, border: colors.lime },
    dark: { bg: colors.panel, fg: "#fff", border: colors.panel },
  }[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        full && { alignSelf: "stretch" },
        { backgroundColor: palette.bg, borderColor: palette.border },
        pressed && { opacity: 0.8 },
        isDisabled && { opacity: 0.55 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={small ? 15 : 18} color={palette.fg} /> : null}
          <Text style={[styles.buttonText, small && { fontSize: 13 }, { color: palette.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, color = colors.foreground, size = 20, style, label }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityLabel={label} style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }, style]}>
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

export function Chip({ label, tone = "neutral", icon, style, small = false }) {
  const palette = tones[tone] || tones.neutral;
  return (
    <View style={[styles.chip, { backgroundColor: palette.bg }, small && { paddingVertical: 2, paddingHorizontal: 8 }, style]}>
      {icon ? <Ionicons name={icon} size={12} color={palette.fg} /> : null}
      <Text style={[styles.chipText, { color: palette.fg }, small && { fontSize: 11 }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function Field({ label, value, onChangeText, placeholder, multiline = false, keyboardType, error, hint, autoCapitalize = "sentences", secureTextEntry, editable = true, style }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
        editable={editable}
        style={[styles.input, multiline && styles.inputMultiline, !editable && { backgroundColor: colors.muted }, error && { borderColor: colors.destructive }]}
      />
      {error ? <Text style={[type.small, { color: colors.destructive }]}>{error}</Text> : hint ? <Text style={type.small}>{hint}</Text> : null}
    </View>
  );
}

/** Option picker rendered as a bottom sheet list. `options` are strings or { label, value }. */
export function SelectField({ label, value, onChange, options, placeholder = "Select", error, style }) {
  const [open, setOpen] = useState(false);
  const items = options.map((option) => (typeof option === "string" ? { label: option, value: option } : option));
  const selected = items.find((item) => item.value === value);
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <Pressable onPress={() => setOpen(true)} style={[styles.input, styles.selectInput, error && { borderColor: colors.destructive }]}>
        <Text style={[type.body, !selected && { color: colors.mutedForeground }]} numberOfLines={1}>{selected?.label || placeholder}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.mutedForeground} />
      </Pressable>
      {error ? <Text style={[type.small, { color: colors.destructive }]}>{error}</Text> : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title={label || placeholder}>
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.value)}
          style={{ maxHeight: 420 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                onChange(item.value);
                setOpen(false);
              }}
              style={({ pressed }) => [styles.sheetOption, pressed && { backgroundColor: colors.muted }]}
            >
              <Text style={[type.body, item.value === value && { color: colors.primary, fontWeight: "600" }]}>{item.label}</Text>
              {item.value === value ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
            </Pressable>
          )}
        />
      </Sheet>
    </View>
  );
}

export function Sheet({ visible, onClose, title, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={type.heading} numberOfLines={1}>{title}</Text>
          <IconButton icon="close" onPress={onClose} label="Close" />
        </View>
        {children}
      </View>
    </Modal>
  );
}

export function SegmentedControl({ options, value, onChange, style }) {
  return (
    <View style={[styles.segmented, style]}>
      {options.map((option) => {
        const item = typeof option === "string" ? { label: option, value: option } : option;
        const active = item.value === value;
        return (
          <Pressable key={String(item.value)} onPress={() => onChange(item.value)} style={[styles.segment, active && styles.segmentActive]}>
            <Text style={[styles.segmentText, active && { color: colors.foreground }]} numberOfLines={1}>
              {item.label}
              {item.count !== undefined ? <Text style={{ color: colors.mutedForeground }}> {item.count}</Text> : null}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── Data display ───────────────────────────────────────────────────────── */

export function ListRow({ title, subtitle, meta, right, icon, iconTone = "progress", onPress, avatar, style }) {
  const palette = tones[iconTone] || tones.progress;
  const content = (
    <>
      {avatar !== undefined ? <Avatar name={avatar} /> : icon ? (
        <View style={[styles.rowIcon, { backgroundColor: palette.bg }]}>
          <Ionicons name={icon} size={18} color={palette.fg} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={type.subheading} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={type.small} numberOfLines={2}>{subtitle}</Text> : null}
        {meta ? <Text style={[type.small, { marginTop: 2 }]} numberOfLines={1}>{meta}</Text> : null}
      </View>
      {right}
      {onPress && !right ? <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} /> : null}
    </>
  );
  if (onPress) {
    return <Pressable onPress={onPress} style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: colors.muted }, style]}>{content}</Pressable>;
  }
  return <View style={[styles.listRow, style]}>{content}</View>;
}

export function Avatar({ name, size = 40, uri }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ color: colors.lime, fontWeight: "700", fontSize: size * 0.38 }}>{initials(name)}</Text>
    </View>
  );
}

export function StatTile({ label, value, hint, tone = "progress", icon, onPress, style }) {
  const palette = tones[tone] || tones.progress;
  return (
    <Card onPress={onPress} style={[styles.statTile, style]}>
      <Row style={{ justifyContent: "space-between" }}>
        <Text style={type.small} numberOfLines={1}>{label}</Text>
        {icon ? <Ionicons name={icon} size={16} color={palette.fg} /> : null}
      </Row>
      <Text style={styles.statValue}>{value ?? "—"}</Text>
      {hint ? <Text style={[type.small, { fontSize: 12 }]} numberOfLines={1}>{hint}</Text> : null}
    </Card>
  );
}

export function KeyValue({ label, value, last = false }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <View style={[styles.keyValue, last && { borderBottomWidth: 0 }]}>
      <Text style={[type.small, { flex: 1 }]}>{label}</Text>
      <Text style={[type.body, { flex: 1.4, textAlign: "right" }]} selectable>{String(value)}</Text>
    </View>
  );
}

/* ── States ─────────────────────────────────────────────────────────────── */

export function LoadingState({ label = "Loading…", style }) {
  return (
    <View style={[styles.state, style]}>
      <ActivityIndicator color={colors.primary} />
      <Text style={type.small}>{label}</Text>
    </View>
  );
}

export function EmptyState({ icon = "file-tray-outline", title, message, action, onAction, style }) {
  return (
    <View style={[styles.state, styles.stateBox, style]}>
      <Ionicons name={icon} size={28} color={colors.mutedForeground} />
      <Text style={[type.subheading, { textAlign: "center" }]}>{title}</Text>
      {message ? <Text style={[type.small, { textAlign: "center" }]}>{message}</Text> : null}
      {action ? <Button title={action} onPress={onAction} variant="secondary" small style={{ marginTop: 6 }} /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry, style }) {
  return (
    <View style={[styles.state, styles.stateBox, { borderColor: colors.destructiveSoft }, style]}>
      <Ionicons name="alert-circle-outline" size={28} color={colors.destructive} />
      <Text style={[type.body, { textAlign: "center" }]}>{message || "Something went wrong."}</Text>
      {onRetry ? <Button title="Retry" onPress={onRetry} variant="outline" small icon="refresh" /> : null}
    </View>
  );
}

export function Notice({ tone = "info", icon, title, message, action, onAction, style }) {
  const palette = tones[tone] || tones.info;
  return (
    <View style={[styles.notice, { backgroundColor: palette.bg }, style]}>
      {icon ? <Ionicons name={icon} size={18} color={palette.fg} style={{ marginTop: 1 }} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <Text style={[type.subheading, { color: palette.fg }]}>{title}</Text> : null}
        {message ? <Text style={[type.small, { color: palette.fg }]}>{message}</Text> : null}
      </View>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={[styles.link, { color: palette.fg }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenContent: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  pageHeader: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  pageHeaderDark: { backgroundColor: colors.sidebar, padding: spacing.lg, borderRadius: radius.xl },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm, ...shadow.card },
  sectionTitle: { flexDirection: "row", alignItems: "flex-end", gap: spacing.md },
  link: { color: colors.primary, fontWeight: "600", fontSize: 13 },
  divider: { height: 1, backgroundColor: colors.border },
  button: { minHeight: 46, paddingHorizontal: 18, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, alignSelf: "flex-start" },
  buttonSmall: { minHeight: 36, paddingHorizontal: 12, borderRadius: radius.sm },
  buttonText: { fontSize: 15, fontWeight: "600" },
  iconButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill },
  chipText: { fontSize: 12, fontWeight: "600" },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: colors.foreground },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.card, fontSize: 15, color: colors.foreground },
  inputMultiline: { minHeight: 100, textAlignVertical: "top" },
  selectInput: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(11,19,16,0.45)" },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingBottom: 28, maxHeight: "85%" },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginTop: 10 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  sheetOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border },
  segmented: { flexDirection: "row", backgroundColor: colors.muted, borderRadius: radius.md, padding: 3 },
  segment: { flex: 1, paddingVertical: 8, borderRadius: radius.sm, alignItems: "center" },
  segmentActive: { backgroundColor: colors.card, ...shadow.card },
  segmentText: { fontSize: 13, fontWeight: "600", color: colors.mutedForeground },
  listRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 12, paddingHorizontal: spacing.md, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  avatar: { backgroundColor: colors.panel, alignItems: "center", justifyContent: "center" },
  statTile: { flex: 1, minWidth: 140, gap: 4, padding: spacing.md },
  statValue: { fontSize: 26, fontWeight: "600", color: colors.foreground, fontVariant: ["tabular-nums"] },
  keyValue: { flexDirection: "row", gap: spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  state: { alignItems: "center", justifyContent: "center", gap: 8, padding: spacing.xl },
  stateBox: { borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.card },
  notice: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, alignItems: "flex-start" },
});
