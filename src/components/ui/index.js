import { createContext, useContext, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, shadow, spacing, tones, type } from "../../theme";
import { initials } from "../../utils/records";

/* ── Layout ─────────────────────────────────────────────────────────────── */

/** Set by the navigator so screens under a native header do not add the status-bar inset twice. */
export const ScreenChrome = createContext({ headerShown: false });

export function Screen({ children, scroll = true, refreshing = false, onRefresh, padded = true, style, edges, contentStyle }) {
  const chrome = useContext(ScreenChrome);
  const insets = useSafeAreaInsets();
  const safeEdges = edges || (chrome.headerShown ? [] : ["top"]);
  // The last card or button stays clear of the phone's gesture / navigation bar.
  const inner = padded ? [styles.screenContent, { paddingBottom: spacing.xxl + insets.bottom }, contentStyle] : contentStyle;
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

/**
 * Page heading: optional topic `icon` in a `tone`-tinted tile, eyebrow, bold navy title and
 * a muted description. When a native header above already shows the screen title
 * (`showTitle` defaults to that), the title is not repeated in the page.
 */
export function PageHeader({ title, subtitle, eyebrow, right, dark = false, icon, tone = "progress", showTitle }) {
  const chrome = useContext(ScreenChrome);
  const titleInHeader = chrome.headerShown && !chrome.appHeader;
  const withTitle = showTitle ?? !titleInHeader;
  const palette = tones[tone] || tones.progress;
  return (
    <View style={[styles.pageHeader, dark && styles.pageHeaderDark]}>
      {icon ? (
        <View style={[styles.pageHeaderIcon, { backgroundColor: dark ? "rgba(255,255,255,0.12)" : palette.bg }]}>
          <Ionicons name={icon} size={22} color={dark ? "#FFFFFF" : palette.fg} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2, justifyContent: "center" }}>
        {eyebrow ? <Text style={[styles.pageHeaderEyebrow, { color: dark ? colors.lime : colors.primary }]} numberOfLines={1}>{eyebrow}</Text> : null}
        {withTitle && title ? <Text style={[styles.pageHeaderTitle, dark && { color: "#fff" }]} numberOfLines={2}>{title}</Text> : null}
        {subtitle ? <Text style={[type.small, dark && { color: "rgba(255,255,255,0.72)" }]}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.pageHeaderRight}>{right}</View> : null}
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
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.sectionTitleText} numberOfLines={2}>{title}</Text>
        {hint ? <Text style={type.small}>{hint}</Text> : null}
      </View>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8} style={({ pressed }) => [styles.actionPill, pressed && { opacity: 0.7 }]}>
          <Text style={styles.actionPillText} numberOfLines={1} ellipsizeMode="tail">{action}</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.primary} style={styles.noShrink} />
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

/** `icon` is an Ionicons name; `image` is a bundled picture (e.g. a brand logo) shown instead. */
export function Button({ title, onPress, variant = "primary", loading = false, disabled = false, icon, image, style, small = false, full = false }) {
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
          {image ? (
            <Image source={image} style={{ width: small ? 15 : 20, height: small ? 15 : 20, flexShrink: 0 }} resizeMode="contain" />
          ) : icon ? (
            <Ionicons name={icon} size={small ? 15 : 18} color={palette.fg} style={styles.noShrink} />
          ) : null}
          <Text style={[styles.buttonText, small && { fontSize: 13, lineHeight: 18 }, { color: palette.fg }]} numberOfLines={2}>{title}</Text>
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

/** `numberOfLines` defaults to 1 (status-style chips); pass 2+ (or 0 for no limit) for long values. */
export function Chip({ label, tone = "neutral", icon, style, small = false, numberOfLines = 1 }) {
  const palette = tones[tone] || tones.neutral;
  return (
    <View style={[styles.chip, { backgroundColor: palette.bg }, small && { paddingVertical: 2, paddingHorizontal: 8 }, style]}>
      {icon ? <Ionicons name={icon} size={12} color={palette.fg} style={styles.noShrink} /> : null}
      <Text style={[styles.chipText, { color: palette.fg }, small && { fontSize: 11, lineHeight: 15 }]} numberOfLines={numberOfLines} ellipsizeMode="tail">{label}</Text>
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

/**
 * Search box: icon, rounded field, clear button and the keyboard's "Search" key.
 * `onSubmit` runs on the Search key (for server-side searches); lists that filter as you type only need onChangeText.
 */
export function SearchField({ value, onChangeText, onSubmit, placeholder = "Search", autoFocus = false, keyboardType, style }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.search, focused && styles.searchFocused, style]}>
      <Ionicons name="search" size={18} color={focused ? colors.primary : colors.mutedForeground} style={{ flexShrink: 0 }} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={() => onSubmit?.(String(value ?? "").trim())}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        keyboardType={keyboardType}
        returnKeyType="search"
        clearButtonMode="never"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={placeholder}
        style={styles.searchInput}
      />
      {value ? (
        <Pressable
          onPress={() => {
            onChangeText("");
            onSubmit?.("");
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          style={styles.searchClear}
        >
          <Ionicons name="close" size={14} color={colors.card} />
        </Pressable>
      ) : null}
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
        <Text style={[type.body, styles.grow, !selected && { color: colors.mutedForeground }]} numberOfLines={2}>{selected?.label || placeholder}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.mutedForeground} style={styles.noShrink} />
      </Pressable>
      {error ? <Text style={[type.small, { color: colors.destructive }]}>{error}</Text> : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title={label || placeholder} scroll={false}>
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
              <Text style={[type.body, styles.grow, item.value === value && { color: colors.primary, fontWeight: "600" }]}>{item.label}</Text>
              {item.value === value ? <Ionicons name="checkmark" size={18} color={colors.primary} style={styles.noShrink} /> : null}
            </Pressable>
          )}
        />
      </Sheet>
    </View>
  );
}

