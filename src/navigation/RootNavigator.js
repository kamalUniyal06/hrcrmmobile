import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";
import { ScreenChrome } from "../components/ui";
import { selectRole, useAuthStore } from "../store/authStore";
import LoginScreen from "../screens/auth/LoginScreen";
import EmployeeHomeScreen from "../screens/employee/EmployeeHomeScreen";
import AttendanceScreen from "../screens/employee/AttendanceScreen";
import LeaveScreen from "../screens/employee/LeaveScreen";
import ApplyLeaveScreen from "../screens/employee/ApplyLeaveScreen";
import IncrementScreen from "../screens/employee/IncrementScreen";
import AccountScreen from "../screens/shared/AccountScreen";
import CandidateHomeScreen from "../screens/candidate/CandidateHomeScreen";
import { JobDetailScreen, JobsScreen } from "../screens/candidate/JobsScreen";
import InterviewsScreen from "../screens/candidate/InterviewsScreen";
import { CandidateProfileEditScreen, CandidateProfileScreen } from "../screens/candidate/CandidateProfileScreen";
import AdminHomeScreen from "../screens/admin/AdminHomeScreen";
import { LeaveApprovalsScreen, LeaveDetailScreen } from "../screens/admin/LeaveApprovalsScreen";
import { CandidateDetailScreen, CandidatesScreen } from "../screens/admin/CandidatesScreen";
import { EmployeeDetailScreen, EmployeesScreen } from "../screens/admin/EmployeesScreen";
import SystemAlertsScreen from "../screens/admin/SystemAlertsScreen";
import InterviewBoardScreen from "../screens/admin/InterviewBoardScreen";
import { IncrementRequestsScreen, OffboardingScreen } from "../screens/admin/OffboardingScreen";

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, primary: colors.primary, background: colors.background, card: colors.card, text: colors.foreground, border: colors.border },
};

const stackOptions = {
  headerTintColor: colors.foreground,
  headerTitleStyle: { fontWeight: "600" },
  headerStyle: { backgroundColor: colors.background },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.background },
};

const Tab = createBottomTabNavigator();
const AuthStack = createNativeStackNavigator();

const ICONS = {
  Home: ["home", "home-outline"],
  Attendance: ["calendar", "calendar-outline"],
  Leave: ["sunny", "sunny-outline"],
  Jobs: ["briefcase", "briefcase-outline"],
  Interviews: ["people", "people-outline"],
  Profile: ["person-circle", "person-circle-outline"],
  Approvals: ["checkmark-done-circle", "checkmark-done-circle-outline"],
  Candidates: ["person-add", "person-add-outline"],
  People: ["people-circle", "people-circle-outline"],
  More: ["grid", "grid-outline"],
};

const tabOptions = ({ route }) => ({
  headerShown: false,
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.mutedForeground,
  tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
  tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
  tabBarIcon: ({ focused, color, size }) => <Ionicons name={ICONS[route.name]?.[focused ? 0 : 1] || "ellipse"} size={size} color={color} />,
});

const Stack = createNativeStackNavigator();

// Each screen is wrapped once (at module load) so <Screen> knows whether a native header is above it.
function withChrome(Component, headerShown) {
  const value = { headerShown };
  return function ChromedScreen(props) {
    return (
      <ScreenChrome.Provider value={value}>
        <Component {...props} />
      </ScreenChrome.Provider>
    );
  };
}

function stack(definitions, initialParams) {
  const screens = definitions.map((definition) => ({ ...definition, headerShown: definition.headerShown ?? true, component: withChrome(definition.component, definition.headerShown ?? true) }));
  return function StackNavigator() {
    return (
      <Stack.Navigator screenOptions={stackOptions}>
        {screens.map(({ name, component, title, headerShown }, index) => (
          <Stack.Screen key={name} name={name} component={component} options={{ title, headerShown }} initialParams={index === 0 ? initialParams : undefined} />
        ))}
      </Stack.Navigator>
    );
  };
}

// ── Employee ────────────────────────────────────────────────────────────────
const EmployeeHomeStack = stack([
  { name: "EmployeeHome", component: EmployeeHomeScreen, headerShown: false },
]);
const EmployeeAttendanceStack = stack([{ name: "AttendanceCalendar", component: AttendanceScreen, headerShown: false }]);
const EmployeeLeaveStack = stack([
  { name: "LeaveOverview", component: LeaveScreen, headerShown: false },
  { name: "ApplyLeave", component: ApplyLeaveScreen, title: "Apply for leave" },
]);
const EmployeeMoreStack = stack(
  [
    { name: "Account", component: AccountScreen, title: "More" },
    { name: "Increment", component: IncrementScreen, title: "Increment request" },
  ],
  {
    links: [
      { icon: "trending-up-outline", title: "Increment request", subtitle: "Ask for a salary revision", screen: "Increment" },
    ],
  },
);

