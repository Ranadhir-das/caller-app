const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function compile(file, mocks, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(`${__dirname}/../src/${file}`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  vm.runInNewContext(code, {
    exports,
    require: name => {
      assert.ok(name in mocks, `Unexpected import: ${name}`);
      return mocks[name];
    },
    __DEV__: false,
    AbortController,
    setTimeout,
    clearTimeout,
    Date,
    console,
    URLSearchParams,
    ...globals,
  });
  return exports;
}

test('activityApi.startActivity: transmits GPS and category payload to /mobile/activity/start/', async () => {
  let capturedUrl = null;
  let capturedOptions = null;

  const apiMock = {
    apiRequest: async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        has_active_session: true,
        session: { id: 10, status: 'ACTIVE' },
      };
    },
  };

  const service = compile('services/activity.ts', {
    './api': apiMock,
  });

  const res = await service.activityApi.startActivity('mock-token-xyz', {
    category_id: 3,
    note: 'Morning shift',
    latitude: 22.5726,
    longitude: 88.3639,
    accuracy: 12.5,
    recorded_at: '2026-10-29T09:00:00Z',
    is_mocked: false,
  });

  assert.equal(capturedUrl, '/mobile/activity/start/');
  assert.equal(capturedOptions.method, 'POST');
  assert.equal(capturedOptions.token, 'mock-token-xyz');
  assert.equal(capturedOptions.body.category_id, 3);
  assert.equal(capturedOptions.body.note, 'Morning shift');
  assert.equal(capturedOptions.body.latitude, 22.5726);
  assert.equal(capturedOptions.body.longitude, 88.3639);
  assert.equal(capturedOptions.body.accuracy, 12.5);
  assert.equal(capturedOptions.body.is_mocked, false);
  assert.equal(res.has_active_session, true);
});

test('activityApi.startActivity: works without GPS coordinates for exempt employees', async () => {
  let capturedUrl = null;
  let capturedOptions = null;

  const apiMock = {
    apiRequest: async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        has_active_session: true,
        session: { id: 11, status: 'ACTIVE' },
      };
    },
  };

  const service = compile('services/activity.ts', {
    './api': apiMock,
  });

  const res = await service.activityApi.startActivity('mock-token-exempt', {
    category_id: 1,
  });

  assert.equal(capturedUrl, '/mobile/activity/start/');
  assert.equal(capturedOptions.method, 'POST');
  assert.equal(capturedOptions.body.category_id, 1);
  assert.equal(capturedOptions.body.latitude, undefined);
  assert.equal(res.has_active_session, true);
});

test('auth.verifyLogin: transmits photo and challenge without requiring GPS', async () => {
  let capturedUrl = null;
  let capturedBody = null;

  const apiMock = {
    apiRequest: async (url, options) => {
      capturedUrl = url;
      capturedBody = options.body;
      return {
        token: 'auth-token-123',
        session_id: 'sess-uuid-456',
        user: { username: 'caller1' },
      };
    },
  };

  const secureStoreMock = {
    setItemAsync: async () => {},
    getItemAsync: async () => null,
    deleteItemAsync: async () => {},
  };

  const authService = compile('services/auth.ts', {
    './api': apiMock,
    './capabilities': { isCounselor: () => false, isCaller: () => true },
    'expo-secure-store': secureStoreMock,
  });

  // Verify login called with null location
  const res = await authService.verifyLogin('challenge-abc', 'base64-photo', true, null);
  assert.equal(capturedUrl, '/mobile/login/verify/');
  assert.equal(capturedBody.challenge, 'challenge-abc');
  assert.equal(capturedBody.photo, 'base64-photo');
  assert.equal(capturedBody.latitude, undefined);
  assert.equal(capturedBody.longitude, undefined);
  assert.equal(res.token, 'auth-token-123');
});
