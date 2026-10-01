const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const root = path.join(__dirname, '..');
const js = ts.transpileModule(fs.readFileSync(path.join(root, 'src/services/callLifecycle.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {}, console: { warn() {} }, setTimeout };
vm.runInNewContext(js, context);
const ack = context.exports.acknowledgeCallStarted;
test('network failure retries then succeeds without changing local started state', async () => {
  let started = true, calls = 0;
  const delays = [];
  await ack(async () => { if (++calls < 3) throw new Error('offline'); }, () => started,
    async ms => delays.push(ms));
  assert.equal(started, true);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [500, 1500]);
});
test('409 ends acknowledgement retries without changing local lifecycle', async () => {
  let calls = 0;
  await ack(async () => { calls++; throw { status: 409 }; }, () => true, async () => assert.fail());
  assert.equal(calls, 1);
});
test('temporary server failures have bounded retries', async () => {
  let calls = 0;
  await ack(async () => { calls++; throw { status: 503 }; }, () => true, async () => {});
  assert.equal(calls, 4);
});
test('IDLE stops pending acknowledgement retries', async () => {
  let active = true, calls = 0;
  await ack(async () => { calls++; throw new Error(); }, () => active, async () => { active = false; });
  assert.equal(calls, 1);
});
// Integration guardrails on the existing screen: keep the native boundary and
// prevent regressions that reconnect acknowledgement success to navigation.
const screen = fs.readFileSync(path.join(root, 'src/app/dialer.tsx'), 'utf8');
function dialerHarness(markCallStarted, options = {}) {
  let listener, appStateListener, releaseCount = 0;
  let currentPhoneState = options.initialPhoneState || 'IDLE';
  const routes = [], effects = [], timers = [];
  const native = {
    addListener: (_, callback) => { listener = callback; return {remove() {}}; },
    getCurrentState: () => currentPhoneState,
    stopRecording: async () => null
  };
  const appStateObj = {
    currentState: 'active',
    addEventListener: (_, cb) => {
      appStateListener = cb;
      return { remove() {} };
    }
  };
  const modules = {
    '@/context/AppThemeContext': {useAppStyles: () => ({})},
    '@/context/DialerSessionContext': {useDialerSession: () => ({})},
    '@/context/LeadContext': {useLeads: () => ({leads: [{id:'1', name:'Test', phone:'123456789', isClaimed:true}],
      markCallStarted, releaseClaim: async () => {releaseCount++;}})},
    '@/context/AuthContext': {useAuth: () => ({user:{id:1}})},
    '@/services/callLifecycle': {acknowledgeCallStarted: ack},
    '@/services/callDrafts': {newCallId: () => 'draft', patchCallDraft: async () => {}, saveCallDraft: async () => {}},
    'expo-router': {router:{replace: route => routes.push(route)}, useLocalSearchParams: () => ({id:'1', isClaimed:'1'})},
    react: {useEffect: f => effects.push(f), useState: v => [v, () => {}], useRef: v => ({current:v})},
    'react/jsx-runtime': {jsx: () => null, jsxs: () => null},
    'react-native': {AppState: appStateObj, StyleSheet:{create:x=>x}, Alert:{alert() {} }},
    '../../modules/callstate/src/CallstateModule': {__esModule:true, default:native},
  };
  // Expose the existing component only inside the test VM. Simulate a dial request
  // already dispatched, without invoking Android permissions or the phone app.
  const source = screen.replace('const requestedRef = useRef(false)', 'const requestedRef = useRef(true)') + '\nexport { ActiveDialer };';
  const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const env = {exports:{}, require:name=>modules[name], console:{log(){},warn(){},error(){}},
    setTimeout:f=>{timers.push(f);return timers.length;}, clearTimeout(){}, clearInterval(){}};
  vm.runInNewContext(compiled,env);
  env.exports.ActiveDialer();
  effects[0]();
  if (effects[2]) effects[2]();
  return {
    event: state => { currentPhoneState = state; listener({state}); },
    setPhoneState: state => { currentPhoneState = state; },
    appState: nextState => {
      if (appStateListener) {
        appStateObj.currentState = nextState;
        appStateListener(nextState);
      }
    },
    routes,
    timers,
    releases: () => releaseCount
  };
}

test('TEST 1: OFFHOOK -> IDLE opens outcome and completes call', async () => {
  let reject;
  const h = dialerHarness(() => new Promise((_, fail) => {reject=fail;}));
  h.event('OFFHOOK');
  h.event('IDLE');
  reject({status:409});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.releases(),0);
  assert.equal(h.routes.length,1);
  assert.equal(h.routes[0].pathname,'/call-outcome');
  assert.ok(h.routes[0].params.started_at);
  assert.ok(h.routes[0].params.ended_at);
  h.event('IDLE');
  assert.equal(h.routes.length,1);
});

test('TEST 2: IDLE -> OFFHOOK -> IDLE does not cancel on initial IDLE and opens outcome on disconnect', async () => {
  const h = dialerHarness(async()=>{});
  h.event('IDLE');
  h.event('OFFHOOK');
  h.timers.forEach(f=>f());
  assert.equal(h.releases(),0);
  h.event('IDLE');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.releases(),0);
  assert.equal(h.routes.length,1);
  assert.equal(h.routes[0].pathname,'/call-outcome');
});

