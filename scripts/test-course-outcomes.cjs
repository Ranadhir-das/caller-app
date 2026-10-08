const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies = {}) {
  const context = { exports: {}, require: name => dependencies[name] || {} };
  const source = fs.readFileSync(path.join(__dirname, '../src/services/', file), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
}
const courses = load('courses.ts');
test('prohibited outcomes including other consultancy hide contact controls', () => {
  for (const value of ['not_interested', 'no_candidate', 'wrong_number', 'admission_done_by_other_consultancy', 'ADMISSION_DONE_BY_OTHER_CONSULTANCY', 'NOT_INTERESTED', '']) assert.equal(courses.allowsContact(value), false);
  for (const value of ['interested', 'no_answer', 'busy', 'call_back', 'forwarded_calls', 'disconnected', 'all_waiting', 'not_reachable', 'ringing']) assert.equal(courses.allowsContact(value), true);
});
test('current, next and arbitrary years without a future-year cap', () => {
  for (const year of [String(new Date().getFullYear()), String(new Date().getFullYear()+1), '2039', '9999', '1900', '1']) assert.equal(courses.validYear(year), true);
  for (const year of ['', '0', '-1', '10000', '2027.5', '20ab']) assert.equal(courses.validYear(year), false);
});
test('course display keeps custom and unknown preferences distinct', () => {
  assert.equal(courses.courseLabel('MD_MS'), 'MD/MS');
  assert.equal(courses.courseLabel('OTHERS', 'Data Science'), 'Data Science');
  assert.equal(courses.courseLabel(null), 'Not recorded');
});
test('template rendering preserves unknown tokens and uses literal replacement values', () => {
  assert.equal(courses.renderWhatsAppTemplate('Hi {{student_name}} {name} {{course}} {{year}} {{caller_name}} {{unknown}}', { student_name: '$&', name: 'A', course: 'MBA', year: '2039', caller_name: 'B' }), 'Hi $& A MBA 2039 B {{unknown}}');
});
test('private template CRUD reuses authenticated API client', async () => {
  const calls = [];
  const service = load('whatsapp.ts', { './api': { apiRequest: async (...args) => { calls.push(args); return { id: 7 }; } } });
  await service.saveWhatsAppTemplate('session', { title: 'T', message: 'M' });
  await service.saveWhatsAppTemplate('session', { title: 'T2', message: 'M2' }, 7);
  await service.deleteWhatsAppTemplate('session', 7);
  assert.deepEqual(calls.map(([url, opts]) => [url, opts.method, opts.token]), [
    ['/mobile/whatsapp/templates/', 'POST', 'session'], ['/mobile/whatsapp/templates/7/', 'PATCH', 'session'], ['/mobile/whatsapp/templates/7/', 'DELETE', 'session'],
  ]);
});
