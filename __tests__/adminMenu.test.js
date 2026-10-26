import { buildMenuGroups, FALLBACK_GROUPS, iconFor, isTargetActive, mobileTarget, sidebarDestination } from '../src/navigation/adminMenu';

const item = (fields) => ({ id: fields.name, is_visible: '1', ...fields });

describe('admin side menu', () => {
  test('maps web sidebar items to their pages, like the web sidebarDestination', () => {
    expect(sidebarDestination({ name: 'Salary Management' })).toBe('/salaries');
    expect(sidebarDestination({ name: 'Increments', module_name: 'hrc_increment' })).toBe('/increment-management');
    expect(sidebarDestination({ name: 'Leave approvals', navigation: '/leave-approvals' })).toBe('/leave-approvals');
    expect(sidebarDestination({ name: 'Skills', fetch_from: 'hrc_skills' })).toBe('/entity/hrc_skills/view');
    expect(sidebarDestination({ name: 'Nothing' })).toBeNull();
  });

  test('picks the mobile tab or screen for each page', () => {
    expect(mobileTarget('/attendance')).toEqual({ tab: 'Attendance' });
    expect(mobileTarget('/leave-approvals')).toEqual({ tab: 'Approvals' });
    expect(mobileTarget('/candidates?view=shortlisted')).toMatchObject({ tab: 'Candidates', params: { view: 'shortlisted' } });
    expect(mobileTarget('/salaries')).toEqual({ screen: 'Salaries' });
    expect(mobileTarget('/entity/hrc_skills/view', { id: 'ui-7', name: 'Skills' })).toEqual({ screen: 'EntityList', params: { module: 'hrc_skills', title: 'Skills', uiModuleId: 'ui-7' } });
    expect(mobileTarget('/settings')).toBeNull();
  });

  test('builds visible groups in rank order and drops pages without a mobile version', () => {
    const groups = buildMenuGroups([
      { id: 'g2', group_name: 'People', rank: 'b', data: [item({ name: 'Employees', rank: 'b' }), item({ name: 'Attendance', navigation: 'attendance', rank: 'a', show_count: '1', key: 'att' })] },
      { id: 'g1', group_name: 'Recruitment', rank: 'a', data: [item({ name: 'Candidates' }), item({ name: 'Shortlisted' })] },
      { id: 'g3', group_name: 'Hidden', rank: 'c', is_visible: '0', data: [item({ name: 'Employees' })] },
      { id: 'g4', group_name: 'Admin', rank: 'd', data: [item({ name: 'Settings' }), item({ name: 'Old', is_visible: '0', fetch_from: 'hrc_old' })] },
    ]);
    expect(groups.map((group) => group.title)).toEqual(['Recruitment', 'People']);
    expect(groups[0].items.map((entry) => entry.name)).toEqual(['Candidates']);
    expect(groups[1].items.map((entry) => entry.name)).toEqual(['Attendance', 'Employees']);
    expect(groups[1].items[0]).toMatchObject({ countKey: 'att', icon: 'calendar-outline' });
  });

  test('leaves Interviews out of the side menu, from the web layout and the fallback', () => {
    const groups = buildMenuGroups([
      { id: 'g1', group_name: 'Recruitment', rank: 'a', data: [item({ name: 'Candidates' }), item({ name: 'Interviews', navigation: 'interviews' })] },
    ]);
    expect(groups[0].items.map((entry) => entry.name)).toEqual(['Candidates']);
    expect(FALLBACK_GROUPS.flatMap((group) => group.items).some((entry) => entry.target.screen === 'InterviewBoard')).toBe(false);
  });

  test('turns react-icons Io names into Ionicons and falls back by page', () => {
    expect(iconFor({ icon: 'IoCalendarOutline' }, { tab: 'Attendance' })).toBe('calendar-outline');
    expect(iconFor({ icon: 'FaUsers' }, { tab: 'People' })).toBe('people-outline');
    expect(FALLBACK_GROUPS.every((group) => group.items.every((entry) => entry.icon && entry.target))).toBe(true);
  });

  test('marks the item for the page on screen', () => {
    const shortlisted = { tab: 'Candidates', params: { view: 'shortlisted' } };
    const all = { tab: 'Candidates', params: { view: 'all' } };
    expect(isTargetActive(shortlisted, ['AdminTabs', 'Candidates'], { view: 'shortlisted' })).toBe(true);
    expect(isTargetActive(all, ['AdminTabs', 'Candidates'], { view: 'shortlisted' })).toBe(false);
    expect(isTargetActive({ screen: 'Salaries' }, ['Salaries'])).toBe(true);
    expect(isTargetActive({ screen: 'EntityList', params: { module: 'a' } }, ['EntityList'], { module: 'b' })).toBe(false);
  });
});
