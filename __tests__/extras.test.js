// Alert history, Teams presence, generic list stats/filters/actions and the offline banner.
jest.mock('@react-native-async-storage/async-storage');
jest.mock('react-native-safe-area-context');
jest.mock('../src/services/api', () => ({ gateway: jest.fn(), http: jest.fn(), apiRequest: jest.fn(), fetchGpc: jest.fn(), smartGateway: jest.fn() }));
jest.mock('../src/services/crmAuth', () => ({ ...jest.requireActual('../src/services/crmAuth'), getCrmToken: jest.fn(async () => 'tok-1'), clearCrmToken: jest.fn() }));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiRequest, fetchGpc, http } from '../src/services/api';
import { clearCrmToken, getCrmToken } from '../src/services/crmAuth';
import { useAuthStore } from '../src/store/authStore';
import { fetchTeamsDay, fetchTeamsLive, fetchTeamsReport, fetchTeamsTimeline, teamsRetry } from '../src/api/teamsPresence.api';
import {
  indexPresence, istMinutes, onlineThatDay, presenceBucket, presenceForRow, presenceLabel, presenceStatus, teamsClock, teamsErrorText, timelineWindow, TEAMS_NO_ACCESS,
} from '../src/utils/teamsPresence';
import { pastAlerts, splitMyAlerts } from '../src/utils/myAlerts';
import {
  activeFilterCount, buildStatsQueries, evaluateCondition, filterColumnsOf, isActionDisabled, isActionVisible, isStatusActive, layoutActions,
  mobileRouteFor, normalizeStatuses, resolveRequest, resolveTemplate, sortableColumns, statusCount, toggleStatusFilters,
} from '../src/utils/entityList';
import { fetchEntityStats, runActionRequest } from '../src/api/entityActions.api';
import { isNetworkError, useNetworkStore } from '../src/store/networkStore';
import { probeConnection, retryDelay, watchQueryClient } from '../src/components/OfflineBanner';
import { TeamsChip } from '../src/components/attendance/TeamsPresence';
import { PendingAlertsCard } from '../src/components/AlertsPrompt';
import MyAlertsScreen from '../src/screens/shared/MyAlertsScreen';

beforeEach(() => {
  jest.clearAllMocks();
  useNetworkStore.setState({ offline: false, changedAt: 0 });
});

/* ── Teams presence ─────────────────────────────────────────────────── */

describe('teams presence api', () => {
  test('live / report / timeline hit the teams_presence entry point with the CRM bearer token', async () => {
    apiRequest.mockResolvedValue({ success: true, employees: [] });
    await fetchTeamsLive();
    await fetchTeamsReport({ from: '2026-10-20', to: '2026-10-20', employeeId: 'emp-1' });
    await fetchTeamsTimeline({ employeeId: 'emp-1', date: '2026-10-20' });
    const calls = apiRequest.mock.calls.map(([call]) => call);
    expect(calls[0]).toMatchObject({ endpoint: 'https://flight.hrcrm.ai/index.php', params: { entryPoint: 'teams_presence', action: 'live' }, headers: { Authorization: 'Bearer tok-1' } });
    expect(calls[1].params).toEqual({ entryPoint: 'teams_presence', action: 'report', from: '2026-10-20', to: '2026-10-20', employee_id: 'emp-1' });
    expect(calls[2].params).toEqual({ entryPoint: 'teams_presence', action: 'timeline', employee_id: 'emp-1', date: '2026-10-20' });
  });

  test('report without an employee leaves employee_id out; a past day reads records as employees', async () => {
    apiRequest.mockResolvedValue({ success: true, records: [{ employee_id: 'e1' }] });
    expect(await fetchTeamsDay('2026-10-19', false)).toEqual({ employees: [{ employee_id: 'e1' }] });
    expect(apiRequest.mock.calls[0][0].params).toEqual({ entryPoint: 'teams_presence', action: 'report', from: '2026-10-19', to: '2026-10-19' });
  });

  test('a 401 clears the token and retries once; a 403 keeps its status', async () => {
    const unauthorized = Object.assign(new Error('401'), { response: { status: 401, data: {} } });
    apiRequest.mockRejectedValueOnce(unauthorized).mockResolvedValueOnce({ success: true, employees: [] });
    await fetchTeamsLive();
    expect(clearCrmToken).toHaveBeenCalledTimes(1);
    expect(getCrmToken).toHaveBeenCalledTimes(2);

    apiRequest.mockRejectedValue(Object.assign(new Error('403'), { response: { status: 403, data: { success: false, error: 'No access' } } }));
    await expect(fetchTeamsLive()).rejects.toMatchObject({ message: 'No access', status: 403 });
  });

  test('success:false is an error; access errors are not retried', async () => {
    apiRequest.mockResolvedValue({ success: false, error: 'Collector down' });
    await expect(fetchTeamsLive()).rejects.toThrow('Collector down');
    expect(teamsRetry(0, { status: 403 })).toBe(false);
    expect(teamsRetry(1, { status: 500 })).toBe(true);
    expect(teamsRetry(2, { status: 500 })).toBe(false);
  });
});

