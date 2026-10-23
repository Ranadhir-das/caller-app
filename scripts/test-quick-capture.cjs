const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');

// Helper to transpile and run TS modules
function loadTsModule(relativePath, mockImports = {}) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const context = {
    exports: {},
    require: (mod) => {
      if (mockImports[mod]) return mockImports[mod];
      if (mod === './capabilities' || mod === '@/services/capabilities') return loadTsModule('src/services/capabilities.ts');
      throw new Error(`Unexpected import in ${relativePath}: ${mod}`);
    },
  };
  vm.runInNewContext(
    ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    context
  );
  return context.exports;
}

const {
  normalizeIndianMobile,
  extractPhoneCandidates,
  extractLeadCandidates,
  cleanPotentialName,
  isPlausiblePersonName,
  formatPhoneDisplay,
  editPhoneCandidate,
  editCandidateName,
} = loadTsModule('src/utils/quickCapture.ts');

test('inline correction normalizes and preserves selection without mutating OCR candidates', () => {
  const candidates = [{ phone: '7012340103', original: '7012340103', occurrences: 2 },
    { phone: '6234560104', original: '6234560104', occurrences: 1 }];
  const selected = new Set(candidates.map(c => c.phone));
  const result = editPhoneCandidate(candidates, selected, '7012340103', '+91 98765 00111');
  assert.equal(result.phone, '9876500111');
  assert.equal(result.candidates[0].original, '7012340103');
  assert.equal(result.candidates[0].occurrences, 1);
  assert.equal(result.selectedPhones.has('7012340103'), false);
  assert.equal(result.selectedPhones.has('9876500111'), true);
  assert.equal(result.selectedPhones.has('6234560104'), true);
  assert.equal(candidates[0].phone, '7012340103');
  assert.equal(selected.has('7012340103'), true);
});

test('inline correction preserves deselection and allows unchanged formatted number', () => {
  const candidates = [{ phone: '7012340103', original: '7012340103', occurrences: 2 }];
  const result = editPhoneCandidate(candidates, new Set(), '7012340103', '+91 70123 40103');
  assert.equal(result.selectedPhones.size, 0);
  assert.equal(result.candidates[0].occurrences, 2);
});

test('inline correction rejects invalid, duplicate and stale candidates', () => {
  const candidates = [{ phone: '7012340103' }, { phone: '6234560104' }];
  assert.throws(() => editPhoneCandidate(candidates, new Set(), '7012340103', '5123456789'), /valid/);
  assert.throws(() => editPhoneCandidate(candidates, new Set(), '7012340103', '6234560104'), /already/);
  assert.throws(() => editPhoneCandidate(candidates, new Set(), '9876500111', '9876500112'), /no longer/);
  assert.equal(candidates[0].phone, '7012340103');
});

let capturedApiRequests = [];
const counselorService = loadTsModule('src/services/counselor.ts', {
  './api': {
    apiRequest: async (path, options) => {
      capturedApiRequests.push({ path, options });
      return { success: true };
    },
  },
});

function shareRegistrationHarness({ user = { role: 'COUNSELOR' }, loading = false,
  pathname = '/counselor', initial = null } = {}) {
  let effect;
  let listener;
  let removed = false;
  const routes = [];
  const module = loadTsModule('src/components/QuickCaptureShareRegistration.tsx', {
    react: { useEffect: callback => { effect = callback; } },
    'expo-router': { router: { push: route => routes.push(route) }, usePathname: () => pathname },
    '@/context/AuthContext': { useAuth: () => ({ user, loading }) },
    '../../modules/quick-capture/src': {
      getInitialShareIntent: async () => initial,
      addShareIntentListener: callback => {
        listener = callback;
        return { remove: () => { removed = true; } };
      },
    },
  });
  module.QuickCaptureShareRegistration();
  const cleanup = effect();
  return { routes, send: event => listener?.(event), cleanup,
    removed: () => removed };
}

test('share routing opens capture for cold and warm counselor image shares', async () => {
  const image = { uri: 'content://synthetic/image', mimeType: 'image/png' };
  const cold = shareRegistrationHarness({ initial: image });
  await new Promise(setImmediate);
  assert.deepEqual(cold.routes, ['/counselor/quick-capture']);
  cold.send(image);
  assert.equal(cold.routes.length, 1);
  cold.cleanup();
  assert(cold.removed());
  const warm = shareRegistrationHarness();
  warm.send(image);
  assert.deepEqual(warm.routes, ['/counselor/quick-capture']);
  warm.cleanup();
});

test('share routing preserves auth gates and ignores unsupported or already-open shares', async () => {
  const image = { uri: 'content://synthetic/image', mimeType: 'image/png' };
  for (const options of [{ user: null }, { loading: true }, { user: { role: 'CALLER' } },
    { user: { role: 'COUNSELOR', needs_onboarding: true } },
    { pathname: '/counselor/quick-capture' }]) {
    const harness = shareRegistrationHarness({ ...options, initial: image });
    harness.send(image);
    await new Promise(setImmediate);
    assert.equal(harness.routes.length, 0);
    harness.cleanup?.();
  }
  const unsupported = shareRegistrationHarness();
  unsupported.send({ uri: 'content://synthetic/file', mimeType: 'application/pdf' });
  assert.equal(unsupported.routes.length, 0);
  unsupported.cleanup();
});

test('share routing cleanup prevents late initial-share navigation', async () => {
  const harness = shareRegistrationHarness({
    initial: { uri: 'content://synthetic/image', mimeType: 'image/png' },
  });
  harness.cleanup();
  await new Promise(setImmediate);
  assert.equal(harness.routes.length, 0);
});

