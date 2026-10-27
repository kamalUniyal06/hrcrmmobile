// Sign out through a confirm toast (Cancel / Sign out) instead of a system pop-up, used by the
// profile screens and the admin side menu. A short goodbye shows at the top once signed out,
// clear of the login screen's buttons.
import { toast } from "../store/toastStore";

export function confirmLogout(signOut) {
  toast.confirm({
    key: "logout",
    icon: "log-out-outline",
    title: "Sign out of HRCRM?",
    message: "You'll need to sign in with Google or Microsoft again.",
    confirmLabel: "Sign out",
    danger: true,
    onConfirm: async () => {
      try {
        await signOut();
      } catch (error) {
        toast.error(error?.message || "Could not sign out. Please try again.");
        return;
      }
      toast.success("You've been signed out. See you soon!", 2500);
    },
  });
}
