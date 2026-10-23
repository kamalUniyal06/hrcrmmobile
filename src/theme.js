// Brand palette: primary is a lighter take on the HRCRM logo blue (logo ~#0068F8),
// with the web app's lime as the accent. Status greens (success) stay green.
export const colors = {
  background: "#F8F9FF",
  // Deep midnight navy for hero banners and the main timer ("Kinetic Executive" look).
  navy: "#0D1B2A",
  navySoft: "#1B2B3D",
  foreground: "#0B1310",
  card: "#FFFFFF",
  primary: "#3B82F6",
  primaryDeep: "#2563EB",
  primaryForeground: "#FFFFFF",
  primarySoft: "#EBF3FF",
  lime: "#D4FA3C",
  oliveLime: "#8FA61B",
  sidebar: "#0B1310",
  panel: "#161D1A",
  success: "#10B981",
  successSoft: "#D1FAE5",
  teal: "#3DA9A5",
  muted: "#ECEFEC",
  mutedForeground: "#5F6670",
  border: "rgba(0,0,0,0.10)",
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
export const type = {
  title: { fontSize: 24, lineHeight: 30, fontWeight: "600", color: colors.foreground, letterSpacing: -0.4 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: "600", color: colors.foreground, letterSpacing: -0.2 },
  subheading: { fontSize: 15, lineHeight: 20, fontWeight: "600", color: colors.foreground },
  body: { fontSize: 15, lineHeight: 21, color: colors.foreground },
  small: { fontSize: 13, lineHeight: 18, color: colors.mutedForeground },
  tiny: { fontSize: 11, lineHeight: 15, color: colors.mutedForeground, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
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