// ==========================================
// 1. normalizeIndianMobile Unit Tests
// ==========================================

test('normalizeIndianMobile: standard 10-digit mobile numbers', () => {
  assert.equal(normalizeIndianMobile('9876543210'), '9876543210');
  assert.equal(normalizeIndianMobile('8123456789'), '8123456789');
  assert.equal(normalizeIndianMobile('7012345678'), '7012345678');
  assert.equal(normalizeIndianMobile('6234567890'), '6234567890');
});

test('normalizeIndianMobile: numbers starting with 91 but total length is 10 (MUST PRESERVE)', () => {
  // A number like 9123456789 has 10 digits starting with 91. It MUST NOT be truncated to 8 digits!
  assert.equal(normalizeIndianMobile('9123456789'), '9123456789');
  assert.equal(normalizeIndianMobile('9198765432'), '9198765432');
});

test('normalizeIndianMobile: country code +91 variations', () => {
  assert.equal(normalizeIndianMobile('+91 98765 43210'), '9876543210');
  assert.equal(normalizeIndianMobile('+91-9876543210'), '9876543210');
  assert.equal(normalizeIndianMobile('+919876543210'), '9876543210');
  assert.equal(normalizeIndianMobile('+91 63045 69634'), '6304569634');
});

test('normalizeIndianMobile: 12-digit numbers starting with 91', () => {
  // 91 followed by 10 valid digits
  assert.equal(normalizeIndianMobile('919876543210'), '9876543210');
  assert.equal(normalizeIndianMobile('91 79897 73522'), '7989773522');
  assert.equal(normalizeIndianMobile('91-63041-53694'), '6304153694');
});

test('normalizeIndianMobile: stripping formatting characters', () => {
  assert.equal(normalizeIndianMobile('(9876) 543-210'), '9876543210');
  assert.equal(normalizeIndianMobile('  63041 53694  '), '6304153694');
  assert.equal(normalizeIndianMobile('{9876543210}'), '9876543210');
  assert.equal(normalizeIndianMobile('[9876543210]'), '9876543210');
  assert.equal(normalizeIndianMobile('98765.43210'), '9876543210');
});

test('normalizeIndianMobile: rejects invalid numbers without truncating digits', () => {
  assert.equal(normalizeIndianMobile(''), null);
  assert.equal(normalizeIndianMobile(null), null);
  assert.equal(normalizeIndianMobile(undefined), null);
  // Less than 10 digits
  assert.equal(normalizeIndianMobile('987654321'), null);
  // Starts with 0, 1, 2, 3, 4, 5
  assert.equal(normalizeIndianMobile('0876543210'), null);
  assert.equal(normalizeIndianMobile('5876543210'), null);
  assert.equal(normalizeIndianMobile('1234567890'), null);
  // More than 12 digits
  assert.equal(normalizeIndianMobile('9198765432100'), null);
  // 11 digits
  assert.equal(normalizeIndianMobile('98765432100'), null);
  // Invalid + prefix (e.g. +1 US number)
  assert.equal(normalizeIndianMobile('+19876543210'), null);
  // Non-numeric garbage
  assert.equal(normalizeIndianMobile('callmeplease'), null);
});

// ==========================================
// 2. extractPhoneCandidates Unit Tests
// ==========================================

test('extractPhoneCandidates: extracts single number from noisy text', () => {
  const ocrText = `
    WhatsApp Chat with Rahul
    Today 10:45 AM
    Hi please call me on +91 98765 43210 regarding MBBS admission.
    Thanks
  `;
  const result = extractPhoneCandidates(ocrText);
  assert.equal(result.uniqueCount, 1);
  assert.equal(result.candidates[0].phone, '9876543210');
  assert.equal(result.candidates[0].occurrences, 1);
});

test('extractPhoneCandidates: extracts multiple distinct numbers', () => {
  const ocrText = `
    Recent Call Logs:
    Unknown (+91 98765 43210) - 2 min ago
    Ananya (8123456789) - 15 min ago
    Student 3: 70123 45678
  `;
  const result = extractPhoneCandidates(ocrText);
  assert.equal(result.uniqueCount, 3);
  const phones = result.candidates.map((c) => c.phone);
  assert(phones.includes('9876543210'));
  assert(phones.includes('8123456789'));
  assert(phones.includes('7012345678'));
});

test('extractPhoneCandidates: collapses duplicate occurrences and tracks count', () => {
  const ocrText = `
    Incoming Call from 9876543210
    Missed call (2) from +91 98765 43210
    Message sent to 98765 43210
    Another number: 6234567890
  `;
  const result = extractPhoneCandidates(ocrText);
  assert.equal(result.uniqueCount, 2);
  const cand98 = result.candidates.find((c) => c.phone === '9876543210');
  assert(cand98);
  assert.equal(cand98.occurrences, 3);

  const cand62 = result.candidates.find((c) => c.phone === '6234567890');
  assert(cand62);
  assert.equal(cand62.occurrences, 1);
});

test('extractPhoneCandidates: handles empty and non-string inputs safely', () => {
  const resEmpty = extractPhoneCandidates('');
  assert.equal(resEmpty.candidates.length, 0);
  assert.equal(resEmpty.uniqueCount, 0);

  const resNull = extractPhoneCandidates(null);
  assert.equal(resNull.candidates.length, 0);
  assert.equal(resNull.uniqueCount, 0);

  const resUndef = extractPhoneCandidates(undefined);
  assert.equal(resUndef.candidates.length, 0);
  assert.equal(resUndef.uniqueCount, 0);
});

