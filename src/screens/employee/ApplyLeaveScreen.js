import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { pick, types, isErrorWithCode, errorCodes } from "@react-native-documents/picker";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, tones, type } from "../../theme";
import { Button, Card, Field, Notice, Row, Screen, SelectField } from "../../components/ui";
import MonthCalendar from "../../components/ui/MonthCalendar";
import { applyForLeave, LEAVE_TYPES } from "../../api/leaves.api";
import { useEmail, usePublicHolidays, useUserId } from "../../hooks/queries";
import { toast } from "../../store/toastStore";
import { calendarDateKey, eachDay, formatDate, isWeekend, todayKey } from "../../utils/dates";
import { errorMessage } from "../../utils/records";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function ApplyLeaveScreen({ navigation }) {
  const email = useEmail();
  const employeeId = useUserId();
  const holidays = usePublicHolidays();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ type: "", note: "", otherReason: "" });
  const [range, setRange] = useState({ from: null, to: null });
  const [attachment, setAttachment] = useState(null);
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const holidayKeys = useMemo(() => new Set((holidays.data || []).map((h) => calendarDateKey(h.holiday_date)).filter(Boolean)), [holidays.data]);
  const markers = useMemo(() => Object.fromEntries([...holidayKeys].map((key) => [key, { tone: "holiday" }])), [holidayKeys]);

  const leaveDays = useMemo(() => {
    if (!range.from || !range.to) return 0;
    return eachDay(range.from, range.to).filter((day) => !isWeekend(day) && !holidayKeys.has(day)).length;
  }, [holidayKeys, range]);
  const proofRequired = leaveDays > 3;

  const selectDay = (key) => {
    setError("");
    if (!range.from || (range.from && range.to)) setRange({ from: key, to: null });
    else if (key < range.from) setRange({ from: key, to: range.from });
    else setRange({ from: range.from, to: key });
  };

  const pickFile = async () => {
    let file;
    try {
      // `import` mode copies the file into the app so the upload can read it later.
      [file] = await pick({ type: [types.pdf, types.images], allowMultiSelection: false, mode: "import" });
    } catch (err) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) return;
      setError(errorMessage(err, "Could not open the file picker."));
      return;
    }
    if (file.size && file.size > MAX_FILE_SIZE) {
      setError("The file must be 10 MB or smaller.");
      return;
    }
    setError("");
    setAttachment({ uri: file.uri, name: file.name || "attachment", mimeType: file.type || "application/octet-stream", size: file.size });
  };

  const mutation = useMutation({
    mutationFn: applyForLeave,
    onSuccess: () => {
      toast.success("Leave applied successfully");
      queryClient.invalidateQueries({ queryKey: ["leaves"] });
      navigation.goBack();
    },
    onError: (err) => setError(errorMessage(err, "Failed to apply for leave.")),
  });

  const submit = () => {
    if (!form.type) return setError("Please select a leave type.");
    if (form.type === "Other Reason" && !form.otherReason.trim()) return setError("Please enter the reason for other leave.");
    if (!range.from || !range.to) return setError("Please select a start and end date.");
    if (holidays.isPending) return setError("Please wait while public holidays are loaded.");
    if (proofRequired && !attachment) return setError("A supporting document is required for leave longer than 3 working days.");
    setError("");
    mutation.mutate({
      email,
      candidate_id: employeeId,
      leave_type: form.type,
      leave_from: range.from,
      leave_to: range.to,
      leave_days: leaveDays,
      description: form.type === "Other Reason" ? form.otherReason.trim() : form.note.trim(),
      attachment,
    });
  };

  const move = (delta) =>
    setCursor(({ year, month }) => {
      const next = new Date(year, month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });

  return (
    <Screen>
      <View style={styles.info}>
        <Ionicons name="information-circle" size={18} color={colors.primary} />
        <Text style={styles.infoText}>Weekends and public holidays are not counted as leave days.</Text>
      </View>

      <Card style={styles.section}>
        <SectionHead icon="pricetag" tone="info" title="Leave type" />
        <SelectField value={form.type} onChange={(leaveType) => setForm({ ...form, type: leaveType })} options={LEAVE_TYPES} placeholder="Choose a reason" />
        {form.type === "Other Reason" ? (
          <Field label="Reason" value={form.otherReason} onChangeText={(otherReason) => setForm({ ...form, otherReason })} placeholder="Tell HR what this leave is for" multiline />
        ) : null}
      </Card>

      <Card style={styles.section}>
        <SectionHead icon="calendar" tone="success" title="Dates" right={!range.from ? <Text style={type.small}>Tap start, then end</Text> : null} />
        <MonthCalendar year={cursor.year} month={cursor.month} onPrev={() => move(-1)} onNext={() => move(1)} markers={markers} rangeStart={range.from} rangeEnd={range.to || range.from} onSelectDay={selectDay} minKey={todayKey()} legend={[{ label: "Public holiday", tone: "holiday" }]} />
        {range.from ? (
          <View style={styles.rangeRow}>
            <DateBox label="From" value={formatDate(range.from, { year: false })} />
            <Ionicons name="arrow-forward" size={16} color={colors.mutedForeground} />
            <DateBox label="To" value={range.to ? formatDate(range.to, { year: false }) : "pick end"} muted={!range.to} />
          </View>
        ) : null}
        {range.from && range.to ? (
          <View style={[styles.daysPill, !leaveDays && { backgroundColor: colors.attentionSoft }]}>
            <Ionicons name={leaveDays ? "briefcase-outline" : "alert-circle-outline"} size={15} color={leaveDays ? colors.primary : colors.attention} />
            <Text style={[styles.daysText, !leaveDays && { color: colors.attention }]}>
              {leaveDays ? `${leaveDays} working day${leaveDays === 1 ? "" : "s"} of leave` : "No working days in this range."}
            </Text>
          </View>
        ) : null}
      </Card>

      {form.type !== "Other Reason" ? (
        <Card style={styles.section}>
          <SectionHead icon="chatbubble-ellipses" tone="attention" title="Note for HR (optional)" />
          <Field value={form.note} onChangeText={(note) => setForm({ ...form, note })} placeholder="Anything HR should know" multiline />
        </Card>
      ) : null}

      <Card style={styles.section}>
        <SectionHead icon="document-attach" tone={proofRequired ? "closed" : "progress"} title={`Supporting document ${proofRequired ? "" : "(optional)"}`} />
        {attachment ? (
          <View style={styles.fileChip}>
            <View style={styles.fileIcon}>
              <Ionicons name="document-text" size={18} color={colors.primary} />
            </View>
            <Text style={[type.body, { flex: 1, fontWeight: "600" }]} numberOfLines={1}>{attachment.name}</Text>
            <Button title="Remove" variant="ghost" small onPress={() => setAttachment(null)} />
          </View>
        ) : null}
        <Pressable onPress={pickFile} style={({ pressed }) => [styles.upload, proofRequired && !attachment && styles.uploadRequired, pressed && { opacity: 0.75 }]}>
          <Ionicons name={attachment ? "swap-horizontal" : "cloud-upload-outline"} size={22} color={proofRequired && !attachment ? colors.destructive : colors.primary} />
          <Text style={[styles.uploadTitle, proofRequired && !attachment && { color: colors.destructive }]}>{attachment ? "Change" : "Attach"}</Text>
          <Text style={[type.small, { textAlign: "center" }]}>{proofRequired ? "Required for more than 3 working days." : "PDF or image, up to 10 MB."}</Text>
        </Pressable>
      </Card>

      {error ? <Notice tone="closed" icon="alert-circle-outline" message={error} /> : null}
      <Button title="Submit leave request" icon="paper-plane-outline" full loading={mutation.isPending} onPress={submit} style={{ minHeight: 52 }} />
    </Screen>
  );
}

