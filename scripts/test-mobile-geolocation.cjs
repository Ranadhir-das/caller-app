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
    ...globals,
  });
  return exports;
}

test('getFreshGpsReading: detects disabled location services', async () => {
  const locationMock = {
    hasServicesEnabledAsync: async () => false,
  };
  const rnMock = { Platform: { OS: 'android' }, Linking: {} };

  const service = compile('services/location.ts', {
    'expo-location': locationMock,
    'react-native': rnMock,
  });

  const result = await service.getFreshGpsReading();
  assert.equal(result.success, false);
  assert.equal(result.error, 'SERVICES_DISABLED');
  assert.equal(result.canRetry, true);
  assert.ok(result.message.includes('Device location services (GPS) are turned off'));
});

test('getFreshGpsReading: detects denied permission', async () => {
  const locationMock = {
    hasServicesEnabledAsync: async () => true,
    getForegroundPermissionsAsync: async () => ({ status: 'undetermined', canAskAgain: true }),
    requestForegroundPermissionsAsync: async () => ({ status: 'denied', canAskAgain: false }),
  };
  const rnMock = { Platform: { OS: 'android' }, Linking: {} };

  const service = compile('services/location.ts', {
    'expo-location': locationMock,
    'react-native': rnMock,
  });

  const result = await service.getFreshGpsReading();
  assert.equal(result.success, false);
  assert.equal(result.error, 'PERMISSION_DENIED');
  assert.equal(result.canRetry, false);
});

test('getFreshGpsReading: detects Android 12+ coarse/approximate permission and requires precise', async () => {
  const locationMock = {
    hasServicesEnabledAsync: async () => true,
    getForegroundPermissionsAsync: async () => ({
      status: 'granted',
      canAskAgain: true,
      android: { accuracy: 'coarse' },
    }),
  };
  const rnMock = { Platform: { OS: 'android' }, Linking: {} };

  const service = compile('services/location.ts', {
    'expo-location': locationMock,
    'react-native': rnMock,
  });

  const result = await service.getFreshGpsReading();
  assert.equal(result.success, false);
  assert.equal(result.error, 'PRECISE_LOCATION_REQUIRED');
  assert.ok(result.message.includes('Precise location is required'));
});

test('getFreshGpsReading: acquires fresh, accurate GPS fix within 25m', async () => {
  const now = Date.now();
  const locationMock = {
    Accuracy: { High: 4 },
    hasServicesEnabledAsync: async () => true,
    getForegroundPermissionsAsync: async () => ({
      status: 'granted',
      canAskAgain: true,
      android: { accuracy: 'fine' },
    }),
    getCurrentPositionAsync: async () => ({
      coords: {
        latitude: 22.572646,
        longitude: 88.363895,
        accuracy: 8.5,
        altitude: 12.0,
      },
      timestamp: now - 2000, // 2s old
      mocked: false,
    }),
  };
  const rnMock = { Platform: { OS: 'android' }, Linking: {} };

  const service = compile('services/location.ts', {
    'expo-location': locationMock,
    'react-native': rnMock,
  });

  const result = await service.getFreshGpsReading();
  assert.equal(result.success, true);
  assert.equal(result.reading.latitude, 22.572646);
  assert.equal(result.reading.longitude, 88.363895);
  assert.equal(result.reading.accuracy, 8.5);
  assert.equal(result.reading.is_mocked, false);
  assert.ok(result.reading.recorded_at.includes('T'));
});

test('getFreshGpsReading: retries on suboptimal accuracy and returns best reading with POOR_ACCURACY guidance', async () => {
  let callCount = 0;
  const now = Date.now();
  const locationMock = {
    Accuracy: { High: 4 },
    hasServicesEnabledAsync: async () => true,
    getForegroundPermissionsAsync: async () => ({
      status: 'granted',
      canAskAgain: true,
      android: { accuracy: 'fine' },
    }),
    getCurrentPositionAsync: async () => {
      callCount++;
      return {
        coords: {
          latitude: 22.572646,
          longitude: 88.363895,
          accuracy: 45.0, // Exceeds 25m
        },
        timestamp: now - 1000,
        mocked: false,
      };
    },
  };
  const rnMock = { Platform: { OS: 'android' }, Linking: {} };

  const service = compile('services/location.ts', {
    'expo-location': locationMock,
    'react-native': rnMock,
  });

  const result = await service.getFreshGpsReading({ maxAttempts: 2, timeoutMs: 3000 });
  assert.equal(callCount, 2); // Attempted retry
  assert.equal(result.success, false);
  assert.equal(result.error, 'POOR_ACCURACY');
  assert.ok(result.message.includes('target is ±25m or better'));
  assert.equal(result.reading.accuracy, 45.0);
});

test('getFreshGpsReading: rejects stale reading older than 60s', async () => {
  const now = Date.now();
  const locationMock = {
    Accuracy: { High: 4 },
    hasServicesEnabledAsync: async () => true,
    getForegroundPermissionsAsync: async () => ({
      status: 'granted',
      canAskAgain: true,
      android: { accuracy: 'fine' },
    }),
    getCurrentPositionAsync: async () => ({
      coords: {
        latitude: 22.572646,
        longitude: 88.363895,
        accuracy: 10.0,
      },
      timestamp: now - 90000, // 90 seconds old (> 60s limit)
      mocked: false,
    }),
  };
  const rnMock = { Platform: { OS: 'android' }, Linking: {} };

  const service = compile('services/location.ts', {
    'expo-location': locationMock,
    'react-native': rnMock,
  });

  const result = await service.getFreshGpsReading({ maxAttempts: 1, timeoutMs: 2000 });
  assert.equal(result.success, false);
  assert.equal(result.error, 'STALE_READING');
  assert.ok(result.message.includes('stale'));
});

