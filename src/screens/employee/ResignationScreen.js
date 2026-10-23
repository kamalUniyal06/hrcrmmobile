import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { colors, radius, tones, type } from "../../theme";
import { Button, Card, Field, Notice, Screen } from "../../components/ui";
import { isNotified, markStepNotified, RESIGNATION_STEPS, startResignation } from "../../api/resignation.api";
import { useEmail } from "../../hooks/queries";
import { toast } from "../../store/toastStore";
import { errorMessage } from "../../utils/records";

/**
 * Guided resignation (web: "I want to resign" → Resignation assistance). Steps:
 * confirm → for each of team lead / manager / HR: notify → verify their token → complete.
 */
export default function ResignationScreen({ navigation }) {
  const email = useEmail();
  const [stage, setStage] = useState("confirm"); // confirm | notify | token | complete
  const [stepIndex, setStepIndex] = useState(0);
  const [record, setRecord] = useState(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const step = RESIGNATION_STEPS[stepIndex];
  const progress = stage === "confirm" ? 0 : stage === "complete" ? 1 : (stepIndex + (stage === "token" ? 0.65 : 0.2)) / RESIGNATION_STEPS.length;

  const begin = async () => {
    if (!email) return setError("Your account email is unavailable. Please refresh and try again.");
    setBusy(true);
    setError("");
    try {
      const found = await startResignation(email);
      setRecord(found);
      const next = RESIGNATION_STEPS.findIndex((item) => !isNotified(found?.[item.notifyField]));
      if (next === -1) setStage("complete");
      else {
        setStepIndex(next);
        setStage("notify");
      }
    } catch (err) {
      setError(errorMessage(err, "Could not start the resignation process."));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    const expected = String(record?.[step.tokenField] ?? "").trim();
    if (!token.trim()) return setError(`Enter the token provided by your ${step.title.toLowerCase()}.`);
    if (!expected || token.trim() !== expected) return setError("That token is not valid. Check it and try again.");
    setBusy(true);
    setError("");
    try {
      await markStepNotified(record.id, step.notifyField);
      setRecord((current) => ({ ...current, [step.notifyField]: "1" }));
      setToken("");
      if (stepIndex === RESIGNATION_STEPS.length - 1) {
        setStage("complete");
        toast.success("Resignation process completed successfully.");
      } else {
        setStepIndex(stepIndex + 1);
        setStage("notify");
      }
    } catch (err) {
      setError(errorMessage(err, "Token was valid, but the approval could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.heroRow}>
          <View style={styles.heroIcon}>
            <Ionicons name="shield-checkmark" size={22} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.heroTitle}>Resignation assistance</Text>
            <Text style={styles.heroSubtitle}>A private, guided process with confirmation at every step.</Text>
          </View>
        </View>
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <View style={styles.stepDots}>
          {RESIGNATION_STEPS.map((item, index) => {
            const done = isNotified(record?.[item.notifyField]);
            const current = (stage === "notify" || stage === "token") && index === stepIndex;
            return (
              <View key={item.key} style={styles.stepDot}>
                <View style={[styles.dot, done && styles.dotDone, current && styles.dotCurrent]}>
                  {done ? <Ionicons name="checkmark" size={11} color={colors.navy} /> : null}
                </View>
                <Text style={[styles.dotLabel, (done || current) && { color: "#FFFFFF" }]}>{item.title}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {stage === "confirm" ? (
        <Card style={styles.stepCard}>
          <StepIcon icon="alert-circle" tone="closed" />
          <Text style={styles.stepTitle}>Are you sure you want to resign?</Text>
          <Text style={styles.stepText}>Before beginning the formal process, consider whether a compensation discussion could address your concerns.</Text>
          <View style={styles.actions}>
            <Button title="Ask for an increment" icon="trending-up-outline" variant="secondary" full onPress={() => navigation.navigate("Increment")} style={styles.action} />
            <Button title="Yes, continue" icon="arrow-forward" variant="destructive" full loading={busy} onPress={begin} style={styles.action} />
          </View>
        </Card>
      ) : null}

      {stage === "notify" ? (
        <Card style={styles.stepCard}>
          <StepIcon icon="people" tone="info" />
          <Text style={styles.stepEyebrow}>Step {stepIndex + 1} of {RESIGNATION_STEPS.length}</Text>
          <Text style={styles.stepTitle}>{step.question}</Text>
          <Text style={styles.stepText}>Speak with your {step.title.toLowerCase()} first. They will provide the private token required for the next step.</Text>
          <View style={styles.actions}>
            <Button title="Not yet" variant="outline" full onPress={() => setError(`Please notify your ${step.title.toLowerCase()} before continuing.`)} style={styles.action} />
            <Button title="Yes, I notified them" icon="checkmark" full onPress={() => { setError(""); setStage("token"); }} style={styles.action} />
          </View>
        </Card>
      ) : null}

      {stage === "token" ? (
        <Card style={styles.stepCard}>
          <StepIcon icon="key" tone="attention" />
          <Text style={styles.stepEyebrow}>{step.title} verification</Text>
          <Text style={styles.stepTitle}>Enter your approval token</Text>
          <Text style={styles.stepText}>Enter the token exactly as it was shared with you. It is verified before you can continue.</Text>
          <Field value={token} onChangeText={setToken} placeholder="Enter token" autoCapitalize="none" style={{ alignSelf: "stretch" }} />
          <View style={styles.actions}>
            <Button title="Back" icon="arrow-back" variant="outline" full disabled={busy} onPress={() => { setToken(""); setError(""); setStage("notify"); }} style={styles.action} />
            <Button title="Verify token" icon="shield-checkmark-outline" full loading={busy} onPress={verify} style={styles.action} />
          </View>
        </Card>
      ) : null}

      {stage === "complete" ? (
        <Card style={styles.stepCard}>
          <StepIcon icon="checkmark-circle" tone="success" />
          <Text style={styles.stepTitle}>Process completed</Text>
          <Text style={styles.stepText}>All three tokens have been verified.</Text>
          <Button title="Done" full onPress={() => navigation.goBack()} style={styles.action} />
        </Card>
      ) : null}

      {error ? <Notice tone="closed" icon="alert-circle-outline" message={error} /> : null}
    </Screen>
  );
}

function StepIcon({ icon, tone }) {
  const palette = tones[tone] || tones.progress;
  return (
    <View style={[styles.stepIcon, { backgroundColor: palette.bg }]}>
      <Ionicons name={icon} size={26} color={palette.fg} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: 18, gap: 14, overflow: "hidden" },
  heroGlow: { position: "absolute", width: 200, height: 200, borderRadius: 100, right: -70, top: -100, backgroundColor: "rgba(59,130,246,0.28)" },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  heroTitle: { fontSize: 20, lineHeight: 26, fontWeight: "600", color: "#FFFFFF" },
  heroSubtitle: { fontSize: 13, lineHeight: 18, color: "rgba(255,255,255,0.65)" },
  track: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.12)", overflow: "hidden" },
  trackFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  stepDots: { flexDirection: "row", justifyContent: "space-between" },
  stepDot: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.3)" },
  dotDone: { backgroundColor: colors.lime, borderColor: colors.lime },
  dotCurrent: { borderColor: colors.primary, backgroundColor: "rgba(59,130,246,0.35)" },
  dotLabel: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: "rgba(255,255,255,0.55)" },
  stepCard: { alignItems: "center", gap: 10, paddingVertical: 24, paddingHorizontal: 20 },
  stepIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  stepEyebrow: { ...type.tiny, color: colors.primary, letterSpacing: 0.8 },
  stepTitle: { fontSize: 19, lineHeight: 25, fontWeight: "600", color: colors.navy, textAlign: "center" },
  stepText: { fontSize: 14, lineHeight: 20, color: colors.mutedForeground, textAlign: "center" },
  actions: { alignSelf: "stretch", gap: 10, marginTop: 8 },
  action: { minHeight: 50 },
});