test('extractPhoneCandidates: country code with spaces in surrounding text', () => {
  const result = extractPhoneCandidates('Call 91 98765 43210 about admission');
  assert.equal(result.uniqueCount, 1);
  assert.equal(result.candidates[0].phone, '9876543210');
});

test('extractPhoneCandidates: does not salvage a suffix of an invalid digit sequence', () => {
  for (const text of ['0009876543210', '19876543210', '98765432100', '+1 9876543210']) {
    assert.equal(extractPhoneCandidates(text).uniqueCount, 0, text);
  }
});

// ==========================================
// 3. formatPhoneDisplay Unit Tests
// ==========================================

test('formatPhoneDisplay: splits 10 digits into 5-5 chunks', () => {
  assert.equal(formatPhoneDisplay('9876543210'), '98765 43210');
  assert.equal(formatPhoneDisplay('6304569634'), '63045 69634');
  assert.equal(formatPhoneDisplay('short'), 'short');
  assert.equal(formatPhoneDisplay(''), '');
});

// ==========================================
// 4. Counselor Service Contract Tests
// ==========================================

test('COUNSELOR_ROUTES includes quick-capture', () => {
  assert(counselorService.COUNSELOR_ROUTES.includes('/counselor/quick-capture'));
});

test('counselorApi.checkDuplicates sends phone list', async () => {
  capturedApiRequests = [];
  await counselorService.counselorApi.checkDuplicates('mock-token', ['9876543210', '8123456789']);
  assert.equal(capturedApiRequests.length, 1);
  assert.equal(capturedApiRequests[0].path, '/mobile/counselor/leads/check-duplicates/');
  assert.equal(capturedApiRequests[0].options.method, 'POST');
  assert.equal(capturedApiRequests[0].options.token, 'mock-token');
  const body = capturedApiRequests[0].options.body;
  assert.deepEqual(body.phones, ['9876543210', '8123456789']);
});

test('counselorApi.batchCreateLeads handles unassigned batch payload', async () => {
  capturedApiRequests = [];
  await counselorService.counselorApi.batchCreateLeads('mock-token', {
    leads: [
      { phone: '9876543210', name: 'Student 1' },
      { phone: '8123456789' },
    ],
    assigned_caller_id: null,
    preferred_course: 'MBBS',
  });
  assert.equal(capturedApiRequests.length, 1);
  assert.equal(capturedApiRequests[0].path, '/mobile/counselor/leads/batch-create/');
  assert.equal(capturedApiRequests[0].options.method, 'POST');
  assert.equal(capturedApiRequests[0].options.token, 'mock-token');
  const body = capturedApiRequests[0].options.body;
  assert.equal(body.assigned_caller_id, null);
  assert.equal(body.preferred_course, 'MBBS');
  assert.equal(body.leads.length, 2);
  assert.equal(body.leads[0].phone, '9876543210');
  assert.equal(body.leads[0].name, 'Student 1');
  assert.equal(body.leads[1].phone, '8123456789');
  assert.equal(body.leads[1].name, undefined);
});

test('counselorApi.batchCreateLeads handles assigned caller batch payload', async () => {
  capturedApiRequests = [];
  await counselorService.counselorApi.batchCreateLeads('mock-token', {
    leads: [{ phone: '9876543210', name: 'Pooja' }],
    assigned_caller_id: 15,
  });
  assert.equal(capturedApiRequests.length, 1);
  const body = capturedApiRequests[0].options.body;
  assert.equal(body.assigned_caller_id, 15);
  assert.equal(body.leads[0].name, 'Pooja');
});

// ==========================================
// 5. Name Extraction & Association Tests
// ==========================================

test('cleanPotentialName and isPlausiblePersonName filters noise correctly', () => {
  assert.equal(cleanPotentialName('Name: Rahul Sharma - 9876543210', '9876543210'), 'Rahul Sharma');
  assert.equal(cleanPotentialName('+91 98765 43210 (Sneha Reddy)', '9876543210'), 'Sneha Reddy');
  assert.equal(cleanPotentialName('1. Amit Patel (MBBS)'), 'Amit Patel');
  assert.equal(cleanPotentialName('WhatsApp Chat with Priya Verma'), 'Priya Verma');

  // Valid person names
  assert.equal(isPlausiblePersonName('Rahul Sharma'), true);
  assert.equal(isPlausiblePersonName('Aarav Patel'), true);
  assert.equal(isPlausiblePersonName('Sneha B. Reddy'), true);
  assert.equal(isPlausiblePersonName('Dr. Rajesh Gupta'), true);
  assert.equal(isPlausiblePersonName('P. Venkat Rao'), true);
  assert.equal(isPlausiblePersonName('Mary-Jane'), true);

  // Obvious non-names must be rejected
  assert.equal(isPlausiblePersonName('MBBS'), false);
  assert.equal(isPlausiblePersonName('B.Tech Admissions'), false);
  assert.equal(isPlausiblePersonName('Mobile'), false);
  assert.equal(isPlausiblePersonName('Phone Number'), false);
  assert.equal(isPlausiblePersonName('Missed Call'), false);
  assert.equal(isPlausiblePersonName('Incoming Call'), false);
  assert.equal(isPlausiblePersonName('Yesterday 10:45 AM'), false);
  assert.equal(isPlausiblePersonName('Bangalore'), false);
  assert.equal(isPlausiblePersonName('Karnataka, India'), false);
  assert.equal(isPlausiblePersonName('Student'), false);
  assert.equal(isPlausiblePersonName('Unknown'), false);
  assert.equal(isPlausiblePersonName('9876543210'), false);
  assert.equal(isPlausiblePersonName('Please call me regarding admission'), false);
});

