import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, shadow } from "../../theme";
import { useToastStore } from "../../store/toastStore";

const palette = {
  success: { bg: colors.panel, fg: "#fff", accent: colors.lime, icon: "checkmark-circle" },
  error: { bg: colors.destructive, fg: "#fff", accent: "#fff", icon: "alert-circle" },
  info: { bg: colors.panel, fg: "#fff", accent: "#fff", icon: "information-circle" },
  // Confirm toasts are light cards so their buttons read clearly.
  confirm: { bg: colors.card, fg: colors.foreground, accent: colors.destructive, icon: "help-circle" },
};

export default function ToastHost() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  if (!toasts.length) return null;
  // Plain toasts slide in at the top. Centred ones (the Log out confirm and its goodbye) sit in
  // the exact middle of the window over a dim backdrop; tapping the backdrop closes them.
  const notices = toasts.filter((toast) => !toast.centered && !toast.actions?.length);
  const center = toasts.find((toast) => toast.centered || toast.actions?.length);
  return (
    <>
      {center ? (
        <View style={[styles.centerLayer, { width, height }]}>
          {/* The screen behind is lightly dimmed so the card stands out. */}
          <Pressable style={styles.backdrop} onPress={() => dismiss(center.id)} accessibilityLabel="Close" />
          <View style={styles.centerCard}>
            <ToastItem key={center.id} toast={center} centered />
          </View>
        </View>
      ) : null}
      {notices.length ? (
        <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 8 }]}>
          {notices.map((toast) => <ToastItem key={toast.id} toast={toast} />)}
        </View>
      ) : null}
    </>
  );
}

/** One toast: slides down (or pops in, when centred) and fades in; tap a plain toast to dismiss it. */
function ToastItem({ toast, centered = false }) {
  const dismiss = useToastStore((state) => state.dismiss);
  const enter = useRef(new Animated.Value(0)).current;
  const tone = palette[toast.tone] || palette.info;
  const isConfirm = Boolean(toast.actions?.length);

  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [enter]);

  const motion = {
    opacity: enter,
    transform: [
      { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [centered ? 12 : -16, 0] }) },
      { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [centered ? 0.92 : 0.97, 1] }) },
    ],
  };

  return (
    <Animated.View style={motion}>
      <Pressable
        onPress={isConfirm ? undefined : () => dismiss(toast.id)}
        accessibilityRole={isConfirm ? "alert" : "button"}
        accessibilityLiveRegion="polite"
        style={[styles.toast, { backgroundColor: tone.bg }, isConfirm && styles.confirm]}
      >
        <View style={styles.row}>
          <View style={[styles.iconWrap, isConfirm && { backgroundColor: colors.destructiveSoft }]}>
            <Ionicons name={toast.icon || tone.icon} size={isConfirm ? 20 : 18} color={tone.accent} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            {toast.title ? <Text style={[styles.title, { color: tone.fg }]}>{toast.title}</Text> : null}
            {toast.message ? <Text style={[isConfirm ? styles.message : styles.text, { color: isConfirm ? colors.mutedForeground : tone.fg }]}>{toast.message}</Text> : null}
          </View>
        </View>
        {isConfirm ? (
          <View style={styles.actions}>
            {toast.actions.map((action) => (
              <Pressable
                key={action.label}
                onPress={action.onPress}
                accessibilityRole="button"
                style={({ pressed }) => [styles.action, styles[`action_${action.tone}`] || styles.action_plain, pressed && { opacity: 0.8 }]}
              >
                <Text style={[styles.actionText, action.tone !== "plain" && { color: "#fff" }]}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: 16, right: 16, gap: 8, zIndex: 100, elevation: 100 },
  centerLayer: { position: "absolute", top: 0, left: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, zIndex: 101, elevation: 101 },
  // A light dim over the screen behind a centred toast.
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(11,19,16,0.4)" },
  centerCard: { width: "100%", maxWidth: 420 },
  toast: { gap: 12, padding: 14, borderRadius: radius.lg, ...shadow.card, shadowOpacity: 0.18, shadowRadius: 18, elevation: 8 },
  confirm: { borderWidth: 1, borderColor: colors.border, padding: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: { flexShrink: 0, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  title: { fontSize: 15, lineHeight: 20, fontWeight: "700" },
  text: { fontSize: 14, lineHeight: 19, fontWeight: "500" },
  message: { fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
  action: { minWidth: 96, alignItems: "center", paddingVertical: 10, paddingHorizontal: 16, borderRadius: radius.pill },
  action_plain: { backgroundColor: colors.muted },
  action_primary: { backgroundColor: colors.primary },
  action_danger: { backgroundColor: colors.destructive },
  actionText: { fontSize: 14, lineHeight: 18, fontWeight: "600", color: colors.foreground },
});
