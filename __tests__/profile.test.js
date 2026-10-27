// "My profile" (employees and admins): API contract against a mocked Smart Gateway / hrc entry
// point, matching the web Profile page, plus render checks for the screen and the Account entry.
jest.mock('@react-native-async-storage/async-storage');
jest.mock('react-native-safe-area-context');
jest.mock('../src/services/api', () => ({ gateway: jest.fn(), http: jest.fn(), apiRequest: jest.fn(), fetchGpc: jest.fn(), smartGateway: jest.fn() }));
jest.mock('../src/config', () => ({ ...jest.requireActual('../src/config'), FETCH_GPC_X_API_KEY: 'test-key' }));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fetchGpc, gateway } from '../src/services/api';
import { useAuthStore } from '../src/store/authStore';
import { ScreenChrome } from '../src/components/ui';
import {
  aboutText,
  experienceDateForInput,
  fetchProfileRelated,
  findProfile,
  normalizeProfile,
  photoMimeType,
  saveMyProfile,
  saveProfile,
  saveProfileRelated,
  uploadProfilePhoto,
  validatePersonalDetails,
} from '../src/api/profile.api';
import { experienceDuration, formatDateRange, profileCompletion, relatedEntryView } from '../src/components/profile/profileFormat';
import MyProfileScreen from '../src/screens/shared/MyProfileScreen';
import AccountScreen from '../src/screens/shared/AccountScreen';

// eslint-disable-next-line @react-native/no-deep-imports -- React Native's FormData keeps file parts' uri/name/type (as in api.test.js).
global.FormData = require('react-native/Libraries/Network/FormData').default || require('react-native/Libraries/Network/FormData');

const EMAIL = 'kamal@example.com';
const record = {
  id: 'c1', first_name: 'Kamal', last_name: 'Uniyal', email1: EMAIL, phone_mobile: '+91 98765 43210', dob: '05/14/1995',
  gender: 'Male', current_designation: 'Developer', primary_address_street: '1 Main Rd', primary_address_city: 'Dehradun',
  primary_address_state: 'Uttarakhand', primary_address_postalcode: '248001', primary_address_country: 'India',
  linkedin_url: 'linkedin.com/in/kamal', description: 'I build mobile and web apps for HR teams and enjoy shipping polished products.',
  candidate_source: 'Employee Referral', status: 'Active', profile_image: 'https://cdn.example.com/k.jpg',
};
const related = {
  hrc_experience: [{ id: 'ex1', name: 'Developer', company_name: 'Acme', joining_date: '01/15/2020', leaving_date: '', deleted: '0' }, { id: 'ex2', deleted: '1' }],
  hrc_education: [{ id: 'ed1', name: 'B.Tech', institution: 'IIT', from_time: '2012', to_time: '2016' }],
  hrc_skills: [{ id: 'sk1', name: 'React', total_years_total_months: '5 yrs' }],
};

function respond(body) {
  if (body.action === 'fetch_related') return { success: true, records: related[body.related_module] || [], total_pages: 1 };
  if (body.action === 'fetch' && body.module === 'hrc_candidates') return { success: true, records: [record] };
  return { success: true, id: 'new-id' };
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'signedIn', user: { email: EMAIL }, userInfo: { id: 'emp-1', status: 'employee', phase: 'Employment' }, notice: null });
  gateway.mockImplementation(async (body) => respond(body));
});

