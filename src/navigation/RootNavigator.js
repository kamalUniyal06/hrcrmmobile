import { Pressable } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { colors } from "../theme";
import { ScreenChrome } from "../components/ui";
import AdminDrawer from "../components/AdminDrawer";
import MenuButton from "../components/MenuButton";
import AppHeader from "../components/AppHeader";
import AppTabBar from "../components/AppTabBar";
import { useDrawerStore } from "../store/drawerStore";
import { navigationRef } from "./navigationRef";
import { selectRole, useAuthStore } from "../store/authStore";
import LoginScreen from "../screens/auth/LoginScreen";
import EmployeeHomeScreen from "../screens/employee/EmployeeHomeScreen";
import AttendanceScreen from "../screens/employee/AttendanceScreen";
import LeaveScreen from "../screens/employee/LeaveScreen";
import ApplyLeaveScreen from "../screens/employee/ApplyLeaveScreen";
import IncrementScreen from "../screens/employee/IncrementScreen";
import ResignationScreen from "../screens/employee/ResignationScreen";
import AnnouncementDetailScreen from "../screens/employee/AnnouncementDetailScreen";
import AccountScreen from "../screens/shared/AccountScreen";
import MyProfileScreen from "../screens/shared/MyProfileScreen";
import MyAlertsScreen from "../screens/shared/MyAlertsScreen";
import MyApplicationsScreen from "../screens/candidate/MyApplicationsScreen";
import CandidateRelatedEditScreen from "../screens/candidate/CandidateRelatedEditScreen";
import CandidateResumeScreen from "../screens/candidate/CandidateResumeScreen";
import CandidateGovernmentIdScreen from "../screens/candidate/CandidateGovernmentIdScreen";
import CandidateHomeScreen from "../screens/candidate/CandidateHomeScreen";
import { JobDetailScreen, JobsScreen } from "../screens/candidate/JobsScreen";
import InterviewsScreen from "../screens/candidate/InterviewsScreen";
import { CandidateProfileEditScreen, CandidateProfileScreen } from "../screens/candidate/CandidateProfileScreen";
import AdminHomeScreen from "../screens/admin/AdminHomeScreen";
import AdminAttendanceScreen from "../screens/admin/AdminAttendanceScreen";
import { SalariesScreen, SalaryDetailScreen } from "../screens/admin/SalariesScreen";
import { LimitEditScreen, LimitManagementScreen } from "../screens/admin/LimitManagementScreen";
import { JobPostingDetailScreen, JobPostingFormScreen, JobPostingsScreen } from "../screens/admin/JobPostingsScreen";
import { EntityDetailScreen, EntityFormScreen, EntityListScreen } from "../screens/admin/EntityScreens";
import { LeaveApprovalsScreen, LeaveDetailScreen } from "../screens/admin/LeaveApprovalsScreen";
import { CandidateDetailScreen, CandidatesScreen } from "../screens/admin/CandidatesScreen";
import { EmployeeDetailScreen, EmployeeEditScreen, EmployeesScreen } from "../screens/admin/EmployeesScreen";
import SystemAlertsScreen from "../screens/admin/SystemAlertsScreen";
import InterviewBoardScreen from "../screens/admin/InterviewBoardScreen";
import { IncrementRequestDetailScreen, IncrementRequestsScreen, OffboardingDetailScreen, OffboardingScreen } from "../screens/admin/OffboardingScreen";

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, primary: colors.primary, background: colors.background, card: colors.card, text: colors.foreground, border: colors.border },
};

const stackOptions = {
  headerTintColor: colors.navy,
  // Screen titles read as headings: bold navy, 20pt.
  headerTitleStyle: { fontWeight: "600", fontSize: 20, color: colors.navy },
  headerStyle: { backgroundColor: colors.background },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.background },
};

// Tab root screens with `centerTitle` (Profile) get a centred, larger, bold navy title,
// matching the app's other titles (home "HRCRM" bar, banner headings).
const centeredTitleOptions = {
  headerTitleAlign: "center",
  headerTitleStyle: { fontWeight: "600", fontSize: 22, color: colors.navy },
};

const Tab = createBottomTabNavigator();
const AuthStack = createNativeStackNavigator();

