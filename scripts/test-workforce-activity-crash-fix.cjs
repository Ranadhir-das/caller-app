const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function transpileCode(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;
}

function compile(file, mocks, globals = {}) {
  const exports = {};
  const code = transpileCode(fs.readFileSync(`${__dirname}/../src/${file}`, 'utf8'));

  vm.runInNewContext(code, {
    exports,
    require: (name) => {
      if (mocks[name]) return mocks[name];
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

test('EmployeeWorkspaceContext: useEmployeeWorkspace returns safe fallback outside provider without throwing', () => {
  let reactContextVal = null;
  const reactMock = {
    createContext: () => ({}),
    useContext: () => reactContextVal,
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useRef: (val) => ({ current: val }),
    useState: (val) => [val, () => {}],
    createElement: () => null,
  };

  const contextModule = compile('context/EmployeeWorkspaceContext.tsx', {
    react: reactMock,
    'react-native': { Alert: { alert: () => {} } },
    'expo-image-picker': {},
    '@/context/AuthContext': { useAuth: () => ({ token: null, refreshUser: async () => {} }) },
    '@/services/api': { apiRequest: async () => ({}) },
    '@/services/employee': {
      submitAttendanceRequest: async () => ({}),
      cancelAttendanceRequest: async () => {},
    },
  });

  // Verify useOptionalEmployeeWorkspace returns null when context is null
  assert.equal(contextModule.useOptionalEmployeeWorkspace(), null);

  // Verify useEmployeeWorkspace DOES NOT THROW when context is null, returns safe fallback
  let fallback = null;
  assert.doesNotThrow(() => {
    fallback = contextModule.useEmployeeWorkspace();
  });
  assert.ok(fallback, 'Fallback workspace state must be returned');
  assert.equal(fallback.data, null);
  assert.equal(fallback.busy, false);
  assert.equal(typeof fallback.load, 'function');
  assert.equal(typeof fallback.submitAttendanceRequest, 'function');
});

test('activity.tsx: Safe date and time formatters handle null, undefined, malformed strings without throwing', () => {
  const activityContent = fs.readFileSync(`${__dirname}/../src/app/activity.tsx`, 'utf8');

  // Extract formatSessionDate implementation
  const formatSessionDateMatch = activityContent.match(/function formatSessionDate[\s\S]*?\n\}/);
  assert.ok(formatSessionDateMatch, 'formatSessionDate function must exist in activity.tsx');

  // Extract formatEventTime implementation
  const formatEventTimeMatch = activityContent.match(/function formatEventTime[\s\S]*?\n\}/);
  assert.ok(formatEventTimeMatch, 'formatEventTime function must exist in activity.tsx');

  const evalSandbox = {};
  const transpiled = transpileCode(`${formatSessionDateMatch[0]}\n${formatEventTimeMatch[0]}`);
  vm.runInNewContext(transpiled, evalSandbox);

  const { formatSessionDate, formatEventTime } = evalSandbox;

  // Test formatSessionDate
  assert.equal(formatSessionDate(null), 'Unknown Date');
  assert.equal(formatSessionDate(undefined), 'Unknown Date');
  assert.equal(formatSessionDate(''), 'Unknown Date');
  assert.doesNotThrow(() => formatSessionDate('invalid-date-string'));
  assert.doesNotThrow(() => formatSessionDate('2026-10-30'));
  assert.doesNotThrow(() => formatSessionDate('2026-10-30T10:00:00Z'));

  const parsedValid = formatSessionDate('2026-10-30');
  assert.ok(parsedValid.includes('30') || parsedValid.includes('Oct'), `Expected formatted date, got: ${parsedValid}`);

  // Test formatEventTime
  assert.equal(formatEventTime(null), '');
  assert.equal(formatEventTime(undefined), '');
  assert.equal(formatEventTime(''), '');
  assert.doesNotThrow(() => formatEventTime('invalid-time'));
  assert.doesNotThrow(() => formatEventTime('2026-10-30T10:30:00Z'));
  const parsedTime = formatEventTime('2026-10-30T10:30:00Z');
  assert.ok(parsedTime.length > 0, 'Formatted time should produce non-empty string');
});

test('AttendanceRequestModal: parseTimeToIso handles 12h, 24h, ISO, and invalid formats safely', () => {
  const modalContent = fs.readFileSync(`${__dirname}/../src/components/AttendanceRequestModal.tsx`, 'utf8');
  const parseMatch = modalContent.match(/export function parseTimeToIso[\s\S]*?\n\}/);
  assert.ok(parseMatch, 'parseTimeToIso must exist');

  const evalSandbox = { exports: {} };
  const transpiled = transpileCode(parseMatch[0]);
  vm.runInNewContext(transpiled, evalSandbox);
  const parseTimeToIso = evalSandbox.exports.parseTimeToIso || evalSandbox.parseTimeToIso;
  assert.ok(typeof parseTimeToIso === 'function', 'parseTimeToIso must be a function');

  // 12-hour AM/PM
  const iso12Am = parseTimeToIso('2026-10-30', '10:30 AM');
  assert.ok(iso12Am, 'Should parse 10:30 AM');
  assert.ok(iso12Am.includes('2026-10-30'), 'Should contain target date');

  const iso12Pm = parseTimeToIso('2026-10-30', '04:15 PM');
  assert.ok(iso12Pm, 'Should parse 04:15 PM');

  // 24-hour
  const iso24 = parseTimeToIso('2026-10-30', '16:00');
  assert.ok(iso24, 'Should parse 16:00');

  // Invalid formats return null without throwing
  assert.equal(parseTimeToIso('2026-10-30', ''), null);
  assert.equal(parseTimeToIso('2026-10-30', 'not a time'), null);
  assert.equal(parseTimeToIso('2026-10-30', '25:99'), null);
});

test('Layout and routing: EmployeeWorkspaceProvider mounted at root, attendance routes corrected', () => {
  const rootLayout = fs.readFileSync(`${__dirname}/../src/app/_layout.tsx`, 'utf8');
  assert.ok(
    rootLayout.includes('EmployeeWorkspaceProvider'),
    '_layout.tsx must import and mount EmployeeWorkspaceProvider'
  );
  assert.ok(
    rootLayout.includes('<EmployeeWorkspaceProvider>') && rootLayout.includes('<AppNavigator />'),
    'EmployeeWorkspaceProvider must wrap AppNavigator in AccountData'
  );

  const activityScreen = fs.readFileSync(`${__dirname}/../src/app/activity.tsx`, 'utf8');
  assert.ok(
    !activityScreen.includes("router.push('/attendance' as any)"),
    'activity.tsx must not push non-existent /attendance route'
  );
  assert.ok(
    activityScreen.includes("router.push('/employee/attendance' as never)"),
    'activity.tsx must push /employee/attendance'
  );
  assert.ok(
    activityScreen.includes('export function ErrorBoundary'),
    'activity.tsx must export ErrorBoundary for crash resilience'
  );

  const widget = fs.readFileSync(`${__dirname}/../src/components/ActivityStatusWidget.tsx`, 'utf8');
  assert.ok(
    !widget.includes("router.push('/attendance' as never)"),
    'ActivityStatusWidget must not push non-existent /attendance route'
  );
  assert.ok(
    widget.includes("router.push('/employee/attendance' as never)"),
    'ActivityStatusWidget must push /employee/attendance'
  );
});
