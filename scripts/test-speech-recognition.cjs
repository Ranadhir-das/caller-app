const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadSpeechService(mockModule) {
  const exports = {};
  const listeners = new Map();

  const fakeModule = mockModule || {
    isRecognitionAvailable: async () => true,
    startListening: async () => true,
    stopListening: async () => true,
    destroy: async () => true,
    addListener: (event, handler) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
      return {
        remove: () => {
          listeners.get(event)?.delete(handler);
        },
      };
    },
    emit: (event, payload) => {
      const handlers = Array.from(listeners.get(event) || []);
      for (const h of handlers) {
        h(payload);
      }
    },
    listenerCount: (event) => listeners.get(event)?.size || 0,
  };

  const reactState = [];
  let stateIndex = 0;

  const mockReact = {
    useState: (initial) => {
      const idx = stateIndex++;
      if (reactState[idx] === undefined) {
        reactState[idx] = typeof initial === 'function' ? initial() : initial;
      }
      const setState = (newVal) => {
        reactState[idx] = typeof newVal === 'function' ? newVal(reactState[idx]) : newVal;
      };
      return [reactState[idx], setState];
    },
    useRef: (initial) => {
      const idx = stateIndex++;
      if (reactState[idx] === undefined) {
        reactState[idx] = { current: initial };
      }
      return reactState[idx];
    },
    useCallback: (fn) => fn,
    useEffect: (fn) => {
      // simulate mount
      const cleanup = fn();
      return cleanup;
    },
  };

  const mockRN = {
    Platform: { OS: 'android' },
    PermissionsAndroid: {
      PERMISSIONS: { RECORD_AUDIO: 'android.permission.RECORD_AUDIO' },
      RESULTS: { GRANTED: 'granted' },
      check: async () => true,
      request: async () => 'granted',
    },
    Alert: {
      alert: () => {},
    },
  };

  const source = fs.readFileSync(path.join(__dirname, '../src/services/speech.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const context = {
    exports,
    require: (mod) => {
      if (mod === 'react') return mockReact;
      if (mod === 'react-native') return mockRN;
      if (mod === '../../modules/speech-recognition/src') return fakeModule;
      throw new Error(`Unexpected import in test: ${mod}`);
    },
    console,
    Math,
  };

  vm.runInNewContext(compiled, context);
  return { exports, fakeModule, resetHook: () => { stateIndex = 0; } };
}

test('appendDictatedText preserves manually typed text with correct spacing', () => {
  const { exports } = loadSpeechService();
  const { appendDictatedText } = exports;

  // 1. Appending to empty or whitespace
  assert.equal(appendDictatedText('', 'Hello world'), 'Hello world');
  assert.equal(appendDictatedText('   ', 'Hello world'), 'Hello world');
  assert.equal(appendDictatedText(null, 'Hello world'), 'Hello world');
  assert.equal(appendDictatedText(undefined, 'Hello world'), 'Hello world');

  // 2. Appending empty dictated text leaves existing intact
  assert.equal(appendDictatedText('Existing note', ''), 'Existing note');
  assert.equal(appendDictatedText('Existing note', '   '), 'Existing note');
  assert.equal(appendDictatedText('Existing note', null), 'Existing note');

  // 3. Appending to existing text adds a single space
  assert.equal(
    appendDictatedText('Student called.', 'Wants MBBS brochure.'),
    'Student called. Wants MBBS brochure.'
  );

  // 4. Appending to existing text with trailing space does not add double space
  assert.equal(
    appendDictatedText('Student called. ', 'Wants MBBS brochure.'),
    'Student called. Wants MBBS brochure.'
  );

  // 5. Appending to existing text ending with newline does not add space
  assert.equal(
    appendDictatedText('Discussion notes:\n', 'Follow up on Monday.'),
    'Discussion notes:\nFollow up on Monday.'
  );
});

