const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(file, imports = {}, extra = {}) {
  const context = { exports: {}, __DEV__: false, console, AbortController, setTimeout, clearTimeout,
    require: name => { if (!(name in imports)) throw new Error(`Unexpected dependency: ${name}`); return imports[name]; }, ...extra };
  vm.runInNewContext(ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, context);
  return context.exports;
}
const centerFile = 'src/services/notificationCenter.ts';
const route = load('src/services/notificationRouting.ts').websiteLeadNotificationTarget;
const item = { id: 9, type: 'LEAD_ASSIGNED', title: 'New Lead Assigned', body: 'Assigned.',
  data: { type: 'LEAD_ASSIGNED', lead_id: 42 }, is_read: false, read_at: null, created_at: '2026-09-30T10:00:00Z' };
function api(result) {
  const calls = [];
  const service = load(centerFile, { './api': { apiRequest: async (...args) => {
    calls.push(args); if (result instanceof Error) throw result; return result;
  } } });
  return { service, calls };
}
test('notification list preserves paginated fields and uses authenticated relative URL', async () => {
  const result = { count: 26, next: 'https://untrusted.example/page', previous: null, results: [item] };
  const { service, calls } = api(result);
  assert.equal(await service.getNotifications('session', 2), result);
  assert.equal(calls[0][0], '/mobile/notifications/?page=2');
  assert.equal(calls[0][1].token, 'session');
});
test('unread count parsing retains real counts and rejects invalid values', async () => {
  assert.equal(await api({ unread_count: 123 }).service.getUnreadCount('session'), 123);
  for (const value of [-1, '2', null, 1.5])
    await assert.rejects(api({ unread_count: value }).service.getUnreadCount('session'));
});
test('badge hides zero and caps display only', () => {
  const { service } = api(null);
  assert.equal(service.unreadBadge(0), '');
  assert.equal(service.unreadBadge(5), '5');
  assert.equal(service.unreadBadge(999), '99+');
});
test('mark read posts exact ID and emits change after success', async () => {
  const { service, calls } = api({ ...item, is_read: true });
  let changed = 0;
  const stop = service.subscribeNotificationCenter(() => changed++);
  const result = await service.markNotificationRead('session', '9');
  assert.equal(calls[0][0], '/mobile/notifications/9/read/');
  assert.equal(calls[0][1].method, 'POST');
  assert.equal(calls[0][1].token, 'session');
  assert.equal(result.is_read, true);
  assert.equal(changed, 1);
  stop(); service.notificationCenterChanged(); assert.equal(changed, 1);
});
test('mark all uses owner-authenticated endpoint without recipient overrides', async () => {
  const { service, calls } = api({ updated: 3 });
  assert.equal((await service.markAllNotificationsRead('session')).updated, 3);
  assert.equal(calls[0][0], '/mobile/notifications/read-all/');
  assert.equal(calls[0][1].method, 'POST');
  assert.equal(calls[0][1].body, undefined);
});
test('invalid notification IDs never produce a request', async () => {
  const { service, calls } = api(item);
  for (const id of [undefined, null, 0, -1, 1.2, {}, [], true, '../read-all', '1e3', Number.MAX_SAFE_INTEGER + 1])
    assert.equal(await service.markNotificationRead('session', id), null);
  assert.equal(calls.length, 0);
});
test('old pushes and malformed notification IDs can still target valid assigned leads', async () => {
  const { service, calls } = api(item);
  for (const id of [undefined, 'bad', null]) {
    const data = { type: 'LEAD_ASSIGNED', lead_id: 42, notification_id: id };
    await service.markPushNotificationRead('session', data);
    assert.equal(route(data, true).pathname, '/lead-details');
  }
  assert.equal(calls.length, 0);
});
test('push read errors are nonfatal and exact persistent ID is used', async () => {
  const { service, calls } = api(new Error('offline'));
  await service.markPushNotificationRead('session', { type: 'LEAD_ASSIGNED', lead_id: 42, notification_id: 9 });
  assert.equal(calls[0][0], '/mobile/notifications/9/read/');
});
test('assigned lead IDs are validated and taps cannot bypass auth', () => {
  assert.equal(route({ type: 'LEAD_ASSIGNED', lead_id: '42' }, true).params.id, '42');
  for (const id of [undefined, 0, -1, 'bad', {}, true]) assert.equal(route({ type: 'LEAD_ASSIGNED', lead_id: id }, true), null);
  assert.equal(route({ type: 'LEAD_ASSIGNED', lead_id: 42 }, false), null);
});

function registration(auth, mark = async () => {}) {
  let callback, cleanup, removed = false;
  const routes = [];
  const component = load('src/components/PushNotificationRegistration.tsx', {
    react: { useEffect: effect => { cleanup = effect(); } },
    '@/context/AuthContext': { useAuth: () => auth },
    '@/services/notifications': { setupNotificationListeners: (token, response) => {
      callback = response; return () => { removed = true; };
    } },
    'expo-router': { router: { push: value => routes.push(value) }, useRootNavigationState: () => ({ key: 'ready' }) },
    '@/services/notificationRouting': { websiteLeadNotificationTarget: route },
    '@/services/notificationCenter': { markPushNotificationRead: mark },
  });
  component.PushNotificationRegistration();
  return { routes, callback, cleanup, removed: () => removed };
}
const signedIn = { token: 'session', user: { id: 1, role: 'CALLER', needs_onboarding: false }, loading: false };
test('push tap waits for mark-read then routes only to lead detail', async () => {
  let finish;
  const state = registration(signedIn, () => new Promise(resolve => { finish = resolve; }));
  assert.equal(state.callback({ type: 'LEAD_ASSIGNED', lead_id: 42, notification_id: 9 }, 'push-1'), true);
  assert.equal(state.routes.length, 0);
  finish(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.routes[0].pathname, '/lead-details');
  assert.equal(state.routes[0].params.fromNotification, '1');
  state.cleanup(); assert.equal(state.removed(), true);
});
test('logout while mark-read is pending cancels navigation', async () => {
  let finish;
  const state = registration(signedIn, () => new Promise(resolve => { finish = resolve; }));
  state.callback({ type: 'LEAD_ASSIGNED', lead_id: 42 }, 'push-2');
  state.cleanup(); finish(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.routes.length, 0);
});
test('cold-start listener waits until authentication restoration completes', () => {
  assert.equal(registration({ ...signedIn, loading: true }).callback, undefined);
  assert.equal(registration({ token: null, user: null, loading: false }).callback, undefined);
  const state = registration(signedIn);
  assert.equal(typeof state.callback, 'function'); state.cleanup();
});
test('onboarding and noncallers cannot open lead notifications', () => {
  for (const user of [{ id: 1, role: 'CALLER', needs_onboarding: true }, { id: 1, role: 'ADMIN' }]) {
    const state = registration({ ...signedIn, user });
    assert.equal(state.callback({ type: 'LEAD_ASSIGNED', lead_id: 42 }, 'push'), false);
    state.cleanup();
  }
});
test('inbox and push taps never claim or start a call', () => {
  for (const file of [centerFile, 'src/app/notifications.tsx', 'src/components/PushNotificationRegistration.tsx'])
    assert.doesNotMatch(read(file), /claimLead|\/claim\/|\/call-started\/|\/dialer|\/calls\//);
  const detail = read('src/app/lead-details.tsx');
  assert.match(detail, /\/mobile\/leads\/\$\{encodeURIComponent\(id\)\}/);
  assert.match(detail, /This lead is no longer assigned to you/);
});