function SectionHead({ icon, tone, title, right }) {
  const palette = tones[tone] || tones.progress;
  return (
    <Row style={{ justifyContent: "space-between" }}>
      <Row gap={10} style={{ flex: 1 }}>
        <View style={[styles.headIcon, { backgroundColor: palette.bg }]}>
          <Ionicons name={icon} size={15} color={palette.fg} />
        </View>
        <Text style={[type.subheading, { flex: 1 }]} numberOfLines={1}>{title}</Text>
      </Row>
      {right}
    </Row>
  );
}

function DateBox({ label, value, muted }) {
  return (
    <View style={styles.dateBox}>
      <Text style={styles.dateLabel}>{label}</Text>
      <Text style={[styles.dateValue, muted && { color: colors.mutedForeground, fontWeight: "500" }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  info: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.primaryDeep },
  section: { gap: 12 },
  headIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  rangeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dateBox: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  dateLabel: { fontSize: 11, fontWeight: "600", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 },
  dateValue: { fontSize: 15, fontWeight: "600", color: colors.foreground, marginTop: 2 },
  daysPill: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  daysText: { fontSize: 13, fontWeight: "600", color: colors.primary },
  fileChip: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  fileIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.card },
  upload: { alignItems: "center", gap: 4, paddingVertical: 18, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1.5, borderStyle: "dashed", borderColor: "rgba(59,130,246,0.35)", backgroundColor: "#F7FAFF" },
  uploadRequired: { borderColor: "rgba(212,24,61,0.45)", backgroundColor: "#FFF7F9" },
  uploadTitle: { fontSize: 15, fontWeight: "600", color: colors.primary },
});
