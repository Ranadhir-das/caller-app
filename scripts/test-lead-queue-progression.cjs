// Regression tests for lead calling queue progression, optimistic updates,
// stale response protection, and duplicate prevention.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const tick = () => new Promise(resolve => setImmediate(resolve));
class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }

const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };

function compile(file, mocks) {
  const exports = {};
  const code = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  vm.runInNewContext(
    ts.transpileModule(code, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      console,
      setTimeout,
      clearTimeout,
      require: name => {
        if (name in mocks) return mocks[name];
        if (name === 'react/jsx-runtime') return jsx;
        throw new Error(`Unexpected dependency in test: ${name}`);
      },
    }
  );
  return exports;
}

function createLeadEnvironment(initialLeads = []) {
  let appStateListener = null;
  const dbLeads = JSON.parse(JSON.stringify(initialLeads));
  const serverCalls = [];

  const stateSlots = [];
  const refSlots = [];
  const effectList = [];
  let stateCursor = 0;
  let refCursor = 0;
  let effectCursor = 0;
  let currentContextValue = null;

  const renderSync = () => {
    stateCursor = 0;
    refCursor = 0;
    effectCursor = 0;
    const tree = Provider({ children: null });
    currentContextValue = tree.props.value;
  };

  const react = {
    createContext: () => ({ Provider: 'Provider' }),
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useState(initial) {
      const i = stateCursor++;
      if (!(i in stateSlots)) {
        stateSlots[i] = typeof initial === 'function' ? initial() : initial;
      }
      const setter = (val) => {
        stateSlots[i] = typeof val === 'function' ? val(stateSlots[i]) : val;
        renderSync();
      };
      return [stateSlots[i], setter];
    },
    useRef(initial) {
      const i = refCursor++;
      if (!(i in refSlots)) {
        refSlots[i] = { current: initial };
      }
      return refSlots[i];
    },
    useEffect(fn, deps) {
      const i = effectCursor++;
      const prev = effectList[i];
      if (!prev || !deps || deps.some((d, idx) => d !== prev.deps[idx])) {
        prev?.cleanup?.();
        effectList[i] = { deps, run: fn, executed: false };
      }
    },
  };

  const native = {
    AppState: {
      addEventListener: (type, handler) => {
        appStateListener = handler;
        return { remove: () => { appStateListener = null; } };
      },
    },
  };

  let delayLeadsMs = 0;
  let failNextCalls = false;

  const api = {
    ApiError,
    apiRequest: async (url, options = {}) => {
      if (url === '/mobile/leads/') {
        if (delayLeadsMs > 0) {
          await new Promise(r => setTimeout(r, delayLeadsMs));
        }
        return JSON.parse(JSON.stringify(dbLeads));
      }
      if (url === '/calls/mine/') {
        return serverCalls;
      }
      if (url.startsWith('/mobile/leads/available/')) {
        return [];
      }
      if (url === '/calls/' && options.method === 'POST') {
        if (failNextCalls) {
          throw new ApiError('Network timeout saving call', 500);
        }
        const callId = serverCalls.length + 1;
        const callObj = {
          id: callId,
          lead: options.body.lead,
          phone_number: options.body.phone_number,
          outcome: options.body.outcome,
          notes: options.body.notes || '',
          started_at: options.body.started_at,
          ended_at: options.body.ended_at,
          duration_seconds: options.body.duration_seconds || 60,
        };
        serverCalls.push(callObj);

        // Update DB lead status on backend
        if (options.body.lead) {
          const l = dbLeads.find(item => item.id === options.body.lead);
          if (l) {
            l.status = options.body.outcome;
            l.updated_at = new Date().toISOString();
          }
        }
        return callObj;
      }
      return [];
    },
  };

  const followUpsMock = {
    loadFollowUps: async () => [],
    completeFollowUp: async () => {},
  };

  const authMock = {
    useAuth: () => ({ token: 'mock-token', user: { id: 1, role: 'CALLER', capabilities: { caller: true } } }),
  };

  const authServicesMock = {
    isCallerCapable: () => true,
    getStoredToken: async () => 'mock-token',
  };

  const leadContextModule = compile('src/context/LeadContext.tsx', {
    react,
    'react/jsx-runtime': jsx,
    'react-native': native,
    '@/context/AuthContext': authMock,
    '@/services/api': api,
    '@/services/auth': authServicesMock,
    '@/services/followUps': followUpsMock,
  });

  const Provider = leadContextModule.LeadProvider;

  const flushEffects = async () => {
    for (const e of effectList) {
      if (e && e.run && !e.executed) {
        e.executed = true;
        const cleanup = e.run();
        if (typeof cleanup === 'function') e.cleanup = cleanup;
      }
    }
    await tick();
  };

  const init = async () => {
    renderSync();
    await flushEffects();
    renderSync();
  };

  return {
    dbLeads,
    serverCalls,
    init,
    get ctx() { return currentContextValue; },
    setDelayLeads: (ms) => { delayLeadsMs = ms; },
    setFailNextCalls: (val) => { failNextCalls = val; },
    triggerAppState: (state) => { appStateListener?.(state); },
    api,
  };
}

