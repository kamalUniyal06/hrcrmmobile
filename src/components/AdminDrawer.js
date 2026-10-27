// Admin side menu: the web sidebar's groups, icons and counts as a left drawer.
// Swipe right from the left edge to open it, swipe left (or tap outside) to close it.
// Web: src/components/Sidebar.jsx (mobile drawer mode) + the profile panel.
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, BackHandler, Image, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { CommonActions } from "@react-navigation/native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius } from "../theme";
import { Skeleton } from "./ui";
import { fetchSidebar, getSidebarStats } from "../api/sidebar.api";
import { buildMenuGroups, FALLBACK_GROUPS, isTargetActive } from "../navigation/adminMenu";
import { focusedRoute, navigationRef } from "../navigation/navigationRef";
import { closeDrawer, useDrawerStore } from "../store/drawerStore";
import { selectEmail, useAuthStore } from "../store/authStore";
import { initials } from "../utils/records";
import { confirmLogout } from "../utils/confirmLogout";

const LOGO = require("../../assets/hrcrm-icon.png");
const HOME = { id: "home", name: "Home", icon: "home-outline", target: { tab: "Home" } };
// Wider than Android's system back-gesture strip, so the part beyond it still opens the menu.
const EDGE_WIDTH = 32;
// Bands fade the panel from the web sidebar's ink (#0B1310) into its deep green, top to bottom.
const GRADIENT_BANDS = Array.from({ length: 16 }, (_, index) => ((index + 1) / 16) * 0.9);

