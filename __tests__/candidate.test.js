// Candidate features ported from the web: profile validation and payloads, related records,
// uploads (resume, photo, government ID), application tracker, interviews and the Round 1 test.
jest.mock('@react-native-async-storage/async-storage');
jest.mock('react-native-safe-area-context');
jest.mock('../src/services/api', () => ({ gateway: jest.fn(), http: jest.fn(), apiRequest: jest.fn(), fetchGpc: jest.fn(), smartGateway: jest.fn() }));
jest.mock('../src/services/crmAuth', () => ({ ...jest.requireActual('../src/services/crmAuth'), getCrmToken: jest.fn(async () => 'crm-token'), clearCrmToken: jest.fn() }));
jest.mock('../src/config', () => ({ ...jest.requireActual('../src/config'), FETCH_GPC_X_API_KEY: 'test-key', RECRUITMENT_API_URL: 'https://recruit.example.com/api/' }));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fetchGpc, gateway } from '../src/services/api';
import { clearCrmToken } from '../src/services/crmAuth';
import { useAuthStore } from '../src/store/authStore';
import { ScreenChrome } from '../src/components/ui';
import {
  applicationStage, createCandidateRelated, fetchCandidateRelated, fetchMyTestInvitation, parseResume, saveCandidate,
  saveCandidateRelated, scanGovernmentDocument, uploadCandidateImage,
} from '../src/api/candidate.api';
import {
  ABOUT_MIN_LENGTH, educationForOnboarding, experienceDateForInput, governmentDocumentFileError, governmentDocumentNumbersMatch,
  governmentIdError, governmentIdFields, normalizeCandidate, photoFileError, readResumeSections, requiredPersonalFields,
  resumeFileError, validatePersonalDetails, validateRelatedEntries,
} from '../src/utils/candidateProfile';
import { applicationStepDetails, applicationSteps, countApplications, interviewJourney, isFirstRound } from '../src/utils/candidateJourney';
import { readTestInvitation, safeInvitationUrl, testInvitationView, testIsDue } from '../src/utils/candidateInvitation';
import MyApplicationsScreen from '../src/screens/candidate/MyApplicationsScreen';
import InterviewsScreen from '../src/screens/candidate/InterviewsScreen';
import { CandidateProfileEditScreen, CandidateProfileScreen } from '../src/screens/candidate/CandidateProfileScreen';
import CandidateRelatedEditScreen, { editableRows, saveRelatedRows } from '../src/screens/candidate/CandidateRelatedEditScreen';
import CandidateResumeScreen from '../src/screens/candidate/CandidateResumeScreen';
import CandidateGovernmentIdScreen from '../src/screens/candidate/CandidateGovernmentIdScreen';

// React Native's FormData keeps file parts' uri/name/type.
// eslint-disable-next-line @react-native/no-deep-imports
global.FormData = require('react-native/Libraries/Network/FormData').default || require('react-native/Libraries/Network/FormData');

const EMAIL = 'asha@example.com';
const validDraft = {
  first_name: 'Asha', last_name: 'Rao', email1: EMAIL, phone_mobile: '+91 98765 43210', dob: '1995-04-12', gender: 'Female',
  current_designation: 'Designer', primary_address_street: '12 MG Road', primary_address_city: 'Pune', primary_address_state: 'Maharashtra',
  primary_address_postalcode: '411001', primary_address_country: 'India', description: 'x'.repeat(ABOUT_MIN_LENGTH),
};
const partsOf = (body) => body.getParts();
const part = (body, name) => partsOf(body).find((item) => item.fieldName === name);

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'signedIn', user: { email: EMAIL }, userInfo: { id: 'c1', status: 'candidate', phase: 'Hiring' }, notice: null });
});

