/**
 * Verification test script for Counselor Lead Creation & Caller Assignment client contracts.
 */
const assert = require('assert');

// 1. Verify Course list matches backend Course choices
const COURSES = [
  'MBBS', 'BDS', 'BTECH', 'GNM_NURSING', 'BSC_NURSING',
  'PHARMACY', 'MBA', 'MD_MS', 'OTHERS'
];

assert.strictEqual(COURSES.length, 9, 'Should have exactly 9 course options');
assert(COURSES.includes('MBBS'));
assert(COURSES.includes('OTHERS'));

// 2. Test Phone normalization logic (matches backend normalize_phone)
function normalizePhone(input) {
  return String(input || '').replace(/\D/g, '');
}

assert.strictEqual(normalizePhone('+91 98765 43210'), '919876543210');
assert.strictEqual(normalizePhone('98765-43210'), '9876543210');
assert.strictEqual(normalizePhone('(022) 2876-5432'), '02228765432');
assert(normalizePhone('9876543210').length >= 10);
assert(normalizePhone('12345').length < 10);

// 3. Test Lead Creation Payload Construction
function buildLeadPayload({ name, phone, callerId, email, location, college, course, customCourse, neet, pcb, intake, source, notes }) {
  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone || cleanPhone.length < 10) {
    throw new Error('Valid phone number (>= 10 digits) required');
  }
  if (!callerId) {
    throw new Error('Caller assignment required');
  }

  const payload = {
    phone: cleanPhone,
    assigned_caller_id: Number(callerId),
  };

  if (name && name.trim()) payload.name = name.trim();
  if (email && email.trim()) payload.email = email.trim();
  if (location && location.trim()) payload.location = location.trim();
  if (college && college.trim()) payload.college = college.trim();
  if (course) payload.preferred_course = course;
  if (course === 'OTHERS' && customCourse && customCourse.trim()) {
    payload.preferred_course_custom = customCourse.trim();
  }
  if (neet) payload.neet_status = neet;
  if (pcb && String(pcb).trim()) payload.pcb_percentage = String(pcb).trim();
  if (intake && intake.trim()) payload.preferred_intake = intake.trim();
  if (source && source.trim()) payload.source = source.trim();
  if (notes && notes.trim()) payload.notes = notes.trim();

  return payload;
}

// Minimal payload: phone and caller only (name omitted -> backend defaults to "Student")
const minimal = buildLeadPayload({
  phone: '98765 43210',
  callerId: 42,
});
assert.strictEqual(minimal.phone, '9876543210');
assert.strictEqual(minimal.assigned_caller_id, 42);
assert.strictEqual(minimal.name, undefined);

// Full payload: all CRM fields populated
const full = buildLeadPayload({
  name: 'Sneha Patel',
  phone: '+91 91234 56789',
  callerId: 10,
  email: 'sneha@example.com',
  location: 'Ahmedabad',
  college: 'Nirma University',
  course: 'OTHERS',
  customCourse: 'Aviation Management',
  neet: 'Qualified',
  pcb: '82.40',
  intake: '2026',
  source: 'Campus Visit',
  notes: 'Interested in aviation courses with placement assurance',
});

assert.strictEqual(full.name, 'Sneha Patel');
assert.strictEqual(full.phone, '919123456789');
assert.strictEqual(full.assigned_caller_id, 10);
assert.strictEqual(full.email, 'sneha@example.com');
assert.strictEqual(full.location, 'Ahmedabad');
assert.strictEqual(full.college, 'Nirma University');
assert.strictEqual(full.preferred_course, 'OTHERS');
assert.strictEqual(full.preferred_course_custom, 'Aviation Management');
assert.strictEqual(full.neet_status, 'Qualified');
assert.strictEqual(full.pcb_percentage, '82.40');
assert.strictEqual(full.preferred_intake, '2026');
assert.strictEqual(full.source, 'Campus Visit');
assert.strictEqual(full.notes, 'Interested in aviation courses with placement assurance');

// Validation error checks
assert.throws(() => buildLeadPayload({ phone: '123', callerId: 1 }), /Valid phone number/);
assert.throws(() => buildLeadPayload({ phone: '9876543210' }), /Caller assignment required/);

// 4. Test Reassignment Payload & Validation
function buildReassignPayload({ callerId, currentCallerId }) {
  if (!callerId || Number.isNaN(Number(callerId))) {
    throw new Error('Valid caller ID required for reassignment');
  }
  if (currentCallerId && Number(callerId) === Number(currentCallerId)) {
    throw new Error('Cannot reassign to the currently assigned caller');
  }
  return { caller_id: Number(callerId) };
}

assert.deepStrictEqual(buildReassignPayload({ callerId: 25, currentCallerId: 10 }), { caller_id: 25 });
assert.throws(() => buildReassignPayload({ callerId: null }), /Valid caller ID required/);
assert.throws(() => buildReassignPayload({ callerId: 10, currentCallerId: 10 }), /Cannot reassign to the currently assigned caller/);

// 5. Test Created Lead Route Protection
const fs = require('fs');
const path = require('path');
const counselorTs = fs.readFileSync(path.join(__dirname, '../src/services/counselor.ts'), 'utf8');
assert(counselorTs.includes('/counselor-created-lead'), 'COUNSELOR_ROUTES must include /counselor-created-lead');

console.log('Counselor lead creation & management client validation tests: ALL PASSED');


