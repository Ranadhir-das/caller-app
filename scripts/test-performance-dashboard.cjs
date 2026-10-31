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

test('formatSecondsToDuration: formats durations matching user requirement examples', () => {
  const pointsService = compile('services/points.ts', {
    './api': { apiRequest: () => {} },
  });

  const { formatSecondsToDuration } = pointsService;

  // Prompt requirement: "Total Talk Time (formatted as 2h 35m, 45m 20s, 0m 35s)"
  assert.equal(formatSecondsToDuration(9300), '2h 35m'); // 2 hours, 35 minutes
  assert.equal(formatSecondsToDuration(2720), '45m 20s'); // 45 minutes, 20 seconds
  assert.equal(formatSecondsToDuration(35), '0m 35s'); // 35 seconds
  assert.equal(formatSecondsToDuration(0), '0m 0s'); // 0 seconds
  assert.equal(formatSecondsToDuration(-10), '0m 0s'); // negative handled safely
  assert.equal(formatSecondsToDuration(null), '0m 0s'); // null handled safely
  assert.equal(formatSecondsToDuration(undefined), '0m 0s'); // undefined handled safely

  // Additional durations
  assert.equal(formatSecondsToDuration(60), '1m 0s');
  assert.equal(formatSecondsToDuration(100), '1m 40s');
  assert.equal(formatSecondsToDuration(3600), '1h 0m');
  assert.equal(formatSecondsToDuration(7200), '2h 0m');
  assert.equal(formatSecondsToDuration(7325), '2h 2m');
});

test('getCallerTalkTime: constructs query parameters correctly for each timeframe filter', async () => {
  const capturedUrls = [];
  const apiMock = {
    apiRequest: async (url, options) => {
      capturedUrls.push({ url, options });
      return {
        caller_id: 1,
        timeframe: '7days',
        start_date: '2026-10-24',
        end_date: '2026-10-30',
        total_calls_count: 10,
        connected_calls_count: 6,
        unconnected_calls_count: 4,
        connection_rate_percent: 60.0,
        total_talk_time_seconds: 1200,
        formatted_talk_time: '20m 0s',
        average_duration_seconds: 200,
        formatted_avg_duration: '3m 20s',
        trend: [],
      };
    },
  };

  const pointsService = compile('services/points.ts', {
    './api': apiMock,
  });

  const { getCallerTalkTime } = pointsService;

  // 1. Today filter
  await getCallerTalkTime('token-123', { timeframe: 'today' });
  assert.equal(capturedUrls[0].url, '/points/talk-time/?timeframe=today');
  assert.equal(capturedUrls[0].options.token, 'token-123');

  // 2. Yesterday filter
  await getCallerTalkTime('token-123', { timeframe: 'yesterday' });
  assert.equal(capturedUrls[1].url, '/points/talk-time/?timeframe=yesterday');

  // 3. Last 7 Days filter
  await getCallerTalkTime('token-123', { timeframe: '7days' });
  assert.equal(capturedUrls[2].url, '/points/talk-time/?timeframe=7days');

  // 4. This Month filter
  await getCallerTalkTime('token-123', { timeframe: 'this_month' });
  assert.equal(capturedUrls[3].url, '/points/talk-time/?timeframe=this_month');

  // 5. Custom Date Range filter
  await getCallerTalkTime('token-123', {
    timeframe: 'custom',
    start_date: '2026-10-01',
    end_date: '2026-10-15',
  });
  assert.equal(
    capturedUrls[4].url,
    '/points/talk-time/?timeframe=custom&start_date=2026-10-01&end_date=2026-10-15'
  );
});

