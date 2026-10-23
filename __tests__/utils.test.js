import {
  calendarDateKey, eachDay, employeeDateKey, formatDate, formatHours, interviewDate, nowStampInIndia, parseActivityTime, timeUntil,
} from '../src/utils/dates';
import { daySummary, employeeAttendanceStats, holidayMapOf, leaveDaysOf, sessionSummary, timeToMinutes } from '../src/utils/attendance';
import { activeRecords, errorMessage, fetchAllPages, fullName, htmlBlocks, initials, plainText, totalPagesOf } from '../src/utils/records';
import { emailFromIdToken, withAccountChooser } from '../src/utils/oauthUrl';

describe('dates', () => {
  test('parses CRM MM/DD/YYYY HH:mm timestamps', () => {
    const t = parseActivityTime('10/19/2026 09:41');
    expect(t).toMatchObject({ date: '2026-10-19', minutes: 581, time: '09:41 AM' });
    expect(parseActivityTime('2026-10-19 17:05:00').time).toBe('05:05 PM');
    expect(parseActivityTime('not a date')).toBeNull();
  });

  test('normalises calendar and employee dates', () => {
    expect(calendarDateKey('10/19/2026')).toBe('2026-10-19');
    expect(calendarDateKey('2026-10-19 00:00:00')).toBe('2026-10-19');
    expect(employeeDateKey('19/10/2026')).toBe('2026-10-19');
    expect(formatDate('2026-10-19', { weekday: true })).toBe('Mon, 19 Oct 2026');
    expect(formatHours(540)).toBe('9h 00m');
  });

  test('interview datetimes are UTC and countdown reads naturally', () => {
    const date = interviewDate('2026-10-20 10:30:00');
    expect(date.toISOString()).toBe('2026-10-20T10:30:00.000Z');
    const now = Date.parse('2026-10-20T09:00:00Z');
    expect(timeUntil(date, now)).toMatch(/Today|In/);
    expect(eachDay('2026-10-30', '2026-11-02')).toHaveLength(4);
    expect(typeof nowStampInIndia()).toBe('number');
  });
});

describe('attendance', () => {
  test('session and day summaries', () => {
    const session = sessionSummary({ login: '10/19/2026 09:30', lunch_in: '10/19/2026 13:00', lunch_out: '10/19/2026 13:40', logout: '10/19/2026 18:30' });
    expect(session.worked).toBe(540);
    expect(session.breakMinutes).toBe(40);
    expect(daySummary([{ login: '10/19/2026 10:15' }], '2026-10-19', '2026-10-19', false, 600).status).toBe('late');
    expect(daySummary([], '2026-10-15', '2026-10-19', true).status).toBe('leave');
    expect(daySummary([], '2026-10-25', '2026-10-19').status).toBe('upcoming');
    expect(timeToMinutes('9:30 AM')).toBe(570);
  });

  test('stats ignore weekends, holidays and pending leave', () => {
    const leaveDays = leaveDaysOf([
      { status: 'Accepted', leave_from: '2026-10-12', leave_to: '2026-10-13' },
      { status: 'Applied', leave_from: '2026-10-14', leave_to: '2026-10-14' },
    ]);
    expect([...leaveDays]).toEqual(['2026-10-12', '2026-10-13']);
    const stats = employeeAttendanceStats({
      records: [{ login: '10/14/2026 09:20', logout: '10/14/2026 18:20' }, { login: '10/15/2026 10:30', logout: '10/15/2026 18:30' }],
      from: '2026-10-12', to: '2026-10-18', today: '2026-10-18', lateAfter: 600, leaveDays, holidays: new Set(['2026-10-16']),
    });
    expect(stats.counts).toEqual({ present: 1, late: 1, leave: 2, absent: 0 });
    expect(holidayMapOf([{ holiday_date: '10/16/2026', name: 'Diwali' }])).toEqual({ '2026-10-16': 'Diwali' });
  });
});

