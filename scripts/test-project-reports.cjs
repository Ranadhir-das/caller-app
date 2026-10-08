const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
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
function screen() {
  const state = []; let cursor = 0; let pending;
  const calls = [], alerts = [];
  const mocks = {
    react: { useState: initial => { const i = cursor++; if (!(i in state)) state[i] = initial;
      return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; } },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { ...Object.fromEntries(['View', 'Text', 'Pressable', 'Image', 'Modal', 'RefreshControl'].map(n => [n, n])),
      StyleSheet: { create: v => v }, Platform: { OS: 'android' }, Alert: { alert: (...args) => alerts.push(args) } },
    'expo-image-picker': {},
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@react-native-community/datetimepicker': { __esModule: true, default: 'DateTimePicker' },
    '@/context/AuthContext': { useAuth: () => ({ user: { role: 'IT' } }) },
    '@/context/AppThemeContext': { useAppStyles: () => ({}), useAppTheme: () => ({ colors: {}, mode: 'dark' }) },
    '@/context/EmployeeWorkspaceContext': { useEmployeeWorkspace: () => ({ data: { date: '2026-10-07', projects: [], reports: [] },
      request: async (...args) => calls.push(args), run: fn => { pending = fn(); } }) },
    '@/services/api': {},
    '@/components/employee/shared': { ActionButton: 'ActionButton', FormInput: 'FormInput', DateField: 'DateField' },
    '@/components/KeyboardAwareContainer': { KeyboardAwareContainer: 'KeyboardAwareContainer' },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/../src/app/employee/work.tsx`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => { assert.ok(name in mocks, name); return mocks[name]; } });
  const render = () => { cursor = 0; return exports.default(); };
  const find = (type, label) => nodes(render()).find(n => n.type === type && (n.props.label === label || n.props.title === label || text(n) === label));
  find('FormInput', 'Project Name *').props.onChangeText('CRM project');
  find('FormInput', 'Work Duration *').props.onChangeText('3 hours');
  return { render, find, calls, alerts, settled: () => pending };
}
test('Completed immediately hides and clears a selected date, then submits without it', async () => {
  const app = screen();
  app.find('DateField', 'Expected Completion Date *').props.onPress();
  nodes(app.render()).find(n => n.type === 'DateTimePicker').props.onChange({ type: 'set' }, new Date(2026, 9, 10));
  app.find('Pressable', 'Completed').props.onPress();
  assert.equal(nodes(app.render()).some(n => n.type === 'DateField'), false);
  app.find('ActionButton', "Save today's report").props.onPress(); await app.settled();
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0][1].project_reports[0].expected_completion_date, '');
  assert.equal(app.calls[0][1].project_reports[0].status, 'Completed');
});
for (const status of ['Pending', 'In Progress']) test(`${status} requires a date after switching from Completed`, async () => {
  const app = screen();
  app.find('Pressable', 'Completed').props.onPress();
  app.find('Pressable', status).props.onPress();
  assert.ok(app.find('DateField', 'Expected Completion Date *'));
  app.find('ActionButton', "Save today's report").props.onPress();
  assert.equal(app.calls.length, 0); assert.equal(app.alerts.at(-1)[0], 'Completion Date Required');
  app.find('DateField', 'Expected Completion Date *').props.onPress();
  nodes(app.render()).find(n => n.type === 'DateTimePicker').props.onChange({ type: 'set' }, new Date(2026, 9, 10));
  app.find('ActionButton', "Save today's report").props.onPress(); await app.settled();
  assert.equal(app.calls[0][1].project_reports[0].expected_completion_date, '2026-10-10');
});
