const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(request) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/../src/services/followUps.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, URL, require: () => ({ apiRequest: request, API_BASE_URL: 'https://crm.example/api/v1' }) });
  return exports;
}
test('pending follow-ups from every API page are sorted and deduplicated without lead status/history requirements', async () => {
  const calls = [];
  const due = { id: 2, lead: 4, status: 'PENDING', scheduled_at: '2026-10-07T12:30:00+05:30' };
  const overdue = { id: 1, lead: null, status: 'PENDING', scheduled_at: '2026-10-06T10:00:00Z' };
  const service = load(async (url, opts) => {
    calls.push(url); assert.equal(opts.token, 'session');
    return calls.length === 1 ? { results: [due], next: 'https://crm.example/api/v1/mobile/follow-ups/?page=2' }
      : { results: [due, overdue, { ...due, id: 3, status: 'COMPLETED' }], next: null };
  });
  assert.deepEqual(Array.from(await service.loadFollowUps('session'), item => item.id), [1, 2]);
  assert.equal(calls[1], '/mobile/follow-ups/?page=2');
});
test('array responses work and pagination cannot leak authentication to another host', async () => {
  assert.equal((await load(async () => []).loadFollowUps('session')).length, 0);
  let count = 0;
  await assert.rejects(load(async () => { count++; return { results: [], next: 'https://evil.example/api/v1/mobile/follow-ups/' }; }).loadFollowUps('session'), /Invalid follow-up/);
  assert.equal(count, 1);
});
test('timezone offsets represent instants; overdue, today and upcoming remain distinct', () => {
  const { followUpCategory } = load();
  const now = new Date(2026, 9, 7, 12, 0);
  assert.equal(followUpCategory(new Date(2026, 9, 7, 11, 59).toISOString(), now), 'Overdue');
  assert.equal(followUpCategory(new Date(2026, 9, 7, 15, 0).toISOString(), now), 'Due today');
  assert.equal(followUpCategory(new Date(2026, 9, 8, 0, 0).toISOString(), now), 'Upcoming');
  assert.equal(followUpCategory('2026-10-07T12:00:00+05:30', new Date('2026-10-07T06:31:00Z')), 'Overdue');
});