describe('teams presence utils', () => {
  test('buckets, labels and status text', () => {
    expect(presenceBucket('DoNotDisturb')).toBe('busy');
    expect(presenceBucket('BeRightBack')).toBe('away');
    expect(presenceBucket('Whatever')).toBe('unknown');
    expect(presenceLabel('InAMeeting')).toBe('In a meeting');
    expect(presenceStatus({ availability: 'Busy', activity: 'InACall' })).toBe('In a call');
    expect(presenceStatus({ availability: 'Away', activity: 'Away' })).toBe('Away');
    expect(presenceStatus({})).toBe('Unknown');
  });

  test('rows find their record by employee id, then by email', () => {
    const index = indexPresence([{ employee_id: 'e1', email: 'A@x.com' }, { email: 'b@x.com' }]);
    expect(presenceForRow(index, { key: 'employee:e1' })).toMatchObject({ employee_id: 'e1' });
    expect(presenceForRow(index, { key: 'employee:zz', email: 'b@x.com' })).toMatchObject({ email: 'b@x.com' });
    expect(presenceForRow(index, { key: 'employee:zz', email: 'a@x.com' })).toMatchObject({ employee_id: 'e1' });
    expect(presenceForRow(index, { key: 'employee:none' })).toBeUndefined();
  });

  test('clock and day maths are in IST', () => {
    expect(teamsClock('2026-10-20T12:11:00Z')).toBe('5:41 PM');
    expect(teamsClock('2026-10-20T18:30:00Z')).toBe('12:00 AM');
    expect(teamsClock('')).toBe('');
    expect(istMinutes('2026-10-20T03:30:00Z', '2026-10-20')).toBe(540);
    expect(timelineWindow([], '2026-10-20')).toEqual({ start: 540, end: 1140 });
    expect(timelineWindow([{ started_at: '2026-10-20T02:10:00Z', ended_at: '2026-10-20T15:00:00Z' }], '2026-10-20')).toEqual({ start: 420, end: 1260 });
    expect(onlineThatDay([{ online_minutes: '5' }, { online_minutes: 0 }, {}])).toBe(1);
    expect(teamsErrorText({ status: 403 })).toBe(TEAMS_NO_ACCESS);
    expect(teamsErrorText({ message: 'Boom' })).toBe("Couldn't load Teams activity. Boom");
  });
});

/* ── Alert history ──────────────────────────────────────────────────── */

describe('my alerts', () => {
  const alerts = [
    { id: 'a', responded: false, date_entered: '2026-10-20 10:00:00' },
    { id: 'b', responded: true, answer: 'yes', answered_at: '2026-10-21 09:00:00' },
    { id: 'c', responded: true, answer: 'no', answered_at: '2026-10-22 09:00:00' },
    { id: 'd', responded: false, date_entered: '2026-10-19 10:00:00' },
  ];

  test('splits into pending (oldest first) and past (latest answer first)', () => {
    const { pending, past } = splitMyAlerts(alerts);
    expect(pending.map((alert) => alert.id)).toEqual(['d', 'a']);
    expect(past.map((alert) => alert.id)).toEqual(['c', 'b']);
    expect(pastAlerts(undefined)).toEqual([]);
  });
});