test('auth.verifyLogin: transmits full GPS payload matching Django contract', async () => {
  const apiRequests = [];
  const secureStorage = new Map();

  const apiMock = {
    apiRequest: async (endpoint, options) => {
      apiRequests.push({ endpoint, options });
      return {
        token: 'auth-token-12345',
        session_id: 'session-uuid-67890',
        user: { id: 1, username: 'test_caller', role: 'CALLER', name: 'Test' },
      };
    },
  };
  const secureStoreMock = {
    setItemAsync: async (key, val) => secureStorage.set(key, val),
    getItemAsync: async key => secureStorage.get(key) || null,
    deleteItemAsync: async key => secureStorage.delete(key),
  };
  const capabilitiesMock = {
    isCallerCapable: () => true,
    isCounselorCapable: () => false,
    isDualRole: () => false,
    isFaceVerificationExempt: () => false,
  };

  const auth = compile('services/auth.ts', {
    './api': apiMock,
    'expo-secure-store': secureStoreMock,
    './capabilities': capabilitiesMock,
  });

  const gpsLocation = {
    latitude: 22.572646,
    longitude: 88.363895,
    accuracy: 12.4,
    recorded_at: '2026-10-28T06:30:00.000Z',
    is_mocked: false,
  };

  const result = await auth.verifyLogin(
    '11111111-2222-3333-4444-555555555555',
    'base64-photo-string',
    true,
    gpsLocation,
    'Shift start login'
  );

  assert.equal(result.token, 'auth-token-12345');
  assert.equal(secureStorage.get('caller_auth_token'), 'auth-token-12345');
  assert.equal(secureStorage.get('caller_session_id'), 'session-uuid-67890');

  assert.equal(apiRequests.length, 1);
  const sent = apiRequests[0];
  assert.equal(sent.endpoint, '/mobile/login/verify/');
  assert.equal(sent.options.body.challenge, '11111111-2222-3333-4444-555555555555');
  assert.equal(sent.options.body.photo, 'base64-photo-string');
  assert.equal(sent.options.body.consent, true);
  assert.equal(sent.options.body.latitude, 22.572646);
  assert.equal(sent.options.body.longitude, 88.363895);
  assert.equal(sent.options.body.accuracy, 12.4);
  assert.equal(sent.options.body.recorded_at, '2026-10-28T06:30:00.000Z');
  assert.equal(sent.options.body.timestamp, '2026-10-28T06:30:00.000Z');
  assert.equal(sent.options.body.is_mocked, false);
  assert.equal(sent.options.body.login_remark, 'Shift start login');
});

test('auth.verifyLogin: preserves backward compatibility when location is null', async () => {
  const apiRequests = [];
  const secureStorage = new Map();

  const apiMock = {
    apiRequest: async (endpoint, options) => {
      apiRequests.push({ endpoint, options });
      return {
        token: 'auth-token-counselor',
        session_id: 'session-counselor',
        user: { id: 2, username: 'test_counselor', role: 'COUNSELOR', name: 'Counselor' },
      };
    },
  };
  const secureStoreMock = {
    setItemAsync: async (key, val) => secureStorage.set(key, val),
    getItemAsync: async key => secureStorage.get(key) || null,
    deleteItemAsync: async key => secureStorage.delete(key),
  };
  const capabilitiesMock = {
    isCallerCapable: () => false,
    isCounselorCapable: () => true,
    isDualRole: () => false,
    isFaceVerificationExempt: () => true,
  };

  const auth = compile('services/auth.ts', {
    './api': apiMock,
    'expo-secure-store': secureStoreMock,
    './capabilities': capabilitiesMock,
  });

  const result = await auth.verifyLogin(
    '22222222-3333-4444-5555-666666666666',
    undefined,
    undefined,
    null
  );

  assert.equal(result.token, 'auth-token-counselor');
  assert.equal(apiRequests.length, 1);
  const sent = apiRequests[0];
  assert.equal(sent.options.body.latitude, undefined);
  assert.equal(sent.options.body.longitude, undefined);
  assert.equal(sent.options.body.accuracy, undefined);
  assert.equal(sent.options.body.recorded_at, undefined);
});

test('activityApi: forwards location payload on resumeActivity and endActivity', async () => {
  const requests = [];
  const apiMock = {
    apiRequest: async (endpoint, options) => {
      requests.push({ endpoint, options });
      return { status: 'ok' };
    },
  };

  const activity = compile('services/activity.ts', {
    './api': apiMock,
  });

  await activity.activityApi.resumeActivity('test-token', {
    category_id: 3,
    note: 'Lunch over',
    latitude: 22.572646,
    longitude: 88.363895,
    accuracy: 15.0,
    recorded_at: '2026-10-28T07:00:00.000Z',
    is_mocked: false,
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].endpoint, '/mobile/activity/resume/');
  assert.equal(requests[0].options.body.accuracy, 15.0);
  assert.equal(requests[0].options.body.latitude, 22.572646);

  await activity.activityApi.endActivity('test-token', {
    note: 'Day complete',
    latitude: 22.572646,
    longitude: 88.363895,
    accuracy: 10.0,
    recorded_at: '2026-10-28T17:00:00.000Z',
    is_mocked: false,
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[1].endpoint, '/mobile/activity/end/');
  assert.equal(requests[1].options.body.accuracy, 10.0);
  assert.equal(requests[1].options.body.latitude, 22.572646);
});