const ICONS = {
  Home: ["home", "home-outline"],
  Attendance: ["calendar", "calendar-outline"],
  Leave: ["document-text", "document-text-outline"],
  Jobs: ["briefcase", "briefcase-outline"],
  Interviews: ["people", "people-outline"],
  Profile: ["person-circle", "person-circle-outline"],
  Approvals: ["document-text", "document-text-outline"],
  Candidates: ["person-add", "person-add-outline"],
  People: ["people", "people-outline"],
};

const tabOptions = () => ({ headerShown: false });
const renderTabBar = (props) => <AppTabBar {...props} icons={ICONS} />;

const Stack = createNativeStackNavigator();

// Each screen is wrapped once (at module load) so <Screen> knows whether a native header is above it.
function withChrome(Component, headerShown, extra) {
  const value = { headerShown, ...extra };
  return function ChromedScreen(props) {
    return (
      <ScreenChrome.Provider value={value}>
        <Component {...props} />
      </ScreenChrome.Provider>
    );
  };
}

// The side-menu button always sits on the left, like the admin top bar.
const menuHeaderLeft = () => <MenuButton style={{ marginLeft: -6, marginRight: 4 }} />;

// Back arrow that returns to the screen the page was opened from (the dashboard if there is none).
const backHomeLeft = (navigation) => () => (
  <Pressable
    onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("AdminTabs", { screen: "Home" }))}
    hitSlop={10}
    accessibilityRole="button"
    accessibilityLabel="Back"
    style={({ pressed }) => [{ width: 40, height: 40, marginLeft: -6, marginRight: 4, alignItems: "center", justifyContent: "center" }, pressed && { opacity: 0.6 }]}
  >
    <Ionicons name="arrow-back" size={24} color={colors.navy} />
  </Pressable>
);

// `params` sets a screen's initial params, `getId` keeps one screen per id (e.g. per CRM module),
// `menu` marks a side-menu destination: opened from the menu (`fromMenu` param) its header shows the
// menu button; opened from a card or button it keeps the normal back arrow. `backHome` puts a
// custom back arrow there that returns to the previous screen.
function stack(definitions, initialParams) {
  const screens = definitions.map((definition) => ({ ...definition, headerShown: definition.headerShown ?? true, component: withChrome(definition.component, definition.headerShown ?? true) }));
  return function StackNavigator() {
    return (
      <Stack.Navigator screenOptions={stackOptions}>
        {screens.map(({ name, component, title, headerShown, centerTitle, params, getId, menu, backHome }, index) => (
          <Stack.Screen
            key={name}
            name={name}
            component={component}
            getId={getId}
            options={({ navigation, route }) => ({
              title,
              headerShown,
              ...(centerTitle ? centeredTitleOptions : null),
              ...(menu && route.params?.fromMenu ? { headerLeft: menuHeaderLeft } : null),
              ...(backHome ? { headerLeft: backHomeLeft(navigation), headerBackVisible: false } : null),
            })}
            initialParams={params ?? (index === 0 ? initialParams : undefined)}
          />
        ))}
      </Stack.Navigator>
    );
  };
}

// ── Employee ────────────────────────────────────────────────────────────────
const EmployeeHomeStack = stack([
  { name: "EmployeeHome", component: EmployeeHomeScreen, headerShown: false },
  { name: "AnnouncementDetail", component: AnnouncementDetailScreen, title: "Announcement" },
  { name: "MyAlerts", component: MyAlertsScreen, title: "My alerts" },
]);
const EmployeeAttendanceStack = stack([{ name: "AttendanceCalendar", component: AttendanceScreen, headerShown: false }]);
const EmployeeLeaveStack = stack([
  { name: "LeaveOverview", component: LeaveScreen, headerShown: false },
  { name: "ApplyLeave", component: ApplyLeaveScreen, title: "Apply for leave" },
]);
const EmployeeProfileStack = stack(
  [
    { name: "Account", component: AccountScreen, title: "Profile Screen", centerTitle: true },
    { name: "MyProfile", component: MyProfileScreen, title: "My profile" },
    { name: "Increment", component: IncrementScreen, title: "Increment request" },
    { name: "Resignation", component: ResignationScreen, title: "Resignation" },
  ],
  {
    links: [
      { icon: "trending-up-outline", title: "Increment request", subtitle: "Ask for a salary revision", screen: "Increment" },
      { icon: "exit-outline", title: "I want to resign", subtitle: "Start approval process", screen: "Resignation", tone: "closed" },
    ],
  },
);

