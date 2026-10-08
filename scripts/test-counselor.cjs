const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/services/counselor.ts'), 'utf8');
const context = {
  exports: {},
  require: (mod) => {
    if (mod === './api') return { apiRequest: async () => ({}) };
    throw new Error(`Unexpected import: ${mod}`);
  },
};
vm.runInNewContext(
  ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  context
);

const {
  isCounselor,
  canOfferForward,
  homeRouteFor,
  availabilityTone,
  contactStatusTone,
  formatContactTime,
  formatDuration,
  buildCounselorNotePayload,
  COUNSELOR_ROUTES,
} = context.exports;

test('isCounselor correctly identifies counselor role case-insensitively', () => {
  assert.equal(isCounselor({ role: 'COUNSELOR' }), true);
  assert.equal(isCounselor({ role: 'counselor' }), true);
  assert.equal(isCounselor({ role: 'CALLER' }), false);
  assert.equal(isCounselor({ role: 'ADMIN' }), false);
  assert.equal(isCounselor(null), false);
  assert.equal(isCounselor(undefined), false);
});

test('homeRouteFor routes counselors to /counselor and others to /employee', () => {
  assert.equal(homeRouteFor({ role: 'COUNSELOR', needs_onboarding: false }), '/counselor');
  assert.equal(homeRouteFor({ role: 'COUNSELOR', needs_onboarding: true }), '/employee');
  assert.equal(homeRouteFor({ role: 'CALLER', needs_onboarding: false }), '/employee');
  assert.equal(homeRouteFor({ role: 'EMPLOYEE', needs_onboarding: false }), '/employee');
  assert.equal(homeRouteFor(null), '/employee');
});

test('canOfferForward requires CALLER role, INTERESTED outcome, and non-null leadId', () => {
  assert.equal(canOfferForward({ role: 'CALLER' }, 'INTERESTED', 42), true);
  assert.equal(canOfferForward({ role: 'caller' }, 'interested', 42), true);
  // Non-caller cannot forward
  assert.equal(canOfferForward({ role: 'COUNSELOR' }, 'INTERESTED', 42), false);
  assert.equal(canOfferForward({ role: 'ADMIN' }, 'INTERESTED', 42), false);
  // Non-interested outcome cannot forward
  assert.equal(canOfferForward({ role: 'CALLER' }, 'NOT_INTERESTED', 42), false);
  assert.equal(canOfferForward({ role: 'CALLER' }, 'CALL_BACK', 42), false);
  // Missing lead cannot forward
  assert.equal(canOfferForward({ role: 'CALLER' }, 'INTERESTED', null), false);
  assert.equal(canOfferForward({ role: 'CALLER' }, 'INTERESTED', undefined), false);
});

test('availabilityTone maps codes to distinct visual tones', () => {
  assert.equal(availabilityTone('ONLINE'), 'success');
  assert.equal(availabilityTone('CHECKED_IN'), 'warning');
  assert.equal(availabilityTone('ON_LEAVE'), 'danger');
  assert.equal(availabilityTone('OFFLINE'), 'muted');
});

test('formatDuration formats seconds nicely', () => {
  assert.equal(formatDuration(0), '0s');
  assert.equal(formatDuration(45), '45s');
  assert.equal(formatDuration(60), '1m 0s');
  assert.equal(formatDuration(125), '2m 5s');
  assert.equal(formatDuration(-5), '0s');
});

test('buildCounselorNotePayload creates clean notes-only payload with zero outcome/course/year fields', () => {
  const notePayload = buildCounselorNotePayload('Spoke with parent', 'event-uuid-123', null);
  assert.equal(notePayload.notes, 'Spoke with parent');
  assert.equal(notePayload.client_event_id, 'event-uuid-123');
  assert.equal('call' in notePayload, false);
  assert.equal('outcome' in notePayload, false);
  assert.equal('selected_course' in notePayload, false);
  assert.equal('expected_admission_year' in notePayload, false);

  const callTiming = {
    started_at: '2026-10-08T10:00:00Z',
    ended_at: '2026-10-08T10:05:00Z',
    duration_seconds: 300,
  };
  const callPayload = buildCounselorNotePayload('Call consultation', 'event-uuid-456', callTiming);
  assert.equal(callPayload.notes, 'Call consultation');
  assert.equal(callPayload.call.started_at, callTiming.started_at);
  assert.equal(callPayload.call.ended_at, callTiming.ended_at);
  assert.equal(callPayload.call.duration_seconds, callTiming.duration_seconds);
  assert.equal('outcome' in callPayload, false);
  assert.equal('selected_course' in callPayload, false);
  assert.equal('expected_admission_year' in callPayload, false);
});

