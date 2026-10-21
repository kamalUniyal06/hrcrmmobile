// Session plumbing: CRM token cache, refresh fallbacks, Bearer injection, store bootstrap, native Google fallback.
jest.mock('@react-native-async-storage/async-storage');

const mockGoogle = { configure: jest.fn(), hasPlayServices: jest.fn(), signIn: jest.fn(), signOut: jest.fn() };
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: mockGoogle,
  isSuccessResponse: (response) => response?.type === 'success',
  isErrorWithCode: (error) => Boolean(error && error.code),
  statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED', IN_PROGRESS: 'IN_PROGRESS', PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE' },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as crmAuth from '../src/services/crmAuth';
import { crmClient } from '../src/services/crmClient';
import { useAuthStore, normalizeMe, selectRole } from '../src/store/authStore';
import { signInWithGoogleNative } from '../src/services/googleAuth';

const meJson = (overrides = {}) => ({
  user: { email: 'kamal@example.com' },
  userInfo: { id: 'emp-1', stage: 'Joining', phase: 'Employment', status: 'employee' },
  subject_type: 'employee',
  crm_access_token: 'jwt-1',
  crm_access_token_expires_in: 600,
  ...overrides,
});

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

beforeEach(async () => {
  jest.clearAllMocks();
  crmAuth.clearCrmToken();
  crmAuth.registerBridgeRefresher(null);
  await AsyncStorage.clear();
  global.fetch = jest.fn();
});

describe('crmAuth', () => {
  test('caches the token from a me response and persists it', async () => {
    crmAuth.applyMeResponse(meJson());
    expect(crmAuth.hasCrmToken()).toBe(true);
    expect(await crmAuth.getCrmToken()).toBe('jwt-1');
    expect(global.fetch).not.toHaveBeenCalled();
    const saved = JSON.parse(await AsyncStorage.getItem('hrcrm.crmToken'));
    expect(saved.token).toBe('jwt-1');
    crmAuth.clearCrmToken();
    expect(crmAuth.hasCrmToken()).toBe(false);
    expect(await AsyncStorage.getItem('hrcrm.crmToken')).toBeNull();
  });

  test('refreshes through native fetch with cookies', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, meJson({ crm_access_token: 'jwt-2' })));
    expect(await crmAuth.getCrmToken()).toBe('jwt-2');
    expect(global.fetch).toHaveBeenCalledWith(crmAuth.ME_URL, expect.objectContaining({ credentials: 'include' }));
  });

  test('falls back to the WebView bridge, then reports expiry', async () => {
    global.fetch.mockResolvedValue(jsonResponse(401, { error: 'Invalid token' }));
    const bridge = jest.fn().mockResolvedValue(meJson({ crm_access_token: 'jwt-bridge' }));
    crmAuth.registerBridgeRefresher(bridge);
    expect(await crmAuth.getCrmToken()).toBe('jwt-bridge');
    expect(bridge).toHaveBeenCalledTimes(1);

    crmAuth.clearCrmToken();
    const expired = jest.fn();
    crmAuth.onSessionExpired(expired);
    bridge.mockRejectedValue(Object.assign(new Error('gone'), { status: 401 }));
    await expect(crmAuth.getCrmToken()).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(expired).toHaveBeenCalled();
  });

  test('network failure is not treated as expiry', async () => {
    global.fetch.mockRejectedValue(new Error('Network request failed'));
    const expired = jest.fn();
    crmAuth.onSessionExpired(expired);
    await expect(crmAuth.refreshSession()).rejects.toMatchObject({ code: 'NETWORK' });
    expect(expired).not.toHaveBeenCalled();
  });

  test('restores a still-valid token from storage', async () => {
    await AsyncStorage.setItem('hrcrm.crmToken', JSON.stringify({ token: 'jwt-saved', expiresAt: Date.now() + 60000 }));
    expect(await crmAuth.restoreCrmToken()).toBe(true);
    expect(await crmAuth.getCrmToken()).toBe('jwt-saved');
    await AsyncStorage.setItem('hrcrm.crmToken', JSON.stringify({ token: 'old', expiresAt: Date.now() - 1 }));
    crmAuth.clearCrmToken();
    expect(await crmAuth.restoreCrmToken()).toBe(false);
  });
});

