// API modules against a mocked Smart Gateway. Verifies the request bodies match the
// web app's contract and the response handling is sound.
jest.mock('@react-native-async-storage/async-storage');
jest.mock('../src/services/api', () => ({
  gateway: jest.fn(),
  http: jest.fn(),
  apiRequest: jest.fn(),
  fetchGpc: jest.fn(),
  smartGateway: jest.fn(),
}));

import { apiRequest, fetchGpc, gateway } from '../src/services/api';
import { useAuthStore } from '../src/store/authStore';
import { applyForLeave, getLeaveHistory, getMyLeaves, leaveBalancesOf, leaveStatusOf, updateLeaveStatus } from '../src/api/leaves.api';
import { getDailyActivity, markActivity } from '../src/api/dailyActivity.api';
import { createSystemAlert, fetchMyAlerts, respondToAlert, updateSystemAlert } from '../src/api/systemAlerts.api';
import { emptyAlertForm } from '../src/utils/systemAlerts';
import { fetchAttendanceLimits } from '../src/api/limits.api';
import { createIncrement, getPendingIncrement } from '../src/api/increment.api';
import { applicationStage, applyToJob, candidateInterviewStatus, fetchMyInterviews, findCandidate, hiringProgress, needsProfile, salaryRange } from '../src/api/candidate.api';
import { boardState, buildCandidateListRequest, fetchCandidatePage, groupInterviews, isExEmployee, uniqueInterviews } from '../src/api/admin.api';
import { markStepNotified, startResignation } from '../src/api/resignation.api';

// Use React Native's FormData (with getParts) instead of Node's so file parts keep their uri/name/type.
global.FormData = require("react-native/Libraries/Network/FormData").default || require("react-native/Libraries/Network/FormData");

const ok = (records, extra = {}) => ({ success: true, records, total_pages: 1, ...extra });

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'signedIn', user: { email: 'kamal@example.com' }, userInfo: { id: 'emp-1', status: 'employee', phase: 'Employment' } });
});