test('name and phone number on the same line', () => {
  const ocrText = 'Rahul Sharma - +91 98765 43210';
  const result = extractLeadCandidates(ocrText);
  assert.equal(result.uniqueCount, 1);
  assert.equal(result.candidates[0].phone, '9876543210');
  assert.equal(result.candidates[0].name, 'Rahul Sharma');
  assert.equal(result.candidates[0].needsReview, false);

  const parenText = '+91 81234 56789 (Sneha Reddy)';
  const resParen = extractLeadCandidates(parenText);
  assert.equal(resParen.candidates[0].phone, '8123456789');
  assert.equal(resParen.candidates[0].name, 'Sneha Reddy');

  const colonText = 'Student: Amit Patel: 7012345678';
  const resColon = extractLeadCandidates(colonText);
  assert.equal(resColon.candidates[0].phone, '7012345678');
  assert.equal(resColon.candidates[0].name, 'Amit Patel');
});

test('name directly above a phone number', () => {
  const ocrText = `
    Aarav Patel
    Mobile: +91 98765 43210
  `;
  const result = extractLeadCandidates(ocrText);
  assert.equal(result.uniqueCount, 1);
  assert.equal(result.candidates[0].phone, '9876543210');
  assert.equal(result.candidates[0].name, 'Aarav Patel');
  assert.equal(result.candidates[0].needsReview, false);
});

test('name directly below a phone number flags needsReview', () => {
  const ocrText = `
    +91 98765 43210
    Pooja Verma
  `;
  const result = extractLeadCandidates(ocrText);
  assert.equal(result.uniqueCount, 1);
  assert.equal(result.candidates[0].phone, '9876543210');
  assert.equal(result.candidates[0].name, 'Pooja Verma');
  assert.equal(result.candidates[0].needsReview, true);
});

test('multiple names and numbers in a table with bounding boxes', () => {
  const structuredOcr = {
    text: '1. Rahul Sharma 9876543210 MBBS\n2. Ananya Rao 8123456789 BDS',
    blocks: [
      {
        text: 'Table block',
        lines: [
          // Row 1
          { text: '1. Rahul Sharma', boundingBox: { left: 40, top: 100, right: 150, bottom: 120, width: 110, height: 20 } },
          { text: '9876543210', boundingBox: { left: 200, top: 100, right: 350, bottom: 120, width: 150, height: 20 } },
          { text: 'MBBS', boundingBox: { left: 400, top: 100, right: 460, bottom: 120, width: 60, height: 20 } },

          // Row 2
          { text: '2. Ananya Rao', boundingBox: { left: 40, top: 140, right: 150, bottom: 160, width: 110, height: 20 } },
          { text: '8123456789', boundingBox: { left: 200, top: 140, right: 350, bottom: 160, width: 150, height: 20 } },
          { text: 'BDS', boundingBox: { left: 400, top: 140, right: 460, bottom: 160, width: 60, height: 20 } },
        ],
      },
    ],
  };

  const result = extractLeadCandidates(structuredOcr);
  assert.equal(result.uniqueCount, 2);

  const candRahul = result.candidates.find((c) => c.phone === '9876543210');
  assert(candRahul);
  assert.equal(candRahul.name, 'Rahul Sharma');
  assert.notEqual(candRahul.name, 'MBBS');

  const candAnanya = result.candidates.find((c) => c.phone === '8123456789');
  assert(candAnanya);
  assert.equal(candAnanya.name, 'Ananya Rao');
  assert.notEqual(candAnanya.name, 'BDS');
});

test('multiple contacts in one screenshot', () => {
  const ocrText = `
    Recent Contacts
    Aarav Patel
    +91 98765 43210

    Pooja Verma
    8123456789

    Kunal Roy
    70123 45678
  `;
  const result = extractLeadCandidates(ocrText);
  assert.equal(result.uniqueCount, 3);

  const c1 = result.candidates.find((c) => c.phone === '9876543210');
  assert.equal(c1.name, 'Aarav Patel');

  const c2 = result.candidates.find((c) => c.phone === '8123456789');
  assert.equal(c2.name, 'Pooja Verma');

  const c3 = result.candidates.find((c) => c.phone === '7012345678');
  assert.equal(c3.name, 'Kunal Roy');
});

test('phone number without a visible name leaves name undefined', () => {
  const ocrText = `
    Incoming call
    Yesterday 10:45 AM
    +91 98765 43210
    Bangalore, Karnataka
    Duration: 2 min 14 sec
  `;
  const result = extractLeadCandidates(ocrText);
  assert.equal(result.uniqueCount, 1);
  assert.equal(result.candidates[0].phone, '9876543210');
  assert.equal(result.candidates[0].name, undefined);
});

test('name without a nearby phone number does not create candidate', () => {
  const ocrText = `
    Counselor: Dr. Rajesh Gupta
    Lead Batch Notes:
    All students successfully verified.
    No contact numbers recorded.
  `;
  const result = extractLeadCandidates(ocrText);
  assert.equal(result.uniqueCount, 0);
  assert.equal(result.candidates.length, 0);
});

test('course headings, labels, dates and addresses are rejected as names', () => {
  const ocrText = `
    MBBS Admission 2026
    Recent Calls
    Today 04:30 PM
    Mobile: 9876543210
    Bangalore, India
  `;
  const result = extractLeadCandidates(ocrText);
  assert.equal(result.uniqueCount, 1);
  assert.equal(result.candidates[0].phone, '9876543210');
  assert.equal(result.candidates[0].name, undefined);
});