/**
 * Bottom sheet capped at 85% of the screen. Content is wrapped in a ScrollView so long content
 * (or large font scales) scrolls instead of being clipped; pass `scroll={false}` when the
 * children bring their own ScrollView / FlatList.
 */
export function Sheet({ visible, onClose, title, children, scroll = true }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {/* Lifts the sheet above the keyboard, and keeps its last buttons clear of the phone's navigation bar. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(28, insets.bottom + 16) }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={[type.heading, styles.grow]} numberOfLines={2}>{title}</Text>
          <IconButton icon="close" onPress={onClose} label="Close" />
        </View>
        {scroll ? (
          <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : children}
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Up to four options share the width; more than that scroll horizontally at their natural width. */
const SEGMENT_FIT_MAX = 4;

export function SegmentedControl({ options, value, onChange, style }) {
  const scrolls = options.length > SEGMENT_FIT_MAX;
  const segments = options.map((option) => {
    const item = typeof option === "string" ? { label: option, value: option } : option;
    const active = item.value === value;
    return (
      // Label and count are separate texts: the label shrinks (then truncates), the count never does.
      <Pressable
        key={String(item.value)}
        onPress={() => onChange(item.value)}
        accessibilityState={{ selected: active }}
        style={[styles.segment, scrolls && styles.segmentScroll, active && styles.segmentActive]}
      >
        <Text
          style={[styles.segmentText, styles.segmentLabel, active && { color: colors.foreground }]}
          numberOfLines={1}
          ellipsizeMode="tail"
          adjustsFontSizeToFit={!scrolls}
          minimumFontScale={0.7}
        >
          {item.label}
        </Text>
        {item.count !== undefined ? <Text style={[styles.segmentText, styles.segmentCount]} numberOfLines={1}>{item.count}</Text> : null}
      </Pressable>
    );
  });
  if (scrolls) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.segmented, styles.segmentedScroll, style]} contentContainerStyle={styles.segmentedScrollContent}>
        {segments}
      </ScrollView>
    );
  }
  return <View style={[styles.segmented, style]}>{segments}</View>;
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
        <Text style={type.subheading} numberOfLines={2}>{title}</Text>
        {subtitle ? <Text style={type.small} numberOfLines={2}>{subtitle}</Text> : null}
        {meta ? <Text style={[type.small, { marginTop: 2 }]} numberOfLines={2} ellipsizeMode="tail">{meta}</Text> : null}
      </View>
      {right ? <View style={styles.listRowRight}>{right}</View> : null}
      {onPress && !right ? <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} style={styles.noShrink} /> : null}
    </>
  );
  if (onPress) {
    return <Pressable onPress={onPress} style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: colors.muted }, style]}>{content}</Pressable>;
  }
  return <View style={[styles.listRow, style]}>{content}</View>;
}

