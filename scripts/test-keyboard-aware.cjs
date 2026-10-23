const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

// 1. WhatsAppModal keyboard handling
test('WhatsAppModal wraps modal sheet in KeyboardAvoidingView and ScrollView', () => {
  const source = fs.readFileSync(path.join(root, 'src/components/WhatsAppModal.tsx'), 'utf8');
  assert.match(source, /KeyboardAvoidingView/);
  assert.match(source, /behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}/);
  assert.match(source, /keyboardShouldPersistTaps="handled"/);
  assert.match(source, /maxHeight:\s*["']85%["']/);
});

// 2. CounselorLead Admission Modal keyboard handling
test('counselor-lead admission request modal is keyboard-aware with ScrollView', () => {
  const source = fs.readFileSync(path.join(root, 'src/app/counselor-lead.tsx'), 'utf8');
  assert.match(source, /showAdmissionModal/);
  assert.match(source, /<KeyboardAvoidingView/);
  assert.match(source, /behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}/);
  assert.match(source, /keyboardShouldPersistTaps="handled"/);
  assert.match(source, /maxHeight:\s*['"]85%['"]/);
});

// 3. ChatScreen keyboard handling
test('chat screen message list supports persisted taps and drag dismissal', () => {
  const source = fs.readFileSync(path.join(root, 'src/app/chat.tsx'), 'utf8');
  assert.match(source, /<KeyboardAvoidingView/);
  assert.match(source, /keyboardShouldPersistTaps="handled"/);
  assert.match(source, /keyboardDismissMode=\{Platform\.OS === "ios" \? "interactive" : "on-drag"\}/);
});

// 4. IncomingEnquiryScreen keyboard handling
test('incoming enquiry screen has KeyboardAvoidingView and persisted taps', () => {
  const source = fs.readFileSync(path.join(root, 'src/app/incoming-enquiry.tsx'), 'utf8');
  assert.match(source, /<KeyboardAvoidingView/);
  assert.match(source, /keyboardShouldPersistTaps="handled"/);
  assert.match(source, /paddingBottom:\s*88/);
});

// 5. Counselor AddLeadScreen keyboard handling
test('counselor add-lead screen has KeyboardAvoidingView and sticky bottom bar padding', () => {
  const source = fs.readFileSync(path.join(root, 'src/app/counselor/add-lead.tsx'), 'utf8');
  assert.match(source, /<KeyboardAvoidingView/);
  assert.match(source, /keyboardShouldPersistTaps="handled"/);
  assert.match(source, /paddingBottom: Math\.max\(insets\.bottom, 16\) \+ 88/);
});

// 6. CallOutcomeScreen keyboard handling
test('call-outcome screen wraps form in KeyboardAwareContainer', () => {
  const source = fs.readFileSync(path.join(root, 'src/app/call-outcome.tsx'), 'utf8');
  assert.match(source, /<KeyboardAwareContainer/);
  assert.match(source, /NoteInputWithVoice/);
});

// 7. CounselorNoteScreen keyboard handling
test('counselor note screen wraps form in KeyboardAvoidingView with persisted taps', () => {
  const source = fs.readFileSync(path.join(root, 'src/app/counselor-note.tsx'), 'utf8');
  assert.match(source, /<KeyboardAvoidingView/);
  assert.match(source, /keyboardShouldPersistTaps="handled"/);
});

// 8. QuickCaptureScreen keyboard handling
test('quick capture screen handles keyboard on both main scroll and caller list', () => {
  const source = fs.readFileSync(path.join(root, 'src/app/counselor/quick-capture.tsx'), 'utf8');
  assert.match(source, /<KeyboardAvoidingView/);
  const matches = source.match(/keyboardShouldPersistTaps="handled"/g);
  assert.ok(matches && matches.length >= 2, 'Must have keyboardShouldPersistTaps on both outer and inner lists');
});