/* ── Generic lists ──────────────────────────────────────────────────── */

describe('entity list helpers', () => {
  const statuses = normalizeStatuses([
    { key: 'open', label: 'Open', filters: { status: 'open' }, rank: '1' },
    { key: 'hidden', label: 'Hidden', visible: '0', rank: '0' },
    { key: 'won', label: 'Won', filters: { status: 'won' }, amountKey: 'total', rank: '0', presentation: { label: { currentValue: 'Closed won' } } },
  ]);

  test('statuses are visible, rank ordered and presentation-labelled', () => {
    expect(statuses.map((status) => [status.key, status.label])).toEqual([['won', 'Closed won'], ['open', 'Open']]);
    expect(buildStatsQueries(statuses, 'Opportunities')).toEqual([
      { key: 'won', module: 'Opportunities', filters: { status: 'won' }, sum_of: ['total'] },
      { key: 'open', module: 'Opportunities', filters: { status: 'open' } },
    ]);
    expect(statusCount({ stats: { won: { count: '3' } } }, 'won')).toBe(3);
    expect(statusCount(undefined, 'won')).toBe(0);
  });

  test('status tabs toggle their own filters and keep the others', () => {
    let filters = { owner: 'me' };
    filters = toggleStatusFilters(filters, statuses, statuses[1]);
    expect(filters).toEqual({ owner: 'me', status: 'open' });
    expect(isStatusActive(filters, statuses[1])).toBe(true);
    filters = toggleStatusFilters(filters, statuses, statuses[0]);
    expect(filters).toEqual({ owner: 'me', status: 'won' });
    filters = toggleStatusFilters(filters, statuses, statuses[0]);
    expect(filters).toEqual({ owner: 'me' });
    const neq = { key: 'x', neqFilter: { done: '1' } };
    expect(toggleStatusFilters({}, [neq], neq)).toEqual({ done: { neq: '1' } });
  });

  test('filter columns, sortable columns and counts', () => {
    const columns = filterColumnsOf({ filterColumns: [
      { accessor: 'status', label: 'Status', values: [{ value: 'open', label: 'Open' }] },
      { accessor: 'empty', label: 'Empty', values: [] },
      { accessor: 'type', values: ['a', 'b'] },
    ] });
    expect(columns.map((column) => column.accessor)).toEqual(['status', 'type']);
    expect(columns[1].values).toEqual([{ value: 'a', label: 'a' }, { value: 'b', label: 'b' }]);
    expect(activeFilterCount({ status: 'open', other: 1 }, columns)).toBe(1);
    expect(sortableColumns([{ accessor: 'a', sortable: true }, { accessor: 'b' }, { accessor: 'c', sortable: '0' }]).map((c) => c.accessor)).toEqual(['a']);
  });

  test('templates, conditions and visibility follow the web action engine', () => {
    expect(resolveTemplate('/orders/{id}/contact/{client_email}', { id: 7, client_email: 'a b@x.com' })).toBe('/orders/7/contact/a%20b%40x.com');
    expect(resolveRequest({ endpoint: 'smartgateway', body: { id: '{id}', nested: ['{id}'] } }, { id: 5 })).toMatchObject({ body: { id: '5', nested: ['5'] } });
    const record = { order_status: 'Completed', amount: '' };
    expect(evaluateCondition({ field: 'order_status', operator: 'eq', value: 'completed' }, record)).toBe(true);
    expect(evaluateCondition({ any: [{ field: 'amount', operator: 'not_empty' }, { field: 'amount', operator: 'empty' }] }, record)).toBe(true);
    const action = { type: 'mutation', visibility: [{ field: 'order_status', operator: 'neq', value: 'completed' }] };
    expect(isActionVisible(action, record)).toBe(false);
    expect(isActionDisabled({ disabled: [{ field: 'amount', operator: 'empty' }] }, record)).toBe(true);
    expect(layoutActions([{ type: 'navigate', rank: '1', label: 'B' }, { type: 'mutation', rank: '0', label: 'A' }, { label: 'no type' }], record).map((a) => a.label)).toEqual(['A', 'B']);
  });

  test('navigate targets map to phone screens', () => {
    const ctx = { module: 'orders', title: 'Orders', uiModuleId: 'ui-1' };
    expect(mobileRouteFor({ target: '/orders/{id}/edit' }, { id: '9' }, ctx)).toEqual({ name: 'EntityForm', params: { module: 'orders', title: 'Orders', uiModuleId: 'ui-1', id: '9', mode: 'edit' } });
    expect(mobileRouteFor({ target: 'edit', targetType: 'relative' }, {}, { ...ctx, base: '/orders/9' })).toMatchObject({ name: 'EntityForm', params: { id: '9', mode: 'edit' } });
    expect(mobileRouteFor({ target: '/contacts/{contact_id}' }, { contact_id: 'c1' }, ctx)).toMatchObject({ name: 'EntityDetail', params: { module: 'contacts', id: 'c1', title: 'Contacts' } });
    expect(mobileRouteFor({ target: '/orders/create' }, {}, ctx)).toMatchObject({ name: 'EntityForm', params: { mode: 'create' } });
    expect(mobileRouteFor({ target: '/a/b/c/d' }, {}, ctx)).toBeNull();
    expect(mobileRouteFor({}, {}, ctx)).toBeNull();
  });
});

