import {
  attendanceDayBounds, buildAttendanceRows, buildLeaveDays, clockSpan, formatMinutes, isHalfDayLeave, isRowOnLeave,
  leaveDayRequests, leaveForRow, leaveRecordsByDay, leavesCoveringDay, lunchSpan, matchesOverviewFilter, readAttendanceStats,
} from '../src/utils/adminAttendance';
import { daySummary } from '../src/utils/attendance';

const sample = {
  id: 'activity-1', name: 'verm.jatin2004@gmail.com', login: '09/18/2026 17:59',
  logout: '09/18/2026 19:34', lunch_in: '09/18/2026 18:49', lunch_out: '09/18/2026 19:27',
  hrc_employees_hrc_daily_activity_1hrc_employees_ida: '    ',
};

describe('admin attendance rows', () => {
  test('matches blank employee relationships by trimmed, case-insensitive email', () => {
    const rows = buildAttendanceRows([
      { id: 'employee-1', first_name: 'Jatin', email1: ' VERM.JATIN2004@gmail.com ' },
      { id: 'employee-2', name: 'Employee without attendance' },
    ], [sample, sample, { ...sample, id: 'deleted', deleted: '1' }]);
    expect(rows).toHaveLength(2);
    const row = rows.find((item) => item.name === 'Jatin');
    expect(row.days['2026-09-18']).toHaveLength(1);
    expect(row).toMatchObject({ matched: true, id: 'employee-1' });
  });

  test('keeps unmatched activity and excludes exited employees', () => {
    const rows = buildAttendanceRows(
      [{ id: 'exited', email1: 'former@example.com', stage_id_name: 'Ex Employee', hrc_phase_id_name: 'Exit' }, { id: 'one', email1: sample.name }],
      [{ ...sample, hrc_employees_hrc_daily_activity_1hrc_employees_ida: 'unknown' }, { ...sample, id: 'gone', name: 'FORMER@example.com' }],
    );
    expect(rows.map((row) => row.key).sort()).toEqual(['employee:one', 'unmatched:unknown']);
    expect(rows.find((row) => !row.matched).days['2026-09-18']).toHaveLength(1);
  });
});

describe('admin attendance leaves', () => {
  const leave = { id: 'l1', status: 'Accepted', employee_id: 'one', email: 'A@x.com', leave_from: '2026-09-17', leave_to: '2026-09-18', leave_type: 'half_day' };

  test('expands accepted leaves by employee and email', () => {
    const days = buildLeaveDays([leave, { ...leave, id: 'l2', status: 'Applied', leave_from: '2026-09-20', leave_to: '2026-09-20' }]);
    expect(isRowOnLeave(days, { key: 'employee:one', email: '' }, '2026-09-18')).toBe(true);
    expect(isRowOnLeave(days, { key: 'employee:two', email: 'a@x.com' }, '2026-09-17')).toBe(true);
    expect(isRowOnLeave(days, { key: 'employee:one', email: '' }, '2026-09-20')).toBe(false);
    expect(leaveForRow([leave], { id: 'one', email: '' }, '2026-09-18')).toBe(leave);
    expect(Object.keys(leaveRecordsByDay([leave]))).toEqual(['2026-09-17', '2026-09-18']);
  });

  test('detects half-day leave and merges the two day requests', () => {
    expect(isHalfDayLeave(leave)).toBe(true);
    expect(isHalfDayLeave({ leave_days: '0.5' })).toBe(true);
    expect(isHalfDayLeave({ leave_type: 'Sick Leave', leave_days: '1' })).toBe(false);
    expect(leaveDayRequests('2026-09-18').map((request) => request.dateField)).toEqual(['leave_to', 'leave_from']);
    expect(leavesCoveringDay([[leave], [leave, { id: 'l3', leave_from: '2026-09-19' }]], '2026-09-18')).toEqual([leave]);
  });
});

describe('admin attendance overview', () => {
  test('filters rows by overview tile', () => {
    const base = { records: [sample], matched: true, onLeave: false, halfDay: false, day: '2026-09-18', today: '2026-09-20', lateAfter: 600 };
    expect(matchesOverviewFilter('late', base)).toBe(true);
    expect(matchesOverviewFilter('onTime', base)).toBe(false);
    expect(matchesOverviewFilter('missing', { ...base, records: [] })).toBe(true);
    expect(matchesOverviewFilter('missing', { ...base, records: [], onLeave: true })).toBe(false);
    expect(matchesOverviewFilter('halfDay', { ...base, halfDay: true })).toBe(true);
  });

  test('summarises clock and lunch spans', () => {
    const summary = daySummary([sample], '2026-09-18', '2026-09-20', false, 600);
    expect(summary.inOffice).toBe(95);
    expect(clockSpan(summary)).toMatchObject({ closed: true, stillIn: false });
    expect(lunchSpan(summary.sessions)).toMatchObject({ totalBreak: 38, onLunch: false });
    expect(lunchSpan([])).toBeNull();
    expect(formatMinutes(40)).toBe('40m');
    expect(formatMinutes(485)).toBe('8h 05m');
  });

  test('reads get_stats totals and the IST day bounds', () => {
    const stat = (count) => ({ count });
    const totals = readAttendanceStats({
      success: true,
      stats: { employees_shown: stat(40), checked_in: stat(30), late_check_ins: stat(5), not_checked_in: stat(8), on_leave_full: stat(2), on_leave_half: stat(1) },
    });
    expect(totals).toEqual({ all: 40, notCheckedIn: 8, leave: 2, late: 5, onTime: 25 });
    expect(() => readAttendanceStats({ success: true, stats: {} })).toThrow();
    expect(attendanceDayBounds('2026-09-18')).toEqual({ from: '2026-09-17 18:30:00', to: '2026-09-18 18:29:59' });
  });
});
