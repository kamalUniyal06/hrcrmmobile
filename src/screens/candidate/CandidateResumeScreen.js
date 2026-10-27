// Resume upload and parsing (web Profile.jsx parseResume + ResumeUpload.jsx): the CRM reads the
// resume into the candidate record, then the candidate reviews the filled-in details.
import { useState } from "react";
import { Text, View } from "react-native";
import { types } from "@react-native-documents/picker";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type } from "../../theme";
import { Button, Card, ListRow, Notice, Screen, SelectField, SkeletonText } from "../../components/ui";
import { pickOneFile } from "../../components/candidate/pickFile";
import { keys, useEmail } from "../../hooks/queries";
import { findCandidate, parseResume } from "../../api/candidate.api";
import { toast } from "../../store/toastStore";
import { candidateSources, resumeFileError } from "../../utils/candidateProfile";
import { errorMessage } from "../../utils/records";

const sizeLabel = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

export default function CandidateResumeScreen({ navigation, route }) {
  const email = useEmail();
  const queryClient = useQueryClient();
  const [file, setFile] = useState(null);
  const [stage, setStage] = useState("");
  const [phase, setPhase] = useState("processing");
  const [error, setError] = useState("");

  const upload = useMutation({
    mutationFn: async () => {
      setPhase("processing");
      await parseResume({ file, email, stage, jobId: route?.params?.jobId });
      setPhase("fetching");
      const candidate = await findCandidate(email);
      if (!candidate) throw new Error("Resume parsed, but your candidate profile is not available yet. Pull to refresh your profile to retry the lookup.");
      return candidate;
    },
    onSuccess: (candidate) => {
      queryClient.setQueryData(keys.candidate(email), candidate);
      queryClient.invalidateQueries({ queryKey: ["candidate-related"] });
      toast.success("Resume added. Review your details.");
      // Review the parsed details next, as the web does.
      if (navigation.replace) navigation.replace("CandidateProfileEdit");
      else navigation.navigate("CandidateProfileEdit");
    },
    onError: (err) => {
      const timedOut = err?.code === "ECONNABORTED";
      setError(timedOut ? "Resume upload timed out. It may still finish: pull to refresh your profile in a minute, or try again." : errorMessage(err, "Couldn't read this resume. Try another file."));
    },
  });

  const choose = async () => {
    setError("");
    let picked;
    try {
      picked = await pickOneFile([types.pdf, types.doc, types.docx]);
    } catch (err) {
      setError(err.message);
      return;
    }
    if (!picked) return;
    const problem = resumeFileError(picked);
    setFile(problem ? null : picked);
    if (problem) setError(problem);
  };

  const submit = () => {
    if (!file) return setError("Choose a non-empty PDF, DOC or DOCX resume up to 10 MB.");
    if (!candidateSources.some((source) => source.value === stage)) return setError("Select how you heard about us.");
    setError("");
    upload.mutate();
  };

  if (upload.isPending) {
    return (
      <Screen>
        <Card>
          <Text style={type.heading}>{phase === "processing" ? "Reading your resume…" : "Filling in your profile…"}</Text>
          <Text style={type.small}>{file?.name} · Keep this screen open. This can take up to a minute.</Text>
          <SkeletonText lines={4} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Text style={type.title}>Upload your resume</Text>
        <Text style={type.small}>We'll read your resume and fill in your details, skills, experience and education. You can review everything before it's final.</Text>
      </View>
      {file ? (
        <ListRow icon="document-text-outline" title={file.name} subtitle={sizeLabel(file.size)} right={<Button title="Replace" small variant="ghost" onPress={choose} />} />
      ) : (
        <Button title="Choose resume" icon="cloud-upload-outline" variant="secondary" full onPress={choose} />
      )}
      <Text style={type.small}>PDF, DOC or DOCX · Max 10 MB</Text>
      <SelectField label="How did you hear about us? *" value={stage} onChange={setStage} options={candidateSources} placeholder="Select an option" />
      <Text style={type.small}>Linked to {email}</Text>
      {error ? <Notice tone="closed" icon="alert-circle-outline" message={error} /> : null}
      <Button title="Upload and continue" icon="arrow-forward" full onPress={submit} disabled={!file || !stage} style={{ minHeight: 50 }} />
    </Screen>
  );
}