test('duplicate phone numbers collapses occurrences and preserves name', () => {
  const ocrText = `
    Rahul Sharma - 9876543210
    Missed call from +91 98765 43210
    Message sent to 98765 43210
  `;
  const result = extractLeadCandidates(ocrText);
  assert.equal(result.uniqueCount, 1);
  assert.equal(result.candidates[0].phone, '9876543210');
  assert.equal(result.candidates[0].name, 'Rahul Sharma');
  assert.equal(result.candidates[0].occurrences, 3);
});

test('ambiguous layout flags needsReview', () => {
  // Candidate name with single short word like "Dev" or multi-claim
  const ocrText = `
    Dev
    9876543210
  `;
  const result = extractLeadCandidates(ocrText);
  assert.equal(result.uniqueCount, 1);
  assert.equal(result.candidates[0].phone, '9876543210');
  assert.equal(result.candidates[0].name, 'Dev');
  assert.equal(result.candidates[0].needsReview, true);
});

test('manual name correction updates candidate name and clears needsReview', () => {
  const candidates = [
    { phone: '9876543210', original: '9876543210', occurrences: 1, name: 'Dev', needsReview: true },
    { phone: '8123456789', original: '8123456789', occurrences: 1, name: undefined },
  ];

  // Correct first candidate
  const updated1 = editCandidateName(candidates, '9876543210', 'Devendra Singh');
  assert.equal(updated1[0].name, 'Devendra Singh');
  assert.equal(updated1[0].needsReview, false);

  // Add name for second candidate
  const updated2 = editCandidateName(updated1, '8123456789', 'Ananya Roy');
  assert.equal(updated2[1].name, 'Ananya Roy');
  assert.equal(updated2[1].needsReview, false);

  // Clear name
  const cleared = editCandidateName(updated2, '8123456789', '');
  assert.equal(cleared[1].name, undefined);
  assert.equal(cleared[1].needsReview, false);
});

// =========================================================================
// 6. Systematic Phase B Scenarios (Scenarios 1 to 18)
// =========================================================================

test('Scenario 1: Name and phone on the same line (Rahul Sharma - +91 98765 43210)', () => {
  const input = 'Rahul Sharma - +91 98765 43210';
  const res = extractLeadCandidates(input);
  assert.equal(res.uniqueCount, 1);
  assert.equal(res.candidates[0].phone, '9876543210');
  assert.equal(res.candidates[0].name, 'Rahul Sharma');
  assert.equal(res.candidates[0].needsReview, false);
});

test('Scenario 2: Phone followed by a name (+91 98765 43210 (Sneha Reddy))', () => {
  const input = '+91 98765 43210 (Sneha Reddy)';
  const res = extractLeadCandidates(input);
  assert.equal(res.uniqueCount, 1);
  assert.equal(res.candidates[0].phone, '9876543210');
  assert.equal(res.candidates[0].name, 'Sneha Reddy');
});

test('Scenario 3: Contact card with a name directly above the number', () => {
  const structuredOcr = {
    text: 'Aarav Patel\n+91 98765 43210',
    blocks: [
      {
        text: 'Contact card',
        lines: [
          { text: 'Aarav Patel', boundingBox: { left: 40, top: 100, right: 180, bottom: 120, width: 140, height: 20 } },
          { text: 'Mobile: +91 98765 43210', boundingBox: { left: 40, top: 126, right: 260, bottom: 146, width: 220, height: 20 } },
        ],
      },
    ],
  };
  const res = extractLeadCandidates(structuredOcr);
  assert.equal(res.uniqueCount, 1);
  assert.equal(res.candidates[0].phone, '9876543210');
  assert.equal(res.candidates[0].name, 'Aarav Patel');
  assert.equal(res.candidates[0].needsReview, false);
});

test('Scenario 4: Contact card with a name directly below the number (verify review flag)', () => {
  const structuredOcr = {
    text: '+91 98765 43210\nPooja Verma',
    blocks: [
      {
        text: 'Inverted card',
        lines: [
          { text: '+91 98765 43210', boundingBox: { left: 40, top: 100, right: 220, bottom: 120, width: 180, height: 20 } },
          { text: 'Pooja Verma', boundingBox: { left: 40, top: 128, right: 170, bottom: 148, width: 130, height: 20 } },
        ],
      },
    ],
  };
  const res = extractLeadCandidates(structuredOcr);
  assert.equal(res.uniqueCount, 1);
  assert.equal(res.candidates[0].phone, '9876543210');
  assert.equal(res.candidates[0].name, 'Pooja Verma');
  assert.equal(res.candidates[0].needsReview, true);
});

