// Open/closed state of the admin side menu, so any header or tab can open it.
// `swipeEnabled` is true on the tab screens, where a swipe from the left edge opens it.
import { create } from "zustand";

export const useDrawerStore = create((set) => ({
  open: false,
  swipeEnabled: true,
  setOpen: (open) => set({ open }),
  setSwipeEnabled: (swipeEnabled) => set({ swipeEnabled }),
}));

export const openDrawer = () => useDrawerStore.getState().setOpen(true);
export const closeDrawer = () => useDrawerStore.getState().setOpen(false);
