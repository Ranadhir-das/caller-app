const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

class ApiError extends Error {
  constructor(message, status, details) { super(message); this.status = status; this.details = details; }
}
function load(request) {
  const context = { exports: {}, require: () => ({ apiRequest: request, ApiError }) };
  const source = fs.readFileSync(path.join(__dirname, '../src/services/counselling.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
}
test('new visitors send visitor fields without a fabricated lead ID', async () => {
  const service = load(async (url, options) => {
    assert.equal(url, '/mobile/counselling/');
    assert.equal(options.method, 'POST');
    assert.equal(options.token, 'session');
    assert.equal(options.body.visitor_name, 'Visitor');
    assert.equal(options.body.lead_id, undefined);
    return { success: true };
  });
  assert.equal((await service.createCounselling('session', { visitor_name: 'Visitor', visitor_phone: '9876504322' })).success, true);
});
test('existing lead and Google Meet are preserved', async () => {
  const service = load(async (_, options) => {
    assert.equal(options.body.lead_id, 12);
    assert.equal(options.body.counselling_type, 'GOOGLE_MEET');
    return { success: true };
  });
  await service.createCounselling('session', { lead_id: 12, counselling_type: 'GOOGLE_MEET' });
});
test('old backend required-lead error identifies backend update instead of faking a record', async () => {
  const service = load(async () => { throw new ApiError('This field is required.', 400, { lead_id: ['This field is required.'] }); });
  await assert.rejects(service.createCounselling('session', { visitor_name: 'Visitor' }), /Update the backend counselling API/);
});
test('visitor field error names the rejected field', async () => {
  const service = load(async () => { throw new ApiError('Invalid.', 400, { visitor_phone: ['Enter a valid phone.'] }); });
  await assert.rejects(service.createCounselling('session', { visitor_name: 'Visitor' }), /Phone number: Enter a valid phone/);
});
test('visitor source error names the rejected source field', async () => {
  const service = load(async () => { throw new ApiError('Invalid.', 400, { visitor_source: ['Visitor source is required for new visitors.'] }); });
  await assert.rejects(service.createCounselling('session', { visitor_name: 'Visitor', visitor_phone: '9876504322' }), /Source: Visitor source is required for new visitors/);
});
test('authentication errors are preserved', async () => {
  const error = new ApiError('Session expired.', 401);
  const service = load(async () => { throw error; });
  await assert.rejects(service.createCounselling('session', {}), value => value === error);
});
