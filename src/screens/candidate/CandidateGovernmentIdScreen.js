// Government ID verification (web GovernmentIdVerification.jsx + governmentDocument.js): the ID
// image is scanned server-side (hrc upload_doc), the number read from it must match the number
// typed, and only then are the ID fields saved on the candidate.
import { useState } from "react";
import { Image, Text, View } from "react-native";
import { types } from "@react-native-documents/picker";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { colors, type } from "../../theme";
import { Button, Card, EmptyState, Field, ListRow, LoadingState, Notice, Screen, SelectField } from "../../components/ui";
import { pickOneFile } from "../../components/candidate/pickFile";
import { keys, useCandidateProfile, useEmail } from "../../hooks/queries";
import { scanGovernmentDocument } from "../../api/candidate.api";
import { toast } from "../../store/toastStore";
import { governmentDocumentFileError, governmentDocumentNumbersMatch, governmentIdError, governmentIdTypes, normalizeCandidate, validatePersonalDetails } from "../../utils/candidateProfile";
import { errorMessage } from "../../utils/records";
import { saveProfile } from "./CandidateProfileScreen";

const typeOptions = Object.entries(governmentIdTypes).map(([value, item]) => ({ value, label: item.label }));

export default function CandidateGovernmentIdScreen({ navigation }) {
  const email = useEmail();
  const profile = useCandidateProfile();
  const candidate = profile.data;
  const queryClient = useQueryClient();
  const [idType, setIdType] = useState(governmentIdTypes[candidate?.government_id_type] ? candidate.government_id_type : "pan");
  const [number, setNumber] = useState("");
  const [touched, setTouched] = useState(false);
  const [file, setFile] = useState(null);
  const [scan, setScan] = useState(null);
  const [scanError, setScanError] = useState("");

  const selected = governmentIdTypes[idType];
  const idError = governmentIdError(idType, number);
  const matches = Boolean(scan?.file === file && scan?.type === idType && governmentDocumentNumbersMatch(idType, number, scan?.number));

  const verify = useMutation({
    mutationFn: () => scanGovernmentDocument({ file, type: idType }),
    onMutate: () => {
      setScan(null);
      setScanError("");
    },
    onSuccess: (scanned, _vars) => setScan({ file, type: idType, number: scanned }),
    onError: (err) => setScanError(errorMessage(err, "Unable to scan this document. Please try a clearer image.")),
  });

  const save = useMutation({
    mutationFn: () => saveProfile({ candidate, draft: normalizeCandidate(candidate, email), email, identification: { type: idType, number } }),
    onSuccess: (saved) => {
      queryClient.setQueryData(keys.candidate(email), saved);
      toast.success("Your government ID has been verified and saved.");
      navigation.goBack();
    },
    onError: (err) => toast.error(errorMessage(err, "Unable to save your profile.")),
  });

  if (profile.isPending) return <Screen><LoadingState variant="lines" /></Screen>;
  if (!candidate?.id) {
    return <Screen><EmptyState icon="person-circle-outline" title="Save your personal information first" message="Your ID is verified against your saved profile." action="Edit profile" onAction={() => navigation.navigate("CandidateProfileEdit")} /></Screen>;
  }

  const resetScan = () => {
    setScan(null);
    setScanError("");
  };
  const choose = async () => {
    resetScan();
    let picked;
    try {
      picked = await pickOneFile([types.images]);
    } catch (err) {
      setScanError(err.message);
      return;
    }
    if (!picked) return;
    const problem = governmentDocumentFileError(picked);
    setFile(problem ? null : picked);
    if (problem) setScanError(problem);
  };
  const runScan = () => {
    if (idError) {
      setTouched(true);
      setScanError(idError);
      return;
    }
    verify.mutate();
  };
  const submit = () => {
    // The web saves the ID together with the whole profile, so the personal details must be valid too.
    const personal = validatePersonalDetails(normalizeCandidate(candidate, email));
    if (Object.keys(personal).length) {
      toast.error("Complete your personal details first.");
      navigation.navigate("CandidateProfileEdit");
      return;
    }
    if (idError || !matches) {
      setScanError(idError || "Verify your ID to continue.");
      return;
    }
    save.mutate();
  };

  const busy = verify.isPending || save.isPending;
  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Text style={type.title}>Government ID</Text>
        <Text style={type.small}>Enter your ID number, add a clear photo of the document, then verify it.</Text>
      </View>
      {governmentIdTypes[candidate.government_id_type] ? (
        <Notice tone="success" icon="shield-checkmark-outline" message={`${governmentIdTypes[candidate.government_id_type].label} ending ${String(candidate.government_id_number || "").slice(-4)} is on your profile. Verify again to replace it.`} />
      ) : null}
      <SelectField
        label="ID type *"
        value={idType}
        options={typeOptions}
        onChange={(value) => {
          resetScan();
          setFile(null);
          setIdType(value);
          setNumber("");
          setTouched(false);
        }}
      />
      <Field
        label={`${selected.label} number *`}
        value={number}
        onChangeText={(value) => {
          setNumber(value.toUpperCase().slice(0, selected.maxLength));
          setScanError("");
        }}
        placeholder={selected.placeholder}
        autoCapitalize="characters"
        keyboardType={idType === "aadhaar" ? "number-pad" : "default"}
        error={touched && idError ? idError : undefined}
        hint={selected.hint}
      />
      <Card>
        <Text style={type.subheading}>{selected.label} document *</Text>
        <Text style={type.small}>Clear image, ID number visible. JPG, PNG, or WebP · Max 10 MB</Text>
        {file ? (
          <>
            <Image source={{ uri: file.uri }} style={{ width: "100%", aspectRatio: 1.586, borderRadius: 8, backgroundColor: colors.muted }} resizeMode="contain" accessibilityLabel={`Preview of selected ${selected.label} document`} />
            <ListRow icon="image-outline" title={file.name} subtitle={`${(file.size / 1024 / 1024).toFixed(2)} MB`} right={<Button title="Replace" small variant="ghost" disabled={busy} onPress={choose} />} />
          </>
        ) : (
          <Button title="Choose image" icon="cloud-upload-outline" variant="secondary" onPress={choose} disabled={busy} />
        )}
        <Button
          title={verify.isPending ? "Verifying ID…" : scan ? "Verify again" : "Verify ID"}
          icon="scan-outline"
          variant={file && !matches ? "primary" : "secondary"}
          loading={verify.isPending}
          disabled={!file || busy}
          onPress={runScan}
        />
        {verify.isPending ? (
          <Text style={type.small}>Verifying your ID. Keep this screen open.</Text>
        ) : scanError ? (
          <Text style={[type.small, { color: colors.destructive }]}>{scanError}</Text>
        ) : matches ? (
          <Notice tone="success" icon="checkmark-circle" message="ID verified" />
        ) : scan ? (
          <Text style={[type.small, { color: colors.destructive }]}>Couldn't verify. Check the ID number and image, then try again.</Text>
        ) : (
          <Text style={type.small}>Upload your ID image, then select Verify ID.</Text>
        )}
      </Card>
      <Button title="Save verified ID" icon="save-outline" full loading={save.isPending} disabled={!matches || busy} onPress={submit} style={{ minHeight: 50 }} />
    </Screen>
  );
}
