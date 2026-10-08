// Execute the real provider -> authenticated API loader -> home rendering path.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
function compile(file, mocks) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/../${file}`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, URL, console, require: name => { assert.ok(name in mocks, name); return mocks[name]; } });
  return exports;
}
function text(tree) {
  if (tree == null || typeof tree === 'boolean') return '';
  if (Array.isArray(tree)) return tree.map(text).join(' ');
  return typeof tree === 'object' ? text(tree.props?.children) : String(tree);
}
test('Interested and external due follow-ups reach Home even with empty call history; next page is included', async () => {
  let cursor = 0; const slots = [], effects = [], requests = [];
  const react = {
    createContext: () => ({ Provider: 'Provider' }), useMemo: fn => fn(),
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] || (slots[i] = { current: initial }); },
    useEffect(fn) { const i = cursor++; if (!(i in slots)) { slots[i] = true; effects.push(fn); } },
  };
  const now = new Date(); const tomorrow = new Date(now.getTime() + 86400000);
  const lead = { id: 7, name: 'Interested due student', phone: '9876543210', status: 'INTERESTED', created_at: now.toISOString() };
  const pending = { id: 11, lead: 7, lead_name: lead.name, lead_phone: lead.phone, caller: 1, status: 'PENDING', scheduled_at: new Date(now.getTime() - 3600000).toISOString() };
  const api = { API_BASE_URL: 'https://crm.example/api/v1', apiRequest: async (url, options) => {
    requests.push(url); assert.equal(options.token, 'session');
    if (url === '/mobile/leads/') return [lead];
    if (url === '/mobile/follow-ups/') return { results: [pending], next: '?page=2' };
    if (url === '/mobile/follow-ups/?page=2') return { results: [{ ...pending, id: 12, lead: null, lead_name: null, lead_phone: null, phone_number: '9876500001', scheduled_at: tomorrow.toISOString() }], next: null };
    return [];
  } };
  const service = compile('src/services/followUps.ts', { '@/services/api': api });
  const auth = { useAuth: () => ({ token: 'session', user: { id: 1, role: 'CALLER', username: 'Caller' } }) };
  const native = { AppState: { addEventListener: () => ({ remove() {} }) }, StyleSheet: { create: v => v },
    ...Object.fromEntries(['View', 'Text', 'Pressable', 'ScrollView', 'TouchableOpacity'].map(n => [n, n])) };
  const provider = compile('src/context/LeadContext.tsx', {
    react, 'react/jsx-runtime': jsx, 'react-native': native, '@/context/AuthContext': auth,
    '@/services/api': api, '@/services/auth': {}, '@/services/followUps': service,
  }).LeadProvider;
  provider({ children: null }); effects.splice(0).forEach(fn => fn());
  await new Promise(resolve => setImmediate(resolve));
  cursor = 0; const value = provider({ children: null }).props.value;
  assert.equal(value.dashboardFollowUps.length, 2);
  assert.equal(value.leads[0].status, 'interested');
  assert.equal(value.leads[0].followUpDate, pending.scheduled_at);
  assert.equal(value.getOverdueFollowUps().length + value.getUpcomingFollowUps().length, 1);
  const home = compile('src/app/(tabs)/index.tsx', {
    react: { useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}], useEffect() {} },
    'react/jsx-runtime': jsx, 'react-native': native, 'expo-router': { router: {} },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' }, '@/services/followUps': service,
    '@/utils/status': { getStatusLabel: value => value }, '@/components/CallerPointsCard': { CallerPointsCard: 'CallerPointsCard' },
    '@/components/CallerAvatar': { CallerAvatar: 'CallerAvatar' }, '@/components/LeadPieChart': { LeadPieChart: 'LeadPieChart' },
    '@/context/AppThemeContext': { useAppStyles: () => ({}), useAppTheme: () => ({ colors: {} }) },
    '@/context/AuthContext': auth, '@/context/LeadContext': { useLeads: () => value },
    '@/context/DialerSessionContext': { useDialerSession: () => ({ session: { stats: {} } }) },
  }).default;
  const rendered = text(home());
  assert.ok(rendered.includes('Interested due student'));
  assert.ok(rendered.includes('9876500001'));
  assert.ok(rendered.includes('Overdue'));
  assert.ok(rendered.includes('Upcoming'));
  assert.ok(requests.includes('/mobile/follow-ups/?page=2'));
});
