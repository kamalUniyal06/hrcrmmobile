import { create } from "zustand";

let counter = 0;

export const useToastStore = create((set) => ({
  toasts: [],
  push: (toast) => {
    const id = ++counter;
    set((state) => ({ toasts: [...state.toasts.slice(-2), { id, ...toast }] }));
    setTimeout(() => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })), toast.duration || 3500);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })),
}));

export const toast = {
  success: (message, duration) => useToastStore.getState().push({ tone: "success", message, duration }),
  error: (message, duration) => useToastStore.getState().push({ tone: "error", message, duration: duration || 5000 }),
  info: (message, duration) => useToastStore.getState().push({ tone: "info", message, duration }),
};
