import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, type } from "../../theme";
import { Card, EmptyState, Screen } from "../../components/ui";
import { formatDate } from "../../utils/dates";
import { htmlBlocks, plainText } from "../../utils/records";

/** Full announcement opened from the home screen. `route.params.alert` is the record. */
export default function AnnouncementDetailScreen({ route }) {
  const alert = route?.params?.alert;
  if (!alert) {
    return (
      <Screen>
        <EmptyState icon="megaphone-outline" title="Announcement not found" message="Go back and open it again." />
      </Screen>
    );
  }

  // Paragraphs keep their breaks and HTML tables (e.g. team lists) stay tables.
  const blocks = htmlBlocks(alert.description);

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.heroIcon}>
          <Ionicons name="megaphone" size={22} color="#FFFFFF" />
        </View>
        <Text style={styles.eyebrow}>Announcement</Text>
        <Text style={styles.title}>{plainText(alert.name) || "Announcement"}</Text>
        {alert.date_entered ? (
          <View style={styles.datePill}>
            <Ionicons name="time-outline" size={13} color="#FFFFFF" />
            <Text style={styles.dateText}>{formatDate(alert.date_entered)}</Text>
          </View>
        ) : null}
      </View>

      <Card style={styles.body}>
        {blocks.length ? (
          blocks.map((block, index) =>
            block.type === "table" ? (
              <DataTable key={index} header={block.header} rows={block.rows} />
            ) : (
              <Text key={index} style={styles.message} selectable>{block.text}</Text>
            ),
          )
        ) : (
          <Text style={type.small}>This announcement has no details.</Text>
        )}
      </Card>
    </Screen>
  );
}

const WIDE_COLUMN = 140;

/**
 * Announcement table: navy header, zebra rows. Up to three columns share the card width;
 * wider tables scroll sideways with fixed-width columns so no cell is squeezed.
 */
function DataTable({ header, rows }) {
  const columns = Math.max(header?.length || 0, ...rows.map((row) => row.length), 1);
  const scrolls = columns > 3;
  const cellStyle = scrolls ? { width: WIDE_COLUMN } : { flex: 1 };
  const pad = (cells) => Array.from({ length: columns }, (_, index) => cells[index] ?? "");

  const table = (
    <View style={[styles.table, scrolls && { width: WIDE_COLUMN * columns }]}>
      {header ? (
        <View style={[styles.tr, styles.thead]}>
          {pad(header).map((cell, index) => (
            <Text key={index} style={[styles.th, cellStyle]}>{cell}</Text>
          ))}
        </View>
      ) : null}
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={[styles.tr, rowIndex % 2 === 1 && styles.zebra, rowIndex > 0 && styles.rowLine]}>
          {pad(row).map((cell, index) => (
            <Text key={index} style={[styles.td, cellStyle, index === 0 && styles.firstCol]} selectable>{cell || "—"}</Text>
          ))}
        </View>
      ))}
    </View>
  );

  return scrolls ? (
    <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>{table}</ScrollView>
  ) : (
    table
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: 20, gap: 8, overflow: "hidden" },
  heroGlow: { position: "absolute", width: 200, height: 200, borderRadius: 100, right: -70, top: -100, backgroundColor: "rgba(59,130,246,0.28)" },
  heroIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, marginBottom: 4 },
  eyebrow: { ...type.tiny, color: "rgba(255,255,255,0.6)", letterSpacing: 1 },
  title: { fontSize: 22, lineHeight: 29, fontWeight: "600", letterSpacing: -0.3, color: "#FFFFFF" },
  datePill: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", marginTop: 4, paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.12)" },
  dateText: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: "#FFFFFF" },
  body: { padding: 20, gap: 16 },
  message: { fontSize: 15, lineHeight: 24, color: colors.foreground },
  tableScroll: { marginHorizontal: -4 },
  table: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  tr: { flexDirection: "row" },
  thead: { backgroundColor: colors.navy },
  th: { paddingVertical: 10, paddingHorizontal: 12, fontSize: 12, lineHeight: 16, fontWeight: "600", color: "#FFFFFF", textTransform: "uppercase", letterSpacing: 0.4 },
  zebra: { backgroundColor: colors.background },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.border },
  td: { paddingVertical: 10, paddingHorizontal: 12, fontSize: 14, lineHeight: 20, color: colors.foreground },
  firstCol: { fontWeight: "600", color: colors.navy },
});
