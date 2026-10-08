// Exercise the actual screen/modal handlers with isolated React hooks and native/API doubles.
// This verifies application flow; it does not replace Android device UI testing.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const tick = () => new Promise(resolve => setImmediate(resolve));
class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
const base = { id: 'event-1', userId: 1, phone: '9876543210', name: 'Student', leadId: '7', direct: false,
  startedAt: '2026-10-06T10:00:00Z', endedAt: '2026-10-06T10:01:00Z', durationSeconds: 60 };
function hooks() {
  const slots = []; let cursor = 0; let effects = [];
  return {
    reset() { cursor = 0; },
    flush() { const pending = effects; effects = []; pending.forEach(fn => fn()); },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(value) { const i = cursor++; return slots[i] || (slots[i] = { current: value }); },
    useEffect(fn, deps) { const i = cursor++; const previous = slots[i];
      if (!previous || deps.some((dep, index) => dep !== previous.deps[index])) {
        effects.push(() => { previous?.cleanup?.(); const cleanup = fn(); slots[i] = { deps, cleanup }; });
      }
    },
  };
}
const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
function compile(file, mocks, cache = {}) {
  if (cache[file]) return cache[file];
  const output = { exports: {} };
  const requireMock = name => {
    if (name in mocks) return mocks[name];
    if (name === 'react/jsx-runtime') return jsx;
    if (name === '@/services/courses' || name === './courses') return compile('src/services/courses.ts', mocks, cache);
    if (name === '@/services/callOutcome') return compile('src/services/callOutcome.ts', mocks, cache);
    if (name === '@/services/counselor') return compile('src/services/counselor.ts', { ...mocks, './api': mocks['@/services/api'] }, cache);
    throw new Error(`Unexpected dependency (recording must not be imported): ${name}`);
  };
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports: output.exports, require: requireMock, console: { log() {}, warn() {}, error() {} }, setTimeout: () => 1, clearTimeout() {} });
  cache[file] = output.exports; return output.exports;
}
function nodes(tree) {
  if (tree == null || typeof tree === 'boolean') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (tree == null || typeof tree === 'boolean') return '';
  if (Array.isArray(tree)) return tree.map(text).join('');
  return typeof tree === 'object' ? text(tree.props?.children) : String(tree);
}
function button(tree, label) {
  const found = nodes(tree).find(n => n.type === 'Pressable' && (n.props.accessibilityLabel === label || text(n) === label ||
    nodes(n.props.children).some(child => child.type === 'Text' && text(child) === label)));
  assert.ok(found, `Missing button ${label}`); return found;
}
async function screen(options = {}) {
  let draft = { ...base, ...options.draft }; const h = hooks(); const calls = [], alerts = [], history = [], patches = [], navigation = [];
  const mocks = {
    react: h,
    'react-native': { ...Object.fromEntries(['Pressable','View','Text','ScrollView','TextInput','Modal','KeyboardAvoidingView'].map(n => [n,n])),
      Platform: { OS: 'android' }, StyleSheet: { create: v => v }, Alert: { alert: (...args) => alerts.push(args) } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/components/KeyboardAwareContainer': { KeyboardAwareContainer: 'KeyboardAwareContainer' },
    '@/components/NoteInputWithVoice': { NoteInputWithVoice: 'NoteInputWithVoice' },
    '@/components/AnimatedBackButton': { AnimatedBackButton: 'BackButton' },
    '@/components/InterestedCourseSteps': { InterestedCourseSteps: 'InterestedCourseSteps' },
    '@/components/OutcomeWhatsAppEditor': { OutcomeWhatsAppEditor: 'OutcomeWhatsAppEditor' },
    '@/components/ForwardCounselorModal': { ForwardCounselorModal: 'ForwardCounselorModal' },
    '@/context/AppThemeContext': { useAppStyles: () => ({}), useAppTheme: () => ({ colors: {}, mode: 'light' }) },
    '@/context/AuthContext': { useAuth: () => ({ user: { id: 1, username: 'Caller', role: options.role }, token: 'session' }) },
    '@/context/DialerSessionContext': { useDialerSession: () => ({ recordCall() {} }) },
    '@/context/LeadContext': { useLeads: () => ({ leads: [], refresh: options.refresh || (() => Promise.resolve()),
      addCallHistory: value => history.push(value), getNextPendingLead: () => undefined }) },
    'expo-router': { useLocalSearchParams: () => ({ draft_id: base.id }), router: { replace: value => navigation.push(value) } },
    '@react-native-community/datetimepicker': { __esModule: true, default: 'DateTimePicker' },
    '@/services/whatsapp': { launchWhatsAppHandoff: async () => ({ success: true }) },
    '@/services/api': { ApiError, apiRequest: async (url, args) => { calls.push({ url, ...args });
      if (options.request) return options.request(url, args);
      return { id: 21, lead: 7, lead_name: 'Student', phone_number: base.phone, followup: args.body.callback_at ? { scheduled_at: args.body.callback_at, status: 'PENDING' } : null,
        selected_course: args.body.selected_course, expected_admission_year: args.body.expected_admission_year }; } },
    '@/services/callDrafts': { newCallId: () => base.id, readCallDraft: async () => draft, saveCallDraft: async () => {},
      patchCallDraft: async (_, __, patch) => { patches.push(patch); if (options.cleanupFailure && patch.savedCallId) throw new Error('Disk full'); draft = { ...draft, ...patch }; },
      removeCallDraft: async () => { draft = null; } },
  };
  const component = compile('src/app/call-outcome.tsx', mocks).default;
  const render = () => { h.reset(); const tree = component(); h.flush(); return tree; };
  render(); await tick();
  return { render, calls, alerts, history, patches, mocks, draft: () => draft, navigation };
}
function modal(props, mocks) {
  const h = hooks(); const component = compile('src/components/InterestedCourseSteps.tsx', { ...mocks, react: h }).InterestedCourseSteps;
  return () => { h.reset(); return component(props); };
}

test('Interested opens Course then Year before enabling Save and submits normalized fields', async () => {
  const app = await screen(); button(app.render(), 'Interested').props.onPress();
  let tree = app.render(); assert.equal(button(tree, 'Save Outcome').props.disabled, true); assert.equal(app.calls.length, 0);
  const flow = nodes(tree).find(n => n.type === 'InterestedCourseSteps'); assert.ok(flow);
  const renderModal = modal(flow.props, app.mocks);
  assert.equal(button(renderModal(), 'Continue to Year').props.disabled, true);
  button(renderModal(), 'MBBS').props.onPress(); button(renderModal(), 'Continue to Year').props.onPress();
  const year = new Date().getFullYear(); button(renderModal(), `Next Year (${year+1})`).props.onPress();
  button(renderModal(), 'Use Course and Year').props.onPress();
  tree = app.render(); assert.equal(button(tree, 'Save Outcome').props.disabled, false);
  assert.equal(app.calls.length, 0);
  await button(tree, 'Save Outcome').props.onPress();
  assert.equal(app.calls.length, 1); assert.equal(app.calls[0].body.selected_course, 'MBBS');
  assert.equal(app.calls[0].body.expected_admission_year, year+1); assert.equal(app.alerts.at(-1)[0], 'Outcome saved');
  assert.equal(app.history.length, 1);
});
for (const [label, outcome] of [['Not Interested','NOT_INTERESTED'], ['No Answer','NO_ANSWER']]) {
  test(`${label} saves directly without course/year`, async () => {
    const app = await screen(); button(app.render(), label).props.onPress(); const tree = app.render();
    assert.equal(nodes(tree).some(n => n.type === 'InterestedCourseSteps'), false);
    assert.equal(button(tree, 'Save Outcome').props.disabled, false);
    await button(tree, 'Save Outcome').props.onPress();
    assert.equal(app.calls[0].body.outcome, outcome);
    assert.equal('selected_course' in app.calls[0].body, false); assert.equal('expected_admission_year' in app.calls[0].body, false);
    assert.equal(app.alerts.at(-1)[0], 'Outcome saved');
  });
}
test('Call Back requires a date/time, then saves without course/year', async () => {
  const app = await screen(); button(app.render(), 'Call Back').props.onPress();
  let tree = app.render();
  await button(tree, 'Save Outcome').props.onPress();
  assert.equal(app.calls.length, 0);
  assert.equal(app.alerts.at(-1)[0], 'Follow-up Required');
  button(tree, 'Select follow-up date').props.onPress(); tree = app.render();
  let picker = nodes(tree).find(n => n.type === 'DateTimePicker');
  picker.props.onChange({ type: 'set' }, new Date('2027-10-07T12:00:00Z'));
  picker = nodes(app.render()).find(n => n.type === 'DateTimePicker'); picker.props.onChange({ type: 'set' }, new Date('2027-10-07T12:30:00Z'));
  tree = app.render(); assert.equal(button(tree, 'Save Outcome').props.disabled, false);
  await button(tree, 'Save Outcome').props.onPress();
  assert.equal(app.calls[0].body.outcome, 'CALL_BACK'); assert.ok(app.calls[0].body.callback_at);
  assert.equal('selected_course' in app.calls[0].body, false);
});
test('recording is retained and never awaited; even a never-resolving refresh cannot delay success', async () => {
  const app = await screen({ draft: { recordingPath: '/private/existing.m4a' }, refresh: () => new Promise(() => {}) });
  button(app.render(), 'No Answer').props.onPress();
  await button(app.render(), 'Save Outcome').props.onPress(); await tick();
  assert.equal(app.alerts.at(-1)[0], 'Outcome saved'); assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].url, '/calls/'); assert.equal('recordingPath' in app.calls[0].body, false);
  assert.equal(app.draft().recordingPath, '/private/existing.m4a'); assert.equal(app.draft().savedCallId, 21);
  assert.equal(app.patches.some(p => 'recordingStatus' in p || 'recordingQueuedAt' in p), false);
});
test('double tap sends one request and success stays disabled', async () => {
  let resolve; const pending = new Promise(r => { resolve = r; });
  const app = await screen({ request: () => pending }); button(app.render(), 'No Answer').props.onPress();
  const save = button(app.render(), 'Save Outcome').props.onPress;
  const first = save(); const second = save(); await tick();
  assert.equal(app.calls.length, 1); assert.equal(button(app.render(), 'Saving...').props.disabled, true);
  resolve({ id: 21, lead: 7, phone_number: base.phone, followup: null }); await Promise.all([first, second]);
  assert.equal(button(app.render(), 'Outcome Saved').props.disabled, true);
});
test('incomplete frozen Interested draft opens selection without an API request', async () => {
  const app = await screen({ draft: { outcome: 'interested', payload: { client_event_id: base.id, outcome: 'INTERESTED', started_at: base.startedAt, ended_at: base.endedAt, duration_seconds: 60, notes: '' } } });
  const tree = app.render(); assert.ok(nodes(tree).find(n => n.type === 'InterestedCourseSteps'));
  assert.equal(app.calls.length, 0); assert.equal(button(tree, 'Save Outcome').props.disabled, true);
  assert.equal(app.draft().id, base.id); assert.equal(app.draft().payload, undefined);
});
test('API failure keeps exact retry payload and permits retry', async () => {
  let fail = true;
  const app = await screen({ request: async () => { if (fail) throw new Error('Network unavailable'); return { id: 21, lead: 7, phone_number: base.phone, followup: null }; } });
  button(app.render(), 'No Answer').props.onPress(); await button(app.render(), 'Save Outcome').props.onPress();
  assert.equal(app.alerts.at(-1)[0], 'Could Not Save Call'); const original = JSON.stringify(app.calls[0].body);
  fail = false; await button(app.render(), 'Save Outcome').props.onPress();
  assert.equal(JSON.stringify(app.calls[1].body), original); assert.equal(app.alerts.at(-1)[0], 'Outcome saved');
});
test('local post-save cleanup failure never becomes an API-save error', async () => {
  const app = await screen({ cleanupFailure: true, refresh: async () => { throw new Error('Refresh offline'); } });
  button(app.render(), 'No Answer').props.onPress(); await button(app.render(), 'Save Outcome').props.onPress(); await tick();
  assert.equal(app.alerts.length, 1); assert.equal(app.alerts[0][0], 'Outcome saved');
});
test('Others requires a name, cancellation never sends, and unknown course values fail validation', async () => {
  const app = await screen(); button(app.render(), 'Interested').props.onPress();
  const flow = nodes(app.render()).find(n => n.type === 'InterestedCourseSteps'); const renderModal = modal(flow.props, app.mocks);
  button(renderModal(), 'Others').props.onPress(); assert.equal(button(renderModal(), 'Continue to Year').props.disabled, true);
  flow.props.onCancel(); assert.equal(app.calls.length, 0); assert.equal(button(app.render(), 'Save Outcome').props.disabled, true);
  const courses = compile('src/services/courses.ts', {}); assert.equal(courses.completeInterestedSelection('BAD', '', '2027'), false);
});

