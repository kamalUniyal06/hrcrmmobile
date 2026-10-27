// Recruitment API and helpers against a mocked Smart Gateway: request bodies match the web app
// (candidatesApi.js, candidateList.js, ScheduleInterviewDialog.jsx, InterviewActionDialog.jsx).
jest.mock('@react-native-async-storage/async-storage');
jest.mock('react-native-safe-area-context');
jest.mock('../src/services/api', () => ({
  gateway: jest.fn(),
  http: jest.fn(),
  apiRequest: jest.fn(),
  fetchGpc: jest.fn(),
  smartGateway: jest.fn(),
}));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { gateway } from '../src/services/api';
import CandidateEditSheet from '../src/components/recruitment/CandidateEditSheet';
import CandidateFilterSheet from '../src/components/recruitment/CandidateFilterSheet';
import InterviewActionSheet from '../src/components/recruitment/InterviewActionSheet';
import ScheduleInterviewSheet from '../src/components/recruitment/ScheduleInterviewSheet';
import {
  boardState, buildCandidateListRequest, changeCandidateWorkflow, changedFields, decideInterview, fetchShortlist,
  groupInterviews, rescheduleInterview, scheduleInterview, updateCandidateRecord, workflowField, workflowUpdate, workflowValue,
} from '../src/api/admin.api';
import { filterShortlist, interviewCounts, localDateTime, readResumeSections, sortRequest, updateResumeAbout } from '../src/utils/recruitment';

const ok = (records, extra = {}) => ({ success: true, records, total_pages: 1, ...extra });
const STAGES = [{ id: 'st-short', name: 'Shortlisted' }, { id: 'st-join', name: 'Joining' }];
const STATUSES = [{ id: 'ss-sched', name: 'Scheduled' }, { id: 'ss-rej', name: 'Rejected' }, { id: 'ss-new', name: 'New' }];
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 30, 0, 0); return d; };

/** Routes gateway calls by module/action; `writes` collects create/update bodies in order. */
function fakeGateway(db) {
  const writes = [];
  gateway.mockImplementation(async (body) => {
    if (body.action === 'fetch') {
      const rows = db[body.module] || [];
      const id = body.filters?.id;
      return ok(id ? rows.filter((row) => row.id === id) : rows);
    }
    writes.push(body);
    return { success: true, id: 'new-id' };
  });
  return writes;
}

beforeEach(() => jest.clearAllMocks());

describe('candidate list request', () => {
  test('stage/phase/status IDs, source and date range go to the server like the web', () => {
    const body = buildCandidateListRequest({
      search: 'kam', workflow: { stage: 'st-short', phase: '', status: 'ss-new' }, source: 'linkedin',
      dateRange: { fromDate: '2026-10-01', toDate: '2026-10-31' }, ...sortRequest({ key: 'name', direction: 1 }),
    });
    expect(body.filters).toEqual({
      employee: 0,
      hrc_stages_id_c: 'st-short',
      hrc_phase_id: { nin: ['', 'Unassigned'] },
      hrc_status_id_c: 'ss-new',
      candidate_source: 'linkedin',
    });
    expect(body).toMatchObject({
      search: 'kam', order_by: 'first_name', order_dir: 'ASC',
      date_range: 'custom', date_field: 'date_entered', date_from: '2026-10-01 00:00:00', date_to: '2026-10-31 23:59:59', per_page: 20,
    });
    expect(sortRequest({ key: 'stage', direction: -1 })).toEqual({ orderBy: 'stage', orderDir: 'DESC' });
    expect(buildCandidateListRequest({ perPage: 1 }).per_page).toBe(1);
    expect(buildCandidateListRequest().date_range).toBeUndefined();
  });

  test('the shortlist loads every page for the period and refuses ineligible rows', async () => {
    gateway.mockResolvedValueOnce(ok([{ id: 'c1', employee: '0', hrc_stages_id_c_name: 'Shortlisted' }]));
    const rows = await fetchShortlist({ dateRange: { fromDate: '2026-10-01', toDate: '2026-10-31' } });
    expect(rows).toHaveLength(1);
    expect(gateway.mock.calls[0][0]).toMatchObject({ filters: { employee: 0, hrc_stages_id_c_name: 'Shortlisted' }, date_from: '2026-10-01 00:00:00', page: 1, per_page: 20 });
    gateway.mockResolvedValueOnce(ok([{ id: 'c2', employee: '1', hrc_stages_id_c_name: 'Shortlisted' }]));
    await expect(fetchShortlist()).rejects.toThrow('ineligible');
  });

  test('the shortlist is searched, filtered by option and sorted on the phone', () => {
    const lookups = { stage: STAGES, phase: [], status: STATUSES };
    const rows = [
      { id: 'b', first_name: 'Bina', hrc_status_id_c: 'ss-new', candidate_source: 'web' },
      { id: 'a', first_name: 'Asha', hrc_status_id_c: 'ss-sched', candidate_source: 'web' },
      { id: 'c', first_name: 'Chet', hrc_status_id_c: 'ss-sched', candidate_source: 'ref' },
    ];
    const run = (options) => filterShortlist(rows, { lookups, ...options }).map((row) => row.id);
    expect(run({})).toEqual(['a', 'b', 'c']);
    expect(run({ sort: { key: 'name', direction: -1 } })).toEqual(['c', 'b', 'a']);
    expect(run({ filters: { stage: '', phase: '', status: 'ss-sched', source: 'web' } })).toEqual(['a']);
    expect(run({ search: 'bin' })).toEqual(['b']);
  });

  test('interview tiles count open rounds ahead and those without a date', () => {
    const counts = interviewCounts([
      { id: '1', description: 'Round 1', candidate_id: 'c1', interview_datetime: '2099-01-01 10:00:00' },
      { id: '2', description: 'Round 1', candidate_id: 'c2' },
      { id: '3', description: 'Round 1', candidate_id: 'c3', interview_status: 'Pass' },
    ]);
    expect(counts).toEqual({ open: 2, upcoming: 1, unscheduled: 1 });
  });
});