describe('profile api', () => {
  test('findProfile looks up hrc_candidates by email1 like the web', async () => {
    const found = await findProfile(EMAIL);
    expect(gateway).toHaveBeenCalledWith({ action: 'fetch', module: 'hrc_candidates', filters: { email1: EMAIL }, page: 1, per_page: 20 });
    expect(found.id).toBe('c1');
    gateway.mockResolvedValueOnce({ success: true, records: [] });
    expect(await findProfile(EMAIL)).toBeNull();
    gateway.mockResolvedValueOnce({ success: true, records: [{ id: 'x', email1: 'other@example.com' }] });
    await expect(findProfile(EMAIL)).rejects.toThrow('unexpected email');
    gateway.mockResolvedValueOnce({ success: false, message: 'Denied' });
    await expect(findProfile(EMAIL)).rejects.toThrow('Denied');
    await expect(findProfile('')).rejects.toThrow('login email');
  });

  test('normalizeProfile mirrors web normalizeCandidate', () => {
    const draft = normalizeProfile({ full_name: 'Asha Devi Rao', city: 'Pune', dob: '05/14/1995', github_url: 'https://', linkedin_url: 'linkedin.com/in/a', profile_image: 'not-a-url', description: JSON.stringify({ about: 'Hello', skills: [] }) }, EMAIL);
    expect(draft).toMatchObject({ first_name: 'Asha Devi', last_name: 'Rao', email1: EMAIL, primary_address_city: 'Pune', dob: '1995-05-14', github_url: '', linkedin_url: 'https://linkedin.com/in/a', profile_image: '', description: 'Hello' });
    expect(aboutText('Intro text\n\nSKILLS\nname: React')).toBe('Intro text');
    expect(aboutText(JSON.stringify({ content: { candidate: { summary: 'From resume' } } }))).toBe('From resume');
  });

  test('saveProfile sends the web payload (update with id, create without)', async () => {
    const saved = await saveProfile('c1', { ...record, candidate_source: 'Employee Referral' }, EMAIL);
    const call = gateway.mock.calls[0][0];
    expect(call).toMatchObject({ action: 'update', module: 'hrc_candidates', id: 'c1' });
    expect(call.data).toMatchObject({ first_name: 'Kamal', email1: EMAIL, dob: '1995-05-14', candidate_source: 'Employee Referral', profile_image: 'https://cdn.example.com/k.jpg', title: '', department: '' });
    expect(saved.id).toBe('c1');
    gateway.mockClear();
    const created = await saveProfile(undefined, { first_name: 'New' }, EMAIL);
    expect(gateway.mock.calls[0][0]).toMatchObject({ action: 'create', module: 'hrc_candidates', data: { candidate_source: 'career_portal' } });
    expect(gateway.mock.calls[0][0]).not.toHaveProperty('id');
    expect(created.id).toBe('new-id');
    gateway.mockResolvedValueOnce({ success: false, message: 'Nope' });
    await expect(saveProfile('c1', {}, EMAIL)).rejects.toThrow('Nope');
  });

  test('fetchProfileRelated pages through fetch_related, drops deleted rows and normalizes experience dates', async () => {
    const items = await fetchProfileRelated('c1', 'experiences');
    expect(gateway).toHaveBeenCalledWith({ action: 'fetch_related', module: 'hrc_candidates', id: 'c1', related_module: 'hrc_experience', page: 1, per_page: 20 });
    expect(items).toEqual([{ id: 'ex1', name: 'Developer', company_name: 'Acme', joining_date: '2020-01-15', leaving_date: '', deleted: '0' }]);
    gateway.mockReset();
    gateway
      .mockResolvedValueOnce({ success: true, records: [{ id: 's1', name: 'A', years: 3 }], total_pages: 2 })
      .mockResolvedValueOnce({ success: true, records: [{ id: 's2', name: 'B', meta: { a: 1 } }], total_pages: 2 });
    const skills = await fetchProfileRelated('c1', 'skills');
    expect(skills).toEqual([{ id: 's1', name: 'A', years: '3' }, { id: 's2', name: 'B', meta: '{"a":1}' }]);
    expect(gateway.mock.calls[1][0].page).toBe(2);
    await expect(fetchProfileRelated('', 'skills')).rejects.toThrow('saved profile');
    gateway.mockResolvedValueOnce({ success: false, error: 'Boom' });
    await expect(fetchProfileRelated('c1', 'education')).rejects.toThrow('Boom');
    expect(experienceDateForInput('13/45/2020')).toBe('13/45/2020');
  });

  test('saveProfileRelated updates only changed whitelisted fields', async () => {
    const original = { id: 'sk1', name: 'React', version: '18', extra: 'x' };
    expect(await saveProfileRelated('skills', { ...original }, original)).toBe(false);
    expect(gateway).not.toHaveBeenCalled();
    expect(await saveProfileRelated('skills', { ...original, version: '19', extra: 'y' }, original)).toBe(true);
    expect(gateway).toHaveBeenCalledWith({ action: 'update', module: 'hrc_skills', id: 'sk1', data: { version: '19' } });
    await expect(saveProfileRelated('skills', { name: 'No id' }, original)).rejects.toThrow('missing its ID');
  });

  test('saveMyProfile saves the record, then changed related records', async () => {
    const original = [{ id: 'ed1', name: 'B.Tech', institution: 'IIT' }];
    const result = await saveMyProfile({
      record,
      draft: normalizeProfile(record, EMAIL),
      email: EMAIL,
      related: [{ section: 'education', items: [{ ...original[0], institution: 'IIT Delhi' }], original }],
    });
    expect(gateway.mock.calls.map(([body]) => [body.action, body.module])).toEqual([['update', 'hrc_candidates'], ['update', 'hrc_education']]);
    expect(gateway.mock.calls[0][0].data.candidate_source).toBe('Employee Referral');
    expect(gateway.mock.calls[1][0].data).toEqual({ institution: 'IIT Delhi' });
    expect(result.record.id).toBe('c1');
    expect(result.related.education[0].institution).toBe('IIT Delhi');
  });

  test('saveMyProfile rechecks for an existing record before creating one', async () => {
    await saveMyProfile({ record: null, draft: normalizeProfile({}, EMAIL), email: EMAIL });
    expect(gateway.mock.calls[0][0]).toMatchObject({ action: 'fetch', module: 'hrc_candidates' });
    expect(gateway.mock.calls[1][0]).toMatchObject({ action: 'update', id: 'c1' });
  });

  test('uploadProfilePhoto posts email + image to upload_candidate_image', async () => {
    fetchGpc.mockResolvedValue({ success: true, image_url: 'https://cdn.example.com/new.jpg' });
    const url = await uploadProfilePhoto({ email: EMAIL, file: { uri: 'file:///p.png', name: 'p.png', type: 'image/png' } });
    expect(url).toBe('https://cdn.example.com/new.jpg');
    const call = fetchGpc.mock.calls[0][0];
    expect(call).toMatchObject({ method: 'POST', params: { type: 'upload_candidate_image' } });
    expect(call.endpoint).toContain('entryPoint=hrc');
    const parts = call.body.getParts();
    expect(parts.find((part) => part.fieldName === 'email').string).toBe(EMAIL);
    expect(parts.find((part) => part.fieldName === 'image')).toMatchObject({ uri: 'file:///p.png', name: 'p.png', type: 'image/png' });
    fetchGpc.mockResolvedValue({ success: true, image_url: 'nope' });
    await expect(uploadProfilePhoto({ email: EMAIL, file: { uri: 'file:///p.png', name: 'p.png' } })).rejects.toThrow('valid image URL');
    fetchGpc.mockResolvedValue({ success: false, message: 'Too big' });
    await expect(uploadProfilePhoto({ email: EMAIL, file: { uri: 'file:///p.jpg', name: 'p.jpg' } })).rejects.toThrow('Too big');
    await expect(uploadProfilePhoto({ email: EMAIL, file: { uri: 'file:///p.gif', name: 'p.gif', type: 'image/gif' } })).rejects.toThrow('JPG, PNG, or WebP');
    expect(photoMimeType({ name: 'a.JPG' })).toBe('image/jpeg');
    expect(photoMimeType({ type: 'image/webp' })).toBe('image/webp');
  });

  test('validatePersonalDetails matches the web rules', () => {
    expect(validatePersonalDetails(normalizeProfile(record, EMAIL))).toEqual({});
    const errors = validatePersonalDetails({ ...normalizeProfile(record, EMAIL), phone_mobile: '12', dob: '2999-01-01', description: 'short', linkedin_url: 'nodot', gender: '' });
    expect(Object.keys(errors).sort()).toEqual(['description', 'dob', 'gender', 'linkedin_url', 'phone_mobile']);
  });

  test('display helpers', () => {
    expect(formatDateRange('2020-01-15', '', 'Present')).toBe('Jan 2020 – Present');
    expect(experienceDuration('2020-01-15', '2021-03-01')).toBe('1 yr 3 mos');
    expect(relatedEntryView('experiences', { name: 'Dev', company_name: 'Acme', designation: 'Dev' }).details).toEqual([]);
    expect(profileCompletion(normalizeProfile(record, EMAIL)).percent).toBe(100);
    expect(profileCompletion({}).missing).toHaveLength(8);
  });
});