describe('personal details validation (web onboardingValidation)', () => {
  test('requires all 13 fields', () => {
    const errors = validatePersonalDetails({});
    expect(Object.keys(requiredPersonalFields)).toHaveLength(13);
    expect(Object.keys(errors).sort()).toEqual(Object.keys(requiredPersonalFields).sort());
    expect(validatePersonalDetails(validDraft)).toEqual({});
  });

  test('About needs 50 characters', () => {
    expect(validatePersonalDetails({ ...validDraft, description: 'Too short' }).description).toMatch('at least 50');
    expect(validatePersonalDetails({ ...validDraft, description: 'y'.repeat(50) }).description).toBeUndefined();
  });

  test('phone needs 7 to 15 digits and phone characters only', () => {
    expect(validatePersonalDetails({ ...validDraft, phone_mobile: '12345' }).phone_mobile).toMatch('7 to 15 digits');
    expect(validatePersonalDetails({ ...validDraft, phone_mobile: '1234567890123456' }).phone_mobile).toMatch('7 to 15 digits');
    expect(validatePersonalDetails({ ...validDraft, phone_mobile: '98765abc43' }).phone_mobile).toBe('Enter a valid phone number.');
    expect(validatePersonalDetails({ ...validDraft, phone_mobile: '(022) 555-0101' }).phone_mobile).toBeUndefined();
  });

  test('date of birth must be a real date not in the future', () => {
    expect(validatePersonalDetails({ ...validDraft, dob: '2999-01-01' }, '2026-10-26').dob).toMatch('not in the future');
    expect(validatePersonalDetails({ ...validDraft, dob: '2001-02-30' }, '2026-10-26').dob).toMatch('valid date');
    expect(validatePersonalDetails({ ...validDraft, dob: '2026-10-26' }, '2026-10-26').dob).toBeUndefined();
  });

  test('profile links are optional but must be web addresses', () => {
    expect(validatePersonalDetails({ ...validDraft, linkedin_url: 'linkedin.com/in/asha' }).linkedin_url).toBeUndefined();
    expect(validatePersonalDetails({ ...validDraft, github_url: 'not a url' }).github_url).toMatch('valid profile address');
    expect(validatePersonalDetails({ ...validDraft, github_url: 'ftp://github.com/x' }).github_url).toMatch('valid profile address');
  });
});

describe('government ID', () => {
  test('number formats per type', () => {
    expect(governmentIdError('pan', 'abcde1234f')).toBe('');
    expect(governmentIdError('pan', 'ABCDE12345')).toMatch('valid PAN');
    expect(governmentIdError('aadhaar', '1234 5678 9012')).toBe('');
    expect(governmentIdError('aadhaar', '1234')).toMatch('12-digit');
    expect(governmentIdError('driving_licence', 'MH12 2011 0012345')).toBe('');
    expect(governmentIdError('passport', 'X')).toMatch('Choose');
  });

  test('saved fields and scan match rules', () => {
    expect(governmentIdFields('pan', 'abcde1234f')).toEqual({ government_id_type: 'pan', government_id_number: 'ABCDE1234F', pan_card_number: 'ABCDE1234F' });
    expect(governmentIdFields('aadhaar', '1234-5678-9012')).toEqual({ government_id_type: 'aadhaar', government_id_number: '123456789012' });
    expect(() => governmentIdFields('pan', 'bad')).toThrow('valid PAN');
    expect(governmentDocumentNumbersMatch('driving_licence', 'MH12-2011-0012345', 'MH12 2011 0012345')).toBe(true);
    expect(governmentDocumentNumbersMatch('pan', 'ABCDE1234F', 'ABCDE1234G')).toBe(false);
  });

  test('file checks', () => {
    expect(governmentDocumentFileError({ name: 'id.png', size: 100 })).toBe('');
    expect(governmentDocumentFileError({ name: 'id.pdf', size: 100 })).toMatch('JPG, PNG');
    expect(governmentDocumentFileError({ name: 'id.jpg', size: 11 * 1024 * 1024 })).toMatch('10 MB');
    expect(resumeFileError({ name: 'cv.docx', size: 10 })).toBe('');
    expect(resumeFileError({ name: 'cv.txt', size: 10 })).toMatch('PDF, DOC');
    expect(photoFileError({ name: 'me.heic', type: 'image/heic', size: 10 })).toMatch('JPG, PNG');
    expect(photoFileError({ name: 'me.jpg', type: 'image/jpeg', size: 10 })).toBe('');
  });
});

