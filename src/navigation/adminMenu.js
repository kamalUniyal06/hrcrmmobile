// Admin side-menu model. Groups and items come from the web's sidebar layout
// (web: utils/sidebarLayout.js, utils/sidebarNavigation.js, utils/pageAccess.js);
// each item is mapped to the mobile tab or screen that shows the same page.
import glyphMap from "@react-native-vector-icons/ionicons/glyphmaps/Ionicons.json";
import { clean } from "../utils/records";

// Anything unrecognised counts as visible, so an item never disappears because of an unexpected value.
export const isVisible = (record) => {
  const value = record?.is_visible ?? record?.visible;
  if (value === undefined || value === null || value === "") return true;
  if (typeof value === "boolean") return value;
  return String(value) !== "0" && String(value).toLowerCase() !== "false";
};

// Ranks are opaque ASCII strings compared in binary order; the backend already sends rank order.
const byRank = (a, b) => {
  const left = String(a?.rank ?? a?.rank_key ?? "");
  const right = String(b?.rank ?? b?.rank_key ?? "");
  return left < right ? -1 : left > right ? 1 : 0;
};

/** Web sidebarDestination(): the web path an item opens. */
export function sidebarDestination(item) {
  const name = clean(item.name);
  const module = clean(item.fetch_from || item.module_name);
  if (/^(?:my\s+)?increment\s+requests?$/i.test(name) || /^\/?increment-request\/?$/i.test(clean(item.navigation))) return "/increment-request";
  if (/^increment(?:s|\s+management)?$/i.test(name) || ["hrc_increment", "hrc_increment_questions", "hrc_increment_replies"].includes(module)) return "/increment-management";
  if (/^system[\s-]+alerts?$/i.test(name) || ["hrc_system_alert", "hrc_employee_response"].includes(module)) return "/system-alerts";
  if (/^offboarding(?:\s+management)?$/i.test(name) || module === "hrc_resignation") return "/offboarding";
  if (/^(?:salary|salaries)(?:\s+management)?$/i.test(name) || module === "hrc_salaries") return "/salaries";
  if (/^employees?$/i.test(name) || module === "hrc_employees") return "/employees";
  if (/^short[\s-]?listed(?:\s+candidates)?$/i.test(name)) return "/shortlisted";
  if (/^candidates?$/i.test(name)) return "/candidates";
  if (/^(my\s+)?profile$/i.test(name)) return "/profile";
  if (/^job[\s-]+post(?:ing)?s?$/i.test(name)) return "/job-posting";
  if (/^(?:my\s+)?(?:job[\s-]+)?applications?$/i.test(name)) return "/job-application";
  if (/^settings?$/i.test(name)) return "/settings";
  const navigation = clean(item.navigation).replace(/^\/+/, "");
  if (navigation && !/^profile(?:[/?#]|$)/i.test(navigation)) return `/${navigation}`;
  return module ? `/entity/${encodeURIComponent(module)}/view` : null;
}

/**
 * Mobile target for a web path: { tab, screen?, params? } opens a bottom tab, { screen, params } pushes a screen.
 * null means the page has no mobile version (e.g. the desktop layout editor under /settings).
 */
export function mobileTarget(path, item = {}) {
  if (!path) return null;
  const [pathname, query = ""] = path.split("?");
  const route = pathname.replace(/\/+$/, "").toLowerCase();
  const title = clean(item.name);
  if (route === "" || route === "/") return { tab: "Home" };
  if (route === "/attendance" || route.startsWith("/attendance/")) return { tab: "Attendance" };
  if (["/leave-approvals", "/leaves", "/leave-applications"].includes(route)) return { tab: "Approvals" };
  if (route === "/candidates") return { tab: "Candidates", params: { view: query.includes("view=shortlisted") ? "shortlisted" : "all" } };
  if (route === "/shortlisted") return { tab: "Candidates", params: { view: "shortlisted" } };
  if (route === "/employees") return { tab: "People" };
  const screens = {
    "/salaries": "Salaries",
    "/limit-management": "LimitManagement",
    "/offboarding": "Offboarding",
    "/system-alerts": "SystemAlerts",
    "/interviews": "InterviewBoard",
    "/job-posting": "JobPostings",
    "/increment-management": "IncrementRequests",
    "/increment-request": "Increment",
    "/my-leaves": "MyLeave",
    "/profile": "Account",
  };
  if (screens[route]) return { screen: screens[route] };
  const entity = route.match(/^\/entity\/([^/]+)/);
  if (entity) return { screen: "EntityList", params: { module: decodeURIComponent(entity[1]), title: title || "Records", uiModuleId: item.id } };
  return null;
}

// Fallback icon per destination, used when the item's icon has no Ionicons equivalent.
const TARGET_ICONS = {
  Home: "home-outline",
  Attendance: "calendar-outline",
  Approvals: "document-text-outline",
  Candidates: "person-add-outline",
  Shortlisted: "star-outline",
  People: "people-outline",
  Salaries: "wallet-outline",
  LimitManagement: "speedometer-outline",
  Offboarding: "exit-outline",
  SystemAlerts: "megaphone-outline",
  InterviewBoard: "chatbubbles-outline",
  JobPostings: "briefcase-outline",
  IncrementRequests: "trending-up-outline",
  Increment: "trending-up-outline",
  MyLeave: "document-text-outline",
  Account: "person-circle-outline",
  EntityList: "albums-outline",
};

/** "IoCalendarOutline" (react-icons io/io5) → "calendar-outline" when Ionicons has it. */
export function iconFor(item, target) {
  const name = clean(item?.icon);
  const io = name.match(/^Io(?:s|Md)?([A-Z][A-Za-z0-9]*)$/);
  if (io) {
    const kebab = io[1].replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase();
    if (glyphMap[kebab] !== undefined) return kebab;
  }
  const key = target?.params?.view === "shortlisted" ? "Shortlisted" : target?.screen || target?.tab;
  return TARGET_ICONS[key] || "ellipse-outline";
}

// Admins manage the shortlist inside Candidates, so a separate Shortlisted link is redundant (web hideMergedRecruitmentNavigation).
const MERGED_INTO_CANDIDATES = /^\/shortlisted\/?$/i;

// Pages left out of the mobile side menu even when the web layout lists them.
const HIDDEN_FROM_MENU = new Set(["InterviewBoard"]);

/** Raw sidebar response → [{ id, title, items: [{ id, key, name, icon, target, countKey }] }], visible items with a mobile page only. */
export function buildMenuGroups(raw = []) {
  return [...raw]
    .filter(isVisible)
    .sort(byRank)
    .map((group) => ({
      id: String(group.id ?? group.group_name),
      title: clean(group.group_name) || "Menu",
      items: (Array.isArray(group.data) ? [...group.data] : [])
        .filter(isVisible)
        .sort(byRank)
        .map((item) => {
          const path = sidebarDestination(item);
          const target = path && !MERGED_INTO_CANDIDATES.test(path) ? mobileTarget(path, item) : null;
          return {
            id: String(item.id ?? item.name),
            // The CRM calls this page "System alerts"; the menu shows the shorter "Alerts".
            name: target?.screen === "SystemAlerts" ? "Alerts" : clean(item.name) || "Untitled",
            target,
            icon: iconFor(item, target),
            countKey: ["1", "true"].includes(String(item.show_count).toLowerCase()) && item.key ? item.key : null,
            countQuery: { key: item.key, module: item.module_name, ignore_email: String(item.filter_by_email) !== "1", filters: item.count_filters ?? {} },
          };
        })
        .filter((item) => item.target && !HIDDEN_FROM_MENU.has(item.target.screen)),
    }))
    .filter((group) => group.items.length > 0);
}

/** Used when the sidebar layout cannot be loaded: every admin page the app has. */
export const FALLBACK_GROUPS = [
  {
    id: "recruitment",
    title: "Recruitment",
    items: [
      { id: "candidates", name: "Candidates", target: { tab: "Candidates", params: { view: "all" } } },
      { id: "shortlisted", name: "Shortlisted", target: { tab: "Candidates", params: { view: "shortlisted" } } },
      { id: "jobs", name: "Job postings", target: { screen: "JobPostings" } },
    ],
  },
  {
    id: "people",
    title: "People",
    items: [
      { id: "employees", name: "Employees", target: { tab: "People" } },
      { id: "attendance", name: "Attendance", target: { tab: "Attendance" } },
      { id: "salaries", name: "Salary management", target: { screen: "Salaries" } },
      { id: "increments", name: "Increment management", target: { screen: "IncrementRequests" } },
      { id: "offboarding", name: "Offboarding", target: { screen: "Offboarding" } },
    ],
  },
  {
    id: "leave",
    title: "Leave",
    items: [
      { id: "approvals", name: "Leave approvals", target: { tab: "Approvals" } },
      { id: "my-leave", name: "My leave", target: { screen: "MyLeave" } },
    ],
  },
  {
    id: "workspace",
    title: "Workspace",
    items: [
      { id: "alerts", name: "Alerts", target: { screen: "SystemAlerts" } },
      { id: "limits", name: "Limit management", target: { screen: "LimitManagement" } },
    ],
  },
].map((group) => ({ ...group, items: group.items.map((item) => ({ ...item, icon: iconFor({}, item.target), countKey: null })) }));

/** Whether a menu target is the page currently on screen (`routeNames` = names from the root down). */
export function isTargetActive(target, routeNames = [], params = {}) {
  if (!target) return false;
  if (target.tab) {
    if (!routeNames.includes(target.tab)) return false;
    if (target.tab === "Candidates") return (params?.view === "shortlisted") === (target.params?.view === "shortlisted");
    return true;
  }
  if (target.screen === "EntityList") return routeNames.at(-1) === "EntityList" && params?.module === target.params?.module;
  return routeNames.at(-1) === target.screen;
}