test('other consultancy hides contact UI and saves without follow-up or WhatsApp', async () => {
  const app = await screen({ role: 'CALLER' });
  button(app.render(), 'Admission done by other consultancy').props.onPress();
  const tree = app.render();
  assert.equal(nodes(tree).some(n => n.type === 'OutcomeWhatsAppEditor'), false);
  assert.equal(nodes(tree).some(n => n.type === 'DateTimePicker'), false);
  assert.equal(text(tree).includes('Follow-up'), false);
  await button(tree, 'Save Outcome').props.onPress();
  assert.equal(app.calls[0].body.outcome, 'ADMISSION_DONE_BY_OTHER_CONSULTANCY');
  assert.equal('callback_at' in app.calls[0].body, false);
  assert.equal('whatsapp_message' in app.calls[0].body, false);
});

async function callerInterestedSave(app) {
  button(app.render(), 'Interested').props.onPress();
  const flow = nodes(app.render()).find(n => n.type === 'InterestedCourseSteps');
  const renderModal = modal(flow.props, app.mocks);
  button(renderModal(), 'MBBS').props.onPress(); button(renderModal(), 'Continue to Year').props.onPress();
  const year = new Date().getFullYear(); button(renderModal(), `Next Year (${year+1})`).props.onPress();
  button(renderModal(), 'Use Course and Year').props.onPress();
  button(app.render(), 'Select follow-up date').props.onPress();
  let picker = nodes(app.render()).find(n => n.type === 'DateTimePicker');
  picker.props.onChange({ type: 'set' }, new Date('2027-10-07T12:00:00Z'));
  picker = nodes(app.render()).find(n => n.type === 'DateTimePicker');
  picker.props.onChange({ type: 'set' }, new Date('2027-10-07T12:30:00Z'));
  await button(app.render(), 'Save Outcome').props.onPress();
  return year;
}