describe('related entries and resume content', () => {
  test('validateRelatedEntries follows the web rules', () => {
    expect(validateRelatedEntries('experiences', [], false).index).toBe(-1);
    expect(validateRelatedEntries('experiences', [], true)).toBeNull();
    expect(validateRelatedEntries('skills', [{ name: ' ' }]).message).toBe('Enter a skill for entry 1.');
    const today = '2026-10-26';
    expect(validateRelatedEntries('experiences', [{ name: 'Dev', joining_date: '2020-01-01' }], false, today).field).toBe('leaving_date');
    expect(validateRelatedEntries('experiences', [{ name: 'Dev', joining_date: '2020-01-01', currentlyWorking: true }], false, today)).toBeNull();
    expect(validateRelatedEntries('experiences', [{ name: 'Dev', joining_date: '2027-01-01', currentlyWorking: true }], false, today).message).toMatch('future');
    expect(validateRelatedEntries('experiences', [{ name: 'Dev', joining_date: '2022-01-01', leaving_date: '2021-01-01' }], false, today).message).toMatch('on or after');
  });

  test('dates, parsed resume and education prefill', () => {
    expect(experienceDateForInput('03/04/2021')).toBe('2021-03-04');
    expect(experienceDateForInput('2021-03-04 00:00:00')).toBe('2021-03-04');
    const parsed = JSON.stringify({ content: { candidate: { summary: 'Hello there' }, education: [{ id: 'x', qualification: 'B.Tech' }] } });
    expect(readResumeSections(parsed).about).toBe('Hello there');
    expect(educationForOnboarding([], parsed)).toEqual([{ qualification: 'B.Tech', name: 'B.Tech' }]);
    expect(educationForOnboarding([{ id: 'e1', name: 'MBA' }], parsed)).toEqual([{ id: 'e1', name: 'MBA' }]);
  });

  test('normalizeCandidate fills street, postal code and converts dates', () => {
    const draft = normalizeCandidate({ full_name: 'Asha Rao', street: '1 Main', postal_code: '110001', dob: '04/12/1995', linkedin_url: 'linkedin.com/in/a', profile_image: 'https://cdn/x.jpg' }, EMAIL);
    expect(draft).toMatchObject({ first_name: 'Asha', last_name: 'Rao', email1: EMAIL, primary_address_street: '1 Main', primary_address_postalcode: '110001', dob: '1995-04-12', linkedin_url: 'https://linkedin.com/in/a', profile_image: 'https://cdn/x.jpg' });
  });

  test('editableRows marks open-ended roles as current', () => {
    expect(editableRows('experiences', [{ id: 'e1', name: 'Dev', joining_date: '2020-01-01', leaving_date: '' }])[0].currentlyWorking).toBe(true);
  });
});

describe('profile API (same modules and payloads as web)', () => {
  test('saveCandidate sends the normalized profile with address and verified ID', async () => {
    gateway.mockResolvedValue({ success: true });
    const saved = await saveCandidate('c1', { ...validDraft, candidate_source: 'New Candidate -> LinkedIn' }, EMAIL, { type: 'pan', number: 'abcde1234f' });
    const body = gateway.mock.calls[0][0];
    expect(body).toMatchObject({ action: 'update', module: 'hrc_candidates', id: 'c1' });
    expect(body.data).toMatchObject({ primary_address_street: '12 MG Road', primary_address_postalcode: '411001', candidate_source: 'New Candidate -> LinkedIn', government_id_type: 'pan', pan_card_number: 'ABCDE1234F', email1: EMAIL });
    expect(saved.id).toBe('c1');
  });

  test('saveCandidate creates with career_portal source', async () => {
    gateway.mockResolvedValue({ success: true, id: 'new' });
    const saved = await saveCandidate(undefined, validDraft, EMAIL);
    expect(gateway.mock.calls[0][0]).toMatchObject({ action: 'create', data: { candidate_source: 'career_portal' } });
    expect(saved.id).toBe('new');
  });

  test('createCandidateRelated links the record and keeps only module fields', async () => {
    gateway.mockResolvedValue({ success: true, id: 'sk9' });
    const created = await createCandidateRelated('skills', 'c1', { name: 'React', clientKey: 'tmp' });
    expect(gateway.mock.calls[0][0]).toEqual({ action: 'create', module: 'hrc_skills', data: { name: 'React', hrc_candidates_hrc_skills_1hrc_candidates_ida: 'c1' } });
    expect(created.id).toBe('sk9');
    gateway.mockResolvedValue({ success: true });
    await expect(createCandidateRelated('skills', 'c1', { name: 'X' })).rejects.toThrow('without a record ID');
  });

  test('saveCandidateRelated sends only changed fields', async () => {
    gateway.mockResolvedValue({ success: true });
    const original = { id: 'ex1', name: 'Dev', company_name: 'Acme' };
    expect(await saveCandidateRelated('experiences', { ...original }, original)).toBe(false);
    expect(gateway).not.toHaveBeenCalled();
    await saveCandidateRelated('experiences', { ...original, company_name: 'Globex' }, original);
    expect(gateway.mock.calls[0][0]).toEqual({ action: 'update', module: 'hrc_experience', id: 'ex1', data: { company_name: 'Globex' } });
    await expect(saveCandidateRelated('experiences', { id: 'a' }, { id: 'b' })).rejects.toThrow('missing its ID');
  });

  test('saveRelatedRows updates, creates and clears end dates of current roles', async () => {
    gateway.mockResolvedValue({ success: true, id: 'ex2' });
    const original = { id: 'ex1', name: 'Dev', joining_date: '2020-01-01', leaving_date: '2021-01-01' };
    const saved = await saveRelatedRows('experiences', 'c1', [{ ...original, currentlyWorking: true }, { name: 'Lead', joining_date: '2022-01-01', leaving_date: '2023-01-01', clientKey: 'k' }], { ex1: original });
    expect(gateway.mock.calls[0][0]).toMatchObject({ action: 'update', id: 'ex1', data: { leaving_date: '' } });
    expect(gateway.mock.calls[1][0]).toMatchObject({ action: 'create', module: 'hrc_experience', data: { name: 'Lead', hrc_candidates_hrc_experience_1hrc_candidates_ida: 'c1' } });
    expect(gateway.mock.calls[1][0].data.clientKey).toBeUndefined();
    expect(saved.map((row) => row.id)).toEqual(['ex1', 'ex2']);
  });

  test('fetchCandidateRelated normalizes experience dates', async () => {
    gateway.mockResolvedValue({ success: true, records: [{ id: 'ex1', joining_date: '01/15/2020', leaving_date: null }], total_pages: 1 });
    const rows = await fetchCandidateRelated('c1', 'experiences');
    expect(gateway.mock.calls[0][0]).toMatchObject({ action: 'fetch_related', module: 'hrc_candidates', id: 'c1', related_module: 'hrc_experience' });
    expect(rows).toEqual([{ id: 'ex1', joining_date: '2020-01-15', leaving_date: '' }]);
  });
});

