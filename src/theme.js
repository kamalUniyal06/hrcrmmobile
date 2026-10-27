// Brand palette: the web app's official "HRCRM" theme (index.css [data-theme="hrcrm"]):
// deep green primary, near-black-to-green sidebar, lime highlight. Status colours stay semantic.
export const colors = {
  background: "#F7F8F6",
  // Dark ink for hero banners, the side menu and the main timer (web --sidebar-primary).
  navy: "#0B1310",
  navySoft: "#064030",
  foreground: "#0B1310",
  card: "#FFFFFF",
  primary: "#09533D",
  primaryDeep: "#064030",
  primaryForeground: "#FFFFFF",
  primarySoft: "#E7F2EC",
  accentSoft: "#F0FBC9",
  lime: "#D4FA3C",
  oliveLime: "#8FA61B",
  sidebar: "#0B1310",
  panel: "#161D1A",
  success: "#10B981",
  successSoft: "#D1FAE5",
  teal: "#3DA9A5",
  muted: "#EFF2EE",
  mutedForeground: "#6A7074",
  border: "#DCE3D9",
  destructive: "#D4183D",
  destructiveSoft: "#FCE4EA",
  attention: "#B45309",
  attentionSoft: "#FEF3C7",
  info: "#2563EB",
  infoSoft: "#DBEAFE",
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

// Every style carries a lineHeight: without one Android clips ascenders/descenders in
// tight rows and multi-line text spacing varies between fonts. Bold text uses "600", never
// "700"/"bold": React Native asks Android for that exact weight, and some OEM system fonts
// (Xiaomi MiSans) ship a 600 face but no 700, so 700 falls back to regular.
// One scale for the whole app (nothing below 11): title 26 · heading 18 · subheading/body 15 ·
// small 13 · tiny 11. Line heights give each size room so text never clips or crowds the next line;
// big text is tightened slightly, small labels are opened up.
export const type = {
  title: { fontSize: 26, lineHeight: 32, fontWeight: "600", color: colors.foreground, letterSpacing: -0.5 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: "600", color: colors.foreground, letterSpacing: -0.2 },
  subheading: { fontSize: 15, lineHeight: 21, fontWeight: "600", color: colors.foreground, letterSpacing: -0.1 },
  body: { fontSize: 15, lineHeight: 22, color: colors.foreground },
  small: { fontSize: 13, lineHeight: 19, color: colors.mutedForeground },
  tiny: { fontSize: 11, lineHeight: 15, color: colors.mutedForeground, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6 },
};

export const shadow = {
  card: {
    shadowColor: "#0B1310",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
};

/** Tone colors shared by chips and status badges: neutral | progress | attention | success | closed | info */
export const tones = {
  neutral: { bg: colors.muted, fg: colors.mutedForeground },
  progress: { bg: colors.primarySoft, fg: colors.primary },
  attention: { bg: colors.attentionSoft, fg: colors.attention },
  success: { bg: colors.successSoft, fg: "#047857" },
  closed: { bg: colors.destructiveSoft, fg: colors.destructive },
  info: { bg: colors.infoSoft, fg: "#1D4ED8" },
  lime: { bg: colors.lime, fg: colors.foreground },
};