// Pastel initials, picked from the name so a person keeps their colour across screens (web attendance/offboarding lists).
const AVATAR_TONES = [
  { bg: "#E7F2EC", fg: "#09533D" },
  { bg: "#FDECEA", fg: "#C2410C" },
  { bg: "#EEF2FF", fg: "#4338CA" },
  { bg: "#FEF3C7", fg: "#B45309" },
  { bg: "#E0F2FE", fg: "#0369A1" },
  { bg: "#F0FBC9", fg: "#4D5E0A" },
];
const avatarTone = (name = "") => AVATAR_TONES[[...String(name)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % AVATAR_TONES.length];

export function Avatar({ name, size = 40, style }) {
  const tone = avatarTone(name);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: tone.bg }, style]}>
      <Text style={{ color: tone.fg, fontWeight: "600", fontSize: size * 0.36, lineHeight: size * 0.46 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{initials(name)}</Text>
    </View>
  );
}

/**
 * Web home stat card, stacked for phone width: tinted icon square (and a chevron when it opens
 * something) on top, then the value, label and hint, each on its own line so nothing is cut off.
 */
export function StatTile({ label, value, hint, tone = "progress", icon, onPress, style, loading = false }) {
  const palette = tones[tone] || tones.progress;
  return (
    <Card onPress={onPress} style={[styles.statTile, style]}>
      {icon || onPress ? (
        <View style={styles.statRow}>
          {icon ? (
            <View style={[styles.statIcon, { backgroundColor: palette.bg }]}>
              <Ionicons name={icon} size={18} color={palette.fg} />
            </View>
          ) : <View />}
          {onPress ? (
            <View style={styles.statChevron}>
              <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} />
            </View>
          ) : null}
        </View>
      ) : null}
      {loading ? (
        <Skeleton width="50%" height={26} radius={8} style={{ marginVertical: 3 }} />
      ) : (
        <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value ?? "—"}</Text>
      )}
      <Text style={styles.statLabel} numberOfLines={2}>{label}</Text>
      {hint ? <Text style={styles.statHint} numberOfLines={2}>{hint}</Text> : null}
    </Card>
  );
}

export function KeyValue({ label, value, last = false }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <View style={[styles.keyValue, last && { borderBottomWidth: 0 }]}>
      <Text style={[type.small, { flex: 1, minWidth: 0 }]}>{label}</Text>
      <Text style={[type.body, { flex: 1.4, minWidth: 0, textAlign: "right" }]} selectable>{String(value)}</Text>
    </View>
  );
}

/* ── States ─────────────────────────────────────────────────────────────── */

/* Shimmer: grey placeholder shapes with a soft light band sweeping across. Every placeholder
   shares one looping animation (started by the first, stopped by the last), so they move in
   step and cost a single native-driven timer. */
const shimmerProgress = new Animated.Value(0);
let shimmerUsers = 0;
let shimmerLoop = null;
const SHIMMER_BAND = 90;

function useShimmer() {
  useEffect(() => {
    shimmerUsers += 1;
    if (!shimmerLoop) {
      shimmerProgress.setValue(0);
      shimmerLoop = Animated.loop(
        Animated.timing(shimmerProgress, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      );
      shimmerLoop.start();
    }
    return () => {
      shimmerUsers -= 1;
      if (!shimmerUsers && shimmerLoop) {
        shimmerLoop.stop();
        shimmerLoop = null;
      }
    };
  }, []);
  return shimmerProgress;
}

/** One shimmering placeholder block; `radius` rounds it (half the height for a circle). */
export function Skeleton({ width = "100%", height = 12, radius: corner = 6, style }) {
  const progress = useShimmer();
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-SHIMMER_BAND * 1.5, Dimensions.get("window").width] });
  return (
    <View style={[styles.skeleton, { width, height, borderRadius: corner }, style]}>
      <Animated.View style={[styles.shimmerBand, { transform: [{ translateX }, { skewX: "-18deg" }] }]} />
    </View>
  );
}

/** A few lines of placeholder text; the last line is shorter, like a real paragraph. */
export function SkeletonText({ lines = 2, lastWidth = "55%", height = 11, style }) {
  return (
    <View style={[{ gap: 8 }, style]}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} height={height} width={index === lines - 1 && lines > 1 ? lastWidth : "100%"} />
      ))}
    </View>
  );
}