describe('uploads through the hrc entry point', () => {
  const resume = { uri: 'file:///cv.pdf', name: 'cv.pdf', size: 2048, type: 'application/pdf' };
  const photo = { uri: 'file:///me.jpg', name: 'me.jpg', size: 2048, type: 'image/jpeg' };
  const idImage = { uri: 'file:///pan.png', name: 'pan.png', size: 2048, type: 'image/png' };

  test('parseResume posts type=resume_parsing with the web field names', async () => {
    fetchGpc.mockResolvedValue({ success: true });
    await parseResume({ file: resume, email: EMAIL, stage: 'New Candidate -> LinkedIn', jobId: 'job-1' });
    const call = fetchGpc.mock.calls[0][0];
    expect(call).toMatchObject({ method: 'POST', params: { type: 'resume_parsing' } });
    expect(call.endpoint).toContain('entryPoint=hrc');
    expect(part(call.body, 'file')).toMatchObject({ uri: 'file:///cv.pdf', name: 'cv.pdf', type: 'application/pdf' });
    expect(part(call.body, 'primary_email').string).toBe(EMAIL);
    expect(part(call.body, 'stage').string).toBe('New Candidate -> LinkedIn');
    expect(part(call.body, 'job_record_id').string).toBe('job-1');
    fetchGpc.mockResolvedValue({ success: false, message: 'Bad file' });
    await expect(parseResume({ file: resume, email: EMAIL, stage: 's' })).rejects.toThrow('Bad file');
    await expect(parseResume({ file: resume, email: EMAIL, stage: '' })).rejects.toThrow('how you heard');
  });

  test('uploadCandidateImage returns the hosted URL', async () => {
    fetchGpc.mockResolvedValue({ success: true, image_url: 'https://cdn.example.com/me.jpg' });
    expect(await uploadCandidateImage({ file: photo, email: EMAIL })).toBe('https://cdn.example.com/me.jpg');
    const call = fetchGpc.mock.calls[0][0];
    expect(call.params).toEqual({ type: 'upload_candidate_image' });
    expect(part(call.body, 'email').string).toBe(EMAIL);
    expect(part(call.body, 'image')).toMatchObject({ uri: 'file:///me.jpg', type: 'image/jpeg' });
    fetchGpc.mockResolvedValue({ success: true, image_url: 'ftp://cdn.example.com/me.jpg' });
    await expect(uploadCandidateImage({ file: photo, email: EMAIL })).rejects.toThrow('valid image URL');
  });

  test('scanGovernmentDocument posts type=upload_doc and checks the result', async () => {
    fetchGpc.mockResolvedValue({ success: true, document_type: 'pan', document_number: 'abcde1234f' });
    expect(await scanGovernmentDocument({ file: idImage, type: 'pan' })).toBe('ABCDE1234F');
    const call = fetchGpc.mock.calls[0][0];
    expect(call.params).toEqual({ type: 'upload_doc' });
    expect(part(call.body, 'document_type').string).toBe('pan');
    fetchGpc.mockResolvedValue({ success: true, document_type: 'aadhaar', document_number: '123456789012' });
    await expect(scanGovernmentDocument({ file: idImage, type: 'pan' })).rejects.toThrow('does not match');
    await scanGovernmentDocument({ file: idImage, type: 'driving_licence' }).catch(() => {});
    expect(part(fetchGpc.mock.calls[2][0].body, 'document_type').string).toBe('dl');
  });
});

