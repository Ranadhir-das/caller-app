const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const tick = () => new Promise(resolve => setImmediate(resolve));
const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
function harness(file, overrides = {}) {
  let cursor = 0; const slots = [], effects = [], alerts = [], navigation = [];
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(value) { const i = cursor++; return slots[i] || (slots[i] = { current: value }); },
    useCallback: fn => fn, useMemo: fn => fn(),
    useEffect(fn, deps) { const i = cursor++; const prev = slots[i];
      if (!prev || deps.some((d, n) => d !== prev[n])) { slots[i] = deps; effects.push(fn); } },
  };
  const mocks = {
    react: hooks, 'react/jsx-runtime': jsx,
    'react-native': { ...Object.fromEntries(['ActivityIndicator', 'Modal', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View'].map(x => [x, x])),
      Platform: { OS: 'android' }, StyleSheet: { create: s => s }, Alert: { alert: (...args) => alerts.push(args) } },
    'expo-router': { useLocalSearchParams: () => ({}), useFocusEffect: fn => hooks.useEffect(fn, []),
      router: { push: value => navigation.push(value), replace: value => navigation.push(value) } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/components/AnimatedBackButton': { AnimatedBackButton: 'BackButton' },
    '@/context/AuthContext': { useAuth: () => ({ token: 'session', user: { id: 1, role: 'CALLER' } }) },
    '@/context/AppThemeContext': { useAppStyles: () => ({}), useAppTheme: () => ({ colors: {} }) },
    '@/context/LeadContext': { useLeads: () => ({ leads: [{ id: '9', phone: '9876543210', name: 'Existing' }] }) },
    '@/services/callDrafts': { listCallDrafts: async () => [] }, '@/services/recordingUploads': {},
    ...overrides,
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/../${file}`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, console, Error, require: name => { assert.ok(name in mocks, name); return mocks[name]; } });
  const Component = exports.default || exports.ForwardCounselorModal;
  const render = props => { cursor = 0; const tree = Component(props); effects.splice(0).forEach(fn => fn()); return tree; };
  return { render, alerts, navigation };
}
function nodes(tree) {
  if (tree == null || typeof tree !== 'object') return [];
  return Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
}
const find = (tree, label) => nodes(tree).find(n => n.props.accessibilityLabel === label);

test('Direct Dialer has a native editable field: formatted paste, selection replacement and backspace', async () => {
  const calls = [];
  const app = harness('src/app/direct-dialer.tsx', { '@/services/api': { apiRequest: async (_, options) => {
    calls.push(options); return { lead: null, phone_number: '+919876543210' };
  } } });
  let tree = app.render(); await tick();
  const field = find(tree, 'Phone number');
  assert.equal(field.type, 'TextInput');
  assert.equal(field.props.editable, true);
  assert.notEqual(field.props.contextMenuHidden, true);
  assert.notEqual(field.props.showSoftInputOnFocus, false);
  field.props.onChangeText('  +91 (98765) 43210  '); // Same handler as a native paste.
  tree = app.render(); assert.equal(find(tree, 'Phone number').props.value, '  +91 (98765) 43210  ');
  await find(tree, 'Call').props.onPress();
  assert.equal(calls[0].body.phone_number, '+91 (98765) 43210');
  assert.equal(calls[0].body.lead, undefined);
  tree = app.render(); find(tree, 'Phone number').props.onChangeText('1234567');
  tree = app.render(); find(tree, 'Phone number').props.onSelectionChange({ nativeEvent: { selection: { start: 2, end: 4 } } });
  find(tree, 'Key 9').props.onPress();
  tree = app.render(); assert.equal(find(tree, 'Phone number').props.value, '129567');
  find(tree, 'Backspace').props.onPress();
  assert.equal(find(app.render(), 'Phone number').props.value, '12567');
});

test('Partial suffix never selects a different lead; duplicate calls are locked and errors remain visible', async () => {
  const calls = []; let reject;
  const app = harness('src/app/direct-dialer.tsx', { '@/services/api': { apiRequest: async (_, options) => {
    calls.push(options); return new Promise((_, fail) => { reject = fail; });
  } } });
  app.render(); await tick();
  find(app.render(), 'Phone number').props.onChangeText('6543210');
  const call = find(app.render(), 'Call').props.onPress;
  const first = call(); await call();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.phone_number, '6543210');
  assert.equal(calls[0].body.lead, undefined);
  reject(new Error('This number is not available to your account.')); await first;
  assert.equal(app.navigation.length, 0);
  assert.match(app.alerts.at(-1)[1], /not available/);
});

test('Counselor forwarding locks repeated taps and closes only after confirmed persistence', async () => {
  let resolve, fail, attempts = 0, closed = 0, forwarded = 0;
  const app = harness('src/components/ForwardCounselorModal.tsx', { '@/services/counselor': {
    availabilityTone: () => 'success', COUNSELOR_TEAL: '#008080', counselorApi: {
      directory: async () => ({ counselors: [{ id: 8, name: 'Counselor', availability_label: 'Online' }] }),
      forward: async (token, lead, counselor) => {
        assert.equal(token, 'session'); assert.equal(lead, 91); assert.equal(counselor, 8); attempts++;
        return new Promise((yes, no) => { resolve = yes; fail = no; });
      },
    },
  } });
  const props = { visible: true, leadId: 91, onClose: () => closed++, onForwarded: () => forwarded++ };
  app.render(props); await tick();
  find(app.render(props), 'Counselor, Online').props.onPress();
  const send = find(app.render(props), 'Forward').props.onPress;
  const first = send(); await send();
  assert.equal(attempts, 1); assert.equal(closed, 0);
  const pending = app.render(props);
  nodes(pending).find(n => n.type === 'Modal').props.onRequestClose();
  assert.equal(closed, 0); assert.equal(find(pending, 'Counselor, Online').props.disabled, true);
  fail(new Error('Could not persist assignment')); await first;
  assert.equal(closed, 0); assert.equal(forwarded, 0);
  const retry = find(app.render(props), 'Forward').props.onPress();
  resolve({ assignment: { counselor_name: 'Counselor' } }); await retry;
  assert.equal(attempts, 2); assert.equal(forwarded, 1); assert.equal(closed, 1);
});

test('Follow-up detail completes the reminder, awaits success and reports failures without changing the lead', async () => {
  const item = { id: 15, lead: null, phone_number: '9876540001', scheduled_at: new Date().toISOString(), status: 'PENDING' };
  let reject, resolve, saves = 0;
  const app = harness('src/app/follow-up-details.tsx', {
    'expo-router': { useLocalSearchParams: () => ({ followup_id: '15' }), router: { replace() {} } },
    '@/services/followUps': { loadFollowUps: async () => [item] },
    '@/context/LeadContext': { useLeads: () => ({ dashboardFollowUps: [item], completeFollowUp: () => {
      saves++; return new Promise((yes, no) => { resolve = yes; reject = no; });
    } }) },
  });
  const completeButton = () => nodes(app.render()).find(n => n.type === 'Pressable' &&
    nodes(n).some(child => child.type === 'Text' && String(child.props.children).includes('Mark Follow-up Complete')));
  app.render(); await tick();
  completeButton().props.onPress();
  const confirm = app.alerts.at(-1)[2].find(b => b.text === 'Complete').onPress;
  const first = confirm(); await confirm(); assert.equal(saves, 1);
  assert.equal(app.alerts.length, 1);
  reject(new Error('Offline')); await first;
  assert.equal(app.alerts.at(-1)[0], 'Could not complete follow-up');
  completeButton().props.onPress();
  const retry = app.alerts.at(-1)[2].find(b => b.text === 'Complete').onPress();
  resolve(); await retry;
  assert.equal(app.alerts.at(-1)[0], 'Follow-up Completed');
});