test('One spoken phrase appears exactly once and interim results are never appended to notes', async () => {
  const { exports, fakeModule, resetHook } = loadSpeechService();
  const { useSpeechToText, appendDictatedText } = exports;

  let noteValue = 'Existing note.';
  let interimValue = '';
  let finalDeliveredCount = 0;

  resetHook();
  const hook = useSpeechToText({
    onPartialResult: (text) => {
      interimValue = text;
    },
    onResult: (finalText) => {
      finalDeliveredCount++;
      noteValue = appendDictatedText(noteValue, finalText);
    },
  });

  // Start speech recognition
  const started = await hook.start();
  assert.equal(started, true);

  // Simulate Android SpeechRecognizer sending partial results 1, 2, 3 as user speaks
  fakeModule.emit('onSpeechStart');
  fakeModule.emit('onSpeechPartialResults', { value: 'called' });
  assert.equal(interimValue, 'called');
  // noteValue MUST NOT be touched by partial results!
  assert.equal(noteValue, 'Existing note.');

  fakeModule.emit('onSpeechPartialResults', { value: 'called the lead' });
  assert.equal(interimValue, 'called the lead');
  assert.equal(noteValue, 'Existing note.');

  fakeModule.emit('onSpeechPartialResults', { value: 'called the lead today' });
  assert.equal(interimValue, 'called the lead today');
  assert.equal(noteValue, 'Existing note.');

  // Recognizer completes and delivers final result
  fakeModule.emit('onSpeechResults', { value: 'called the lead today' });
  fakeModule.emit('onSpeechEnd');

  // Verified: final result delivered exactly once! Not 3 times!
  assert.equal(finalDeliveredCount, 1);
  assert.equal(noteValue, 'Existing note. called the lead today');
});

test('Multiple final-result events in the same session do not duplicate already processed text', async () => {
  const { exports, fakeModule, resetHook } = loadSpeechService();
  const { useSpeechToText, appendDictatedText } = exports;

  let noteValue = '';
  let finalCount = 0;

  resetHook();
  const hook = useSpeechToText({
    onResult: (text) => {
      finalCount++;
      noteValue = appendDictatedText(noteValue, text);
    },
  });

  await hook.start();
  fakeModule.emit('onSpeechStart');

  // Simulate duplicate onSpeechResults events arriving in the same session
  fakeModule.emit('onSpeechResults', { value: 'Payment received via UPI' });
  fakeModule.emit('onSpeechResults', { value: 'Payment received via UPI' });
  fakeModule.emit('onSpeechResults', { value: 'Payment received via UPI' });
  fakeModule.emit('onSpeechEnd');

  assert.equal(finalCount, 1);
  assert.equal(noteValue, 'Payment received via UPI');
});

test('Starting and stopping the microphone repeatedly does not multiply event handlers', async () => {
  const { exports, fakeModule, resetHook } = loadSpeechService();
  const { useSpeechToText, appendDictatedText } = exports;

  let noteValue = '';
  let finalCount = 0;

  resetHook();
  const hook = useSpeechToText({
    onResult: (text) => {
      finalCount++;
      noteValue = appendDictatedText(noteValue, text);
    },
  });

  // Cycle 1: Start and stop
  await hook.start();
  assert.equal(fakeModule.listenerCount('onSpeechResults'), 1);
  fakeModule.emit('onSpeechStart');
  fakeModule.emit('onSpeechResults', { value: 'First phrase.' });
  fakeModule.emit('onSpeechEnd');
  assert.equal(fakeModule.listenerCount('onSpeechResults'), 0);

  // Cycle 2: Start and stop again
  await hook.start();
  assert.equal(fakeModule.listenerCount('onSpeechResults'), 1);
  fakeModule.emit('onSpeechStart');
  fakeModule.emit('onSpeechResults', { value: 'Second phrase.' });
  fakeModule.emit('onSpeechEnd');
  assert.equal(fakeModule.listenerCount('onSpeechResults'), 0);

  // Cycle 3: Start and stop again
  await hook.start();
  assert.equal(fakeModule.listenerCount('onSpeechResults'), 1);
  fakeModule.emit('onSpeechStart');
  fakeModule.emit('onSpeechResults', { value: 'Third phrase.' });
  fakeModule.emit('onSpeechEnd');
  assert.equal(fakeModule.listenerCount('onSpeechResults'), 0);

  // Verified: exactly 3 phrases appended once each, no listener leak
  assert.equal(finalCount, 3);
  assert.equal(noteValue, 'First phrase. Second phrase. Third phrase.');
});