function EmployeeTabs() {
  return (
    <Tab.Navigator screenOptions={tabOptions}>
      <Tab.Screen name="Home" component={EmployeeHomeStack} />
      <Tab.Screen name="Attendance" component={EmployeeAttendanceStack} />
      <Tab.Screen name="Leave" component={EmployeeLeaveStack} />
      <Tab.Screen name="More" component={EmployeeMoreStack} />
    </Tab.Navigator>
  );
}

// ── Candidate ───────────────────────────────────────────────────────────────
const CandidateHomeStack = stack([{ name: "CandidateHome", component: CandidateHomeScreen, headerShown: false }]);
const CandidateJobsStack = stack([
  { name: "JobList", component: JobsScreen, headerShown: false },
  { name: "JobDetail", component: JobDetailScreen, title: "Job details" },
]);
const CandidateInterviewsStack = stack([{ name: "InterviewList", component: InterviewsScreen, headerShown: false }]);
const CandidateProfileStack = stack([
  { name: "CandidateProfile", component: CandidateProfileScreen, title: "Profile" },
  { name: "CandidateProfileEdit", component: CandidateProfileEditScreen, title: "Edit profile" },
]);

function CandidateTabs() {
  return (
    <Tab.Navigator screenOptions={tabOptions}>
      <Tab.Screen name="Home" component={CandidateHomeStack} />
      <Tab.Screen name="Jobs" component={CandidateJobsStack} />
      <Tab.Screen name="Interviews" component={CandidateInterviewsStack} />
      <Tab.Screen name="Profile" component={CandidateProfileStack} />
    </Tab.Navigator>
  );
}

// ── Admin ───────────────────────────────────────────────────────────────────
const AdminHomeStack = stack([{ name: "AdminHome", component: AdminHomeScreen, headerShown: false }]);
const AdminApprovalsStack = stack([
  { name: "LeaveApprovals", component: LeaveApprovalsScreen, headerShown: false },
  { name: "LeaveDetail", component: LeaveDetailScreen, title: "Leave request" },
]);
const AdminCandidatesStack = stack([
  { name: "CandidateList", component: CandidatesScreen, headerShown: false },
  { name: "CandidateDetail", component: CandidateDetailScreen, title: "Candidate" },
]);
const AdminPeopleStack = stack([
  { name: "EmployeeList", component: EmployeesScreen, headerShown: false },
  { name: "EmployeeDetail", component: EmployeeDetailScreen, title: "Employee" },
  { name: "EmployeeAttendance", component: AttendanceScreen, title: "Attendance" },
]);
const AdminMoreStack = stack(
  [
    { name: "Account", component: AccountScreen, title: "More" },
    { name: "InterviewBoard", component: InterviewBoardScreen, title: "Interviews" },
    { name: "SystemAlerts", component: SystemAlertsScreen, title: "System alerts" },
    { name: "IncrementRequests", component: IncrementRequestsScreen, title: "Increment requests" },
    { name: "Offboarding", component: OffboardingScreen, title: "Offboarding" },
    { name: "MyAttendance", component: AttendanceScreen, title: "My attendance" },
    { name: "MyLeave", component: LeaveScreen, title: "My leave" },
    { name: "ApplyLeave", component: ApplyLeaveScreen, title: "Apply for leave" },
    { name: "Increment", component: IncrementScreen, title: "Increment request" },
  ],
  {
    links: [
      { icon: "people-outline", title: "Interviews", subtitle: "Round-by-round board with decisions", screen: "InterviewBoard" },
      { icon: "megaphone-outline", title: "System alerts", subtitle: "Publish notices and see responses", screen: "SystemAlerts" },
      { icon: "trending-up-outline", title: "Increment requests", subtitle: "Who asked and how far they got", screen: "IncrementRequests" },
      { icon: "exit-outline", title: "Offboarding", subtitle: "Open resignation cases", screen: "Offboarding" },
      { icon: "calendar-outline", title: "My attendance", subtitle: "Your own calendar", screen: "MyAttendance" },
      { icon: "sunny-outline", title: "My leave", subtitle: "Your balance and requests", screen: "MyLeave" },
    ],
  },
);

function AdminTabs() {
  return (
    <Tab.Navigator screenOptions={tabOptions}>
      <Tab.Screen name="Home" component={AdminHomeStack} />
      <Tab.Screen name="Approvals" component={AdminApprovalsStack} />
      <Tab.Screen name="Candidates" component={AdminCandidatesStack} />
      <Tab.Screen name="People" component={AdminPeopleStack} />
      <Tab.Screen name="More" component={AdminMoreStack} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const status = useAuthStore((state) => state.status);
  const role = useAuthStore(selectRole);
  return (
    <NavigationContainer theme={navTheme}>
      {status === "signedIn" ? (
        role === "admin" ? <AdminTabs /> : role === "employee" ? <EmployeeTabs /> : <CandidateTabs />
      ) : (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Login" component={LoginScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}