test('caller Interested still requires Course and Year, then offers optional Forward to Counselor', async () => {
  const app = await screen({ role: 'CALLER' });
  const year = await callerInterestedSave(app);
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].body.outcome, 'INTERESTED');
  assert.equal(app.calls[0].body.selected_course, 'MBBS');
  assert.equal(app.calls[0].body.expected_admission_year, year + 1);
  assert.equal('counselor_id' in app.calls[0].body, false);
  let forward = nodes(app.render()).find(n => n.type === 'ForwardCounselorModal');
  assert.equal(forward.props.visible, false);
  const [title, , buttons] = app.alerts.at(-1); assert.equal(title, 'Outcome saved');
  buttons.find(b => b.text === 'Continue').onPress();
  forward = nodes(app.render()).find(n => n.type === 'ForwardCounselorModal');
  assert.equal(forward.props.visible, true); assert.equal(forward.props.leadId, 7);
  assert.equal(app.navigation.length, 0);
  // Skip continues with the normal post-save navigation.
  forward.props.onClose();
  assert.equal(app.navigation.length, 1);
  assert.equal(nodes(app.render()).find(n => n.type === 'ForwardCounselorModal').props.visible, false);
});

test('non-Interested caller outcomes never offer Forward to Counselor', async () => {
  const app = await screen({ role: 'CALLER' });
  button(app.render(), 'Not Interested').props.onPress();
  await button(app.render(), 'Save Outcome').props.onPress();
  const [, , buttons] = app.alerts.at(-1);
  buttons.find(b => b.text === 'Continue').onPress();
  assert.equal(app.navigation.length, 1);
  assert.equal(nodes(app.render()).find(n => n.type === 'ForwardCounselorModal').props.visible, false);
});
