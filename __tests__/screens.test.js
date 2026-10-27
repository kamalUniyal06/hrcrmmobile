// Render smoke tests: every screen mounts against a mocked gateway and settles without throwing.
jest.mock('@react-native-async-storage/async-storage');
jest.mock('react-native-safe-area-context');
jest.mock('../src/services/api', () => ({ gateway: jest.fn(), http: jest.fn(), apiRequest: jest.fn(), fetchGpc: jest.fn(), smartGateway: jest.fn() }));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fetchGpc, gateway } from '../src/services/api';
import { useAuthStore } from '../src/store/authStore';
import { ScreenChrome } from '../src/components/ui';

import LoginScreen from '../src/screens/auth/LoginScreen';
import EmployeeHomeScreen from '../src/screens/employee/EmployeeHomeScreen';
import AttendanceScreen from '../src/screens/employee/AttendanceScreen';
import LeaveScreen from '../src/screens/employee/LeaveScreen';
import ApplyLeaveScreen from '../src/screens/employee/ApplyLeaveScreen';
import IncrementScreen from '../src/screens/employee/IncrementScreen';
import ResignationScreen from '../src/screens/employee/ResignationScreen';
import AnnouncementDetailScreen from '../src/screens/employee/AnnouncementDetailScreen';
import AccountScreen from '../src/screens/shared/AccountScreen';
import CandidateHomeScreen from '../src/screens/candidate/CandidateHomeScreen';
import { JobDetailScreen, JobsScreen } from '../src/screens/candidate/JobsScreen';
import InterviewsScreen from '../src/screens/candidate/InterviewsScreen';
import { CandidateProfileEditScreen, CandidateProfileScreen } from '../src/screens/candidate/CandidateProfileScreen';
import AdminHomeScreen from '../src/screens/admin/AdminHomeScreen';
import AdminAttendanceScreen from '../src/screens/admin/AdminAttendanceScreen';
import { SalariesScreen } from '../src/screens/admin/SalariesScreen';
import { LimitManagementScreen } from '../src/screens/admin/LimitManagementScreen';
import { JobPostingsScreen } from '../src/screens/admin/JobPostingsScreen';
import { EntityListScreen } from '../src/screens/admin/EntityScreens';
import AdminDrawer from '../src/components/AdminDrawer';
import { useDrawerStore } from '../src/store/drawerStore';
import { LeaveApprovalsScreen, LeaveDetailScreen } from '../src/screens/admin/LeaveApprovalsScreen';
import { CandidateDetailScreen, CandidatesScreen } from '../src/screens/admin/CandidatesScreen';
import { EmployeeDetailScreen, EmployeesScreen } from '../src/screens/admin/EmployeesScreen';
import SystemAlertsScreen from '../src/screens/admin/SystemAlertsScreen';
import InterviewBoardScreen from '../src/screens/admin/InterviewBoardScreen';
import { IncrementRequestsScreen, OffboardingScreen } from '../src/screens/admin/OffboardingScreen';

const navigation = { navigate: jest.fn(), goBack: jest.fn() };
const route = (params = {}) => ({ params });

