// Log out through a confirm toast (Cancel / Log out) instead of a system pop-up, used by the
// profile screens and the admin side menu. A quick goodbye toast follows once signed out.
import { toast, useToastStore } from "../store/toastStore";

export function confirmLogout(signOut) {
  toast.confirm({
    key: "logout",
    icon: "log-out-outline",
    title: "Log out of HRCRM?",
    message: "You'll need to sign in with Google or Microsoft again.",
    confirmLabel: "Log out",
    danger: true,
    onConfirm: async () => {
      try {
        await signOut();
      } catch (error) {
        toast.error(error?.message || "Could not log out. Please try again.");
        return;
      }
      // The goodbye shows in the middle too, where the confirm was.
      useToastStore.getState().push({ tone: "success", centered: true, message: "You've been logged out. See you soon!", duration: 2500 });
    },
  });
}