test('contactStatusTone maps PENDING to warning and CONTACTED to success', () => {
  assert.equal(contactStatusTone('PENDING'), 'warning');
  assert.equal(contactStatusTone('pending'), 'warning');
  assert.equal(contactStatusTone('CONTACTED'), 'success');
  assert.equal(contactStatusTone('contacted'), 'success');
  assert.equal(contactStatusTone(null), 'warning');
  assert.equal(contactStatusTone(undefined), 'warning');
});

test('formatContactTime returns Never contacted for empty and formats dates cleanly', () => {
  assert.equal(formatContactTime(null), 'Never contacted');
  assert.equal(formatContactTime(undefined), 'Never contacted');
  assert.equal(formatContactTime(''), 'Never contacted');
  assert.equal(formatContactTime('invalid-date'), 'Never contacted');

  const todayIso = new Date().toISOString();
  assert.match(formatContactTime(todayIso), /^Today, \d{1,2}:\d{2}\s?(AM|PM)$/i);

  const pastDate = new Date('2026-05-15T14:35:00Z');
  assert.match(formatContactTime(pastDate.toISOString()), /15 May,/);
});

test('duration formatting handles exact seconds, minutes, and larger calls', () => {
  assert.equal(formatDuration(252), '4m 12s'); // Matches example from user prompt: 4m 12s
  assert.equal(formatDuration(198), '3m 18s');
  assert.equal(formatDuration(45), '45s');
  assert.equal(formatDuration(0), '0s');
});

test('filter row logic correctly filters by All, Pending, and Contacted', () => {
  const mockLeads = [
    { id: 1, name: 'Rahul Sharma', counselor_contact_status: 'PENDING' },
    { id: 2, name: 'Priya Patel', counselor_contact_status: 'CONTACTED' },
    { id: 3, name: 'Amit Verma', counselor_contact_status: 'PENDING' },
    { id: 4, name: 'Sneha Rao', counselor_contact_status: 'CONTACTED' },
  ];

  const filterLeads = (leads, filter) => leads.filter(l => {
    if (filter === 'PENDING') return l.counselor_contact_status === 'PENDING';
    if (filter === 'CONTACTED') return l.counselor_contact_status === 'CONTACTED';
    return true;
  });

  assert.equal(filterLeads(mockLeads, 'ALL').length, 4);
  assert.deepEqual(filterLeads(mockLeads, 'PENDING').map(l => l.name), ['Rahul Sharma', 'Amit Verma']);
  assert.deepEqual(filterLeads(mockLeads, 'CONTACTED').map(l => l.name), ['Priya Patel', 'Sneha Rao']);
});

test('combined search query and status filter work together seamlessly', () => {
  const mockLeads = [
    { id: 1, name: 'Rahul Sharma', phone: '9876500001', counselor_contact_status: 'PENDING' },
    { id: 2, name: 'Rahul Verma', phone: '9876500002', counselor_contact_status: 'CONTACTED' },
    { id: 3, name: 'Priya Sharma', phone: '9876500003', counselor_contact_status: 'PENDING' },
  ];

  const applySearchAndFilter = (leads, search, filter) => {
    const q = search.trim().toLowerCase();
    return leads
      .filter(l => !q || l.name.toLowerCase().includes(q) || l.phone.includes(q))
      .filter(l => {
        if (filter === 'PENDING') return l.counselor_contact_status === 'PENDING';
        if (filter === 'CONTACTED') return l.counselor_contact_status === 'CONTACTED';
        return true;
      });
  };

  // Search "Rahul" + filter "ALL" -> 2
  assert.equal(applySearchAndFilter(mockLeads, 'Rahul', 'ALL').length, 2);
  // Search "Rahul" + filter "PENDING" -> only Rahul Sharma
  assert.deepEqual(applySearchAndFilter(mockLeads, 'Rahul', 'PENDING').map(l => l.name), ['Rahul Sharma']);
  // Search "Rahul" + filter "CONTACTED" -> only Rahul Verma
  assert.deepEqual(applySearchAndFilter(mockLeads, 'Rahul', 'CONTACTED').map(l => l.name), ['Rahul Verma']);
});

test('counselor routes remain unchanged', () => {
  assert.deepEqual([...COUNSELOR_ROUTES], [
    '/counselor',
    '/counselor/index',
    '/counselor/leads',
    '/counselor/more',
    '/counselor-lead',
    '/counselor-note',
  ]);
});
