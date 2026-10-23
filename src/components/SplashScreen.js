import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from "react-native";
import { colors } from "../theme";

const LOGO = require("../../assets/hrcrm-icon.png");

// After the animation finishes, the logo and name stay this long before fading.
const HOLD_MS = 2000;

/**
 * Launch screen: the HRCRM logo pops in on white, then the name fades in. Once
 * `ready` is true (and the animation has had its time) it fades out and calls `onDone`.
 */
export default function SplashScreen({ ready, onDone }) {
  const scale = useRef(new Animated.Value(0.2)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const nameOpacity = useRef(new Animated.Value(0)).current;
  const nameShift = useRef(new Animated.Value(10)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;
  // Gate on the animation actually finishing, not on a clock: in dev builds the JS thread
  // is busy at launch and the animation can start late.
  const [animationDone, setAnimationDone] = useState(false);
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    // The name starts while the logo's spring is still settling (the spring alone runs ~1s),
    // so it is on screen well before the splash can close.
    Animated.parallel([
      // Low friction = a visible overshoot, so the logo "pops" rather than just growing.
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 60, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.timing(nameOpacity, { toValue: 1, duration: 320, delay: 350, useNativeDriver: true }),
      Animated.timing(nameShift, { toValue: 0, duration: 320, delay: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start(() => setAnimationDone(true));
  }, [scale, logoOpacity, nameOpacity, nameShift]);

  useEffect(() => {
    if (!ready || !animationDone) return undefined;
    const timer = setTimeout(() => {
      Animated.timing(screenOpacity, { toValue: 0, duration: 280, useNativeDriver: true }).start(() => onDone?.());
    }, HOLD_MS);
    return () => clearTimeout(timer);
  }, [ready, animationDone, onDone, screenOpacity]);

  // Sized to the window, not the parent: the app root also holds the hidden session
  // WebView, so a plain absolute fill came out taller than the screen.
  return (
    <Animated.View style={[styles.screen, { width, height, opacity: screenOpacity }]} pointerEvents="none">
      <View style={styles.center}>
        <Animated.Image source={LOGO} resizeMode="contain" style={[styles.logo, { opacity: logoOpacity, transform: [{ scale }] }]} />
        <Animated.Text style={[styles.name, { opacity: nameOpacity, transform: [{ translateY: nameShift }] }]}>HRCRM</Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { position: "absolute", top: 0, left: 0, backgroundColor: "#FFFFFF", zIndex: 10, elevation: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 16 },
  logo: { width: 100, height: 100 },
  name: { fontSize: 21, lineHeight: 26, fontWeight: "600", letterSpacing: -0.3, color: colors.foreground },
});
