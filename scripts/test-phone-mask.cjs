const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

function loadModule(relPath) {
  const code = fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const module = { exports };
  vm.runInNewContext(transpiled, { exports, module, require, console });
  return module.exports;
}

const { maskPhoneNumber } = loadModule('src/utils/phoneMask.ts');

test('Phone Number Masking - Standard 10-digit Indian numbers', () => {
  assert.strictEqual(maskPhoneNumber('9876543213'), '98XXX XXX13');
  assert.strictEqual(maskPhoneNumber('98765 43213'), '98XXX XXX13');
  assert.strictEqual(maskPhoneNumber('98765-43213'), '98XXX XXX13');
  assert.strictEqual(maskPhoneNumber(' 9876543213 '), '98XXX XXX13');
});

test('Phone Number Masking - Prefixes (+91, 91, 0, separators)', () => {
  assert.strictEqual(maskPhoneNumber('+919876543213'), '+91 98XXX XXX13');
  assert.strictEqual(maskPhoneNumber('+91 98765 43213'), '+91 98XXX XXX13');
  assert.strictEqual(maskPhoneNumber('+91-98765-43213'), '+91 98XXX XXX13');
  assert.strictEqual(maskPhoneNumber('919876543213'), '+91 98XXX XXX13');
  assert.strictEqual(maskPhoneNumber('09876543213'), '0 98XXX XXX13');
  assert.strictEqual(maskPhoneNumber('0 98765 43213'), '0 98XXX XXX13');
});

test('Phone Number Masking - International numbers', () => {
  assert.strictEqual(maskPhoneNumber('+12025550199'), '+1 20XXX XXX99');
  assert.strictEqual(maskPhoneNumber('+1 (202) 555-0199'), '+1 20XXX XXX99');
  assert.strictEqual(maskPhoneNumber('+447911123456'), '+44 79XXX XXX56');
  assert.strictEqual(maskPhoneNumber('+971501234567'), '+971 50XXXXX67');
  assert.strictEqual(maskPhoneNumber('+971 50 123 4567'), '+971 50XXXXX67');
});

test('Phone Number Masking - Empty, null, undefined, and whitespace', () => {
  assert.strictEqual(maskPhoneNumber(null), '');
  assert.strictEqual(maskPhoneNumber(undefined), '');
  assert.strictEqual(maskPhoneNumber(''), '');
  assert.strictEqual(maskPhoneNumber('   '), '');
});

test('Phone Number Masking - Short and malformed numbers', () => {
  assert.strictEqual(maskPhoneNumber('1'), 'X');
  assert.strictEqual(maskPhoneNumber('12'), 'XX');
  assert.strictEqual(maskPhoneNumber('123'), 'XXX');
  assert.strictEqual(maskPhoneNumber('1234'), '1XX4');
  assert.strictEqual(maskPhoneNumber('12345'), '1XXX5');
  assert.strictEqual(maskPhoneNumber('123456'), '12XX56');
  assert.strictEqual(maskPhoneNumber('12345678'), '12XXXX78');
  assert.strictEqual(maskPhoneNumber('123456789'), '12XXXXX89');
  assert.strictEqual(maskPhoneNumber('N/A'), 'N/A');
  assert.strictEqual(maskPhoneNumber('Private'), 'Private');
});

test('Phone Number Masking - Already masked numbers', () => {
  assert.strictEqual(maskPhoneNumber('98XXX XXX13'), '98XXX XXX13');
  assert.strictEqual(maskPhoneNumber('98******13'), '98XXXXXX13');
  assert.strictEqual(maskPhoneNumber('+91 98XXX XXX13'), '+91 98XXX XXX13');
});

test('Codebase UI Integration & Guarantees', () => {
  const root = path.resolve(__dirname, '..');
  function read(rel) {
    return fs.readFileSync(path.join(root, rel), 'utf8');
  }

  // 1. Leads screen
  const leadsSrc = read('src/app/(tabs)/leads.tsx');
  assert.ok(leadsSrc.includes('maskPhoneNumber(item.phone)'), 'Leads screen must mask assigned lead phone');
  assert.ok(leadsSrc.includes('maskPhoneNumber(item.phoneMasked || item.phone)'), 'Leads screen must mask available lead phone');

  // 2. History screen
  const historySrc = read('src/app/(tabs)/history.tsx');
  assert.ok(historySrc.includes('maskPhoneNumber(item.phone)'), 'History screen must mask call history phone');

  // 3. Dashboard
  const indexSrc = read('src/app/(tabs)/index.tsx');
  assert.ok(indexSrc.includes('maskPhoneNumber(lead.phone)'), 'Dashboard must mask follow-up phone');
  assert.ok(indexSrc.includes('maskPhoneNumber(call.phone)'), 'Dashboard must mask recent activity phone');
  assert.ok(indexSrc.includes("params: { phone_number: lead.phone }"), 'Dashboard call action must preserve raw unmasked number');

  // 4. CounselorCreatedLeadRow
  const counselorUiSrc = read('src/components/counselor/ui.tsx');
  assert.ok(counselorUiSrc.includes('maskPhoneNumber(lead.phone)'), 'Counselor list row must mask lead phone');

  // 5. Direct dialer search
  const directDialerSrc = read('src/app/direct-dialer.tsx');
  assert.ok(directDialerSrc.includes('maskPhoneNumber(item.phone)'), 'Direct dialer list must mask matched lead phone');
  assert.ok(directDialerSrc.includes('handleSelectLead(item.id, item.phone)'), 'Direct dialer must pass raw unmasked phone on selection');

  // 6. Counselor add-lead and reassign modals
  const addLeadSrc = read('src/app/counselor/add-lead.tsx');
  assert.ok(addLeadSrc.includes('maskPhoneNumber(caller.phone)'), 'Add lead caller list must mask caller phone');
  const createdLeadSrc = read('src/app/counselor-created-lead.tsx');
  assert.ok(createdLeadSrc.includes('maskPhoneNumber(caller.phone)'), 'Reassign modal list must mask caller phone');

  // 7. Individual lead detail views maintain unmasked full phone numbers
  const leadDetailSrc = read('src/app/lead-details.tsx');
  assert.ok(leadDetailSrc.includes('{lead.phone}'), 'Lead details must preserve full unmasked lead phone');

  const counselorLeadSrc = read('src/app/counselor-lead.tsx');
  assert.ok(counselorLeadSrc.includes('{lead.phone}'), 'Counselor lead details must preserve full unmasked lead phone');

  assert.ok(createdLeadSrc.includes('<Text style={styles.heroPhone}>{lead.phone}</Text>'), 'Counselor created lead details must preserve full unmasked phone in hero');

  // 8. Dialer & Call actions use raw unmasked phone
  const dialerSrc = read('src/app/dialer.tsx');
  assert.ok(dialerSrc.includes('{currentLead.phone}'), 'Dialer screen must display current lead full phone');
});