// Today's clock-in in the CRM's MM/DD/YYYY HH:mm format, so "Clocked in" holds on any run date.
const now = new Date();
const todayLogin = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()} 09:12`;

// Canned CRM data keyed by module so every screen has something to draw.
const data = {
  hrc_daily_activity: [{ id: 'd1', name: 'kamal@example.com', login: todayLogin, date_entered: todayLogin }],
  hrc_employees: [{ id: 'emp-1', first_name: 'Kamal', last_name: 'Uniyal', email1: 'kamal@example.com', available_planned_leaves: '4', available_sick_leaves: '2', current_designation: 'Developer' }],
  hrc_leaves: [{ id: 'l1', name: 'kamal@example.com', employee_id: 'emp-1', status: 'Applied', type_of_leave: 'Short leave', leave_from: '2026-10-25', leave_to: '2026-10-25', leave_days: '1', date_entered: '2026-10-20 10:00:00' }],
  hrc_holidays: [{ id: 'h1', name: 'Diwali', holiday_date: '10/30/2026' }],
  hrc_limit_management: [{ name: 'Login Delay', actual_time: '9:30 AM', minutes: '30' }],
  hrc_system_alert: [{ id: 'a1', name: 'Town hall', description: 'Please confirm attendance', date_entered: '2026-10-20 10:00:00' }],
  hrc_employee_response: [],
  hrc_increment: [{ id: 'inc-1', name: 'kamal@example.com', description: '600000', date_entered: '2026-10-01 10:00:00' }],
  hrc_increment_questions: [{ id: 'q1', name: 'Why', description: 'Why do you deserve it?' }],
  hrc_increment_replies: [],
  hrc_salaries: [{ id: 's1', offered_salary: '40000' }],
  hrc_candidates: [{ id: 'c1', first_name: 'Asha', last_name: 'Rao', email1: 'kamal@example.com', hrc_stages_id_c_name: 'Shortlisted', status: 'Active', current_designation: 'Designer', description: 'About me' }],
  hrc_job_postings: [{ id: 'job-1', job_title: 'Frontend Developer', job_location: 'Delhi', minimum_salary: '20000', maximum_salary: '30000', description: '<p>Build things</p>', status: 'open', date_entered: '2026-10-01 10:00:00' }],
  hrc_job_applications: [{ id: 'app1', jobid: 'job-1', status: 'applied', name: 'kamal@example.com' }],
  hrc_interviews: [{ id: 'i1', description: 'Round 1', candidate_id: 'c1', name: 'Asha Rao', email: 'kamal@example.com', job_id: 'job-1', interview_datetime: '2030-01-05 10:00:00' }],
  hrc_resignation: [{ id: 'r1', name: 'someone@example.com', status: 'Open', date_entered: '2026-10-01 10:00:00' }],
  hrc_skills: [{ id: 'sk1', name: 'React' }],
  hrc_experience: [{ id: 'ex1', position: 'Dev', company_name: 'Acme', joining_date: '2020-01-01' }],
  hrc_education: [{ id: 'ed1', qualification: 'B.Tech', institution: 'IIT' }],
  Notes: [],
};

function respond(body) {
  if (body.action === 'fetch_related') return { success: true, records: data[body.related_module] || [], total_pages: 1 };
  if (body.action === 'fetch') return { success: true, records: data[body.module] || [], total_pages: 1, total: (data[body.module] || []).length, page: 1 };
  if (body.action === 'get_stats') return { success: true, stats: {} };
  return { success: true, id: 'new-id' };
}

const mounted = [];
afterEach(() => {
  // Unmount so intervals (attendance timer) and queries stop before Jest tears the environment down.
  while (mounted.length) {
    const { tree, client } = mounted.pop();
    act(() => tree.unmount());
    client.clear();
  }
});

function mount(element, { headerShown = false } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  let tree;
  act(() => {
    tree = create(
      <QueryClientProvider client={client}>
        <ScreenChrome.Provider value={{ headerShown }}>{element}</ScreenChrome.Provider>
      </QueryClientProvider>,
    );
  });
  mounted.push({ tree, client });
  return { tree, client };
}

const settle = async () => {
  for (let i = 0; i < 6; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

// Collect every rendered string so assertions can look for visible copy.
function textOf(tree) {
  const out = [];
  const walk = (node) => {
    if (node == null) return;
    if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    walk(node.children);
  };
  walk(tree.toJSON());
  return out.join(" ");
}

function signIn(role) {
  const userInfo = role === 'admin'
    ? { id: 'emp-1', status: 'admin', phase: 'Employment' }
    : role === 'employee'
      ? { id: 'emp-1', status: 'employee', phase: 'Employment' }
      : { id: 'c1', status: 'candidate', phase: 'Hiring' };
  useAuthStore.setState({ status: 'signedIn', user: { email: 'kamal@example.com' }, userInfo, notice: null });
}

beforeEach(() => {
  jest.clearAllMocks();
  gateway.mockImplementation(async (body) => respond(body));
  // hrc entry point: my_alerts returns the canned alerts as this employee's.
  fetchGpc.mockImplementation(async ({ params } = {}) => (params?.type === 'my_alerts' ? { success: true, alerts: data.hrc_system_alert } : { success: true }));
});

describe('auth', () => {
  test('LoginScreen renders both providers', () => {
    useAuthStore.setState({ status: 'signedOut', user: {}, userInfo: {}, notice: 'Your session expired. Please sign in again.' });
    const { tree } = mount(<LoginScreen />);
    const text = textOf(tree);
    expect(text).toContain('Continue with Google');
    expect(text).toContain('Continue with Microsoft');
    expect(text).toContain('session expired');
  });
});

describe('employee screens', () => {
  beforeEach(() => signIn('employee'));

  test('home shows attendance, stats and announcements', async () => {
    const { tree } = mount(<EmployeeHomeScreen navigation={navigation} />);
    await settle();
    const text = textOf(tree);
    expect(text).toContain('Shift time');
    expect(text).toContain('Present');
    expect(text).toContain('Town hall');
    expect(gateway).toHaveBeenCalledWith(expect.objectContaining({ module: 'hrc_daily_activity' }));
  });

  test.each([
    ['Attendance', () => <AttendanceScreen route={route()} />, 'On time'],
    ['Leave', () => <LeaveScreen navigation={navigation} />, 'Annual Leave'],
    ['ApplyLeave', () => <ApplyLeaveScreen navigation={navigation} />, 'Submit leave request'],
    ['Increment', () => <IncrementScreen />, 'Current annual salary'],
    ['Account', () => <AccountScreen navigation={navigation} route={route({ links: [{ icon: 'trending-up-outline', title: 'Increment request', screen: 'Increment' }, { icon: 'exit-outline', title: 'I want to resign', screen: 'Resignation', tone: 'closed' }] })} />, 'I want to resign'],
    ['Resignation', () => <ResignationScreen navigation={navigation} />, 'Are you sure you want to resign?'],
    ['AnnouncementDetail', () => <AnnouncementDetailScreen route={route({ alert: { id: 'a1', name: 'Town hall', description: '<p>Dear All,</p><p>Please confirm attendance</p><table><tr><th>Team</th><th>Members</th></tr><tr><td>Team A</td><td>Kamal</td></tr></table>', date_entered: '2026-10-20 10:00:00' } })} />, 'Please confirm attendance'],
  ])('%s renders', async (_name, render, expected) => {
    const { tree } = mount(render(), { headerShown: true });
    await settle();
    expect(textOf(tree)).toContain(expected);
  });
});

describe('candidate screens', () => {
  beforeEach(() => signIn('candidate'));

  test.each([
    ['Home', () => <CandidateHomeScreen navigation={navigation} />, 'Hiring journey'],
    ['Jobs', () => <JobsScreen navigation={navigation} />, 'Frontend Developer'],
    ['JobDetail', () => <JobDetailScreen navigation={navigation} route={route({ id: 'job-1' })} />, 'Build things'],
    ['Interviews', () => <InterviewsScreen />, 'Round 1'],
    ['Profile', () => <CandidateProfileScreen navigation={navigation} />, 'Asha Rao'],
    ['ProfileEdit', () => <CandidateProfileEditScreen navigation={navigation} />, 'Save changes'],
  ])('%s renders', async (_name, render, expected) => {
    const { tree } = mount(render());
    await settle();
    expect(textOf(tree)).toContain(expected);
  });
});

describe('admin screens', () => {
  beforeEach(() => signIn('admin'));

  test.each([
    ['Home', () => <AdminHomeScreen navigation={navigation} />, 'Needs attention today'],
    ['Attendance', () => <AdminAttendanceScreen navigation={navigation} route={route()} />, 'Kamal Uniyal'],
    ['Salaries', () => <SalariesScreen navigation={navigation} route={route()} />, 'Total offered salary'],
    ['LimitManagement', () => <LimitManagementScreen navigation={navigation} route={route()} />, 'Login Delay'],
    ['JobPostings', () => <JobPostingsScreen navigation={navigation} route={route()} />, 'Frontend Developer'],
    ['Approvals', () => <LeaveApprovalsScreen navigation={navigation} />, 'Kamal Uniyal'],
    ['LeaveDetail', () => <LeaveDetailScreen navigation={navigation} route={route({ id: 'l1' })} />, 'Approve'],
    ['Candidates', () => <CandidatesScreen navigation={navigation} />, 'Asha Rao'],
    ['CandidateDetail', () => <CandidateDetailScreen route={route({ id: 'c1' })} />, 'Round 1'],
    ['Employees', () => <EmployeesScreen navigation={navigation} />, 'Kamal Uniyal'],
    ['EmployeeDetail', () => <EmployeeDetailScreen navigation={navigation} route={route({ id: 'emp-1' })} />, 'Leave balance'],
    ['SystemAlerts', () => <SystemAlertsScreen />, 'Town hall'],
    ['InterviewBoard', () => <InterviewBoardScreen />, 'Round 1'],
    ['IncrementRequests', () => <IncrementRequestsScreen />, '6,00,000'],
    ['Offboarding', () => <OffboardingScreen />, 'someone@example.com'],
  ])('%s renders', async (_name, render, expected) => {
    const { tree } = mount(render());
    await settle();
    expect(textOf(tree)).toContain(expected);
  });

  test('Home shows the hiring, increment, schedule and feed cards', async () => {
    const { tree } = mount(<AdminHomeScreen navigation={navigation} />);
    await settle();
    const text = textOf(tree);
    expect(text).toContain('Hiring pipeline');
    expect(text).toContain('Asha Rao');
    expect(text).toContain('Increment requests');
    expect(text).toContain('Upcoming');
    expect(text).toContain('Announcements');
    // The tasks & activity card opens on "Upcoming tasks" (sample data, like the web); switch to the activity log.
    expect(text).toContain('Tasks & activity');
    expect(text).toContain('Sample data');
    const activityTab = tree.root.findAll((node) => node.props.children === 'Activity log')[0];
    let pressable = activityTab;
    while (pressable && typeof pressable.props.onPress !== 'function') pressable = pressable.parent;
    await act(async () => { pressable.props.onPress(); });
    expect(textOf(tree)).toContain('Kamal Uniyal checked in');
    // The month's candidates are fetched with the "All" list filters, 100 per page, like the web.
    expect(gateway).toHaveBeenCalledWith(expect.objectContaining({
      module: 'hrc_candidates', date_range: 'custom', date_field: 'date_entered', per_page: 100,
      filters: expect.objectContaining({ employee: 0, hrc_stages_id_c: { nin: ['', 'Unassigned'] } }),
    }));
  });

  test('screens show an error state when the gateway fails', async () => {
    gateway.mockRejectedValue(new Error('Gateway down'));
    const { tree } = mount(<LeaveApprovalsScreen navigation={navigation} />);
    await settle();
    expect(textOf(tree)).toContain('Gateway down');
  });
});

describe('admin navigation', () => {
  beforeEach(() => signIn('admin'));

  test('the side menu falls back to the standard menu when the layout cannot load', async () => {
    useDrawerStore.setState({ open: true });
    const { tree } = mount(<AdminDrawer />);
    await settle();
    const text = textOf(tree);
    expect(text).toContain('Showing the standard menu');
    expect(text).toContain('Salary management');
    expect(text).toContain('kamal@example.com');
    useDrawerStore.setState({ open: false });
  });

  test('a CRM module list mounts for any sidebar module', async () => {
    const nav = { ...navigation, setOptions: jest.fn(), addListener: jest.fn(() => () => {}) };
    const { tree } = mount(<EntityListScreen navigation={nav} route={route({ module: 'hrc_skills', title: 'Skills' })} />, { headerShown: true });
    await settle();
    expect(tree.toJSON()).toBeTruthy();
  });
});
