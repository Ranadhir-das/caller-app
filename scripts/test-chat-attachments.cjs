const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const tick = () => new Promise(resolve => setImmediate(resolve));
const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
function compile(file, mocks, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/../src/${file}`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, Error, AbortController, setTimeout, clearTimeout, process: { env: { EXPO_PUBLIC_API_BASE_URL: 'https://crm.example/api/v1' } },
    console: { log() { throw new Error('Unexpected logging'); }, error() { throw new Error('Unexpected logging'); } },
    require: name => { assert.ok(name in mocks, name); return mocks[name]; }, ...globals });
  return exports;
}
const converterSource = fs.readFileSync(path.join(__dirname, '../node_modules/expo/src/winter/fetch/convertFormData.ts'), 'utf8');
const converter = {};
vm.runInNewContext(ts.transpileModule(converterSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: converter, require: () => ({ blobToArrayBufferAsync: blob => blob.arrayBuffer() }), Blob, TextEncoder, Uint8Array,
});

const attachment = { id: 8, original_name: 'Photo.JPG', mime_type: 'image/jpeg', file_size: 24,
  file_url: 'https://untrusted.example/must-not-receive-auth', created_at: '' };
function setup(options = {}) {
  const files = new Map(), requests = [], opens = [];
  const FS = {
    cacheDirectory: 'file:///cache/', readDirectoryAsync: async () => [],
    getInfoAsync: async uri => files.get(uri) || { exists: false },
    makeDirectoryAsync: async uri => files.set(uri, { exists: true }),
    deleteAsync: async uri => { for (const key of files.keys()) if (key.startsWith(uri)) files.delete(key); },
    getContentUriAsync: async () => 'content://app.files/local',
    createDownloadResumable: (url, uri, settings) => ({
      downloadAsync: async () => {
        requests.push({ url, settings, uri });
        if (options.networkFailure) throw new Error('private native error');
        files.set(uri, { exists: true, size: 24 });
        return { status: options.status || 200, mimeType: options.mime || 'image/jpeg' };
      }, cancelAsync: async () => {},
    }),
  };
  const FileClass = class {
    constructor(uri) { this.uri = uri; }
    get name() { return this.uri.split('/').pop() || 'file'; }
    get type() { return 'application/octet-stream'; }
    async bytes() { return new Uint8Array(24); }
  };
  const api = compile('services/api.ts', { 'expo-file-system/legacy': FS });
  const downloads = compile('services/noticeAttachments.ts', {
    './api': api, 'react-native': { Platform: { OS: 'android' } }, 'expo-file-system/legacy': FS,
    'expo-intent-launcher': { startActivityAsync: async (action, params) => opens.push({ action, params }) },
  });
  const service = compile('services/chat.ts', {
    './api': api,
    './noticeAttachments': downloads,
    'expo-file-system': { File: FileClass },
    'expo/fetch': {
      fetch: async (url, fetchOptions) => {
        if (options.fetch) {
          return options.fetch(url, fetchOptions);
        }
        return {
          ok: options.status ? options.status >= 200 && options.status < 300 : true,
          status: options.status || 200,
          json: async () => ({ id: 42 }),
        };
      },
    },
  }, {
    FormData: class {
      parts = [];
      append(name, value) { this.parts.push([name, value]); }
      entries() { return this.parts; }
    },
  });
  return { service, requests, opens, files };
}

test('multipart chat upload reuses Token auth and encodes with real Expo multipart encoder', async () => {
  let captured;
  const app = setup({
    fetch: async (url, options) => {
      const encoded = await converter.convertFormDataAsync(options.body);
      const multipart = new TextDecoder().decode(encoded.body);
      captured = { url, options, multipart };
      return { ok: true, json: async () => ({ id: 42 }) };
    }
  });
  const file = { uri: 'file:///photo.jpg', name: 'photo.jpg', type: 'image/jpeg' };
  const result = await app.service.sendMessageWithAttachment('test-token', 5, ' Hi ', file);
  assert.equal(result.id, 42);
  assert.equal(captured.url, 'https://crm.example/api/v1/mobile/chat/channels/5/messages/');
  assert.equal(captured.options.headers.Authorization, 'Token test-token');
  assert.equal(captured.options.headers['Content-Type'], undefined);
  assert.match(captured.multipart, /name="text"/);
  assert.match(captured.multipart, /Hi/);
  assert.match(captured.multipart, /name="file"; filename="photo.jpg"/);
  assert.match(captured.multipart, /content-type: image\/jpeg/);
});
test('regression: real encoder rejects raw legacy { uri, name, type } object with serialization error', async () => {
  const legacyFormData = {
    entries: () => [['file', { uri: 'file:///photo.jpg', name: 'photo.jpg', type: 'image/jpeg' }]]
  };
  await assert.rejects(
    converter.convertFormDataAsync(legacyFormData),
    /Unsupported FormDataPart implementation/
  );
});
test('upload network failures expose a safe error and do not log native request details', async () => {
  const app = setup({ fetch: async () => { throw new Error('test-token private transport details'); } });
  await assert.rejects(app.service.sendMessageWithAttachment('test-token', 5, 'Hi'), error =>
    /Check your connection/.test(error.message) && !error.message.includes('test-token'));
});
test('serialization errors report serialization diagnostic rather than falsely claiming network failure', async () => {
  const app = setup({
    fetch: async () => {
      throw new Error('Unsupported FormDataPart implementation');
    }
  });
  await assert.rejects(
    app.service.sendMessageWithAttachment('test-token', 5, 'Hi'),
    error => /Failed to serialize attachment/i.test(error.message) && !/Check your connection/i.test(error.message)
  );
});
test('HTTP 413 indicates attachment is too large for server', async () => {
  const app = setup({ status: 413 });
  await assert.rejects(
    app.service.sendMessageWithAttachment('test-token', 5, 'Hi'),
    /Attachment is too large for the server/
  );
});
test('image previews authenticate the canonical endpoint instead of trusting file_url', () => {
  const source = setup().service.chatAttachmentImageSource(8, 'test-token');
  assert.equal(source.uri, 'https://crm.example/api/v1/mobile/chat/attachments/8/download/');
  assert.equal(source.headers.Authorization, 'Token test-token');
  assert.ok(!source.uri.includes('test-token'));
});
for (const [name, mime] of [['Photo.JPG', 'image/jpeg'], ['Report.pdf', 'application/pdf'], ['Meeting.mp4', 'video/mp4']]) {
  test(`${name} downloads authenticated binary content and opens a local file`, async () => {
    const app = setup({ mime });
    await app.service.openChatAttachment({ ...attachment, original_name: name, mime_type: mime }, 'test-token');
    assert.equal(app.requests[0].url, 'https://crm.example/api/v1/mobile/chat/attachments/8/download/');
    assert.equal(app.requests[0].settings.headers.Authorization, 'Token test-token');
    assert.ok(app.requests[0].uri.endsWith('/' + name));
    assert.ok(!app.requests[0].uri.includes('test-token'));
    assert.equal(app.opens[0].params.data, 'content://app.files/local');
    assert.equal(app.opens[0].params.type, mime); assert.equal(app.opens[0].params.flags, 1);
    assert.equal(app.files.size, 0);
  });
}
for (const status of [401, 403, 500]) test(`chat HTTP ${status} opens no viewer and cleans temporary content`, async () => {
  const app = setup({ status });
  await assert.rejects(app.service.openChatAttachment(attachment, 'test-token'), error => error.status === status);
  assert.equal(app.opens.length, 0); assert.equal(app.files.size, 0);
});
test('chat download network errors and invalid IDs are safe', async () => {
  const app = setup({ networkFailure: true });
  await assert.rejects(app.service.openChatAttachment(attachment, 'test-token'), /Check your connection/);
  await assert.rejects(app.service.openChatAttachment({ ...attachment, id: -1 }, 'test-token'), /Invalid chat attachment/);
  assert.equal(app.opens.length, 0); assert.equal(app.files.size, 0);
});

test('actual Chat screen preserves authenticated thumbnails, locks taps, and displays download failures', async () => {
  let cursor = 0; const slots = [], effects = [], alerts = [];
  let reject, downloads = 0;
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(initial) { const i = cursor++; return slots[i] || (slots[i] = { current: initial }); },
    useCallback: fn => fn,
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((v, n) => v !== slots[i][n])) { slots[i] = deps; effects.push(fn); } },
  };
  const channel = { id: 5, name: 'Team' };
  const message = { id: 7, sender_id: 2, attachments: [attachment], created_at: new Date().toISOString() };
  const service = setup().service;
  const screen = compile('app/chat.tsx', {
    react: hooks, 'react/jsx-runtime': jsx,
    'expo-router': { useLocalSearchParams: () => ({}), router: {} }, 'expo-document-picker': {}, 'expo-image-picker': {},
    'react-native': { ...Object.fromEntries(['ActivityIndicator','Alert','AppState','FlatList','Image','KeyboardAvoidingView','Modal','Pressable','ScrollView','StyleSheet','Text','TextInput','View'].map(n => [n,n])),
      Alert: { alert: (...args) => alerts.push(args) }, AppState: { addEventListener: () => ({ remove() {} }) }, Platform: { OS: 'android' }, StyleSheet: { create: v => v } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' }, '@/context/AuthContext': { useAuth: () => ({ user: { id: 1 }, token: 'test-token' }) },
    '@/context/AppThemeContext': { useAppTheme: () => ({ colors: {}, mode: 'light' }), useAppStyles: () => ({}) },
    '@/components/AnimatedBackButton': { AnimatedBackButton: 'Back' }, '@/services/speech': { useSpeechToText: () => ({}) },
    '@/services/chat': { listChannels: async () => [channel], listMessages: async () => [message], getChatTicket: async () => ({ ticket: 'test-ticket' }),
      chatSocketUrl: () => 'wss://example/?ticket=test-ticket', chatAttachmentImageSource: service.chatAttachmentImageSource,
      openChatAttachment: async () => { downloads++; await new Promise((_, fail) => { reject = fail; }); } },
  }, { requestAnimationFrame() {}, WebSocket: class { close() {} } }).default;
  const render = () => { cursor = 0; const tree = screen(); effects.splice(0).forEach(fn => fn()); return tree; };
  function nodes(tree) { if (!tree || typeof tree !== 'object') return []; return Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)]; }
  render(); await tick(); render(); await tick();
  const row = () => nodes(render()).find(n => n.type === 'FlatList' && n.props.renderItem).props.renderItem({ item: message });
  const image = nodes(row()).find(n => n.type === 'Image');
  assert.equal(image.props.source.headers.Authorization, 'Token test-token');
  const tap = nodes(row()).find(n => n.type === 'Pressable').props.onPress;
  const first = tap(); await tap(); assert.equal(downloads, 1);
  assert.equal(nodes(row()).find(n => n.type === 'Pressable').props.disabled, true);
  reject(new Error('Your session has expired. Please sign in again.')); await first;
  assert.match(alerts[0][1], /sign in again/);
  assert.equal(nodes(row()).find(n => n.type === 'Pressable').props.disabled, false);
  image.props.onError(); assert.equal(nodes(row()).some(n => n.type === 'Image'), false);
});