describe('entity actions api', () => {
  test('get_stats sends the table preferences and one query per status', async () => {
    http.mockResolvedValue({ success: true, stats: {} });
    await fetchEntityStats({ statuses: [{ key: 'open', filters: { status: 'open' } }], module: 'Orders', filters: { owner: 'me' }, search: ' bob ', orderBy: 'name', orderDir: 'ASC', email: 'x@y.com' });
    expect(http).toHaveBeenCalledWith({
      method: 'POST',
      params: { email: 'x@y.com' },
      body: { action: 'get_stats', filters: { owner: 'me' }, search: 'bob', order_by: 'name', order_dir: 'ASC', queries: [{ key: 'open', module: 'Orders', filters: { status: 'open' } }] },
    });
  });

  test('mutation actions go to smartgateway or fetchgpc with placeholders resolved', async () => {
    http.mockResolvedValue({ success: true });
    fetchGpc.mockResolvedValue({ success: true });
    await runActionRequest({ action: { request: { endpoint: 'SmartGateway', body: { action: 'update', id: '{id}', data: { status: 'done' } } } }, record: { id: 'r1' } });
    expect(http).toHaveBeenCalledWith({ method: 'POST', params: undefined, headers: undefined, body: { action: 'update', id: 'r1', data: { status: 'done' } } });
    await runActionRequest({ action: { request: { endpoint: 'fetchgpc', method: 'GET', params: { type: 'x', id: '{id}' } } }, record: { id: 'r2' } });
    expect(fetchGpc).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET', params: { type: 'x', id: 'r2' } }));
    await expect(runActionRequest({ action: { request: { endpoint: '/rest/x' } }, record: {} })).rejects.toThrow('Unsupported action endpoint');
    await expect(runActionRequest({ action: {}, record: {} })).rejects.toThrow('requires request');
  });
});

/* ── Offline detection ──────────────────────────────────────────────── */

describe('network store', () => {
  test('only connectivity failures count as offline', () => {
    expect(isNetworkError(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }))).toBe(true);
    expect(isNetworkError(new TypeError('Network request failed'))).toBe(true);
    expect(isNetworkError(new Error('Network error. Check your internet connection.'))).toBe(true);
    expect(isNetworkError(Object.assign(new Error('Network Error'), { response: { status: 500 } }))).toBe(false);
    expect(isNetworkError(new Error('Record not found.'))).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });

  test('the query cache drives the store', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const stop = watchQueryClient(client);
    await client.fetchQuery({ queryKey: ['x'], queryFn: () => Promise.reject(new TypeError('Network request failed')) }).catch(() => {});
    expect(useNetworkStore.getState().offline).toBe(true);
    await client.fetchQuery({ queryKey: ['y'], queryFn: async () => 1 });
    expect(useNetworkStore.getState().offline).toBe(false);
    await client.fetchQuery({ queryKey: ['z'], queryFn: () => Promise.reject(new Error('Validation failed')) }).catch(() => {});
    expect(useNetworkStore.getState().offline).toBe(false);
    stop();
    client.clear();
  });

  test('probe and backoff', async () => {
    expect(await probeConnection('u', jest.fn(async () => ({ status: 404 })))).toBe(true);
    expect(await probeConnection('u', jest.fn(async () => { throw new TypeError('Network request failed'); }))).toBe(false);
    expect(await probeConnection('u', null)).toBe(false);
    expect([0, 1, 2, 5].map(retryDelay)).toEqual([3000, 6000, 12000, 30000]);
  });
});

