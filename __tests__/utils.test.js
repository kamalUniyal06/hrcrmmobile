import {
  calendarDateKey, eachDay, employeeDateKey, formatDate, formatHours, interviewDate, nowStampInIndia, parseActivityTime, timeUntil,
} from '../src/utils/dates';
import { daySummary, employeeAttendanceStats, holidayMapOf, leaveDaysOf, sessionSummary, timeToMinutes } from '../src/utils/attendance';
import { activeRecords, errorMessage, fetchAllPages, fullName, initials, plainText, totalPagesOf } from '../src/utils/records';

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
