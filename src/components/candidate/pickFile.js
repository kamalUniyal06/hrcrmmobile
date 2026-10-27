// Single-file picker for candidate uploads (resume, photo, ID image).
// Resolves to { uri, name, size, type } or null when the user cancels.
import { errorCodes, isErrorWithCode, pick } from "@react-native-documents/picker";
import { errorMessage } from "../../utils/records";

export async function pickOneFile(type) {
  try {
    // `import` mode copies the file into the app so the upload can read it later.
    const [file] = await pick({ type, allowMultiSelection: false, mode: "import" });
    if (!file) return null;
    return { uri: file.uri, name: file.name || "upload", size: file.size || 0, type: file.type || file.nativeType || "" };
  } catch (err) {
    if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) return null;
    throw new Error(errorMessage(err, "Could not open the file picker."));
  }
}
