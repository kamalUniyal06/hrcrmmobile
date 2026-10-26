import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { colors, type } from "../../theme";
import { Button, Card, Chip, EmptyState, ErrorState, Field, LoadingState, Notice, Row, Screen, SectionTitle } from "../../components/ui";
import {
  clearRememberedIncrement, createIncrement, createIncrementReply, fetchCurrentSalary, fetchMyIncrements,
  getPendingIncrement, getRememberedIncrementId, questionText, rememberIncrementId,
} from "../../api/increment.api";
import { useEmail, useUserId } from "../../hooks/queries";
import { toast } from "../../store/toastStore";
import { formatDate } from "../../utils/dates";
import { clean, errorMessage } from "../../utils/records";

const money = (value) => (Number.isFinite(Number(value)) ? Number(value).toLocaleString("en-IN") : "—");

export default function IncrementScreen() {
  const email = useEmail();
  const employeeId = useUserId();
  const queryClient = useQueryClient();
  const [expected, setExpected] = useState("");
  const [incrementId, setIncrementId] = useState("");
  const [answer, setAnswer] = useState("");

  useEffect(() => {
    getRememberedIncrementId(email).then((id) => id && setIncrementId(id));
  }, [email]);

  const salary = useQuery({ queryKey: ["increment", "salary", employeeId], queryFn: () => fetchCurrentSalary(employeeId) });
  const history = useQuery({ queryKey: ["increment", "mine", email], queryFn: () => fetchMyIncrements(email), enabled: Boolean(email) });
  const pending = useQuery({ queryKey: ["increment", "pending", incrementId], queryFn: () => getPendingIncrement(incrementId), enabled: Boolean(incrementId) });

  const create = useMutation({
    mutationFn: () => createIncrement({ email, expectedSalary: clean(expected).replace(/,/g, "") }),
    onSuccess: async ({ id }) => {
      await rememberIncrementId(email, id);
      setIncrementId(id);
      toast.success("Increment request created. Answer the questions to complete it.");
      queryClient.invalidateQueries({ queryKey: ["increment"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const reply = useMutation({
    mutationFn: ({ questionId }) => createIncrementReply({ incrementId, questionId, answer }),
    onSuccess: async () => {
      setAnswer("");
      const next = await pending.refetch();
      if (next.data && next.data.pendingQuestions.length === 0) {
        await clearRememberedIncrement(email);
        toast.success("All answers saved. Management will review your request.");
        setIncrementId("");
        queryClient.invalidateQueries({ queryKey: ["increment"] });
      } else {
        toast.success("Answer saved.");
      }
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const currentQuestion = pending.data?.pendingQuestions?.[0];
  const expectedNumber = Number(clean(expected).replace(/,/g, ""));
  const validExpected = Number.isFinite(expectedNumber) && expectedNumber > 0;

  return (
    <Screen>
      <Card style={{ backgroundColor: colors.sidebar, borderColor: colors.sidebar }}>
        <Text style={[type.tiny, { color: colors.lime }]}>Current annual salary</Text>
        <Text style={[type.title, { color: "#fff", fontSize: 30, lineHeight: 38 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{salary.isPending ? "…" : `₹ ${money(salary.data?.amount)}`}</Text>
        <Text style={[type.small, { color: "rgba(255,255,255,0.7)" }]}>
          {salary.data?.isFallback ? "No salary record found; showing a reference amount." : `₹ ${money(salary.data?.monthlyAmount)} per month`}
        </Text>
      </Card>

      {incrementId ? (
        <View style={{ gap: 10 }}>
          <SectionTitle title="Complete your request" hint="Answer each question. Your progress is saved as you go." />
          {pending.isPending ? (
            <LoadingState label="Loading questions…" />
          ) : pending.isError ? (
            <ErrorState message={pending.error.message} onRetry={() => pending.refetch()} />
          ) : currentQuestion ? (
            <Card>
              <Chip label={`Question ${pending.data.questions.length - pending.data.pendingQuestions.length + 1} of ${pending.data.questions.length}`} tone="progress" small style={{ alignSelf: "flex-start", maxWidth: "100%" }} />
              <Text style={type.subheading}>{questionText(currentQuestion)}</Text>
              <Field value={answer} onChangeText={setAnswer} placeholder="Type your answer" multiline />
              <Row style={{ flexWrap: "wrap", columnGap: 8, rowGap: 8 }}>
                <Button title="Save answer" icon="checkmark" loading={reply.isPending} disabled={!clean(answer)} onPress={() => reply.mutate({ questionId: currentQuestion.id })} />
                <Button title="Finish later" variant="ghost" onPress={() => toast.info("Your request is saved. Come back any time to finish.")} />
              </Row>
            </Card>
          ) : (
            <Notice tone="success" icon="checkmark-circle-outline" message="Every question is answered. Management will communicate the decision." />
          )}
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <SectionTitle title="Request an increment" hint="Tell HR the annual salary you expect, then answer a few questions." />
          <Card>
            <Field label="Expected annual salary (₹)" value={expected} onChangeText={setExpected} keyboardType="numeric" placeholder="e.g. 600000" />
            {validExpected && salary.data?.amount ? (
              <Text style={type.small}>That is {Math.round(((expectedNumber - salary.data.amount) / salary.data.amount) * 100)}% more than your current salary.</Text>
            ) : null}
            <Button title="Start request" icon="trending-up-outline" loading={create.isPending} disabled={!validExpected} onPress={() => create.mutate()} />
          </Card>
        </View>
      )}

      <View style={{ gap: 10 }}>
        <SectionTitle title="Previous requests" />
        {history.isPending ? (
          <Text style={type.small}>Loading…</Text>
        ) : (history.data || []).length === 0 ? (
          <EmptyState icon="trending-up-outline" title="No requests yet" message="Your increment requests will be listed here." />
        ) : (
          history.data.map((record) => (
            <Card key={record.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={type.subheading} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>₹ {money(record.description)}</Text>
                <Text style={type.small}>Requested {formatDate(record.date_entered)}</Text>
              </View>
              <Chip label={record.id === incrementId ? "In progress" : "Submitted"} tone={record.id === incrementId ? "attention" : "progress"} style={{ flexShrink: 0, maxWidth: "45%" }} />
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}