/** Placeholder for a list row: avatar or icon tile, a title line and a detail line. */
export function SkeletonRow({ avatar = true, style }) {
  return (
    <View style={[styles.skeletonRow, style]}>
      {avatar ? <Skeleton width={40} height={40} radius={20} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
        <Skeleton height={13} width="62%" />
        <Skeleton height={10} width="40%" />
      </View>
      <Skeleton width={54} height={20} radius={radius.pill} />
    </View>
  );
}

/** A short stack of placeholder rows, for loading sections inside an existing card. */
export function SkeletonRows({ count = 2, avatar = true, label = "Loading…", style }) {
  return (
    <View style={style} accessibilityRole="progressbar" accessibilityLabel={label}>
      {Array.from({ length: count }, (_, index) => <SkeletonRow key={index} avatar={avatar} style={index > 0 && styles.skeletonDivider} />)}
    </View>
  );
}

/** Placeholder card: a heading line and a few text lines. */
export function SkeletonCard({ lines = 3, style }) {
  return (
    <View style={[styles.card, { gap: 12 }, style]}>
      <Row gap={10}>
        <Skeleton width={36} height={36} radius={radius.md} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton height={13} width="50%" />
          <Skeleton height={10} width="30%" />
        </View>
      </Row>
      <SkeletonText lines={lines} />
    </View>
  );
}

/**
 * Loading placeholder used across the app: shimmering rows in a card (`variant="list"`, default),
 * stacked placeholder cards (`"cards"`), or bare text lines (`"lines"`). `label` is announced
 * to screen readers.
 */
export function LoadingState({ label = "Loading…", rows = 3, variant = "list", style }) {
  return (
    <View style={[{ gap: spacing.md }, style]} accessibilityRole="progressbar" accessibilityLabel={label}>
      {variant === "cards" ? (
        Array.from({ length: rows }, (_, index) => <SkeletonCard key={index} lines={2} />)
      ) : variant === "lines" ? (
        <SkeletonText lines={rows} />
      ) : (
        <View style={[styles.card, styles.skeletonList]}>
          {Array.from({ length: rows }, (_, index) => <SkeletonRow key={index} style={index > 0 && styles.skeletonDivider} />)}
        </View>
      )}
    </View>
  );
}

export function EmptyState({ icon = "file-tray-outline", title, message, action, onAction, style }) {
  return (
    <View style={[styles.state, styles.stateBox, style]}>
      <Ionicons name={icon} size={28} color={colors.mutedForeground} />
      <Text style={[type.subheading, { textAlign: "center" }]}>{title}</Text>
      {message ? <Text style={[type.small, { textAlign: "center" }]}>{message}</Text> : null}
      {action ? <Button title={action} onPress={onAction} variant="secondary" small style={{ marginTop: 6, alignSelf: "center" }} /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry, style }) {
  return (
    <View style={[styles.state, styles.stateBox, { borderColor: colors.destructiveSoft }, style]}>
      <Ionicons name="alert-circle-outline" size={28} color={colors.destructive} />
      <Text style={[type.body, { textAlign: "center" }]}>{message || "Something went wrong."}</Text>
      {onRetry ? <Button title="Retry" onPress={onRetry} variant="outline" small icon="refresh" style={{ alignSelf: "center" }} /> : null}
    </View>
  );
}

export function Notice({ tone = "info", icon, title, message, action, onAction, style }) {
  const palette = tones[tone] || tones.info;
  return (
    <View style={[styles.notice, { backgroundColor: palette.bg }, style]}>
      {icon ? <Ionicons name={icon} size={18} color={palette.fg} style={{ marginTop: 1, flexShrink: 0 }} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        {title ? <Text style={[type.subheading, { color: palette.fg }]}>{title}</Text> : null}
        {message ? <Text style={[type.small, { color: palette.fg }]}>{message}</Text> : null}
      </View>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button" style={styles.noticeAction}>
          <Text style={[styles.link, { color: palette.fg, textAlign: "right" }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenContent: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  grow: { flex: 1, minWidth: 0 },
  noShrink: { flexShrink: 0 },
  pageHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  pageHeaderRight: { flexShrink: 0, maxWidth: "50%" },
  pageHeaderIcon: { flexShrink: 0, width: 48, height: 48, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  pageHeaderEyebrow: { ...type.tiny, fontSize: 10, letterSpacing: 0.8 },
  pageHeaderTitle: { fontSize: 24, lineHeight: 30, fontWeight: "600", letterSpacing: -0.4, color: colors.navy },
  pageHeaderDark: { backgroundColor: colors.sidebar, padding: spacing.lg, borderRadius: radius.xl },
  card: { backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm, ...shadow.card },
  sectionTitle: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  sectionTitleText: { fontSize: 18, lineHeight: 24, fontWeight: "600", color: colors.foreground, letterSpacing: -0.2 },
  actionPill: { flexDirection: "row", alignItems: "center", gap: 2, flexShrink: 0, maxWidth: "45%", paddingVertical: 6, paddingLeft: 12, paddingRight: 8, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  actionPillText: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.primary, flexShrink: 1 },
  link: { color: colors.primary, fontWeight: "600", fontSize: 13, lineHeight: 18 },
  divider: { height: 1, backgroundColor: colors.border },
  button: { minHeight: 46, paddingHorizontal: 18, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, alignSelf: "flex-start", minWidth: 0, maxWidth: "100%" },
  buttonSmall: { minHeight: 36, paddingHorizontal: 12, borderRadius: radius.sm },
  buttonText: { fontSize: 15, lineHeight: 20, fontWeight: "600", flexShrink: 1, textAlign: "center" },
  iconButton: { flexShrink: 0, width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  // Chips sit in rows next to titles: centred vertically, and allowed to shrink (text
  // truncates) so they never push a title out of the row. A chip placed on its own in a
  // column passes style={{ alignSelf: "flex-start" }}.
  chip: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "center", flexShrink: 1, maxWidth: "100%", paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: "600", flexShrink: 1 },
  fieldLabel: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.foreground },
  search: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, ...shadow.card },
  searchFocused: { borderColor: colors.primary, borderWidth: 1.5 },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 10, fontSize: 15, lineHeight: 20, color: colors.foreground },
  searchClear: { flexShrink: 0, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.mutedForeground },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.card, fontSize: 15, color: colors.foreground },
  inputMultiline: { minHeight: 100, textAlignVertical: "top" },
  selectInput: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(11,19,16,0.45)" },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingBottom: 28, maxHeight: "85%" },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginTop: 10 },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  sheetOption: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border },
  segmented: { flexDirection: "row", backgroundColor: colors.muted, borderRadius: radius.md, padding: 3 },
  segment: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 4, borderRadius: radius.sm },
  segmentActive: { backgroundColor: colors.card, ...shadow.card },
  segmentText: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.mutedForeground },
  segmentLabel: { flexShrink: 1, minWidth: 0, textAlign: "center" },
  segmentScroll: { flex: 0, paddingHorizontal: 12 },
  segmentedScroll: { flexGrow: 0 },
  segmentedScrollContent: { flexGrow: 1 },
  segmentCount: { flexShrink: 0, fontVariant: ["tabular-nums"] },
  listRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 12, paddingHorizontal: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  listRowRight: { flexShrink: 0, maxWidth: "45%", alignItems: "flex-end" },
  rowIcon: { flexShrink: 0, width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  avatar: { flexShrink: 0, alignItems: "center", justifyContent: "center" },
  statTile: { flex: 1, minWidth: 140, padding: spacing.md, gap: 2 },
  statRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  statChevron: { flexShrink: 0, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.muted },
  statIcon: { flexShrink: 0, width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  statLabel: { fontSize: 13, lineHeight: 17, fontWeight: "600", color: colors.foreground },
  statHint: { fontSize: 11, lineHeight: 15, color: colors.mutedForeground },
  statValue: { fontSize: 22, lineHeight: 28, fontWeight: "600", color: colors.foreground, fontVariant: ["tabular-nums"] },
  keyValue: { flexDirection: "row", gap: spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  state: { alignItems: "center", justifyContent: "center", gap: 8, padding: spacing.xl },
  skeleton: { overflow: "hidden", backgroundColor: "#E7ECE5" },
  shimmerBand: { position: "absolute", top: -20, bottom: -20, width: SHIMMER_BAND, backgroundColor: "rgba(255,255,255,0.6)" },
  skeletonList: { paddingVertical: 4, gap: 0 },
  skeletonRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  skeletonDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  stateBox: { borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.card },
  notice: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, alignItems: "flex-start" },
  noticeAction: { flexShrink: 0, maxWidth: "40%" },
});
