import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { colors, type } from "../../theme";
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
    const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.size && asset.size > MAX_FILE_SIZE) {
      setError("The file must be 10 MB or smaller.");
      return;
    }
    setError("");
    setAttachment(asset);
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
      <Text style={type.small}>Weekends and public holidays are not counted as leave days.</Text>

      <SelectField label="Leave type" value={form.type} onChange={(type) => setForm({ ...form, type })} options={LEAVE_TYPES} placeholder="Choose a reason" />
      {form.type === "Other Reason" ? (
        <Field label="Reason" value={form.otherReason} onChangeText={(otherReason) => setForm({ ...form, otherReason })} placeholder="Tell HR what this leave is for" multiline />
      ) : null}

      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Text style={type.subheading}>Dates</Text>
          <Text style={type.small}>{range.from ? (range.to ? `${formatDate(range.from, { year: false })} – ${formatDate(range.to, { year: false })}` : `${formatDate(range.from, { year: false })} → pick end`) : "Tap start, then end"}</Text>
        </Row>
        <MonthCalendar year={cursor.year} month={cursor.month} onPrev={() => move(-1)} onNext={() => move(1)} markers={markers} rangeStart={range.from} rangeEnd={range.to || range.from} onSelectDay={selectDay} minKey={todayKey()} legend={[{ label: "Public holiday", tone: "holiday" }]} />
        {range.from && range.to ? (
          <Notice tone={leaveDays ? "progress" : "attention"} icon="calendar-outline" message={leaveDays ? `${leaveDays} working day${leaveDays === 1 ? "" : "s"} of leave` : "No working days in this range."} />
        ) : null}
      </Card>

      {form.type !== "Other Reason" ? (
        <Field label="Note for HR (optional)" value={form.note} onChangeText={(note) => setForm({ ...form, note })} placeholder="Anything HR should know" multiline />
      ) : null}

      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Text style={type.subheading}>Supporting document {proofRequired ? "" : "(optional)"}</Text>
            <Text style={type.small}>{proofRequired ? "Required for more than 3 working days." : "PDF or image, up to 10 MB."}</Text>
          </View>
          <Button title={attachment ? "Change" : "Attach"} variant="outline" small icon="attach-outline" onPress={pickFile} />
        </Row>
        {attachment ? (
          <Row>
            <Ionicons name="document-attach-outline" size={16} color={colors.primary} />
            <Text style={[type.small, { flex: 1 }]} numberOfLines={1}>{attachment.name}</Text>
            <Button title="Remove" variant="ghost" small onPress={() => setAttachment(null)} />
          </Row>
        ) : null}
      </Card>

      {error ? <Notice tone="closed" icon="alert-circle-outline" message={error} /> : null}
      <Button title="Submit leave request" icon="paper-plane-outline" full loading={mutation.isPending} onPress={submit} style={{ minHeight: 50 }} />
    </Screen>
  );
}