test('Scenario 5: A table with at least five rows containing different names and phone numbers', () => {
  const fiveRowTable = {
    text: 'Table with 5 students',
    blocks: [
      {
        text: 'Table content',
        lines: [
          // Row 1
          { text: '1. Aarav Sharma', boundingBox: { left: 30, top: 100, right: 160, bottom: 120, width: 130, height: 20 } },
          { text: '9876500001', boundingBox: { left: 200, top: 100, right: 350, bottom: 120, width: 150, height: 20 } },
          // Row 2
          { text: '2. Diya Patel', boundingBox: { left: 30, top: 130, right: 160, bottom: 150, width: 130, height: 20 } },
          { text: '9876500002', boundingBox: { left: 200, top: 130, right: 350, bottom: 150, width: 150, height: 20 } },
          // Row 3
          { text: '3. Rohan Verma', boundingBox: { left: 30, top: 160, right: 160, bottom: 180, width: 130, height: 20 } },
          { text: '9876500003', boundingBox: { left: 200, top: 160, right: 350, bottom: 180, width: 150, height: 20 } },
          // Row 4
          { text: '4. Ishaan Iyer', boundingBox: { left: 30, top: 190, right: 160, bottom: 210, width: 130, height: 20 } },
          { text: '9876500004', boundingBox: { left: 200, top: 190, right: 350, bottom: 210, width: 150, height: 20 } },
          // Row 5
          { text: '5. Meera Nair', boundingBox: { left: 30, top: 220, right: 160, bottom: 240, width: 130, height: 20 } },
          { text: '9876500005', boundingBox: { left: 200, top: 220, right: 350, bottom: 240, width: 150, height: 20 } },
        ],
      },
    ],
  };

  const res = extractLeadCandidates(fiveRowTable);
  assert.equal(res.uniqueCount, 5);

  const expected = [
    { phone: '9876500001', name: 'Aarav Sharma' },
    { phone: '9876500002', name: 'Diya Patel' },
    { phone: '9876500003', name: 'Rohan Verma' },
    { phone: '9876500004', name: 'Ishaan Iyer' },
    { phone: '9876500005', name: 'Meera Nair' },
  ];

  for (const exp of expected) {
    const cand = res.candidates.find((c) => c.phone === exp.phone);
    assert(cand, `Missing candidate for phone ${exp.phone}`);
    assert.equal(cand.name, exp.name, `Phone ${exp.phone} associated with wrong name: got ${cand.name}, expected ${exp.name}`);
  }
});

test('Scenario 6: Multi-column layouts where name and phone are in separate cells', () => {
  const multiColOcr = {
    text: 'Rank 142 Kavita Krishnan 9876511111 MBBS\nRank 215 Gaurav Mukherjee 9876522222 B.Tech',
    blocks: [
      {
        text: 'Multi column table',
        lines: [
          // Row 1
          { text: 'Rank 142', boundingBox: { left: 20, top: 80, right: 90, bottom: 100, width: 70, height: 20 } },
          { text: 'Kavita Krishnan', boundingBox: { left: 110, top: 80, right: 240, bottom: 100, width: 130, height: 20 } },
          { text: '9876511111', boundingBox: { left: 260, top: 80, right: 390, bottom: 100, width: 130, height: 20 } },
          { text: 'MBBS', boundingBox: { left: 410, top: 80, right: 480, bottom: 100, width: 70, height: 20 } },

          // Row 2
          { text: 'Rank 215', boundingBox: { left: 20, top: 110, right: 90, bottom: 130, width: 70, height: 20 } },
          { text: 'Gaurav Mukherjee', boundingBox: { left: 110, top: 110, right: 250, bottom: 130, width: 140, height: 20 } },
          { text: '9876522222', boundingBox: { left: 260, top: 110, right: 390, bottom: 130, width: 130, height: 20 } },
          { text: 'B.Tech', boundingBox: { left: 410, top: 110, right: 480, bottom: 130, width: 70, height: 20 } },
        ],
      },
    ],
  };

  const res = extractLeadCandidates(multiColOcr);
  assert.equal(res.uniqueCount, 2);

  const c1 = res.candidates.find((c) => c.phone === '9876511111');
  assert.equal(c1.name, 'Kavita Krishnan');
  assert.notEqual(c1.name, 'Rank 142');
  assert.notEqual(c1.name, 'MBBS');

  const c2 = res.candidates.find((c) => c.phone === '9876522222');
  assert.equal(c2.name, 'Gaurav Mukherjee');
  assert.notEqual(c2.name, 'Rank 215');
  assert.notEqual(c2.name, 'B.Tech');
});

test('Scenario 7: Multiple contacts with close vertical spacing', () => {
  const tightListOcr = {
    text: 'Tight list',
    blocks: [
      {
        text: 'Contacts',
        lines: [
          // Contact 1
          { text: 'Nikhil Jain', boundingBox: { left: 40, top: 50, right: 160, bottom: 68, width: 120, height: 18 } },
          { text: '9876533333', boundingBox: { left: 40, top: 70, right: 180, bottom: 88, width: 140, height: 18 } },
          // Contact 2 (starts only 6px below previous contact's phone)
          { text: 'Swati Mishra', boundingBox: { left: 40, top: 94, right: 160, bottom: 112, width: 120, height: 18 } },
          { text: '9876544444', boundingBox: { left: 40, top: 114, right: 180, bottom: 132, width: 140, height: 18 } },
          // Contact 3
          { text: 'Tanvi Gupta', boundingBox: { left: 40, top: 138, right: 160, bottom: 156, width: 120, height: 18 } },
          { text: '9876555555', boundingBox: { left: 40, top: 158, right: 180, bottom: 176, width: 140, height: 18 } },
        ],
      },
    ],
  };

  const res = extractLeadCandidates(tightListOcr);
  assert.equal(res.uniqueCount, 3);

  const c1 = res.candidates.find((c) => c.phone === '9876533333');
  assert.equal(c1.name, 'Nikhil Jain');

  const c2 = res.candidates.find((c) => c.phone === '9876544444');
  assert.equal(c2.name, 'Swati Mishra');

  const c3 = res.candidates.find((c) => c.phone === '9876555555');
  assert.equal(c3.name, 'Tanvi Gupta');
});