describe('candidate workflow and profile', () => {
  test('workflow values use the foreign-key column and store option IDs', () => {
    const record = { id: 'c1', hrc_stages_id_c: 'st-short', hrc_status_id_c: '' };
    expect(workflowField(record, 'stage')).toBe('hrc_stages_id_c');
    expect(workflowValue(record, 'stage', STAGES)).toBe('Shortlisted');
    expect(workflowValue(record, 'status', STATUSES)).toBe('Unassigned');
    expect(workflowUpdate(record, 'stage', 'Joining', STAGES)).toEqual({ hrc_stages_id_c: 'st-join' });
    expect(() => workflowUpdate(record, 'stage', 'Offer', STAGES)).toThrow('The Offer stage is unavailable');
    // Without a foreign key the web's plain field holds names.
    expect(workflowUpdate({ id: 'c2', stage: 'New' }, 'stage', 'Joining', [])).toEqual({ stage: 'Joining' });
  });

  test('changing a stage updates hrc_candidates with only that field', async () => {
    const writes = fakeGateway({});
    const data = await changeCandidateWorkflow({ id: 'c1', hrc_stages_id_c: 'st-new' }, 'stage', 'Shortlisted', STAGES);
    expect(data).toEqual({ hrc_stages_id_c: 'st-short' });
    expect(writes).toEqual([{ action: 'update', module: 'hrc_candidates', id: 'c1', data: { hrc_stages_id_c: 'st-short' } }]);
  });

  test('profile edits send changed fields only, and empty edits send nothing', async () => {
    expect(changedFields({ first_name: 'Asha', title: 'Dev' }, { first_name: 'Asha', title: 'Lead' })).toEqual({ title: 'Lead' });
    await updateCandidateRecord('c1', {});
    expect(gateway).not.toHaveBeenCalled();
  });

  test('About edits keep parsed resume data', () => {
    const stored = JSON.stringify({ content: { candidate: { description: 'Old' }, skills: [{ name: 'React' }] } });
    expect(readResumeSections(stored).about).toBe('Old');
    const next = JSON.parse(updateResumeAbout(stored, 'New intro'));
    expect(next.content.candidate.description).toBe('New intro');
    expect(next.content.skills).toEqual([{ name: 'React' }]);
    expect(updateResumeAbout('Plain', 'Changed')).toBe('Changed');
  });
});