describe('application tracker', () => {
  test('stages, steps and filters', () => {
    expect(applicationStage('rejected').closed).toBe(true);
    expect(applicationStage('interview_scheduled').closed).toBe(false);
    expect(applicationSteps('interview').map((s) => s.state)).toEqual(['done', 'done', 'current', 'upcoming']);
    expect(applicationSteps('accepted').map((s) => s.state)).toEqual(['done', 'done', 'done', 'done']);
    expect(applicationSteps('rejected')[3].tone).toBe('closed');
    expect(applicationStepDetails('rejected').Decision).toBe('This application is closed.');
    expect(applicationStepDetails('applied', '10/01/2026').Applied).toBe('Submitted 10/01/2026');
    expect(countApplications([{ status: 'applied' }, { status: 'interview' }, { status: 'rejected' }])).toEqual({ all: 3, active: 2, interviews: 1, closed: 1 });
  });
});

describe('interviews and the Round 1 test', () => {
  const candidate = { id: 'c1', email1: EMAIL };
  const future = '2999-01-01T00:00:00Z';

  test('journey and first round detection', () => {
    const now = Date.parse('2026-10-26T00:00:00Z');
    const journey = interviewJourney([
      { id: 'i1', round: 'Round 1', status: 'pass', scheduledAt: '2026-10-01 10:00:00' },
      { id: 'i2', round: 'Round 2', status: '', scheduledAt: '2026-11-01 10:00:00' },
    ], now);
    expect(journey.completed).toBe(1);
    expect(journey.next.record.id).toBe('i2');
    expect(isFirstRound('Round  1')).toBe(true);
    expect(isFirstRound('Round 12')).toBe(false);
  });

  test('readTestInvitation validates ownership and status', () => {
    const invitation = { id: 'v1', external_reference: 'c1', intended_email: EMAIL, status: 'pending', expires_at: future };
    expect(readTestInvitation({ success: true, invitation, invitation_url: 'https://test.example.com/t/1' }, { candidate, email: EMAIL })).toEqual({ status: 'pending', url: 'https://test.example.com/t/1', expiresAt: future });
    expect(readTestInvitation({ success: true, invitation: null }, { candidate, email: EMAIL }).status).toBe('not_created');
    expect(() => readTestInvitation({ success: true, invitation: { ...invitation, intended_email: 'x@y.z' } }, { candidate, email: EMAIL })).toThrow('did not match');
    expect(readTestInvitation({ success: true, invitation: { ...invitation, expires_at: '2000-01-01T00:00:00Z' } }, { candidate, email: EMAIL }).status).toBe('expired');
    expect(safeInvitationUrl('http://evil.example.com/x')).toBe('');
    expect(safeInvitationUrl('https://user:pw@example.com/x')).toBe('');
  });

  test('to-do view', () => {
    const view = testInvitationView({ status: 'accepted', url: 'https://t.example.com', expiresAt: future });
    expect(view).toMatchObject({ canOpen: true, started: true });
    expect(testInvitationView({ status: 'completed', url: '', expiresAt: future })).toMatchObject({ canOpen: false, completed: true });
    expect(testIsDue({ status: 'pending', url: 'https://t.example.com', expiresAt: future })).toBe(true);
  });

  test('fetchMyTestInvitation calls the recruitment backend with the CRM token and retries a 401 once', async () => {
    const invitation = { id: 'v1', external_reference: 'c1', intended_email: EMAIL, status: 'pending', expires_at: future };
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ success: false }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, invitation, invitation_url: 'https://test.example.com/t/1' }) });
    const result = await fetchMyTestInvitation({ candidate, email: EMAIL });
    expect(result.status).toBe('pending');
    expect(clearCrmToken).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://recruit.example.com/api/integrations/hrcrm/my-invitation?external_reference=c1');
    expect(options.headers.Authorization).toBe('Bearer crm-token');
    await expect(fetchMyTestInvitation({ candidate: { id: 'c1', email1: 'other@x.com' }, email: EMAIL })).rejects.toThrow('could not be verified');
  });
});