export default function AdminDrawer() {
  const open = useDrawerStore((state) => state.open);
  const swipeEnabled = useDrawerStore((state) => state.swipeEnabled);
  const setOpen = useDrawerStore((state) => state.setOpen);
  const email = useAuthStore(selectEmail);
  const signOut = useAuthStore((state) => state.signOut);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const panelWidth = Math.min(Math.round(width * 0.84), 340);
  // translateX of the panel: -panelWidth is closed, 0 is fully open.
  const position = useRef(new Animated.Value(-panelWidth)).current;
  const [visible, setVisible] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [current, setCurrent] = useState({ names: [], params: {} });

  const layout = useQuery({ queryKey: ["sidebar", "layout", email], queryFn: fetchSidebar, enabled: Boolean(email), staleTime: 5 * 60 * 1000 });
  const liveGroups = useMemo(() => buildMenuGroups(layout.data || []), [layout.data]);
  const usingFallback = layout.isError || (layout.isSuccess && liveGroups.length === 0);
  const groups = usingFallback ? FALLBACK_GROUPS : liveGroups;

  // Only ask for counts on items that show one.
  const countQueries = useMemo(() => groups.flatMap((group) => group.items.filter((item) => item.countKey).map((item) => item.countQuery)), [groups]);
  const counts = useQuery({
    queryKey: ["sidebar", "stats", email, countQueries],
    queryFn: () => getSidebarStats({ email, queries: countQueries }),
    enabled: visible && countQueries.length > 0,
    staleTime: 60 * 1000,
  });

  const settle = (toOpen, velocity = 0) =>
    Animated.spring(position, { toValue: toOpen ? 0 : -panelWidth, velocity, overshootClamping: true, speed: 18, bounciness: 0, useNativeDriver: true }).start(({ finished }) => {
      if (finished && !toOpen) setVisible(false);
    });

  useEffect(() => {
    if (open) {
      setCurrent(focusedRoute());
      setVisible(true);
    }
    settle(open);
    // settle only reads stable refs and the panel width.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, panelWidth]);

  useEffect(() => {
    if (!open) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      closeDrawer();
      return true;
    });
    return () => subscription.remove();
  }, [open]);

  const clamp = (value) => Math.max(-panelWidth, Math.min(0, value));
  const finish = (dx, vx, fromOpen) => {
    const opening = fromOpen ? !(dx < -panelWidth / 3 || vx < -0.5) : dx > panelWidth / 3 || vx > 0.5;
    if (opening === open) settle(opening, vx);
    else setOpen(opening);
  };

  // Swipe right from the left edge: the panel follows the finger.
  const edgePan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dx > 6 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderGrant: () => {
          setCurrent(focusedRoute());
          setVisible(true);
        },
        onPanResponderMove: (_, g) => position.setValue(clamp(-panelWidth + g.dx)),
        onPanResponderRelease: (_, g) => finish(g.dx, g.vx, false),
        onPanResponderTerminate: () => finish(0, 0, false),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panelWidth, open],
  );
  // Swipe left on the open panel or backdrop to close it.
  const panelPan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dx < -6 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: (_, g) => position.setValue(clamp(g.dx)),
        onPanResponderRelease: (_, g) => finish(g.dx, g.vx, true),
        onPanResponderTerminate: () => finish(0, 0, true),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panelWidth, open],
  );

  const go = (target) => {
    closeDrawer();
    if (!navigationRef.isReady()) return;
    if (target.tab) {
      navigationRef.navigate("AdminTabs", { screen: target.tab, params: target.params });
      return;
    }
    // A menu page is a top-level destination: it opens straight above the tabs (keeping the tab
    // the user was on) and is marked `fromMenu`, so its header shows the menu button. Pages
    // opened from a card or button are pushed normally and get a back arrow instead.
    const tabs = navigationRef.getRootState()?.routes?.find((route) => route.name === "AdminTabs");
    navigationRef.dispatch(
      CommonActions.reset({
        index: 1,
        routes: [tabs || { name: "AdminTabs" }, { name: target.screen, params: { ...target.params, fromMenu: true } }],
      }),
    );
  };

  // A confirm toast instead of a system pop-up; the menu closes first so the toast is in view.
  const confirmSignOut = () => {
    closeDrawer();
    confirmLogout(signOut);
  };

  const renderItem = (item) => {
    const active = isTargetActive(item.target, current.names, current.params);
    const count = item.countKey ? counts.data?.stats?.[item.countKey]?.count : undefined;
    return (
      <Pressable
        key={item.id}
        onPress={() => go(item.target)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={({ pressed }) => [styles.item, active && styles.itemActive, pressed && !active && styles.itemPressed]}
      >
        <View style={[styles.itemIcon, active && styles.itemIconActive]}>
          <Ionicons name={item.icon} size={17} color={active ? colors.lime : "rgba(255,255,255,0.88)"} />
        </View>
        <Text style={[styles.itemText, active && styles.itemTextActive]} numberOfLines={2}>{item.name}</Text>
        {item.countKey ? (
          <View style={[styles.count, active && { backgroundColor: "rgba(11,19,16,0.55)" }]}>
            {counts.isPending && counts.fetchStatus !== "idle" ? (
              <Skeleton width={16} height={10} radius={5} style={styles.skeleton} />
            ) : (
              <Text style={[styles.countText, active && { color: "#FFFFFF" }]} numberOfLines={1}>{count ?? 0}</Text>
            )}
          </View>
        ) : null}
      </Pressable>
    );
  };

  if (!visible) {
    // The strip stops short of the header (menu button) and the tab bar so their taps still land.
    return swipeEnabled ? <View style={[styles.edge, { width: EDGE_WIDTH, top: insets.top + 64, bottom: insets.bottom + 72 }]} {...edgePan.panHandlers} /> : null;
  }

  return (
    <View style={StyleSheet.absoluteFill} {...panelPan.panHandlers}>
      <Animated.View style={[styles.backdrop, { opacity: position.interpolate({ inputRange: [-panelWidth, 0], outputRange: [0, 1], extrapolate: "clamp" }) }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} accessibilityLabel="Close menu" />
      </Animated.View>
      <Animated.View accessibilityViewIsModal style={[styles.panel, { width: panelWidth, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 10, transform: [{ translateX: position }] }]}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {GRADIENT_BANDS.map((alpha, index) => (
            <View key={index} style={{ flex: 1, backgroundColor: `rgba(11,61,44,${alpha})` }} />
          ))}
        </View>

        <View style={styles.brand}>
          <Pressable onPress={() => go(HOME.target)} style={styles.brandMain} accessibilityLabel="Go to home">
            <Image source={LOGO} style={styles.logo} resizeMode="contain" />
            <Text style={styles.brandName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>HRCRM</Text>
          </Pressable>
          <Pressable onPress={closeDrawer} hitSlop={8} accessibilityLabel="Close menu" style={styles.close}>
            <Ionicons name="chevron-back" size={18} color={colors.primary} />
          </Pressable>
        </View>

        <View style={styles.homeWrap}>{renderItem(HOME)}</View>

        <ScrollView style={styles.menu} contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
          {layout.isPending && email ? (
            <MenuSkeleton />
          ) : (
            <>
              {usingFallback ? (
                <Pressable onPress={() => layout.refetch()} style={styles.notice}>
                  <Ionicons name="cloud-offline-outline" size={14} color="rgba(255,255,255,0.75)" style={{ flexShrink: 0 }} />
                  <Text style={styles.noticeText}>Showing the standard menu. Tap to retry.</Text>
                </Pressable>
              ) : null}
              {groups.map((group) => {
                const isCollapsed = collapsed[group.id];
                return (
                  <View key={group.id} style={styles.group}>
                    <Pressable
                      onPress={() => setCollapsed((prev) => ({ ...prev, [group.id]: !prev[group.id] }))}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: !isCollapsed }}
                      style={styles.groupHeader}
                    >
                      <View style={styles.groupAccent} />
                      <Text style={styles.groupTitle} numberOfLines={2}>{group.title}</Text>
                      <Ionicons name={isCollapsed ? "chevron-forward" : "chevron-down"} size={15} color="rgba(255,255,255,0.8)" style={styles.noShrink} />
                    </Pressable>
                    {isCollapsed ? null : <View style={{ gap: 2 }}>{group.items.map(renderItem)}</View>}
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable onPress={() => go({ screen: "Account" })} style={({ pressed }) => [styles.profile, pressed && styles.itemPressed]} accessibilityLabel="Open profile">
            <View style={styles.avatar}>
              <Text style={styles.avatarText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{initials(email.split("@")[0] || "?")}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.profileName} numberOfLines={1} ellipsizeMode="tail">{email.split("@")[0] || "Profile"}</Text>
              <Text style={styles.profileRole} numberOfLines={1} ellipsizeMode="middle">{email || "Admin"}</Text>
            </View>
          </Pressable>
          <Pressable onPress={confirmSignOut} hitSlop={6} accessibilityLabel="Log out" style={({ pressed }) => [styles.logout, pressed && { opacity: 0.7 }]}>
            <Ionicons name="log-out-outline" size={18} color="#FCA5A5" />
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

function MenuSkeleton() {
  return (
    <View style={{ gap: 18, paddingTop: 6 }} accessibilityLabel="Loading menu">
      {[0, 1, 2].map((group) => (
        <View key={group} style={{ gap: 10 }}>
          <Skeleton width={110} height={10} style={styles.skeleton} />
          {[0, 1, 2].map((item) => (
            <View key={item} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 10 }}>
              <Skeleton width={28} height={28} radius={8} style={styles.skeleton} />
              <Skeleton height={12} style={[styles.skeleton, { flex: 1, width: undefined }]} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  edge: { position: "absolute", left: 0 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(2,10,6,0.55)" },
  panel: { position: "absolute", top: 0, bottom: 0, left: 0, backgroundColor: colors.sidebar, borderTopRightRadius: radius.xl, borderBottomRightRadius: radius.xl, overflow: "hidden", paddingHorizontal: 12, elevation: 24, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 24 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingHorizontal: 12, borderRadius: radius.lg, backgroundColor: "#FFFFFF" },
  brandMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  logo: { flexShrink: 0, width: 32, height: 32, borderRadius: 8 },
  brandName: { fontSize: 19, lineHeight: 24, fontWeight: "600", color: colors.primary, letterSpacing: -0.2 },
  close: { flexShrink: 0, width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.muted },
  homeWrap: { marginTop: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.12)" },
  menu: { flex: 1, marginTop: 8 },
  notice: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8, padding: 8, borderRadius: radius.sm, backgroundColor: "rgba(255,255,255,0.08)" },
  noticeText: { flex: 1, minWidth: 0, fontSize: 11, lineHeight: 15, color: "rgba(255,255,255,0.75)" },
  group: { marginBottom: 6 },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingTop: 14, paddingBottom: 8 },
  groupAccent: { flexShrink: 0, width: 3, height: 14, borderRadius: 2, backgroundColor: colors.lime },
  groupTitle: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 16, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", color: "rgba(255,255,255,0.9)" },
  noShrink: { flexShrink: 0 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 46, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.md },
  itemActive: { backgroundColor: "rgba(255,255,255,0.22)" },
  itemPressed: { backgroundColor: "rgba(255,255,255,0.08)" },
  itemIcon: { flexShrink: 0, width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  itemIconActive: { backgroundColor: "rgba(11,19,16,0.55)" },
  itemText: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 19, fontWeight: "500", color: "rgba(255,255,255,0.94)" },
  itemTextActive: { color: "#FFFFFF", fontWeight: "600" },
  count: { flexShrink: 0, minWidth: 28, maxWidth: 72, minHeight: 22, paddingHorizontal: 8, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(11,19,16,0.55)" },
  countText: { fontSize: 11, lineHeight: 15, fontWeight: "600", color: "#FFFFFF", fontVariant: ["tabular-nums"] },
  skeleton: { backgroundColor: "rgba(255,255,255,0.10)" },
  footer: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.12)" },
  profile: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10, padding: 6, borderRadius: radius.md },
  avatar: { flexShrink: 0, width: 40, height: 40, borderRadius: radius.md, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 13, lineHeight: 17, fontWeight: "600", color: colors.navy },
  profileName: { fontSize: 14, lineHeight: 19, fontWeight: "600", color: "#FFFFFF" },
  profileRole: { fontSize: 11, lineHeight: 15, color: "rgba(255,255,255,0.7)" },
  logout: { flexShrink: 0, width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(252,165,165,0.12)" },
});