// ── Screens ──────────────────────────────────────────────────────────────────

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
        <ScreenChrome.Provider value={{ headerShown: true }}>{element}</ScreenChrome.Provider>
      </QueryClientProvider>,
    );
  });
  mounted.push({ tree, client });
  return tree;
}

const settle = async () => {
  for (let i = 0; i < 6; i += 1) {
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

// The UI kit Button element with this title.
const button = (tree, title) => tree.root.find((node) => node.props.title === title && typeof node.props.onPress === 'function');

describe('MyProfileScreen', () => {
  test('shows every section of the saved profile', async () => {
    const tree = mount(<MyProfileScreen />);
    await settle();
    const text = textOf(tree);
    expect(text).toMatch(/100 ?%/);
    for (const expected of ['Kamal Uniyal', 'Developer', 'About', 'I build mobile', 'Personal details', 'Dehradun', 'Experience', 'Acme', 'Education', 'IIT', 'Skills', 'React', 'Profile photo', 'Profile strength']) {
      expect(text).toContain(expected);
    }
  });

  test('editing personal details saves through the gateway', async () => {
    const tree = mount(<MyProfileScreen />);
    await settle();
    await act(async () => button(tree, 'Edit details').props.onPress());
    expect(textOf(tree)).toContain('Professional summary');
    await act(async () => button(tree, 'Save profile').props.onPress());
    await settle();
    expect(gateway).toHaveBeenCalledWith(expect.objectContaining({ action: 'update', module: 'hrc_candidates', id: 'c1' }));
    expect(textOf(tree)).toContain('Edit details');
  });

  test('without a profile record it offers to create one', async () => {
    gateway.mockImplementation(async (body) => (body.action === 'fetch' ? { success: true, records: [] } : respond(body)));
    const tree = mount(<MyProfileScreen />);
    await settle();
    expect(textOf(tree)).toContain('No profile yet');
  });
});

describe('AccountScreen', () => {
  test('has a My profile entry that opens the MyProfile route', async () => {
    const navigation = { navigate: jest.fn() };
    const tree = mount(<AccountScreen navigation={navigation} route={{ params: { links: [] } }} />);
    await settle();
    expect(textOf(tree)).toContain('My profile');
    const entry = tree.root.find((node) => node.props.accessibilityLabel === 'My profile' && typeof node.props.onPress === 'function');
    act(() => entry.props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('MyProfile');
  });
});