test('TEST 3: IDLE only releases website claim after grace period and never opens outcome', async () => {
  const h = dialerHarness(async()=>assert.fail());
  h.event('IDLE');
  h.timers.forEach(f=>f());
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.releases(),1);
  assert.deepEqual(h.routes,['/']);
});

test('TEST 4: AppState active -> background -> active while phone state OFFHOOK keeps call active and does not open outcome', async () => {
  const h = dialerHarness(async()=>{});
  h.setPhoneState('OFFHOOK');
  h.event('OFFHOOK');
  h.appState('background');
  h.appState('active');
  assert.equal(h.routes.length, 0);
  assert.equal(h.releases(), 0);
});

test('TEST 5: AppState returns active while phone state IDLE after connected call handles disconnect and opens outcome exactly once', async () => {
  const h = dialerHarness(async()=>{});
  h.setPhoneState('OFFHOOK');
  h.event('OFFHOOK');
  h.appState('background');
  h.setPhoneState('IDLE');
  h.appState('active');
  h.timers.forEach(f => f());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.routes.length, 1);
  assert.equal(h.routes[0].pathname, '/call-outcome');
  assert.equal(h.releases(), 0);
  h.event('IDLE');
  assert.equal(h.routes.length, 1);
});

test('TEST 6: Multiple IDLE events trigger outcome opening exactly once', async () => {
  const h = dialerHarness(async()=>{});
  h.event('OFFHOOK');
  h.event('IDLE');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.routes.length, 1);
  h.event('IDLE');
  h.event('IDLE');
  assert.equal(h.routes.length, 1);
});

test('TEST 7: OFFHOOK arrives after initial IDLE grace period check but before cancellation connects call and opens outcome', async () => {
  const h = dialerHarness(async()=>{});
  h.event('IDLE');
  h.setPhoneState('OFFHOOK');
  h.timers.forEach(f => f());
  assert.equal(h.releases(), 0);
  h.event('IDLE');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.routes.length, 1);
  assert.equal(h.routes[0].pathname, '/call-outcome');
});

test('TEST 8: Backend mark-call-started failure after OFFHOOK does not release claim and still opens outcome on IDLE', async () => {
  let reject;
  const h = dialerHarness(() => new Promise((_, fail) => { reject = fail; }));
  h.event('OFFHOOK');
  reject(new Error('500 server error'));
  h.event('IDLE');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.releases(), 0);
  assert.equal(h.routes.length, 1);
  assert.equal(h.routes[0].pathname, '/call-outcome');
});
test('OFFHOOK records local start before dispatching acknowledgement', () => {
  const handler = screen.slice(screen.indexOf("if (event.state === 'OFFHOOK'"));
  assert.ok(handler.indexOf('callWasStartedRef.current = true') < handler.indexOf('acknowledgeCallStarted('));
});
test('early IDLE is deferred; confirmed unstarted calls release rather than open outcome', () => {
  assert.match(screen, /isClaimedWebsiteLead && requestedRef.current && !callWasStartedRef.current/);
  assert.match(screen, /scheduleUnstartedIdle\(\);\s+return;/);
  assert.match(screen, /releaseTemporaryClaim\('Confirmed IDLE without OFFHOOK'\)/);
  assert.match(screen, /callWasStartedRef.current \|\| navigatingRef.current/);
});
test('real call IDLE preserves first end timestamp and outcome parameters', () => {
  assert.match(screen, /callWasStartedRef.current &&\s+!navigatingRef.current && !callEndedAtRef.current/);
  for (const name of ['started_at:', 'ended_at:', 'duration_seconds:']) assert.ok(screen.includes(name));
  assert.ok(screen.includes("pathname: '/call-outcome'"));
  const outcome = fs.readFileSync(path.join(root, 'src/app/call-outcome.tsx'), 'utf8');
  assert.doesNotMatch(outcome, /releaseClaim|release-claim/);
});