describe('crmClient', () => {
  const sent = [];
  beforeEach(() => {
    sent.length = 0;
    crmClient.defaults.adapter = async (config) => {
      sent.push(config);
      return { data: { success: true }, status: 200, statusText: 'OK', headers: {}, config };
    };
  });

  test('adds the Bearer token only to CRM entry points', async () => {
    crmAuth.applyMeResponse(meJson());
    await crmClient({ url: 'https://flight.hrcrm.ai/index.php?entryPoint=smart_gateway', method: 'POST', data: { action: 'fetch' } });
    await crmClient({ url: 'https://app.hrcrm.ai/public/index.php?controller=auth', method: 'GET' });
    expect(sent[0].headers.Authorization).toBe('Bearer jwt-1');
    expect(sent[1].headers.Authorization).toBeUndefined();
  });

  test('retries a CRM 401 once with a fresh token', async () => {
    crmAuth.applyMeResponse(meJson());
    global.fetch.mockResolvedValue(jsonResponse(200, meJson({ crm_access_token: 'jwt-fresh' })));
    let calls = 0;
    crmClient.defaults.adapter = async (config) => {
      calls += 1;
      sent.push(config);
      if (calls === 1) {
        const error = new Error('Unauthorized');
        error.config = config;
        error.response = { status: 401, data: {}, headers: {}, config };
        throw error;
      }
      return { data: { success: true }, status: 200, statusText: 'OK', headers: {}, config };
    };
    const response = await crmClient({ url: 'https://flight.hrcrm.ai/index.php?entryPoint=smart_gateway', method: 'POST', data: {} });
    expect(response.data.success).toBe(true);
    expect(calls).toBe(2);
    expect(sent[1].headers.Authorization).toBe('Bearer jwt-fresh');
  });
});

describe('authStore', () => {
  test('normalises both backend response shapes and derives the role', () => {
    const nested = normalizeMe(meJson());
    expect(nested.userInfo).toMatchObject({ id: 'emp-1', phase: 'Employment', subject_type: 'employee' });
    const flat = normalizeMe({ user: { email: 'a@b.c' }, id: '7', stage: 'S', phase: 'Employment', status: 'admin' });
    expect(flat.userInfo).toMatchObject({ id: '7', status: 'admin' });
    expect(selectRole({ status: 'signedIn', userInfo: flat.userInfo })).toBe('admin');
    expect(selectRole({ status: 'signedIn', userInfo: nested.userInfo })).toBe('employee');
    expect(selectRole({ status: 'signedIn', userInfo: { phase: 'Hiring' } })).toBe('candidate');
  });

  test('signInWithMe stores the session; bootstrap restores it; expiry signs out', async () => {
    const store = useAuthStore.getState();
    await store.signInWithMe(meJson());
    expect(useAuthStore.getState().status).toBe('signedIn');
    expect(JSON.parse(await AsyncStorage.getItem('hrcrm.session')).user.email).toBe('kamal@example.com');

    useAuthStore.setState({ status: 'booting', user: {}, userInfo: {} });
    crmAuth.clearCrmToken();
    await AsyncStorage.setItem('hrcrm.crmToken', JSON.stringify({ token: 'jwt-saved', expiresAt: Date.now() + 60000 }));
    global.fetch.mockRejectedValue(new Error('offline'));
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedIn', user: { email: 'kamal@example.com' } });

    await useAuthStore.getState().expire('bye');
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedOut', notice: 'bye' });
    expect(await AsyncStorage.getItem('hrcrm.session')).toBeNull();
  });

  test('bootstrap with no saved session and a 401 ends signed out without a notice', async () => {
    useAuthStore.setState({ status: 'booting', user: {}, userInfo: {}, notice: null });
    global.fetch.mockResolvedValue(jsonResponse(401, { error: 'Invalid token' }));
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedOut', notice: null });
  });
});

describe('native Google sign-in', () => {
  test('falls back to the web flow when the backend has no token route', async () => {
    jest.resetModules();
    jest.doMock('../src/config', () => ({ ...jest.requireActual('../src/config'), GOOGLE_WEB_CLIENT_ID_VALUE: 'web-client-id' }));
    const { signInWithGoogleNative: signIn } = require('../src/services/googleAuth');
    mockGoogle.hasPlayServices.mockResolvedValue(true);
    mockGoogle.signIn.mockResolvedValue({ type: 'success', data: { idToken: 'google-id-token', user: { email: 'kamal@example.com' } } });
    global.fetch.mockResolvedValue(jsonResponse(200, { error: 'Invalid auth route' }));
    const result = await signIn();
    expect(result.status).toBe('fallback');
    expect(global.fetch.mock.calls[0][0]).toContain('action=googleTokenLogin');
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ id_token: 'google-id-token' });

    global.fetch.mockResolvedValue(jsonResponse(200, meJson()));
    expect((await signIn()).status).toBe('ok');

    mockGoogle.signIn.mockResolvedValue({ type: 'cancelled', data: null });
    expect((await signIn()).status).toBe('cancelled');

    mockGoogle.signIn.mockRejectedValue({ code: 'PLAY_SERVICES_NOT_AVAILABLE', message: 'no play' });
    expect((await signIn()).status).toBe('fallback');
    jest.dontMock('../src/config');
  });

  test('without a client id it defers to the web flow immediately', async () => {
    expect((await signInWithGoogleNative()).status).toBe('fallback');
    expect(mockGoogle.signIn).not.toHaveBeenCalled();
  });
});
