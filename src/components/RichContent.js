// CRM rich text (announcement bodies) drawn natively: paragraphs, pictures at their own shape,
// and tables that stay tables. Blocks come from utils/records.htmlBlocks.
import { useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, type } from "../theme";
import { htmlBlocks } from "../utils/records";

export default function RichContent({ value, empty = "No details were added." }) {
  const blocks = htmlBlocks(value);
  if (!blocks.length) return <Text style={type.small}>{empty}</Text>;
  return (
    <View style={styles.wrap}>
      {blocks.map((block, index) =>
        block.type === "table" ? (
          <DataTable key={index} header={block.header} rows={block.rows} />
        ) : block.type === "image" ? (
          <AutoImage key={index} uri={block.uri} />
        ) : (
          <Text key={index} style={styles.message} selectable>{block.text}</Text>
        ),
      )}
    </View>
  );
}

/** Full-width picture at its natural aspect ratio (a wide placeholder until the size is known). */
export function AutoImage({ uri, maxRatio = 2.2, style }) {
  const [ratio, setRatio] = useState(16 / 9);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    Image.getSize(
      uri,
      (width, height) => live && width && height && setRatio(Math.max(width / height, 1 / maxRatio)),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [uri, maxRatio]);
  if (failed) {
    return (
      <View style={[styles.imageFallback, style]}>
        <Ionicons name="image-outline" size={22} color={colors.mutedForeground} />
        <Text style={type.small}>Picture could not be loaded.</Text>
      </View>
    );
  }
  return <Image source={{ uri }} style={[styles.image, { aspectRatio: ratio }, style]} resizeMode="contain" onError={() => setFailed(true)} accessibilityIgnoresInvertColors />;
}

const WIDE_COLUMN = 140;

/**
 * Navy header, zebra rows. Up to three columns share the width; wider tables scroll sideways
 * with fixed-width columns so no cell is squeezed.
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

  return scrolls ? <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>{table}</ScrollView> : table;
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  message: { fontSize: 15, lineHeight: 24, color: colors.foreground },
  image: { width: "100%", borderRadius: radius.md, backgroundColor: colors.muted },
  imageFallback: { alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 24, borderRadius: radius.md, backgroundColor: colors.muted },
  tableScroll: { marginHorizontal: -4 },
  table: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  tr: { flexDirection: "row" },
  thead: { backgroundColor: colors.navy },
  th: { minWidth: 0, paddingVertical: 10, paddingHorizontal: 12, fontSize: 12, lineHeight: 16, fontWeight: "600", color: "#FFFFFF", textTransform: "uppercase", letterSpacing: 0.4 },
  zebra: { backgroundColor: colors.background },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.border },
  td: { minWidth: 0, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14, lineHeight: 20, color: colors.foreground },
  firstCol: { fontWeight: "600", color: colors.navy },
});
