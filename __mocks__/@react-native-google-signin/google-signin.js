// Jest stand-in for the native Google Sign-In module (no Play Services in tests).
const GoogleSignin = {
  configure: jest.fn(),
  hasPlayServices: jest.fn(async () => true),
  signIn: jest.fn(async () => ({ type: 'cancelled', data: null })),
  signInSilently: jest.fn(async () => ({ type: 'noSavedCredentialFound', data: null })),
  signOut: jest.fn(async () => null),
  revokeAccess: jest.fn(async () => null),
  getTokens: jest.fn(async () => ({ idToken: '', accessToken: '' })),
};

const statusCodes = {
  SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  IN_PROGRESS: 'IN_PROGRESS',
  PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
};

module.exports = {
  GoogleSignin,
  statusCodes,
  isSuccessResponse: (response) => response?.type === 'success',
  isCancelledResponse: (response) => response?.type === 'cancelled',
  isErrorWithCode: (error) => Boolean(error && typeof error.code === 'string'),
  GoogleSigninButton: () => null,
};