describe('scheduling', () => {
  const candidate = { id: 'c1', first_name: 'Asha', email1: 'asha@example.com', hrc_status_id_c: 'ss-new' };

  test('creates Round 1 like the web dialog, then marks the candidate Scheduled', async () => {
    const writes = fakeGateway({ hrc_candidates: [candidate], hrc_interviews: [] });
    const when = tomorrow();
    const onCreated = jest.fn();
    await scheduleInterview({ candidate, draft: { name: ' Asha ', email: 'asha@example.com', when, notes: ' Bring portfolio ', job_id: '' }, statusOptions: STATUSES, onCreated });
    expect(writes[0]).toEqual({
      action: 'create',
      module: 'hrc_interviews',
      data: {
        name: 'Asha', email: 'asha@example.com', interview_datetime: when.toISOString().slice(0, 19).replace('T', ' '),
        interview_feedback: 'Bring portfolio', job_id: '', description: 'Round 1', candidate_id: 'c1',
      },
    });
    expect(onCreated).toHaveBeenCalled();
    expect(writes[1]).toEqual({ action: 'update', module: 'hrc_candidates', id: 'c1', data: { hrc_status_id_c: 'ss-sched' } });
  });

  test('a retry after the interview was created only updates the status', async () => {
    const writes = fakeGateway({ hrc_candidates: [candidate] });
    await scheduleInterview({ candidate, draft: { name: 'Asha', email: 'a@x.io', when: tomorrow(), notes: '', job_id: '' }, statusOptions: STATUSES, interviewCreated: true });
    expect(writes.map((w) => w.action + ':' + w.module)).toEqual(['update:hrc_candidates']);
  });

  test('refuses rejected candidates, duplicates, past times and missing contact details', async () => {
    const draft = { name: 'Asha', email: 'asha@example.com', when: tomorrow(), notes: '', job_id: '' };
    let writes = fakeGateway({ hrc_candidates: [{ ...candidate, hrc_status_id_c: 'ss-rej' }] });
    await expect(scheduleInterview({ candidate, draft, statusOptions: STATUSES })).rejects.toThrow('Rejected candidates cannot be scheduled.');
    writes = fakeGateway({ hrc_candidates: [candidate], hrc_interviews: [{ id: 'i1', description: 'Round 1', candidate_id: 'c1', job_id: '' }] });
    await expect(scheduleInterview({ candidate, draft, statusOptions: STATUSES })).rejects.toThrow('already has a Round 1 interview');
    fakeGateway({ hrc_candidates: [candidate], hrc_interviews: [] });
    await expect(scheduleInterview({ candidate, draft: { ...draft, when: new Date(Date.now() - 60000) }, statusOptions: STATUSES })).rejects.toThrow('in the future');
    await expect(scheduleInterview({ candidate, draft: { ...draft, email: ' ' }, statusOptions: STATUSES })).rejects.toThrow('name and email');
    expect(writes).toEqual([]);
  });

  test('localDateTime reads picker values as local time', () => {
    const date = localDateTime('2026-11-02', '09:45');
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()]).toEqual([2026, 10, 2, 9, 45]);
    expect(localDateTime('', '09:45')).toBeNull();
  });
});

