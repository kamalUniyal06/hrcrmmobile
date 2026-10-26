import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius } from "../theme";
import { openDrawer } from "../store/drawerStore";

/** Opens the admin side menu. `boxed` draws it as a card button for in-page headers. */
export default function MenuButton({ boxed = false, style }) {
  return (
    <Pressable
      onPress={openDrawer}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Open menu"
      style={({ pressed }) => [styles.button, boxed && styles.boxed, pressed && { opacity: 0.7 }, style]}
    >
      <Ionicons name="menu" size={22} color={colors.navy} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { flexShrink: 0, width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.md },
  boxed: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
});
