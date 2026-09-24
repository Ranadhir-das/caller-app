const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/services/recordingUploads.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture() {
  const state = { draft: { id: 'draft', userId: 7, savedCallId: 123,
    recordingPath: '/data/user/0/com.vaani.caller/no_backup/call-recordings/test.m4a',
    durationSeconds: 75 }, exists: true, deleted: false, requests: [], cleanupFails: false };
  const exports = {};
  const mocks = {
    'expo-file-system': { File: class {
      constructor(uri) { this.uri = uri; }
      get exists() { return state.exists; }
      get size() { return 100; }
      delete() {
        assert.equal(state.draft.recordingStatus, 'uploaded', 'confirmation must be durable before deletion');
        if (state.cleanupFails) throw Error('cleanup failed');
        state.deleted = true; state.exists = false;
      }
    } },
    './api': { API_BASE_URL: 'https://example.test/api/v1' },
    './callDrafts': {
      readCallDraft: async () => state.draft && { ...state.draft },
      patchCallDraft: async (_, __, patch) => { state.draft = { ...state.draft, ...patch }; },
      removeCallDraft: async () => { state.draft = null; },
    },
  };
  state.respond = async () => ({ ok: true, json: async () => ({ call_id: 123, file_size: 100, sha256: 'hash' }) });
  vm.runInNewContext(code, { exports, require: name => mocks[name], console: { log() {}, warn() {} },
    AbortController, setTimeout, clearTimeout, FormData: class { append() {} },
    fetch: async (url, options) => { state.requests.push({ url, options }); return state.respond(); },
  });
  return { state, upload: () => exports.uploadDraftRecording(7, 'draft', 'token') };
}

test('uploads to returned call ID then confirms before deleting local file', async () => {
  const { state, upload } = fixture();
  await upload();
  assert.equal(state.requests[0].url, 'https://example.test/api/v1/calls/123/recording/');
  assert.equal(state.requests[0].options.headers.Authorization, 'Token token');
  assert.equal(state.deleted, true);
  assert.equal(state.draft, null);
});

test('network failure keeps the recording and durable pending retry state', async () => {
  const { state, upload } = fixture();
  state.respond = async () => { throw Error('offline'); };
  await assert.rejects(upload(), /offline/);
  assert.equal(state.deleted, false);
  assert.equal(state.draft.savedCallId, 123);
  assert.equal(state.draft.recordingStatus, 'pending');
  assert.equal(state.draft.recordingAttempts, 1);
  assert.equal(state.requests.length, 1);
});

test('a mismatched confirmation never deletes the recording', async () => {
  const { state, upload } = fixture();
  state.respond = async () => ({ ok: true, json: async () => ({ call_id: 456, file_size: 100, sha256: 'hash' }) });
  await assert.rejects(upload(), /confirmation/);
  assert.equal(state.deleted, false);
});

test('cleanup failure can be retried without reuploading confirmed bytes', async () => {
  const { state, upload } = fixture();
  state.cleanupFails = true;
  await assert.rejects(upload(), /cleanup failed/);
  assert.equal(state.draft.recordingStatus, 'uploaded');
  state.cleanupFails = false;
  await upload();
  assert.equal(state.requests.length, 1);
  assert.equal(state.draft, null);
});

test('unsaved calls and paths outside recorder storage are never uploaded', async () => {
  for (const patch of [{ savedCallId: undefined }, { recordingPath: '/data/user/0/com.vaani.caller/files/secret.m4a' }]) {
    const { state, upload } = fixture();
    Object.assign(state.draft, patch);
    await assert.rejects(upload());
    assert.equal(state.requests.length, 0);
    assert.equal(state.deleted, false);
  }
});