/* ── Rendering ──────────────────────────────────────────────────────── */

const mounted = [];
afterEach(() => {
  while (mounted.length) {
    const { tree, client } = mounted.pop();
    act(() => tree.unmount());
    client.clear();
  }
});

function mount(element) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  let tree;
  act(() => {
    tree = create(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  });
  mounted.push({ tree, client });
  return { tree, client };
}

const settle = async () => {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
};

function textOf(tree) {
  const out = [];
  const walk = (node) => {
    if (node == null) return;
    if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    walk(node.children);
  };
  walk(tree.toJSON());
  return out.join(' ');
}

const pressText = async (tree, text) => {
  let node = tree.root.findAll((item) => item.props.children === text)[0];
  while (node && typeof node.props.onPress !== 'function') node = node.parent;
  await act(async () => { node.props.onPress(); });
};

describe('screens', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'signedIn', user: { email: 'kamal@example.com' }, userInfo: { id: 'emp-1', status: 'employee', phase: 'Employment' } });
    fetchGpc.mockImplementation(async ({ params } = {}) => (params?.type === 'my_alerts'
      ? { success: true, alerts: [
        { id: 'a1', name: 'Town hall', description: 'Will you join?', response_type: 'yes_no', date_entered: '2026-10-20 10:00:00' },
        { id: 'a2', name: 'Policy update', response_type: 'acknowledge', answer: 'acknowledged', answered_at: '2026-10-21 09:00:00', date_entered: '2026-10-19 10:00:00' },
      ] }
      : { success: true }));
  });

  test('MyAlerts shows waiting alerts and the answered history, and opens an alert', async () => {
    const navigation = { navigate: jest.fn() };
    const { tree } = mount(<MyAlertsScreen navigation={navigation} route={{ params: {} }} />);
    await settle();
    expect(textOf(tree)).toContain('Town hall');
    expect(textOf(tree)).not.toContain('Policy update');
    await pressText(tree, 'Past alerts');
    const text = textOf(tree);
    expect(text).toContain('Policy update');
    expect(text).toContain('You answered Acknowledged');
    await pressText(tree, 'Policy update');
    expect(navigation.navigate).toHaveBeenCalledWith('AnnouncementDetail', { alert: expect.objectContaining({ id: 'a2' }) });
  });

  test('PendingAlertsCard shows "See all" only when asked to', async () => {
    const onSeeAll = jest.fn();
    const plain = mount(<PendingAlertsCard />);
    await settle();
    expect(textOf(plain.tree)).toContain('Needs your response');
    expect(textOf(plain.tree)).not.toContain('See all');
    const linked = mount(<PendingAlertsCard onSeeAll={onSeeAll} />);
    await settle();
    await pressText(linked.tree, 'See all');
    expect(onSeeAll).toHaveBeenCalled();
  });

  test('TeamsChip reads live status and past-day hours', () => {
    const live = mount(<TeamsChip live record={{ availability: 'Busy', activity: 'InACall', status_since: '2026-10-20T04:00:00Z', active_minutes: 90, online_minutes: 125 }} />);
    expect(textOf(live.tree)).toContain('In a call · since 9:30 AM');
    expect(textOf(live.tree)).toMatch(/Active\s+1h 30m\s+· Online\s+2h 05m/);
    const past = mount(<TeamsChip record={{ first_online_at: '2026-10-19T03:45:00Z', last_online_at: '2026-10-19T12:30:00Z' }} />);
    expect(textOf(past.tree)).toContain('9:15 AM – 6:00 PM');
    const missing = mount(<TeamsChip state="ready" />);
    expect(textOf(missing.tree)).toContain('Not on Teams');
  });
});
