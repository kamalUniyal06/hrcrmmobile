import {
  addDaysToKey, alertExpiresAt, announcementPreview, buildFeed, candidateStageTone, countByLabel, feedDayLabel, hiringSummary,
  isAlertLive, leaveEmployeeName, scheduleEventsForDay, shortDate, upcomingScheduleEvents, weekdayOf,
} from '../src/utils/homeDashboard';

describe('home dashboard helpers', () => {
  test('formats short dates and moves day keys across months', () => {
    expect(shortDate('2026-10-03')).toBe('3 Oct');
    expect(addDaysToKey('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(weekdayOf('2026-10-23')).toBe('Fri');
  });

  test('labels feed days relative to today', () => {
    expect(feedDayLabel(Date.UTC(2026, 9, 23, 9, 0), '2026-10-23')).toBe('Today');
    expect(feedDayLabel(Date.UTC(2026, 9, 22, 18, 0), '2026-10-23')).toBe('Yesterday');
    expect(feedDayLabel(Date.UTC(2026, 9, 12, 8, 0), '2026-10-23')).toBe('12 Oct');
  });

  test('counts labels largest first and folds the tail into Other', () => {
    const records = ['A', 'A', 'A', 'B', 'B', 'C', 'D', 'E', 'F', ''];
    expect(countByLabel(records, (value) => value, 3)).toEqual([
      { label: 'A', count: 3 },
      { label: 'B', count: 2 },
      { label: 'Other', count: 5 },
    ]);
    expect(countByLabel(['', ' '], (value) => value)).toEqual([{ label: 'Unassigned', count: 2 }]);
  });

  test('summarises this month\'s candidates newest first', () => {
    const records = [
      { id: 'c1', first_name: 'Old', hrc_stages_id_c_name: 'Applied', date_entered: '10/01/2026 10:00' },
      { id: 'c2', first_name: 'New', hrc_stages_id_c_name: 'Shortlisted', current_designation: 'Designer', date_entered: '10/20/2026 10:00' },
      { id: 'c3', first_name: 'Mid', hrc_stages_id_c_name: 'Applied', date_entered: '2026-10-10 10:00:00' },
    ];
    const summary = hiringSummary(records, { stageOf: (r) => r.hrc_stages_id_c_name, nameOf: (r) => r.first_name, recent: 2 });
    expect(summary.total).toBe(3);
    expect(summary.shortlisted).toBe(1);
    expect(summary.stages).toEqual([{ label: 'Applied', count: 2 }, { label: 'Shortlisted', count: 1 }]);
    expect(summary.recent.map((item) => item.name)).toEqual(['New', 'Mid']);
    expect(summary.recent[0]).toMatchObject({ id: 'c2', designation: 'Designer', stage: 'Shortlisted' });
  });

  test('picks chip tones for candidate stages', () => {
    expect(candidateStageTone('Shortlisted')).toBe('lime');
    expect(candidateStageTone('Joining')).toBe('success');
    expect(candidateStageTone('Rejected')).toBe('closed');
    expect(candidateStageTone('Applied')).toBe('neutral');
  });

  test('treats inactive, deleted and expired alerts as not live', () => {
    const now = new Date(2026, 9, 23, 12, 0);
    expect(isAlertLive({ id: 'a' }, now)).toBe(true);
    expect(isAlertLive({ id: 'a', active: '0' }, now)).toBe(false);
    expect(isAlertLive({ id: 'a', deleted: '1' }, now)).toBe(false);
    expect(isAlertLive({ id: 'a', expires_on: '2026-10-23' }, now)).toBe(true);
    expect(isAlertLive({ id: 'a', expires_on: '10/22/2026' }, now)).toBe(false);
    expect(isAlertLive({ id: 'a', expires_on: '10/23/2026 11:00' }, now)).toBe(false);
    expect(alertExpiresAt({ expires_on: '2026-10-23 06:30:00' }).toISOString()).toBe('2026-10-23T06:30:00.000Z');
  });

  test('previews announcement HTML as one line', () => {
    expect(announcementPreview('&lt;p&gt;Town hall&lt;/p&gt;<p>at 5 pm</p>')).toBe('Town hall at 5 pm');
  });

  test('names a leave by directory record, then the names stored on it', () => {
    expect(leaveEmployeeName({ name: 'x@example.com' }, { first_name: 'Asha', last_name: 'Rao' })).toBe('Asha Rao');
    expect(leaveEmployeeName({ hrc_employees_hrc_leaves_1_name: 'Ravi Kumar', name: 'ravi@example.com' })).toBe('Ravi Kumar');
    expect(leaveEmployeeName({})).toBe('Employee');
  });

  test('builds schedule events for holidays, birthdays, anniversaries and accepted leave', () => {
    const sources = {
      holidays: [{ id: 'h1', name: 'Diwali', holiday_date: '10/30/2026' }, { id: 'h2', name: 'Gone', holiday_date: '10/30/2026', deleted: '1' }],
      employees: [
        { id: 'e1', first_name: 'Asha', last_name: 'Rao', dob: '30/10/1995', joining_date: '30/10/2023' },
        { id: 'e2', first_name: 'New', last_name: 'Joiner', joining_date: '30/10/2026' },
      ],
      leaves: [
        { id: 'l1', status: 'Accepted', leave_from: '2026-10-29', leave_to: '2026-10-31', type_of_leave: 'Sick Leave' },
        { id: 'l2', status: 'Applied', leave_from: '2026-10-30', leave_to: '2026-10-30' },
      ],
      leaveLabel: () => 'Ravi on leave',
    };
    const events = scheduleEventsForDay('2026-10-30', sources);
    expect(events.map((event) => event.id)).toEqual(['holiday:h1', 'birthday:e1', 'anniversary:e1', 'leave:l1']);
    expect(events[2]).toMatchObject({ detail: '3 years completed', employeeId: 'e1' });
    expect(events[3]).toMatchObject({ title: 'Ravi on leave', detail: 'Sick Leave', leaveId: 'l1' });
    expect(scheduleEventsForDay('2026-10-28', sources)).toEqual([]);

    const eventsFor = (key) => scheduleEventsForDay(key, sources);
    const upcoming = upcomingScheduleEvents('2026-10-27', eventsFor, { limit: 3 });
    expect(upcoming.map(({ key, event }) => `${key}:${event.type}`)).toEqual(['2026-10-29:leave', '2026-10-30:holiday', '2026-10-30:birthday']);
  });

  test('builds the feed newest first from activity, leave and alerts', () => {
    const feed = buildFeed({
      activity: [
        { id: 'd1', name: 'Kamal@Example.com', login: '10/23/2026 09:12', lunch_in: '10/23/2026 13:00', logout: '' },
        { id: 'd2', name: 'gone@example.com', login: '10/23/2026 09:00', deleted: '1' },
      ],
      leaves: [
        { id: 'l1', status: 'Applied', type_of_leave: 'Short leave', leave_from: '2026-10-25', leave_to: '2026-10-25', date_entered: '2026-10-22 10:00:00' },
        { id: 'l2', status: 'Accepted', leave_from: '2026-10-26', leave_to: '2026-10-28', date_modified: '10/23/2026 08:00' },
      ],
      alerts: [{ id: 'a1', name: 'Town &amp; hall', date_entered: '2026-10-21 10:00:00' }],
      personLabel: () => 'Kamal',
      leaveLabel: () => "Ravi's",
      limit: 10,
    });
    expect(feed.map((item) => item.id)).toEqual(['d1:lunch_in', 'd1:login', 'leave:l2', 'leave:l1', 'alert:a1']);
    expect(feed[0]).toMatchObject({ type: 'lunch', title: 'Kamal started lunch', detail: '01:00 PM', email: 'kamal@example.com' });
    expect(feed[2]).toMatchObject({ type: 'leaveApproved', title: "Ravi's leave request approved", detail: '26 Oct – 28 Oct', leaveId: 'l2' });
    expect(feed[3].title).toBe("Ravi's short leave request submitted");
    expect(feed[4]).toMatchObject({ type: 'announcement', title: 'Town & hall', alertId: 'a1' });
    expect(buildFeed({ activity: [{ id: 'x', login: '10/23/2026 09:00', logout: '10/23/2026 18:00' }], limit: 1 }).map((item) => item.id)).toEqual(['x:logout']);
  });
});