describe('leaves', () => {
test('leave history reads the employee ledger from hrc_leave_transaction', async () => {    gateway.mockResolvedValue(ok([{ id: 't1', leave_action: 'debit' }], { dropdown_lists: { leave_action: { debit: 'Debit' } } }));    const history = await getLeaveHistory({ employeeId: 'emp-1' });    expect(gateway.mock.calls[0][0]).toMatchObject({ action: 'fetch', module: 'hrc_leave_transaction', filters: { employee_id: 'emp-1' } });    expect(history.records.map((r) => r.id)).toEqual(['t1']);    expect(history.dropdowns.leave_action.debit).toBe('Debit');  });
  test('applyForLeave posts multipart to the hrc entry point with the web field names', async () => {
    fetchGpc.mockResolvedValue({ success: true });
    await applyForLeave({ leave_type: 'Short leave', leave_from: '2026-10-22', leave_to: '2026-10-22', leave_days: 1, description: 'Bank', attachment: { uri: 'file:///a.pdf', name: 'a.pdf', mimeType: 'application/pdf' } });
    const call = fetchGpc.mock.calls[0][0];
    expect(call.params).toEqual({ type: 'create_leave' });
    expect(call.endpoint).toContain('entryPoint=hrc');
    const parts = call.body.getParts();
    const field = (name) => parts.find((part) => part.fieldName === name);
    expect(field('email').string).toBe('kamal@example.com');
    expect(field('candidate_id').string).toBe('emp-1');
    expect(field('status').string).toBe('Applied');
    expect(field('leave_days').string).toBe('1');
    expect(field('attachment')).toMatchObject({ uri: 'file:///a.pdf', name: 'a.pdf', type: 'application/pdf' });
  });

  test('applyForLeave surfaces backend failures', async () => {
    fetchGpc.mockResolvedValue({ success: false, message: 'No balance' });
    await expect(applyForLeave({ leave_type: 'x' })).rejects.toThrow('No balance');
  });

  test('getMyLeaves filters by employee id and updateLeaveStatus validates', async () => {
    gateway.mockResolvedValue(ok([{ id: 'l1', status: 'Applied' }]));
    const records = await getMyLeaves({ employeeId: 'emp-1', email: 'kamal@example.com' });
    expect(records).toHaveLength(1);
    expect(gateway.mock.calls[0][0]).toMatchObject({ action: 'fetch', module: 'hrc_leaves', filters: { employee_id: 'emp-1' } });
    await expect(updateLeaveStatus('l1', 'Maybe')).rejects.toThrow('Accepted or Rejected');
    gateway.mockResolvedValue({ success: true });
    // Like the web, approving needs a reason and an approver, and records the handover and date.
    await expect(updateLeaveStatus('l1', 'Accepted')).rejects.toThrow('reason');
    await expect(updateLeaveStatus('l1', 'Accepted', { reason: 'Balance available' })).rejects.toThrow('approving');
    await updateLeaveStatus('l1', 'Accepted', { reason: ' Balance available ', approvedById: 'emp-1', handoverToId: 'emp-2' });
    expect(gateway).toHaveBeenLastCalledWith({
      action: 'update',
      module: 'hrc_leaves',
      id: 'l1',
      data: { status: 'Accepted', verdict: 'Balance available', approved_by_id: 'emp-1', work_handed_over_to_id: 'emp-2', approved_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
    });
    await updateLeaveStatus('l1', 'Rejected');
    expect(gateway).toHaveBeenLastCalledWith({ action: 'update', module: 'hrc_leaves', id: 'l1', data: { status: 'Rejected' } });
    expect(leaveStatusOf({ status: 'weird' })).toBe('Applied');
    expect(leaveBalancesOf({ available_planned_leaves: '3', available_sick_leaves: '1' }).map((b) => b.available)).toEqual([3, 1]);
  });
});

describe('daily activity', () => {
  test('today lookup and clock actions use the web contract', async () => {
    gateway.mockResolvedValue(ok([{ id: 'd1', login: '10/21/2026 09:12' }]));
    const record = await getDailyActivity();
    expect(record.id).toBe('d1');
    expect(gateway.mock.calls[0][0]).toMatchObject({ module: 'hrc_daily_activity', filters: { name: 'kamal@example.com' }, date_range: 'today' });
    apiRequest.mockResolvedValue({ success: true });
    await markActivity('lunch_in');
    const call = apiRequest.mock.calls[0][0];
    expect(call.endpoint).toBe('https://flight.hrcrm.ai/index.php?entryPoint=hrc&type=daily_activity');
    expect(call.body).toEqual({ email: 'kamal@example.com', action: 'lunch_in' });
    expect(call.headers['X-Api-Key']).toBeDefined();
  });
});

describe('system alerts', () => {
  test('my alerts come from hrc my_alerts with the allowed answers of each type', async () => {
    fetchGpc.mockResolvedValue({ success: true, alerts: [{ id: 'a1', response_type: 'acknowledge' }, { id: 'a2', response_type: 'yes_no', answer: 'yes' }, { id: 'a3', expires_on: '2000-01-01 00:00:00' }] });
    const mine = await fetchMyAlerts();
    expect(fetchGpc.mock.calls[0][0]).toMatchObject({ method: 'POST', params: { type: 'my_alerts' } });
    expect(mine.alerts.map((a) => [a.id, a.allowed_answers, a.responded])).toEqual([['a1', ['acknowledged'], false], ['a2', ['yes', 'no'], true]]);
    expect(mine.pendingCount).toBe(1);
  });

  test('answers go to alert_respond and must be allowed for the alert', async () => {
    fetchGpc.mockResolvedValue({ success: true });
    const alert = { id: 'a1', allowed_answers: ['acknowledged'] };
    await respondToAlert({ alert, answer: 'Acknowledged' });
    expect(fetchGpc.mock.calls[0][0]).toMatchObject({ params: { type: 'alert_respond' }, body: { alert_id: 'a1', answer: 'acknowledged' } });
    await expect(respondToAlert({ alert, answer: 'yes' })).rejects.toThrow();
  });

  test('an alert for selected employees is created inactive, linked, then switched on', async () => {
    gateway.mockResolvedValue({ success: true, id: 'new-1' });
    await createSystemAlert({ ...emptyAlertForm(), name: 'Town hall', message: 'Be there', audience: 'selected', employeeIds: ['e1', 'e2'], responseType: 'acknowledge' });
    const bodies = gateway.mock.calls.map((call) => call[0]);
    expect(bodies[0]).toEqual({
      action: 'create',
      module: 'hrc_system_alert',
      data: { name: 'Town hall', description: '<p>Be there</p>', audience: 'selected', response_type: 'acknowledge', active: 0, expires_on: '' },
    });
    expect(bodies.slice(1, 3).map((b) => [b.action, b.related_module, b.related_id])).toEqual([['add_relationship', 'hrc_employees', 'e1'], ['add_relationship', 'hrc_employees', 'e2']]);
    expect(bodies[3]).toEqual({ action: 'update', module: 'hrc_system_alert', id: 'new-1', data: { active: 1 } });
  });

  test('editing a targeted alert adds and removes only the changed links', async () => {
    gateway.mockResolvedValue({ success: true });
    await updateSystemAlert({ id: 'a1', currentTargetIds: ['e1', 'e2'], values: { ...emptyAlertForm(), name: 'T', message: 'M', audience: 'selected', employeeIds: ['e2', 'e3'] } });
    const bodies = gateway.mock.calls.map((call) => call[0]);
    expect(bodies.slice(0, 2).map((b) => [b.action, b.related_id])).toEqual([['add_relationship', 'e3'], ['remove_relationship', 'e1']]);
    expect(bodies[2]).toMatchObject({ action: 'update', id: 'a1', data: { audience: 'selected', active: 1 } });
  });
});

describe('limits and increments', () => {
  test('attendance limits read the named limit records', async () => {
    gateway.mockResolvedValue(ok([{ name: 'Login Delay', actual_time: '10:00 AM', minutes: '15' }, { name: 'Lunch Out', minutes: '45' }]));
    expect(await fetchAttendanceLimits()).toEqual({ actualLoginTime: '10:00 AM', loginDelayMinutes: 15, lunchOutMinutes: 45 });
  });

  test('increment flow creates a request and tracks unanswered questions', async () => {
    gateway.mockResolvedValueOnce({ success: true, id: 'inc-1' });
    const created = await createIncrement({ email: 'Kamal@Example.com', expectedSalary: '600000' });
    expect(created.id).toBe('inc-1');
    expect(gateway.mock.calls[0][0]).toEqual({ action: 'create', module: 'hrc_increment', data: { name: 'kamal@example.com', description: '600000' } });
    gateway.mockImplementation(async (body) => {
      if (body.module === 'hrc_increment_questions') return ok([{ id: 'q1' }, { id: 'q2' }]);
      if (body.module === 'hrc_increment_replies') return ok([{ id: 'r1', question_id: 'q1', increment_id: 'inc-1' }]);
      return ok([]);
    });
    const pending = await getPendingIncrement('inc-1');
    expect(pending.pendingQuestions.map((q) => q.id)).toEqual(['q2']);
  });
});

describe('candidate', () => {
  test('findCandidate matches the login email exactly', async () => {
    gateway.mockResolvedValue(ok([{ id: 'c1', email1: 'Kamal@Example.com' }]));
    expect((await findCandidate('kamal@example.com')).id).toBe('c1');
    gateway.mockResolvedValue(ok([{ id: 'c2', email1: 'other@example.com' }]));
    await expect(findCandidate('kamal@example.com')).rejects.toThrow('unexpected email');
    expect(needsProfile(null)).toBe(true);
    expect(needsProfile({ id: 'c1', first_name: 'K' })).toBe(false);
  });

  test('applyToJob links the application to the candidate and dedupes', async () => {
    const candidate = { id: 'c1', email1: 'kamal@example.com' };
    gateway.mockImplementation(async (body) => {
      if (body.action === 'fetch_related') return ok([{ id: 'app1', jobid: 'job-9' }]);
      return { success: true, id: 'app2' };
    });
    expect((await applyToJob(candidate, 'job-9')).map((r) => r.id)).toEqual(['app1']);
    const records = await applyToJob(candidate, 'job-10');
    expect(records.at(-1)).toMatchObject({ id: 'app2', jobid: 'job-10', hrc_candidates_hrc_job_applications_1hrc_candidates_ida: 'c1', status: 'applied' });
  });

  test('interviews come through the candidate relationship and are verified', async () => {
    const candidate = { id: 'c1', email1: 'kamal@example.com' };
    gateway.mockResolvedValue(ok([{ id: 'i2', description: 'Round 2', interview_datetime: '2030-01-01 10:00:00', candidate_id: 'c1' }, { id: 'i1', description: 'Round 1', interview_status: 'Pass', candidate_id: 'c1' }]));
    const rounds = await fetchMyInterviews({ candidate, email: 'kamal@example.com' });
    expect(rounds.map((r) => r.round)).toEqual(['Round 1', 'Round 2']);
    expect(gateway.mock.calls[0][0]).toMatchObject({ action: 'fetch_related', module: 'hrc_candidates', id: 'c1', related_module: 'hrc_interviews' });
    gateway.mockResolvedValue(ok([{ id: 'x', candidate_id: 'someone-else' }]));
    await expect(fetchMyInterviews({ candidate, email: 'kamal@example.com' })).rejects.toThrow('did not match');
    await expect(fetchMyInterviews({ candidate, email: 'wrong@example.com' })).rejects.toThrow('could not be verified');
  });

  test('status helpers mirror the web dashboard', () => {
    expect(applicationStage('accepted').label).toBe('Selected');
    expect(applicationStage('rejected_by_hr').tone).toBe('closed');
    expect(candidateInterviewStatus({ interview_status: 'Fail' }).key).toBe('failed');
    expect(candidateInterviewStatus({ interview_datetime: '2030-01-01 10:00:00' }).key).toBe('scheduled');
    const progress = hiringProgress({ candidate: { id: 'c1', hrc_stages_id_c_name: 'Shortlisted' }, applications: [{ status: 'applied' }], interviews: [] });
    expect(progress.steps.map((s) => s.state)).toEqual(['done', 'current', 'upcoming', 'upcoming']);
    expect(salaryRange({ minimum_salary: '20000', maximum_salary: '30000', salary_currency: 'INR' })).toBe('INR 20,000 – 30,000');
  });
});

describe('admin', () => {
  test('candidate list request matches the web filters and paging', async () => {
    const body = buildCandidateListRequest({ page: 2, search: 'kam' });
    expect(body).toMatchObject({ module: 'hrc_candidates', page: 2, per_page: 20, search: 'kam' });
    expect(body.filters).toMatchObject({ employee: 0, hrc_stages_id_c: { nin: ['', 'Unassigned'] } });
    expect(body.search_fields).toEqual(['first_name', 'last_name', 'phone_mobile', 'current_designation', 'title', 'department']);
    // Like the web, an email is matched exactly through filters.email1 instead of the text search.
    const byEmail = buildCandidateListRequest({ search: 'asha@example.com' });
    expect(byEmail.filters.email1).toBe('asha@example.com');
    expect(byEmail.search).toBeUndefined();
    expect(buildCandidateListRequest({ shortlistedOnly: true }).filters).toEqual({ employee: 0, hrc_stages_id_c_name: 'Shortlisted' });
    expect(buildCandidateListRequest({ shortlistedOnly: true, search: 'kam' }).search).toBeUndefined();
    gateway.mockResolvedValue({ success: true, records: [{ id: 'c1' }, { id: 'c2', deleted: '1' }], total: 41, page: 1, total_pages: 3 });
    const page = await fetchCandidatePage({ page: 1 });
    expect(page).toMatchObject({ total: 41, page: 1, pages: 3 });
    expect(page.records).toHaveLength(1);
  });

  test('interview board grouping and states', () => {
    const records = [
      { id: '1', description: 'Round 1', candidate_id: 'c1', job_id: 'j', interview_status: 'Pass', date_modified: '2026-10-01 10:00:00' },
      { id: '2', description: 'Round 2', candidate_id: 'c1', job_id: 'j', interview_datetime: '2030-01-01 10:00:00' },
      { id: '3', description: 'Round 1', candidate_id: 'c2', job_id: 'j', date_modified: '2026-10-02 10:00:00' },
      { id: '4', description: 'Round 1', candidate_id: 'c2', job_id: 'j', date_modified: '2026-10-03 10:00:00' },
    ];
    expect(uniqueInterviews(records).map((r) => r.id).sort()).toEqual(['1', '2', '4']);
    const groups = groupInterviews(records);
    expect(groups.map((g) => g.name)).toEqual(['Round 1', 'Round 2', 'Round 3']);
    expect(groups[0].records.map((r) => r.id)).toEqual(['4']);
    expect(boardState(records[1])).toBe('upcoming');
    expect(boardState(records[3])).toBe('unscheduled');
    expect(boardState(records[0])).toBe('decided');
    expect(isExEmployee({ stage_id_name: 'Ex Employee', hrc_phase_id_name: 'Exit' })).toBe(true);
  });
});

describe('resignation', () => {
  test('reuses an existing record, otherwise creates one keyed by email (web contract)', async () => {
    gateway.mockResolvedValueOnce(ok([{ id: 'r1', name: 'kamal@example.com', tl_token: 'T1' }]));
    expect(await startResignation('kamal@example.com')).toMatchObject({ id: 'r1' });
    expect(gateway).toHaveBeenCalledTimes(1);
    expect(gateway.mock.calls[0][0]).toMatchObject({ action: 'fetch', module: 'hrc_resignation', filters: { name: 'kamal@example.com' } });

    gateway.mockReset();
    gateway
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce({ success: true, record: { id: 'r2', tl_token: 'T2' } });
    expect(await startResignation('kamal@example.com')).toMatchObject({ id: 'r2' });
    expect(gateway.mock.calls[1][0]).toEqual({ action: 'create', module: 'hrc_resignation', data: { name: 'kamal@example.com' } });
  });

  test('marks a step notified with the web field value', async () => {
    gateway.mockResolvedValue({ success: true });
    await markStepNotified('r1', 'notify_tl');
    expect(gateway.mock.calls[0][0]).toEqual({ action: 'update', module: 'hrc_resignation', id: 'r1', data: { notify_tl: '1' } });
  });
});