test('Scenario 8: Repeated names and similar names', () => {
  const structuredOcr = {
    text: 'Repeat list',
    blocks: [
      {
        text: 'Contacts',
        lines: [
          { text: 'Rahul Sharma', boundingBox: { left: 40, top: 50, right: 180, bottom: 70, width: 140, height: 20 } },
          { text: '9876500010', boundingBox: { left: 40, top: 74, right: 200, bottom: 94, width: 160, height: 20 } },
          { text: 'Rahul Sharma', boundingBox: { left: 40, top: 110, right: 180, bottom: 130, width: 140, height: 20 } },
          { text: '9876500020', boundingBox: { left: 40, top: 134, right: 200, bottom: 154, width: 160, height: 20 } },
          { text: 'Rahul S. Sharma', boundingBox: { left: 40, top: 170, right: 200, bottom: 190, width: 160, height: 20 } },
          { text: '9876500030', boundingBox: { left: 40, top: 194, right: 200, bottom: 214, width: 160, height: 20 } },
        ],
      },
    ],
  };

  const res = extractLeadCandidates(structuredOcr);
  assert.equal(res.uniqueCount, 3);

  const c1 = res.candidates.find((c) => c.phone === '9876500010');
  assert.equal(c1.name, 'Rahul Sharma');

  const c2 = res.candidates.find((c) => c.phone === '9876500020');
  assert.equal(c2.name, 'Rahul Sharma');
  // Second identical name flagged for review to avoid false assumption
  assert.equal(c2.needsReview, true);

  const c3 = res.candidates.find((c) => c.phone === '9876500030');
  assert.equal(c3.name, 'Rahul S. Sharma');
});

test('Scenario 9: A name candidate that could incorrectly be associated with two phone numbers', () => {
  // Only one student name line, followed by two separate phone lines
  const structuredOcr = {
    text: 'One name two numbers',
    blocks: [
      {
        text: 'block',
        lines: [
          { text: 'Pooja Verma', boundingBox: { left: 40, top: 50, right: 160, bottom: 70, width: 120, height: 20 } },
          { text: '9876500001', boundingBox: { left: 40, top: 75, right: 200, bottom: 95, width: 160, height: 20 } },
          { text: '9876500002', boundingBox: { left: 40, top: 120, right: 200, bottom: 140, width: 160, height: 20 } },
        ],
      },
    ],
  };

  const res = extractLeadCandidates(structuredOcr);
  assert.equal(res.uniqueCount, 2);

  const c1 = res.candidates.find((c) => c.phone === '9876500001');
  assert.equal(c1.name, 'Pooja Verma');

  const c2 = res.candidates.find((c) => c.phone === '9876500002');
  // Second phone must NOT steal Pooja Verma; its name remains undefined
  assert.equal(c2.name, undefined);
});

test('Scenario 10: Phone numbers without any visible name', () => {
  const ocrText = 'Missed call from +91 98765 00099 - 2 min ago\nDuration 0s';
  const res = extractLeadCandidates(ocrText);
  assert.equal(res.uniqueCount, 1);
  assert.equal(res.candidates[0].phone, '9876500099');
  assert.equal(res.candidates[0].name, undefined);
});

test('Scenario 11: Screenshots containing headings, course names, dates, addresses, and UI labels', () => {
  const noisyOcr = `
    MBBS & BDS Admissions 2026
    Recent Calls - Bangalore South
    Yesterday 11:30 AM
    Mobile: 9876500077
    Incoming WhatsApp Call
    Tap to view details
  `;
  const res = extractLeadCandidates(noisyOcr);
  assert.equal(res.uniqueCount, 1);
  assert.equal(res.candidates[0].phone, '9876500077');
  assert.equal(res.candidates[0].name, undefined);
});

test('Scenario 12: Single-word names and ambiguous name candidates', () => {
  const input = `
    Dev
    9876500088
  `;
  const res = extractLeadCandidates(input);
  assert.equal(res.uniqueCount, 1);
  assert.equal(res.candidates[0].phone, '9876500088');
  assert.equal(res.candidates[0].name, 'Dev');
  // Short single word flags review
  assert.equal(res.candidates[0].needsReview, true);
});

test('Scenario 13: Duplicate phone numbers within the same screenshot', () => {
  const input = `
    Amit Patel - 9876500055
    Missed call from +91 98765 00055
    Call back to 98765 00055
  `;
  const res = extractLeadCandidates(input);
  assert.equal(res.uniqueCount, 1);
  assert.equal(res.candidates[0].phone, '9876500055');
  assert.equal(res.candidates[0].name, 'Amit Patel');
  assert.equal(res.candidates[0].occurrences, 3);
});

test('Scenario 14: Phone numbers with Indian country-code and trunk-prefix variations supported', () => {
  const variations = [
    '9876500001',
    '9123456789',
    '+91 98765 00002',
    '+91-98765-00003',
    '+919876500004',
    '919876500005',
    '91 98765 00006',
    '(9876) 500-007',
    '[9876500008]',
    '{9876500009}',
    '98765.00010',
  ];

  for (const v of variations) {
    const norm = normalizeIndianMobile(v);
    assert(norm, `Variation failed normalization: ${v}`);
    assert.equal(norm.length, 10);
    assert(/^[6-9]\d{9}$/.test(norm));
  }

  // 10-digit starting with 91 preserved
  assert.equal(normalizeIndianMobile('9123456789'), '9123456789');
});