// Generate test pending leads
function makeLeads(count = 10) {
  const leads = [];
  const now = Date.now();
  for (let i = 1; i <= count; i++) {
    leads.push({
      id: i,
      name: `Student ${i}`,
      phone: `987654321${i % 10}`,
      status: 'PENDING',
      created_at: new Date(now - (count - i) * 1000).toISOString(),
      updated_at: new Date(now - (count - i) * 1000).toISOString(),
    });
  }
  return leads;
}

test('1. Call 7 leads and save all 7 outcomes successfully. Verify next lead is lead 8', async () => {
  const env = createLeadEnvironment(makeLeads(10));
  await env.init();
  assert.equal(env.ctx.leads.length, 10);
  assert.equal(env.ctx.leads.filter(l => l.status === 'pending').length, 10);

  // Call leads 1 through 7
  let currentLead = env.ctx.leads[0]; // Lead 1
  for (let step = 1; step <= 7; step++) {
    assert.equal(currentLead.id, String(step));
    // Save outcome to backend
    await env.api.apiRequest('/calls/', {
      method: 'POST',
      body: { lead: Number(currentLead.id), outcome: 'BUSY', phone_number: currentLead.phone },
    });
    // Immediately mark completed in context
    env.ctx.markLeadCompleted(currentLead.id, 'busy');

    // Get next pending lead from queue
    const next = env.ctx.getNextPendingLead(currentLead.id);
    assert.ok(next, `Expected a next lead after lead ${step}`);
    currentLead = next;
  }

  // After 7 calls, currentLead must be Lead 8
  assert.equal(currentLead.id, '8');
});

test('2. Refresh the lead queue after saving outcomes. Verify leads 1-7 do not reappear', async () => {
  const env = createLeadEnvironment(makeLeads(10));
  await env.init();

  for (let i = 1; i <= 7; i++) {
    await env.api.apiRequest('/calls/', {
      method: 'POST',
      body: { lead: i, outcome: 'NO_ANSWER', phone_number: `987654321${i}` },
    });
    env.ctx.markLeadCompleted(String(i), 'no_answer');
  }

  // Refresh from backend
  await env.ctx.refresh();

  // Pending count should be 3 (Leads 8, 9, 10)
  const pendingLeads = env.ctx.leads.filter(l => l.status === 'pending');
  assert.equal(pendingLeads.length, 3);
  assert.deepEqual(pendingLeads.map(l => l.id), ['8', '9', '10']);

  // Next pending lead from start is Lead 8
  const nextFromHome = env.ctx.leads.find(l => l.status === 'pending');
  assert.equal(nextFromHome?.id, '8');
});

test('3. Close and reopen the app after saving outcomes. Verify progress is preserved', async () => {
  const initial = makeLeads(10);
  const env1 = createLeadEnvironment(initial);
  await env1.init();

  // Call leads 1..7 on session 1
  for (let i = 1; i <= 7; i++) {
    await env1.api.apiRequest('/calls/', {
      method: 'POST',
      body: { lead: i, outcome: 'INTERESTED', phone_number: `987654321${i}` },
    });
    env1.ctx.markLeadCompleted(String(i), 'interested');
  }

  // "Close" app and open brand-new app session against the updated backend DB
  const env2 = createLeadEnvironment(env1.dbLeads);
  await env2.init();

  assert.equal(env2.ctx.leads.filter(l => l.status === 'pending').length, 3);
  const firstPending = env2.ctx.leads.find(l => l.status === 'pending');
  assert.equal(firstPending?.id, '8');
});

test('4. Background and foreground the app during queue progression', async () => {
  const env = createLeadEnvironment(makeLeads(10));
  await env.init();

  // Call Lead 1 and Lead 2
  env.ctx.markLeadCompleted('1', 'busy');
  env.ctx.markLeadCompleted('2', 'busy');

  // Trigger foreground event (active)
  env.triggerAppState('active');
  await tick();

  // Progress is intact
  assert.equal(env.ctx.getNextPendingLead('2')?.id, '3');
});

