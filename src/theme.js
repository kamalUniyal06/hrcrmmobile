// Brand palette from the web app's DESIGN.md (HRCRM theme: forest green + lime).
export const colors = {
  background: "#F7F8F6",
  foreground: "#0B1310",
  card: "#FFFFFF",
  primary: "#09533D",
  primaryDeep: "#064030",
  primaryForeground: "#FFFFFF",
  primarySoft: "#E6F0EC",
  lime: "#D4FA3C",
  oliveLime: "#8FA61B",
  sidebar: "#0B1310",
  panel: "#161D1A",
  success: "#10B981",
  successSoft: "#D1FAE5",
  teal: "#3DA9A5",
  muted: "#ECEFEC",
  mutedForeground: "#6A7074",
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

export const type = {
  title: { fontSize: 24, fontWeight: "600", color: colors.foreground, letterSpacing: -0.4 },
  heading: { fontSize: 18, fontWeight: "600", color: colors.foreground },
  subheading: { fontSize: 15, fontWeight: "600", color: colors.foreground },
  body: { fontSize: 15, color: colors.foreground, lineHeight: 21 },
  small: { fontSize: 13, color: colors.mutedForeground, lineHeight: 18 },
  tiny: { fontSize: 11, color: colors.mutedForeground, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6 },
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
