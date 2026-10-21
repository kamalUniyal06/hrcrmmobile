// Small AsyncStorage wrapper: every read/write is guarded so a storage failure
// never breaks the live session.
import AsyncStorage from "@react-native-async-storage/async-storage";

export async function readJson(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function writeJson(key, value) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is a convenience; in-memory state still works.
  }
}

export async function readString(key) {
  try {
    return (await AsyncStorage.getItem(key)) || "";
  } catch {
    return "";
  }
}

export async function writeString(key, value) {
  try {
    await AsyncStorage.setItem(key, String(value));
  } catch {
    // Nothing else required.
  }
}

export async function remove(key) {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Nothing else required.
  }
}