function EmployeeTabs() {
  return (
    <Tab.Navigator screenOptions={tabOptions} tabBar={renderTabBar}>
      <Tab.Screen name="Home" component={EmployeeHomeStack} />
      <Tab.Screen name="Attendance" component={EmployeeAttendanceStack} />
      <Tab.Screen name="Leave" component={EmployeeLeaveStack} />
      <Tab.Screen name="Profile" component={EmployeeProfileStack} />
    </Tab.Navigator>
  );
}

// ── Candidate ───────────────────────────────────────────────────────────────
const CandidateHomeStack = stack([
  { name: "CandidateHome", component: CandidateHomeScreen, headerShown: false },
  { name: "MyApplications", component: MyApplicationsScreen, title: "My applications" },
]);
const CandidateJobsStack = stack([
  { name: "JobList", component: JobsScreen, headerShown: false },
  { name: "JobDetail", component: JobDetailScreen, title: "Job details" },
]);
const CandidateInterviewsStack = stack([{ name: "InterviewList", component: InterviewsScreen, headerShown: false }]);
const CandidateProfileStack = stack([
  { name: "CandidateProfile", component: CandidateProfileScreen, title: "Profile Screen", centerTitle: true },
  { name: "CandidateProfileEdit", component: CandidateProfileEditScreen, title: "Edit profile" },
  { name: "CandidateRelatedEdit", component: CandidateRelatedEditScreen, title: "Edit section" },
  { name: "CandidateResume", component: CandidateResumeScreen, title: "Upload resume" },
  { name: "CandidateGovernmentId", component: CandidateGovernmentIdScreen, title: "Government ID" },
]);

function CandidateTabs() {
  return (
    <Tab.Navigator screenOptions={tabOptions} tabBar={renderTabBar}>
      <Tab.Screen name="Home" component={CandidateHomeStack} />
      <Tab.Screen name="Jobs" component={CandidateJobsStack} />
      <Tab.Screen name="Interviews" component={CandidateInterviewsStack} />
      <Tab.Screen name="Profile" component={CandidateProfileStack} />
    </Tab.Navigator>
  );
}

// ── Admin ───────────────────────────────────────────────────────────────────
// Tab screens sit under the shared HRCRM app bar (menu button, brand, profile), which handles the top inset.
const underAppBar = (Component) => withChrome(Component, true, { appHeader: true });
const AdminHomeTab = underAppBar(AdminHomeScreen);
const AdminAttendanceTab = underAppBar(AdminAttendanceScreen);
const AdminApprovalsTab = underAppBar(LeaveApprovalsScreen);
const AdminCandidatesTab = underAppBar(CandidatesScreen);
const AdminPeopleTab = underAppBar(EmployeesScreen);
const adminTabOptions = (props) => ({ ...tabOptions(props), headerShown: true, header: () => <AppHeader /> });

function AdminTabs() {
  return (
    <Tab.Navigator screenOptions={adminTabOptions} tabBar={renderTabBar}>
      <Tab.Screen name="Home" component={AdminHomeTab} />
      <Tab.Screen name="Attendance" component={AdminAttendanceTab} />
      <Tab.Screen name="Approvals" component={AdminApprovalsTab} options={{ title: "Leave" }} />
      <Tab.Screen name="Candidates" component={AdminCandidatesTab} />
      {/* Route stays "People" (menu links and deep links use it); the tab reads "Employees". */}
      <Tab.Screen name="People" component={AdminPeopleTab} options={{ tabBarLabel: "Employees", title: "Employees" }} />
    </Tab.Navigator>
  );
}

