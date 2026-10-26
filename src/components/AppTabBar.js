// Bottom tab bar for every role: the active tab's icon sits in a tinted pill, filled and in the brand blue.
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius } from "../theme";

/** `icons[routeName]` = [filled, outline] Ionicons names. */
export default function AppTabBar({ state, descriptors, navigation, icons }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const { options } = descriptors[route.key];
        const label = options.tabBarLabel ?? options.title ?? route.name;
        const [filled, outline] = icons[route.name] || ["ellipse", "ellipse-outline"];
        const onPress = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };
        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            style={styles.tab}
          >
            <View style={[styles.pill, focused && styles.pillActive]}>
              <Ionicons name={focused ? filled : outline} size={21} color={focused ? colors.primaryDeep : colors.mutedForeground} />
            </View>
            <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1} ellipsizeMode="tail" adjustsFontSizeToFit minimumFontScale={0.75}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    paddingTop: 8,
    paddingHorizontal: 6,
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    shadowColor: "#0B1310",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  tab: { flex: 1, minWidth: 0, alignItems: "center", gap: 3, paddingHorizontal: 2 },
  pill: { width: 56, maxWidth: "100%", height: 30, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  pillActive: { backgroundColor: colors.primarySoft },
  label: { maxWidth: "100%", textAlign: "center", fontSize: 11, lineHeight: 14, fontWeight: "500", color: colors.mutedForeground },
  labelActive: { fontWeight: "600", color: colors.primaryDeep },
});
