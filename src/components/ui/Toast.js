import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, shadow } from "../../theme";
import { useToastStore } from "../../store/toastStore";

const palette = {
  success: { bg: colors.panel, fg: colors.lime, icon: "checkmark-circle" },
  error: { bg: colors.destructive, fg: "#fff", icon: "alert-circle" },
  info: { bg: colors.panel, fg: "#fff", icon: "information-circle" },
};

export default function ToastHost() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);
  const insets = useSafeAreaInsets();
  if (!toasts.length) return null;
  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 8 }]}>
      {toasts.map((toast) => {
        const tone = palette[toast.tone] || palette.info;
        return (
          <Pressable key={toast.id} onPress={() => dismiss(toast.id)} style={[styles.toast, { backgroundColor: tone.bg }]}>
            <Ionicons name={tone.icon} size={18} color={tone.fg} style={{ flexShrink: 0 }} />
            <Text style={[styles.text, { color: tone.fg === colors.lime ? "#fff" : tone.fg }]}>{toast.message}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: 16, right: 16, gap: 8, zIndex: 100 },
  toast: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: radius.md, ...shadow.card },
  text: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 19, fontWeight: "500" },
});