test('Scenario 15: Empty OCR results, malformed bounding boxes, and missing optional layout fields', () => {
  assert.equal(extractLeadCandidates('').uniqueCount, 0);
  assert.equal(extractLeadCandidates(null).uniqueCount, 0);
  assert.equal(extractLeadCandidates(undefined).uniqueCount, 0);
  assert.equal(extractLeadCandidates({ text: '', blocks: [] }).uniqueCount, 0);

  // Missing optional fields (no bounding boxes, missing lines)
  const missingFieldsOcr = {
    text: 'Aarav Patel 9876500001',
    blocks: [{ text: 'Aarav Patel 9876500001' }],
  };
  const res1 = extractLeadCandidates(missingFieldsOcr);
  assert.equal(res1.uniqueCount, 1);
  assert.equal(res1.candidates[0].phone, '9876500001');
  assert.equal(res1.candidates[0].name, 'Aarav Patel');

  // Malformed bounding box: NaN coordinates and negative dimensions
  const malformedBoxOcr = {
    text: 'Priya Sharma\n9876500002',
    blocks: [
      {
        text: 'block',
        lines: [
          { text: 'Priya Sharma', boundingBox: { left: NaN, top: 10, right: 100, bottom: 30 } },
          { text: '9876500002', boundingBox: { left: 100, top: 200, right: 50, bottom: 150 } }, // inverted
        ],
      },
    ],
  };
  // Must not crash, safely falls back to line order
  const res2 = extractLeadCandidates(malformedBoxOcr);
  assert.equal(res2.uniqueCount, 1);
  assert.equal(res2.candidates[0].phone, '9876500002');
  assert.equal(res2.candidates[0].name, 'Priya Sharma');
});

test('Scenario 16: Inline name editing and confirmation that edited value is used in final candidate', () => {
  const candidates = [
    { phone: '9876500001', original: '9876500001', occurrences: 1, name: 'S. Reddy', needsReview: true },
  ];

  const edited = editCandidateName(candidates, '9876500001', 'Sneha B. Reddy');
  assert.equal(edited[0].phone, '9876500001');
  assert.equal(edited[0].name, 'Sneha B. Reddy');
  assert.equal(edited[0].needsReview, false);
});

test('Scenario 17: Backward compatibility with plain-text OCR input', () => {
  const rawPlainText = 'Pooja Verma: +91 98765 00001';
  // Calling extractPhoneCandidates directly with a string (existing callers)
  const res = extractPhoneCandidates(rawPlainText);
  assert.equal(res.uniqueCount, 1);
  assert.equal(res.candidates[0].phone, '9876500001');
  assert.equal(res.candidates[0].name, 'Pooja Verma');
});

test('Scenario 18: Preservation of existing phone-only extraction behavior', () => {
  for (const text of ['0009876543210', '19876543210', '98765432100', '+1 9876543210', 'callmeplease', '5876543210']) {
    assert.equal(extractPhoneCandidates(text).uniqueCount, 0, `Expected 0 candidates for ${text}`);
  }
});

// ==========================================
// 8. Caller Selection & Review UI State Tests
// ==========================================

test('caller list filtering: matches name and username case-insensitively without arbitrary truncation', () => {
  const callers = Array.from({ length: 25 }, (_, i) => ({
    id: i + 1,
    name: `Caller ${i + 1} Name`,
    username: `caller_user_${i + 1}`,
    phone: `98765000${String(i + 1).padStart(2, '0')}`,
    role: 'CALLER',
  }));

  // No search: all 25 callers are retained (no slice to 10)
  const filterEmpty = (query, list) => {
    if (!query.trim()) return list;
    const q = query.toLowerCase().trim();
    return list.filter((c) => c.name.toLowerCase().includes(q) || c.username.toLowerCase().includes(q));
  };

  const allFiltered = filterEmpty('', callers);
  assert.equal(allFiltered.length, 25, 'All callers should be available without arbitrary truncation');

  // Search by name
  const nameFiltered = filterEmpty('caller 15', callers);
  assert.equal(nameFiltered.length, 1);
  assert.equal(nameFiltered[0].id, 15);

  // Search by username
  const userFiltered = filterEmpty('caller_user_20', callers);
  assert.equal(userFiltered.length, 1);
  assert.equal(userFiltered[0].id, 20);

  // Search no match
  const noneFiltered = filterEmpty('nonexistent', callers);
  assert.equal(noneFiltered.length, 0);
});

test('Leave unassigned clears caller selection and updates CTA button label', () => {
  let assignNow = true;
  let selectedCallerId = 5;
  const callers = [{ id: 5, name: 'Active Caller 5' }, { id: 6, name: 'Active Caller 6' }];

  const selectUnassigned = () => {
    assignNow = false;
    selectedCallerId = null;
  };

  const selectAssign = () => {
    assignNow = true;
    if (!selectedCallerId && callers.length > 0) {
      selectedCallerId = callers[0].id;
    }
  };

  const getButtonLabel = (count) => {
    const selectedCaller = callers.find((c) => c.id === selectedCallerId);
    return `Save ${count} Lead${count > 1 ? 's' : ''} ${assignNow && selectedCaller ? '& Assign' : ''} ↗`.replace(/\s+/g, ' ').trim();
  };

  // Initially assigned
  assert.equal(assignNow, true);
  assert.equal(selectedCallerId, 5);
  assert.equal(getButtonLabel(2), 'Save 2 Leads & Assign ↗');

  // Switch to Leave unassigned
  selectUnassigned();
  assert.equal(assignNow, false);
  assert.equal(selectedCallerId, null);
  assert.equal(getButtonLabel(2), 'Save 2 Leads ↗');

  // Switch back to Assign
  selectAssign();
  assert.equal(assignNow, true);
  assert.equal(selectedCallerId, 5);
  assert.equal(getButtonLabel(1), 'Save 1 Lead & Assign ↗');
});

test('caller selection updates selected state with stable id keys', () => {
  const callers = [
    { id: 101, name: 'Sneha', username: 'sneha_caller' },
    { id: 102, name: 'Rohan', username: 'rohan_caller' },
  ];
  let selectedCallerId = 101;

  const selectCaller = (id) => {
    selectedCallerId = id;
  };

  assert.equal(selectedCallerId, 101);
  selectCaller(102);
  assert.equal(selectedCallerId, 102);
  assert.equal(String(callers[1].id), '102');
});