describe('interview decisions', () => {
  const round = (description, extra = {}) => ({ id: `i-${description}`, description, candidate_id: 'c1', name: 'Asha', email: 'asha@example.com', job_id: 'j1', date_modified: '2026-10-20 10:00:00', ...extra });

  test('passing the final round moves the candidate to Joining and keeps their status', async () => {
    const final = round('Round 3');
    const writes = fakeGateway({ hrc_interviews: [final], hrc_candidates: [{ id: 'c1', hrc_stages_id_c: 'st-short', hrc_status_id_c: 'ss-sched' }], hrc_stages: STAGES });
    const result = await decideInterview({ record: final, outcome: 'Pass', feedback: ' Great ' });
    expect(result).toEqual({ outcome: 'Pass', nextRound: '', hired: true });
    expect(writes).toEqual([
      { action: 'update', module: 'hrc_candidates', id: 'c1', data: { hrc_stages_id_c: 'st-join' } },
      { action: 'update', module: 'hrc_interviews', id: 'i-Round 3', data: { interview_status: 'Pass', interview_feedback: 'Great' } },
    ]);
    // The passed final round stays on the board as "selected".
    const passed = { ...final, interview_status: 'Pass' };
    expect(boardState(passed)).toBe('selected');
    expect(groupInterviews([passed]).find((group) => group.name === 'Round 3').records).toHaveLength(1);
  });

  test('passing the final round fails before writing when Joining is not configured', async () => {
    const final = round('Round 3');
    const writes = fakeGateway({ hrc_interviews: [final], hrc_candidates: [{ id: 'c1', hrc_stages_id_c: 'st-short' }], hrc_stages: [STAGES[0]] });
    await expect(decideInterview({ record: final, outcome: 'Pass', feedback: 'ok' })).rejects.toThrow('The Joining stage is unavailable');
    expect(writes).toEqual([]);
  });

  test('passing Round 1 creates Round 2 first, then records the pass; failing only records the fail', async () => {
    const first = round('Round 1');
    let writes = fakeGateway({ hrc_interviews: [first] });
    expect(await decideInterview({ record: first, outcome: 'Pass', feedback: 'Good' })).toEqual({ outcome: 'Pass', nextRound: 'Round 2', hired: false });
    expect(writes[0]).toMatchObject({ action: 'create', module: 'hrc_interviews', data: { description: 'Round 2', candidate_id: 'c1', job_id: 'j1', interview_datetime: '', interview_status: '' } });
    expect(writes[1]).toEqual({ action: 'update', module: 'hrc_interviews', id: 'i-Round 1', data: { interview_status: 'Pass', interview_feedback: 'Good' } });
    writes = fakeGateway({ hrc_interviews: [first] });
    await decideInterview({ record: first, outcome: 'Fail', feedback: 'No' });
    expect(writes).toEqual([{ action: 'update', module: 'hrc_interviews', id: 'i-Round 1', data: { interview_status: 'Fail', interview_feedback: 'No' } }]);
  });

  test('refuses to save over a concurrent change, and requires feedback', async () => {
    const first = round('Round 1');
    const writes = fakeGateway({ hrc_interviews: [{ ...first, interview_status: 'Fail', date_modified: '2026-10-21 09:00:00' }] });
    await expect(decideInterview({ record: first, outcome: 'Pass', feedback: 'ok' })).rejects.toThrow('changed since you opened it');
    fakeGateway({ hrc_interviews: [first] });
    await expect(decideInterview({ record: first, outcome: 'Pass', feedback: '  ' })).rejects.toThrow('feedback is required');
    expect(writes).toEqual([]);
  });

  test('rescheduling saves a UTC time and refuses rejected candidates and completed rounds', async () => {
    const first = round('Round 1');
    const when = tomorrow();
    let writes = fakeGateway({ hrc_interviews: [first], hrc_candidates: [{ id: 'c1', hrc_status_id_c: 'ss-sched' }] });
    await rescheduleInterview({ record: first, when, statusOptions: STATUSES });
    expect(writes).toEqual([{ action: 'update', module: 'hrc_interviews', id: 'i-Round 1', data: { interview_datetime: when.toISOString().slice(0, 19).replace('T', ' ') } }]);
    writes = fakeGateway({ hrc_interviews: [first], hrc_candidates: [{ id: 'c1', hrc_status_id_c: 'ss-rej' }] });
    await expect(rescheduleInterview({ record: first, when, statusOptions: STATUSES })).rejects.toThrow('Rejected candidates cannot be scheduled or rescheduled.');
    const done = round('Round 1', { interview_status: 'Pass' });
    fakeGateway({ hrc_interviews: [done] });
    await expect(rescheduleInterview({ record: done, when, statusOptions: STATUSES })).rejects.toThrow('completed interview cannot be rescheduled');
    expect(writes).toEqual([]);
  });
});

describe('recruitment sheets', () => {
  const textOf = (tree) => JSON.stringify(tree.toJSON());
  const mount = (element) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    let tree;
    act(() => { tree = create(<QueryClientProvider client={client}>{element}</QueryClientProvider>); });
    return tree;
  };
  const candidate = { id: 'c1', first_name: 'Asha', email1: 'asha@example.com', hrc_status_id_c: 'ss-new', description: 'About Asha' };
  const lookups = { stage: STAGES, phase: [], status: STATUSES };

  test('each sheet renders its form when opened', () => {
    const trees = [
      mount(<ScheduleInterviewSheet candidate={candidate} statusOptions={STATUSES} onClose={() => {}} />),
      mount(<CandidateEditSheet record={candidate} lookups={lookups} onClose={() => {}} />),
      mount(<InterviewActionSheet record={{ id: 'i1', description: 'Round 3', name: 'Asha' }} mode="decide" statusOptions={STATUSES} onClose={() => {}} />),
      mount(<InterviewActionSheet record={{ id: 'i1', description: 'Round 1', name: 'Asha' }} mode="schedule" statusOptions={STATUSES} onClose={() => {}} />),
      mount(<CandidateFilterSheet visible initial={{ filters: { stage: '', phase: '', status: '', source: '' }, sort: 'date_entered:-1', dateRange: { fromDate: '2026-10-01', toDate: '2026-10-31' } }} defaultRange={{ fromDate: '2026-10-01', toDate: '2026-10-31' }} lookups={lookups} sources={[{ value: 'web', label: 'Website' }]} onClose={() => {}} onApply={() => {}} />),
    ];
    const [schedule, edit, decide, reschedule, filter] = trees.map(textOf);
    expect(schedule).toContain('Save interview');
    expect(edit).toContain('About Asha');
    expect(decide).toContain('Joining');
    expect(reschedule).toContain('Save interview date');
    expect(filter).toContain('All stages');
    trees.forEach((tree) => act(() => tree.unmount()));
  });
});
