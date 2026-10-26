// Lets components outside a screen (the admin side menu) navigate and read the current route.
import { createNavigationContainerRef } from "@react-navigation/native";

export const navigationRef = createNavigationContainerRef();

/** Route names from the root down to the focused screen, plus that screen's params. */
export function focusedRoute() {
  if (!navigationRef.isReady()) return { names: [], params: {} };
  const names = [];
  let state = navigationRef.getRootState();
  let params = {};
  while (state?.routes) {
    const route = state.routes[state.index ?? 0];
    if (!route) break;
    names.push(route.name);
    params = route.params || {};
    state = route.state;
  }
  return { names, params };
}
