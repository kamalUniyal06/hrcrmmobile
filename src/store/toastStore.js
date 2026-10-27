import { create } from "zustand";

let counter = 0;
const timers = new Map();

export const useToastStore = create((set, get) => ({
  toasts: [],
  /**
   * `key` keeps one toast per purpose (a second tap on Log out doesn't stack another).
   * `actions` = [{ label, onPress, tone: "primary" | "danger" | "plain" }] turn it into a confirm toast.
   */
  push: (toast) => {
    if (toast.key && get().toasts.some((item) => item.key === toast.key)) return null;
    const id = ++counter;
    set((state) => ({ toasts: [...state.toasts.slice(-2), { id, ...toast }] }));
    // A confirm toast (duration: null) stays until the user answers.
    if (toast.duration !== null) timers.set(id, setTimeout(() => get().dismiss(id), toast.duration || 3500));
    return id;
  },
  dismiss: (id) => {
    clearTimeout(timers.get(id));
    timers.delete(id);
    set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }));
  },
}));

export const toast = {
  success: (message, duration) => useToastStore.getState().push({ tone: "success", message, duration }),
  error: (message, duration) => useToastStore.getState().push({ tone: "error", message, duration: duration || 5000 }),
  info: (message, duration) => useToastStore.getState().push({ tone: "info", message, duration }),
  /** A toast that asks before doing something: Cancel, and a confirm button that runs `onConfirm`. */
  confirm: ({ key, title, message, icon, confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false, onConfirm, duration = null }) => {
    const store = useToastStore.getState();
    let id = null;
    const close = () => id && useToastStore.getState().dismiss(id);
    id = store.push({
      key,
      tone: "confirm",
      title,
      message,
      icon,
      duration,
      actions: [
        { label: cancelLabel, tone: "plain", onPress: close },
        { label: confirmLabel, tone: danger ? "danger" : "primary", onPress: () => { close(); onConfirm?.(); } },
      ],
    });
    return id;
  },
};