test('Switching between Notes fields stops previous field and never sends text to wrong field', async () => {
  const { exports, fakeModule } = loadSpeechService();
  const { useSpeechToText, appendDictatedText } = exports;

  let field1Text = 'Field 1 notes:';
  let field2Text = 'Field 2 notes:';
  let field1Events = 0;
  let field2Events = 0;

  // Simulate Field 1 (Call Notes)
  const hook1 = useSpeechToText({
    onResult: (text) => {
      field1Events++;
      field1Text = appendDictatedText(field1Text, text);
    },
  });

  // Simulate Field 2 (WhatsApp Message Editor)
  const hook2 = useSpeechToText({
    onResult: (text) => {
      field2Events++;
      field2Text = appendDictatedText(field2Text, text);
    },
  });

  // 1. User starts dictation in Field 1
  await hook1.start();
  fakeModule.emit('onSpeechStart');
  fakeModule.emit('onSpeechResults', { value: 'Spoke with candidate.' });
  fakeModule.emit('onSpeechEnd');

  assert.equal(field1Events, 1);
  assert.equal(field2Events, 0);
  assert.equal(field1Text, 'Field 1 notes: Spoke with candidate.');
  assert.equal(field2Text, 'Field 2 notes:');

  // 2. User starts dictation in Field 2 (without manually stopping Field 1)
  await hook2.start();
  fakeModule.emit('onSpeechStart');
  fakeModule.emit('onSpeechResults', { value: 'Sending brochure link.' });
  fakeModule.emit('onSpeechEnd');

  assert.equal(field1Events, 1); // Field 1 must not have received Field 2's speech!
  assert.equal(field2Events, 1);
  assert.equal(field1Text, 'Field 1 notes: Spoke with candidate.');
  assert.equal(field2Text, 'Field 2 notes: Sending brochure link.');
});

test('Manual stop before onSpeechResults delivers partial transcript once as fallback', async () => {
  const { exports, fakeModule, resetHook } = loadSpeechService();
  const { useSpeechToText, appendDictatedText } = exports;

  let noteValue = '';
  let finalCount = 0;

  resetHook();
  const hook = useSpeechToText({
    onResult: (text) => {
      finalCount++;
      noteValue = appendDictatedText(noteValue, text);
    },
  });

  await hook.start();
  fakeModule.emit('onSpeechStart');
  fakeModule.emit('onSpeechPartialResults', { value: 'Candidate requested callback' });

  // Native end arrives without a separate onSpeechResults event
  fakeModule.emit('onSpeechEnd');

  // Fallback captures partial text once
  assert.equal(finalCount, 1);
  assert.equal(noteValue, 'Candidate requested callback');

  // Extra onSpeechResults arriving late after session end must be dropped
  fakeModule.emit('onSpeechResults', { value: 'Candidate requested callback' });
  assert.equal(finalCount, 1);
});

test('Error during recognition resets state cleanly without leaving stale listeners or corrupting text', async () => {
  const { exports, fakeModule, resetHook } = loadSpeechService();
  const { useSpeechToText } = exports;

  let errorCount = 0;
  let resultCount = 0;

  resetHook();
  const hook = useSpeechToText({
    onError: () => { errorCount++; },
    onResult: () => { resultCount++; },
  });

  await hook.start();
  assert.equal(fakeModule.listenerCount('onSpeechError'), 1);

  // Recognition error occurs (e.g. network timeout or mic busy)
  fakeModule.emit('onSpeechError', { error: 7, message: 'Network error' });

  assert.equal(errorCount, 1);
  assert.equal(resultCount, 0);
  assert.equal(fakeModule.listenerCount('onSpeechResults'), 0);
  assert.equal(fakeModule.listenerCount('onSpeechError'), 0);
});

