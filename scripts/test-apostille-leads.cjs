const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks) {
  const context = { exports: {}, require(name) {
    if (name in mocks) return mocks[name];
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
    throw new Error(`Unexpected dependency ${name}`);
  }, console: { error() {}, warn() {} } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  return context.exports;
}
function service(request = async () => ({})) { return load('src/services/apostille.ts', { './api': { apiRequest: request } }); }
const input = { name: ' Name ', phone: '9876543210', country: ' UAE ', document_name: ' Degree ',
  number_of_documents: 2, conversion: true, notes: ' Confirmed ', reason: 'stale', client_event_id: 'stable-id' };
test('Apostille access uses authenticated capability, not a designation string', () => {
  const { canUseApostille } = service();
  assert.equal(canUseApostille({ role: 'CALLER', can_manage_apostille_leads: true }), true);
  for (const user of [null, { role: 'CALLER', designation: 'APOSTILLE' }, { role: 'COUNSELOR', can_manage_apostille_leads: true },
    { role: 'CALLER', can_manage_apostille_leads: true, needs_onboarding: true }]) assert.equal(canUseApostille(user), false);
});
test('conversion changes remove stale conditional fields', () => {
  const { apostillePayload } = service();
  const yes = apostillePayload(input); assert.equal(yes.notes, 'Confirmed'); assert.equal(yes.reason, '');
  const no = apostillePayload({ ...input, conversion: false, reason: 'Later' });
  assert.equal(no.notes, ''); assert.equal(no.reason, 'Later');
  assert.throws(() => apostillePayload({ ...input, conversion: false, reason: ' ' }), /reason/);
});
test('required fields and positive integral document count are validated', () => {
  const { apostillePayload } = service();
  for (const value of [0, -1, 1.5, NaN]) assert.throws(() => apostillePayload({ ...input, number_of_documents: value }), /positive whole/);
  for (const field of ['name', 'phone', 'country', 'document_name']) assert.throws(() => apostillePayload({ ...input, [field]: ' ' }), /Enter/);
});
test('save and retry use the existing token client and same event id', async () => {
  const calls = []; let fail = true;
  const { apostilleApi } = service(async (url, options) => { calls.push({ url, ...options }); if (fail) throw new Error('offline'); return { id: 9 }; });
  await assert.rejects(apostilleApi.save('test-token', input), /offline/);
  fail = false; assert.equal((await apostilleApi.save('test-token', input)).id, 9);
  assert.equal(calls[0].url, '/mobile/apostille-leads/'); assert.equal(calls[0].token, 'test-token');
  assert.equal(JSON.stringify(calls[0].body), JSON.stringify(calls[1].body));
  await apostilleApi.save('test-token', { ...input, revision: 2 }, '9');
  assert.equal(calls[2].method, 'PATCH'); assert.equal(calls[2].body.revision, 2);
});

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (tree == null || typeof tree === 'boolean') return '';
  if (Array.isArray(tree)) return tree.map(text).join('');
  return typeof tree === 'object' ? text(tree.props?.children) : String(tree);
}
async function loginScreen(result) {
  const slots = []; let cursor = 0; const verified = [], navigated = [], alerts = [];
  const h = { useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial;
    return [slots[i], value => { slots[i] = value; }]; } };
  const component = load('src/app/login.tsx', {
    react: h,
    'react-native': { ...Object.fromEntries(['Pressable', 'View', 'Text', 'Image', 'TextInput', 'Switch', 'ActivityIndicator'].map(v => [v, v])),
      Platform: { OS: 'android' }, StyleSheet: { create: v => v }, Alert: { alert: (...args) => alerts.push(args) } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/context/AppThemeContext': { useAppStyles: () => ({}), useAppTheme: () => ({ colors: {}, mode: 'light' }) },
    '@/context/AuthContext': { useAuth: () => ({ beginLogin: async () => { if (result instanceof Error) throw result; return result; },
      completeLogin: async (...args) => { verified.push(args); return { token: 'test-token', user: { role: 'COUNSELOR' } }; } }) },
    'expo-router': { router: { replace: route => navigated.push(route) } },
    'expo-image-picker': { requestCameraPermissionsAsync: () => { throw new Error('Camera must not be opened during login'); } },
    '@/services/location': { getCurrentCoords: async () => null },
    '@/services/counselor': { homeRouteFor: user => user.role === 'COUNSELOR' ? '/counselor' : '/employee' },
    '@/components/PasswordInput': { PasswordInput: 'PasswordInput' },
    '@/components/KeyboardAwareContainer': { KeyboardAwareContainer: 'KeyboardAwareContainer' },
    '@/components/NoteInputWithVoice': { NoteInputWithVoice: 'NoteInputWithVoice' },
    '@/assets/images/vaani-mark.png': 1,
  }).default;
  const render = () => { cursor = 0; return component(); };
  let tree = render();
  nodes(tree).find(n => n.props?.placeholder === 'Enter username').props.onChangeText('counselor');
  nodes(tree).find(n => n.props?.placeholder === 'Enter password').props.onChangeText('password');
  tree = render(); await nodes(tree).find(n => n.type === 'Pressable' && text(n) === 'Login').props.onPress();
  return { tree: render(), verified, navigated, alerts };
}
test('counselor server exemption finishes login without rendering photo screen', async () => {
  const app = await loginScreen({ status: 'PHOTO_REQUIRED', photo_required: false, challenge: 'server-challenge' });
  assert.equal(app.verified.length, 1); assert.equal(app.verified[0][1], undefined);
  assert.equal(app.navigated[0], '/counselor'); assert.equal(text(app.tree).includes('Take photo'), false);
});
test('photo required or omitted stays on verification flow', async () => {
  for (const extra of [{ photo_required: true }, {}]) {
    const app = await loginScreen({ status: 'PHOTO_REQUIRED', challenge: 'server-challenge', ...extra });
    assert.equal(app.verified.length, 0); assert.match(text(app.tree), /Take photo/);
  }
});
test('invalid credentials and pending account never complete login', async () => {
  for (const result of [new Error('Invalid credentials'), { status: 'PENDING', detail: 'Awaiting approval' }]) {
    const app = await loginScreen(result);
    assert.equal(app.verified.length, 0); assert.equal(app.alerts.length, 1); assert.equal(app.navigated.length, 0);
  }
});