// Every page the side menu opens sits above the tabs, with a back button and the menu button.
const AdminRootStack = stack([
  { name: "AdminTabs", component: AdminTabs, headerShown: false },
  { name: "LeaveDetail", component: LeaveDetailScreen, title: "Leave request" },
  { name: "CandidateDetail", component: CandidateDetailScreen, title: "Candidate" },
  { name: "EmployeeDetail", component: EmployeeDetailScreen, title: "Employee" },
  { name: "EmployeeEdit", component: EmployeeEditScreen, title: "Edit employee" },
  { name: "EmployeeAttendance", component: AttendanceScreen, title: "Attendance" },
  { name: "Salaries", component: SalariesScreen, title: "Salary management", menu: true },
  { name: "SalaryDetail", component: SalaryDetailScreen, title: "Salary details" },
  { name: "LimitManagement", component: LimitManagementScreen, title: "Limit management", menu: true },
  { name: "LimitEdit", component: LimitEditScreen, title: "Edit limit" },
  { name: "JobPostings", component: JobPostingsScreen, title: "Job postings", menu: true },
  { name: "JobPostingDetail", component: JobPostingDetailScreen, title: "Job posting" },
  { name: "JobPostingForm", component: JobPostingFormScreen, title: "New job posting" },
  { name: "EntityList", component: EntityListScreen, title: "Records", menu: true, getId: ({ params }) => params?.module },
  { name: "EntityDetail", component: EntityDetailScreen, title: "Record" },
  { name: "EntityForm", component: EntityFormScreen, title: "Record" },
  { name: "InterviewBoard", component: InterviewBoardScreen, title: "Interviews", menu: true },
  { name: "SystemAlerts", component: SystemAlertsScreen, title: "Announcements", menu: true },
  { name: "AnnouncementDetail", component: AnnouncementDetailScreen, title: "Announcement" },
  { name: "MyAlerts", component: MyAlertsScreen, title: "My alerts" },
  { name: "IncrementRequests", component: IncrementRequestsScreen, title: "Increment management", menu: true },
  { name: "IncrementRequestDetail", component: IncrementRequestDetailScreen, title: "Increment request" },
  { name: "Offboarding", component: OffboardingScreen, title: "Offboarding", menu: true },
  { name: "OffboardingDetail", component: OffboardingDetailScreen, title: "Offboarding case" },
  { name: "MyAttendance", component: AttendanceScreen, title: "My attendance", menu: true },
  { name: "MyLeave", component: LeaveScreen, title: "My leave", menu: true },
  { name: "ApplyLeave", component: ApplyLeaveScreen, title: "Apply for leave" },
  { name: "Increment", component: IncrementScreen, title: "Increment request", menu: true },
  { name: "Resignation", component: ResignationScreen, title: "Resignation" },
  { name: "MyProfile", component: MyProfileScreen, title: "My profile" },
  {
    name: "Account",
    component: AccountScreen,
    title: "Profile",
    // No menu here: a back arrow to the dashboard, with the title centred.
    backHome: true,
    centerTitle: true,
    params: {
      links: [
        { icon: "calendar-outline", title: "My attendance", subtitle: "Your own calendar", screen: "MyAttendance" },
        { icon: "document-text-outline", title: "My leave", subtitle: "Your balance and requests", screen: "MyLeave" },
        { icon: "trending-up-outline", title: "My increment request", subtitle: "Ask for a salary revision", screen: "Increment" },
        // Web Profile "Employee services": resigning is offered only to admins who are also employees.
        { icon: "exit-outline", title: "I want to resign", subtitle: "Start approval process", screen: "Resignation", tone: "closed", employeeOnly: true },
      ],
    },
  },
]);

// The edge swipe opens the menu only on the tab screens; on pushed pages it would fight the back gesture.
const allowMenuSwipe = (state) => {
  const root = state?.routes?.[state.index ?? 0]?.name;
  useDrawerStore.getState().setSwipeEnabled(!root || root === "AdminTabs");
};

export default function RootNavigator() {
  const status = useAuthStore((state) => state.status);
  const role = useAuthStore(selectRole);
  const signedIn = status === "signedIn";
  return (
    <NavigationContainer theme={navTheme} ref={navigationRef} onStateChange={allowMenuSwipe}>
      {signedIn ? (
        role === "admin" ? <AdminRootStack /> : role === "employee" ? <EmployeeTabs /> : <CandidateTabs />
      ) : (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Login" component={LoginScreen} />
        </AuthStack.Navigator>
      )}
      {signedIn && role === "admin" ? <AdminDrawer /> : null}
    </NavigationContainer>
  );
}