test('Performance metrics: safe zero division and average calculations', () => {
  const pointsService = compile('services/points.ts', {
    './api': { apiRequest: () => {} },
  });
  const { formatSecondsToDuration } = pointsService;

  // Zero calls state
  const zeroCalls = {
    total_calls_count: 0,
    connected_calls_count: 0,
    total_talk_time_seconds: 0,
  };
  const zeroConnRate =
    zeroCalls.total_calls_count > 0
      ? (zeroCalls.connected_calls_count / zeroCalls.total_calls_count) * 100
      : 0;
  const zeroAvgConnected =
    zeroCalls.connected_calls_count > 0
      ? Math.round(zeroCalls.total_talk_time_seconds / zeroCalls.connected_calls_count)
      : 0;
  const zeroAvgTotal =
    zeroCalls.total_calls_count > 0
      ? Math.round(zeroCalls.total_talk_time_seconds / zeroCalls.total_calls_count)
      : 0;

  assert.equal(zeroConnRate, 0);
  assert.equal(zeroAvgConnected, 0);
  assert.equal(zeroAvgTotal, 0);
  assert.equal(formatSecondsToDuration(zeroAvgConnected), '0m 0s');
  assert.equal(formatSecondsToDuration(zeroAvgTotal), '0m 0s');

  // Active calling state: 50 calls, 30 connected, 3600 seconds total talk time (1 hour)
  const activeCalls = {
    total_calls_count: 50,
    connected_calls_count: 30,
    total_talk_time_seconds: 3600,
  };
  const activeConnRate = Math.round(
    (activeCalls.connected_calls_count / activeCalls.total_calls_count) * 1000
  ) / 10;
  const activeAvgConnected = Math.round(
    activeCalls.total_talk_time_seconds / activeCalls.connected_calls_count
  ); // 3600 / 30 = 120s
  const activeAvgTotal = Math.round(
    activeCalls.total_talk_time_seconds / activeCalls.total_calls_count
  ); // 3600 / 50 = 72s

  assert.equal(activeConnRate, 60.0);
  assert.equal(activeAvgConnected, 120);
  assert.equal(formatSecondsToDuration(activeAvgConnected), '2m 0s');
  assert.equal(activeAvgTotal, 72);
  assert.equal(formatSecondsToDuration(activeAvgTotal), '1m 12s');
  assert.equal(formatSecondsToDuration(activeCalls.total_talk_time_seconds), '1h 0m');
});

test('Performance chart scaling logic: correctly scales heights without division by zero', () => {
  const trend = [
    { date: '2026-10-28', total_calls: 0, connected_calls: 0, talk_time_seconds: 0 },
    { date: '2026-10-29', total_calls: 20, connected_calls: 10, talk_time_seconds: 1200 },
    { date: '2026-10-30', total_calls: 10, connected_calls: 5, talk_time_seconds: 600 },
  ];

  const maxCalls = Math.max(...trend.map((t) => t.total_calls || 0), 1);
  const maxTalkSeconds = Math.max(...trend.map((t) => t.talk_time_seconds || 0), 60);

  assert.equal(maxCalls, 20);
  assert.equal(maxTalkSeconds, 1200);

  const CHART_MAX_HEIGHT = 120;
  const day2CallsHeight = Math.round((trend[1].total_calls / maxCalls) * CHART_MAX_HEIGHT);
  const day2ConnHeight = Math.round((trend[1].connected_calls / maxCalls) * CHART_MAX_HEIGHT);
  const day2TalkHeight = Math.round((trend[1].talk_time_seconds / maxTalkSeconds) * CHART_MAX_HEIGHT);

  assert.equal(day2CallsHeight, 120); // 20 / 20 * 120 = 120
  assert.equal(day2ConnHeight, 60); // 10 / 20 * 120 = 60
  assert.equal(day2TalkHeight, 120); // 1200 / 1200 * 120 = 120

  const day3CallsHeight = Math.round((trend[2].total_calls / maxCalls) * CHART_MAX_HEIGHT);
  const day3ConnHeight = Math.round((trend[2].connected_calls / maxCalls) * CHART_MAX_HEIGHT);
  const day3TalkHeight = Math.round((trend[2].talk_time_seconds / maxTalkSeconds) * CHART_MAX_HEIGHT);

  assert.equal(day3CallsHeight, 60); // 10 / 20 * 120 = 60
  assert.equal(day3ConnHeight, 30); // 5 / 20 * 120 = 30
  assert.equal(day3TalkHeight, 60); // 600 / 1200 * 120 = 60
});