// ─── Screens ──────────────────────────────────────────────────────────────────

const data = {
  hrc_candidates: [{ id: 'c1', first_name: 'Asha', last_name: 'Rao', email1: EMAIL, current_designation: 'Designer', description: 'About me' }],
  hrc_job_postings: [{ id: 'job-1', job_title: 'Frontend Developer', job_location: 'Delhi', status: 'open' }, { id: 'job-2', job_title: 'Backend Developer', status: 'open' }],
  hrc_job_applications: [{ id: 'app1', jobid: 'job-1', status: 'interview', date_entered: '10/01/2026' }, { id: 'app2', jobid: 'job-2', status: 'rejected' }],
  hrc_interviews: [{ id: 'i1', description: 'Round 1', candidate_id: 'c1', email: EMAIL, interview_datetime: '2999-01-05 10:00:00' }],
  hrc_skills: [{ id: 'sk1', name: 'React' }],
  hrc_experience: [{ id: 'ex1', name: 'Dev', company_name: 'Acme', joining_date: '01/15/2020', leaving_date: '' }],
  hrc_education: [],
};

function respond(body) {
  if (body.action === 'fetch_related') return { success: true, records: data[body.related_module] || [], total_pages: 1 };
  if (body.action === 'fetch') return { success: true, records: data[body.module] || [], total_pages: 1 };
  return { success: true, id: 'new-id' };
}

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
    tree = create(
      <QueryClientProvider client={client}>
        <ScreenChrome.Provider value={{ headerShown: false }}>{element}</ScreenChrome.Provider>
      </QueryClientProvider>,
    );
  });
  mounted.push({ tree, client });
  return tree;
}

const settle = async () => {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
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

describe('candidate screens', () => {
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
  beforeEach(() => {
    gateway.mockImplementation(async (body) => respond(body));
    const invitation = { id: 'v1', external_reference: 'c1', intended_email: EMAIL, status: 'pending', expires_at: '2999-01-01T00:00:00Z' };
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, invitation, invitation_url: 'https://test.example.com/t/1' }) }));
  });

  test('My applications shows filters, counts and stage progress', async () => {
    const tree = mount(<MyApplicationsScreen navigation={navigation} route={{ params: {} }} />);
    await settle();
    const text = textOf(tree);
    expect(text).toContain('Frontend Developer');
    expect(text).toContain('In interviews');
    expect(text).toContain('step 3 of 4');
    expect(text).toContain('Showing 2 of 2 applications');
  });

  test('Interviews shows the to-do test card and summary tiles', async () => {
    const tree = mount(<InterviewsScreen navigation={navigation} />);
    await settle();
    const text = textOf(tree);
    expect(text).toContain('Complete the Round 1 test');
    expect(text).toContain('Open test');
    expect(text).toContain('Rounds completed');
    expect(text).toContain('To do');
  });

  test('Profile shows editable sections; edit form has street and postal code', async () => {
    let tree = mount(<CandidateProfileScreen navigation={navigation} />);
    await settle();
    expect(textOf(tree)).toContain('Complete your profile');
    expect(textOf(tree)).toContain('Government ID');
    tree = mount(<CandidateProfileEditScreen navigation={navigation} />);
    await settle();
    expect(textOf(tree)).toContain('Street address *');
    expect(textOf(tree)).toContain('Postal code *');
  });

  test('Related editor, resume and ID screens render', async () => {
    let tree = mount(<CandidateRelatedEditScreen navigation={navigation} route={{ params: { section: 'experiences' } }} />);
    await settle();
    expect(textOf(tree)).toContain('Acme / 2020-01-15 to present');
    expect(textOf(tree)).toContain('Add role');
    tree = mount(<CandidateResumeScreen navigation={navigation} route={{ params: {} }} />);
    await settle();
    expect(textOf(tree)).toContain('How did you hear about us?');
    tree = mount(<CandidateGovernmentIdScreen navigation={navigation} />);
    await settle();
    expect(textOf(tree)).toContain('Verify ID');
  });
});
