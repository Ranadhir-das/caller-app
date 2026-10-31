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
    require: (name) => {
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

test('submitAttendanceRequest: posts payload to /mobile/employee/attendance-requests/', async () => {
  let capturedPath = '';
  let capturedOpts = null;

  const employeeModule = compile('services/employee.ts', {
    './api': {
      apiRequest: async (path, opts) => {
        capturedPath = path;
        capturedOpts = opts;
        return {
          id: 42,
          date: opts.body.date,
          request_type: opts.body.request_type,
          request_type_display: opts.body.request_type === 'LATE_ARRIVAL' ? 'Late Arrival Request' : 'Early Shift-End Request',
          reason: opts.body.reason,
          status: 'PENDING',
          status_display: 'Pending Review',
          reviewed_by_name: null,
          reviewed_at: null,
          review_notes: '',
          created_at: '2026-10-30T10:00:00Z',
        };
      },
    },
  });

  const payload = {
    date: '2026-10-30',
    request_type: 'LATE_ARRIVAL',
    reason: 'Vehicle breakdown on express highway.',
  };

  const result = await employeeModule.submitAttendanceRequest('test-auth-token', payload);

  assert.equal(capturedPath, '/mobile/employee/attendance-requests/');
  assert.equal(capturedOpts.method, 'POST');
  assert.equal(capturedOpts.token, 'test-auth-token');
  assert.deepEqual(capturedOpts.body, payload);
  assert.equal(result.id, 42);
  assert.equal(result.status, 'PENDING');
  assert.equal(result.request_type, 'LATE_ARRIVAL');
});

test('getAttendanceRequests: sends query param for status filtering', async () => {
  let capturedPath = '';
  let capturedOpts = null;

  const employeeModule = compile('services/employee.ts', {
    './api': {
      apiRequest: async (path, opts) => {
        capturedPath = path;
        capturedOpts = opts;
        return {
          requests: [
            {
              id: 101,
              date: '2026-10-30',
              request_type: 'EARLY_SHIFT_END',
              request_type_display: 'Early Shift-End Request',
              reason: 'Medical emergency at home.',
              status: 'APPROVED',
              status_display: 'Approved',
              reviewed_by_name: 'Admin Boss',
              reviewed_at: '2026-10-30T14:30:00Z',
              review_notes: 'Approved.',
              created_at: '2026-10-30T12:00:00Z',
            },
          ],
        };
      },
    },
  });

  // 1. Without status filter
  const resAll = await employeeModule.getAttendanceRequests('my-token');
  assert.equal(capturedPath, '/mobile/employee/attendance-requests/');
  assert.equal(resAll.requests.length, 1);

  // 2. With status filter
  const resApproved = await employeeModule.getAttendanceRequests('my-token', 'APPROVED');
  assert.equal(capturedPath, '/mobile/employee/attendance-requests/?status=APPROVED');
  assert.equal(capturedOpts.token, 'my-token');
  assert.equal(resApproved.requests[0].status, 'APPROVED');
});

test('cancelAttendanceRequest: sends DELETE to /mobile/employee/attendance-requests/<id>/', async () => {
  let capturedPath = '';
  let capturedOpts = null;

  const employeeModule = compile('services/employee.ts', {
    './api': {
      apiRequest: async (path, opts) => {
        capturedPath = path;
        capturedOpts = opts;
        return null;
      },
    },
  });

  await employeeModule.cancelAttendanceRequest('token-xyz', 88);

  assert.equal(capturedPath, '/mobile/employee/attendance-requests/88/');
  assert.equal(capturedOpts.method, 'DELETE');
  assert.equal(capturedOpts.token, 'token-xyz');
});
test('submitAttendanceRequest: supports requested_start, requested_end, requested_net_hours and session_id', async () => {
  let capturedBody = null;

  const employeeModule = compile('services/employee.ts', {
    './api': {
      apiRequest: async (path, opts) => {
        capturedBody = opts.body;
        return {
          id: 55,
          ...opts.body,
          status: 'PENDING',
          status_display: 'Pending Review',
          reviewed_by_name: null,
          reviewed_at: null,
          review_notes: '',
          created_at: '2026-10-30T10:00:00Z',
        };
      },
    },
  });

  const payload = {
    date: '2026-10-30',
    request_type: 'EARLY_SHIFT_END',
    reason: 'Doctor appointment for tooth extraction.',
    requested_end: '2026-10-30T16:30:00.000Z',
    requested_net_hours: '6.50',
    session_id: 'session-uuid-1234',
  };

  const res = await employeeModule.submitAttendanceRequest('token-abc', payload);
  assert.equal(capturedBody.session_id, 'session-uuid-1234');
  assert.equal(capturedBody.requested_end, '2026-10-30T16:30:00.000Z');
  assert.equal(capturedBody.requested_net_hours, '6.50');
  assert.equal(res.id, 55);
});