describe('records', () => {
  test('helpers', () => {
    expect(plainText('<p>Hello&nbsp;<b>world</b> &amp; co</p>')).toBe('Hello world & co');
    expect(plainText('&lt;p&gt;Feeling &lt;b&gt;unwell&lt;/b&gt;&lt;/p&gt;&lt;p&gt;Back Monday&lt;/p&gt;')).toBe('Feeling unwell\nBack Monday');
    expect(plainText('&amp;lt;p&amp;gt;Twice escaped&amp;lt;/p&amp;gt;')).toBe('Twice escaped');
    expect(plainText('<ul><li>One</li><li>Two</li></ul>')).toBe('• One\n• Two');
    expect(plainText('It&rsquo;s &#x20B9;500 &ndash; ok')).toBe('It’s ₹500 – ok');
    expect(fullName({ first_name: ' Kamal ', last_name: 'Uniyal' })).toBe('Kamal Uniyal');
    expect(initials('Kamal Uniyal')).toBe('KU');
    expect(totalPagesOf({ total: 45, per_page: 20 }, 20)).toBe(3);
    expect(activeRecords({ records: [{ id: 1 }, { id: 2, deleted: '1' }] })).toEqual([{ id: 1 }]);
    expect(errorMessage({ response: { data: { error: 'Nope' } } })).toBe('Nope');
    expect(errorMessage({ message: 'Network Error' })).toMatch(/internet/);
  });

  test('fetchAllPages walks every page and drops deleted rows', async () => {
    const pages = {
      1: { success: true, records: [{ id: 'a' }, { id: 'b', deleted: '1' }], total_pages: 2, dropdown_lists: { status: { x: 'X' } } },
      2: { success: true, records: [{ id: 'c' }], total_pages: 2 },
    };
    const request = jest.fn(async (body) => pages[body.page]);
    const result = await fetchAllPages(request, { action: 'fetch', module: 'hrc_leaves' }, { perPage: 50 });
    expect(result.records.map((r) => r.id)).toEqual(['a', 'c']);
    expect(result.dropdowns).toEqual({ status: { x: 'X' } });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0]).toMatchObject({ page: 1, per_page: 50 });
    await expect(fetchAllPages(async () => ({ success: false, error: 'denied' }), { module: 'hrc_leaves' })).rejects.toThrow('denied');
  });
});

describe('oauthUrl', () => {
  // Shapes of the redirects the HRCRM backend actually sends.
  const google = 'https://accounts.google.com/o/oauth2/v2/auth?response_type=code&access_type=online&client_id=abc.apps.googleusercontent.com&redirect_uri=https%3A%2F%2Fapp.hrcrm.ai%2Fcb&state=s1&scope=email%20profile&approval_prompt=auto';
  const microsoft = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=51c4&response_type=code&redirect_uri=https%3A%2F%2Fapp.hrcrm.ai%2Fmicrosoft-callback&scope=openid+email&state=s2';

  test('forces the account chooser and leaves other URLs alone', () => {
    // Google answers "Error 400: invalid_request" when approval_prompt and prompt are both sent.
    expect(withAccountChooser(google)).toBe(google.replace('approval_prompt=auto', 'prompt=select_account'));
    expect(withAccountChooser(microsoft)).toBe(`${microsoft}&prompt=select_account`);
    const forced = withAccountChooser(google);
    expect(withAccountChooser(forced)).toBe(forced); // no reload loop
    expect(withAccountChooser('https://app.hrcrm.ai/public/index.php?controller=auth&action=me')).toBe('https://app.hrcrm.ai/public/index.php?controller=auth&action=me');
  });

  test('a login hint goes straight to the picked account', () => {
    const hinted = withAccountChooser(google, 'a.b@example.com');
    expect(hinted).not.toMatch(/prompt=/);
    expect(hinted).toMatch(/login_hint=a\.b%40example\.com/);
    expect(hinted).toMatch(/state=s1&scope=email%20profile/);
    expect(withAccountChooser(hinted, 'a.b@example.com')).toBe(hinted);
  });

  test('reads the email from an ID token', () => {
    // eslint-disable-next-line no-undef -- Node's Buffer, available in Jest.
    const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    expect(emailFromIdToken(`${part({ alg: 'none' })}.${part({ preferred_username: 'kamal@outright.com' })}.sig`)).toBe('kamal@outright.com');
    expect(emailFromIdToken('not-a-token')).toBeNull();
  });
});

describe('htmlBlocks', () => {
  test('keeps tables as tables and the text around them as paragraphs', () => {
    const html = '<p>Dear All,</p><p>Teams are below.</p><table><tr><th>Team</th><th>Members</th></tr><tr><td>Team A</td><td>Kamal, Shashi</td></tr><tr><td>Team B</td><td>Ravi</td></tr></table><p>All the best!</p>';
    expect(htmlBlocks(html)).toEqual([
      { type: 'text', text: 'Dear All,\nTeams are below.' },
      { type: 'table', header: ['Team', 'Members'], rows: [['Team A', 'Kamal, Shashi'], ['Team B', 'Ravi']] },
      { type: 'text', text: 'All the best!' },
    ]);
  });

  test('reads CRM-escaped tables and uses the first row as header when there is no <th>', () => {
    const escaped = '&lt;table&gt;&lt;tr&gt;&lt;td&gt;Team&lt;/td&gt;&lt;td&gt;Lead&lt;/td&gt;&lt;/tr&gt;&lt;tr&gt;&lt;td&gt;Red&lt;/td&gt;&lt;td&gt;Asha&amp;nbsp;K&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;';
    expect(htmlBlocks(escaped)).toEqual([{ type: 'table', header: ['Team', 'Lead'], rows: [['Red', 'Asha K']] }]);
    expect(htmlBlocks('<p>Just text</p>')).toEqual([{ type: 'text', text: 'Just text' }]);
  });
});
