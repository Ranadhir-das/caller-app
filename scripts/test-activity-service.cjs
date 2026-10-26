const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadService(file, dependencies = {}) {
  const context = {
    exports: {},
    require: (name) => dependencies[name] || {},
    console,
    URLSearchParams,
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/services/', file), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  vm.runInNewContext(compiled, context);
  return context.exports;
}

function loadContext(file, dependencies = {}) {
  const context = {
    exports: {},
    require: (name) => dependencies[name] || {},
    console,
    setInterval,
    clearInterval,
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/context/', file), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;
  vm.runInNewContext(compiled, context);
  return context.exports;
}

test('formatDuration formats seconds accurately into HH:MM:SS', () => {
  const { formatDuration } = loadContext('ActivityContext.tsx', {
    react: { createContext: () => ({ Provider: () => null }) },
    'react-native': { AppState: { addEventListener: () => ({ remove: () => {} }) } },
    './AuthContext': { useAuth: () => ({}) },
    '@/services/activity': {},
    '@/services/api': {},
  });

  assert.equal(formatDuration(0), '00:00:00');
  assert.equal(formatDuration(59), '00:00:59');
  assert.equal(formatDuration(60), '00:01:00');
  assert.equal(formatDuration(3600), '01:00:00');
  assert.equal(formatDuration(3665), '01:01:05');
  assert.equal(formatDuration(86400), '24:00:00');
  assert.equal(formatDuration(-10), '00:00:00');
});

test('activityApi endpoints use authenticated API client and correct payloads', async () => {
  const calls = [];
  const mockApiRequest = async (endpoint, opts) => {
    calls.push({ endpoint, ...opts });
    if (endpoint.includes('categories')) {
      return { categories: [], break_reasons: [] };
    }
    if (endpoint.includes('end')) {
      return { detail: 'Ended', session: { id: 1, net_seconds: 100 } };
    }
    return { has_active_session: true, session: null };
  };

  const { activityApi } = loadService('activity.ts', {
    './api': { apiRequest: mockApiRequest },
  });

  // 1. getCurrentActivity
  await activityApi.getCurrentActivity('token123');
  assert.equal(calls[0].endpoint, '/mobile/activity/current/');
  assert.equal(calls[0].token, 'token123');

  // 2. getActivityCategories
  await activityApi.getActivityCategories('token123');
  assert.equal(calls[1].endpoint, '/mobile/activity/categories/');
  assert.equal(calls[1].token, 'token123');

  // 3. pauseActivity
  await activityApi.pauseActivity('token123', { break_reason_id: 5, note: 'Tea' });
  assert.equal(calls[2].endpoint, '/mobile/activity/pause/');
  assert.equal(calls[2].method, 'POST');
  assert.equal(calls[2].token, 'token123');
  assert.deepEqual(calls[2].body, { break_reason_id: 5, note: 'Tea' });

  // 4. resumeActivity
  await activityApi.resumeActivity('token123', { category_id: 2, note: 'Back' });
  assert.equal(calls[3].endpoint, '/mobile/activity/resume/');
  assert.equal(calls[3].method, 'POST');
  assert.equal(calls[3].token, 'token123');
  assert.deepEqual(calls[3].body, { category_id: 2, note: 'Back' });

  // 5. switchActivity
  await activityApi.switchActivity('token123', { category_id: 3, note: 'Switching' });
  assert.equal(calls[4].endpoint, '/mobile/activity/switch/');
  assert.equal(calls[4].method, 'POST');
  assert.deepEqual(calls[4].body, { category_id: 3, note: 'Switching' });

  // 6. endActivity
  await activityApi.endActivity('token123', { note: 'Day done' });
  assert.equal(calls[5].endpoint, '/mobile/activity/end/');
  assert.equal(calls[5].method, 'POST');
  assert.deepEqual(calls[5].body, { note: 'Day done' });

  // 7. getActivityHistory with preset
  await activityApi.getActivityHistory('token123', { preset: 'last_7_days' });
  assert.equal(calls[6].endpoint, '/mobile/activity/history/?preset=last_7_days');
  assert.equal(calls[6].token, 'token123');

  // 8. getActivityHistory with custom date range
  await activityApi.getActivityHistory('token123', {
    start_date: '2026-10-01',
    end_date: '2026-10-26',
  });
  assert.equal(
    calls[7].endpoint,
    '/mobile/activity/history/?start_date=2026-10-01&end_date=2026-10-26'
  );
});