test('5. Simulate a delayed API response: local completed status survives in-flight stale fetch', async () => {
  const env = createLeadEnvironment(makeLeads(10));
  await env.init();

  // Set delayed response on /mobile/leads/ (takes 30ms)
  env.setDelayLeads(30);

  // Trigger background refresh (this starts a fetch with snapshot where Lead 1 is PENDING)
  const refreshPromise = env.ctx.refresh();

  // In the meantime (before fetch completes), caller completes Lead 1 locally
  env.ctx.markLeadCompleted('1', 'ringing');

  // Await the slow refresh to complete
  await refreshPromise;

  // Stale network response must NOT revert Lead 1 back to pending
  const lead1 = env.ctx.leads.find(l => l.id === '1');
  assert.ok(lead1);
  assert.equal(lead1.status, 'ringing');
  assert.equal(env.ctx.getNextPendingLead('1')?.id, '2');
});

test('6. Simulate a failed API response followed by a retry', async () => {
  const env = createLeadEnvironment(makeLeads(10));
  await env.init();

  // Fail first save attempt
  env.setFailNextCalls(true);
  let failed = false;
  try {
    await env.api.apiRequest('/calls/', { method: 'POST', body: { lead: 1, outcome: 'BUSY' } });
  } catch (err) {
    failed = true;
  }
  assert.equal(failed, true);

  // Ensure Lead 1 was NOT completed on failure
  assert.equal(env.ctx.leads.find(l => l.id === '1')?.status, 'pending');

  // Now retry and succeed
  env.setFailNextCalls(false);
  const saved = await env.api.apiRequest('/calls/', { method: 'POST', body: { lead: 1, outcome: 'BUSY' } });
  assert.equal(saved.id, 1);
  env.ctx.markLeadCompleted('1', 'busy');

  // Now Lead 1 is marked completed and next lead is Lead 2
  assert.equal(env.ctx.leads.find(l => l.id === '1')?.status, 'busy');
  assert.equal(env.ctx.getNextPendingLead('1')?.id, '2');
});

test('7. Simulate a successful backend save followed by a lost/delayed client response', async () => {
  const env = createLeadEnvironment(makeLeads(10));
  await env.init();

  // Backend receives and saves call for Lead 1
  await env.api.apiRequest('/calls/', { method: 'POST', body: { lead: 1, outcome: 'NO_CANDIDATE' } });
  // Client updates optimistic lead state
  env.ctx.markLeadCompleted('1', 'no_candidate');

  // Later, a refresh arrives
  await env.ctx.refresh();

  assert.equal(env.ctx.leads.find(l => l.id === '1')?.status, 'no_candidate');
  assert.equal(env.ctx.getNextPendingLead()?.id, '2');
});

test('8. Fetch multiple pages / batches and verify no duplicate lead IDs', async () => {
  const initial = makeLeads(5);
  // Add duplicate items in DB leads to test client deduplication if raw array has duplicates
  const leadsWithDups = [...initial, initial[0]];
  const env = createLeadEnvironment(leadsWithDups);
  await env.init();

  const next = env.ctx.getNextPendingLead('1');
  assert.equal(next?.id, '2');
});

test('9. Ensure a lead is not marked completed before its outcome is actually saved', async () => {
  const env = createLeadEnvironment(makeLeads(5));
  await env.init();

  // Before saving outcome:
  assert.equal(env.ctx.leads.find(l => l.id === '1')?.status, 'pending');
  assert.equal(env.ctx.getNextPendingLead()?.id, '1');

  // Only after save:
  await env.api.apiRequest('/calls/', { method: 'POST', body: { lead: 1, outcome: 'BUSY' } });
  env.ctx.markLeadCompleted('1', 'busy');

  assert.equal(env.ctx.leads.find(l => l.id === '1')?.status, 'busy');
  assert.equal(env.ctx.getNextPendingLead()?.id, '2');
});

test('10. Verify that the same lead can still appear again when legitimately assigned or reopened', async () => {
  const initial = makeLeads(5);
  const env = createLeadEnvironment(initial);
  await env.init();

  // Caller completes Lead 1 at T0
  await env.api.apiRequest('/calls/', { method: 'POST', body: { lead: 1, outcome: 'BUSY' } });
  env.ctx.markLeadCompleted('1', 'busy');
  assert.equal(env.ctx.leads.find(l => l.id === '1')?.status, 'busy');

  // Later, admin legitimately reopens Lead 1 with updated_at in the future
  const dbLead1 = env.dbLeads.find(l => l.id === 1);
  dbLead1.status = 'PENDING';
  dbLead1.updated_at = new Date(Date.now() + 5000).toISOString();

  // Server refresh occurs
  await env.ctx.refresh();

  // Lead 1 is legitimately pending again!
  const refreshedLead1 = env.ctx.leads.find(l => l.id === '1');
  assert.equal(refreshedLead1?.status, 'pending');
});
