const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const tick = () => new Promise(resolve => setImmediate(resolve));
function compile(file, mocks, extra = {}) {
  const exports = {};
  const source = fs.readFileSync(`${__dirname}/../src/${file}`, 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, Error, AbortController, setTimeout, clearTimeout,
    process: { env: { EXPO_PUBLIC_API_BASE_URL: 'https://crm.example/api/v1' } },
    console: { log() { throw new Error('Unexpected logging'); }, error() { throw new Error('Unexpected logging'); } },
    require: name => { assert.ok(name in mocks, `Unexpected dependency: ${name}`); return typeof mocks[name] === 'function' ? mocks[name]() : mocks[name]; }, ...extra });
  return exports;
}
const attachment = { id: 8, original_filename: 'Welcome Guide.pdf', mime_type: 'application/pdf', file_size: 24,
  file_url: 'https://untrusted.example/must-not-receive-credentials' };
function setup(options = {}) {
  const files = new Map(), requests = [], opens = [], deleted = [];
  let cancelled = 0;
  const FS = {
    cacheDirectory: 'file:///private/cache/',
    makeDirectoryAsync: async uri => files.set(uri, { exists: true, isDirectory: true, modificationTime: Date.now() / 1000 }),
    deleteAsync: async uri => { deleted.push(uri); for (const key of files.keys()) if (key === uri || key.startsWith(uri.endsWith('/') ? uri : `${uri}/`)) files.delete(key); },
    getInfoAsync: async uri => files.get(uri) || { exists: false },
    readDirectoryAsync: async root => [...files.keys()].filter(key => key.startsWith(root) && key !== root).map(key => key.slice(root.length).split('/')[0]).filter((v, i, a) => a.indexOf(v) === i),
    getContentUriAsync: async uri => { assert.ok(files.has(uri)); return `content://app.files/${encodeURIComponent(uri)}`; },
    createDownloadResumable: (url, uri, settings) => ({
      downloadAsync: async () => {
        requests.push({ url, uri, settings });
        if (options.networkFailure) throw new Error('Transport failure with private request details');
        if (options.pendingDownload) await options.pendingDownload;
        files.set(uri, { exists: true, isDirectory: false, size: options.empty ? 0 : 24 });
        return { uri, status: options.status || 200, mimeType: options.mime || null, headers: {} };
      },
      cancelAsync: async () => { cancelled++; },
    }),
  };
  const api = compile('services/api.ts', { 'expo-file-system/legacy': FS }, { fetch: options.fetch });
  const service = compile('services/noticeAttachments.ts', {
    './api': api, 'react-native': { Platform: { OS: 'android' } }, 'expo-file-system/legacy': FS,
    'expo-intent-launcher': () => {
      if (options.missingModule) throw new Error('Missing native module');
      return { startActivityAsync: async (action, params) => { opens.push({ action, params }); if (options.viewerFailure) throw new Error('ActivityNotFound'); await options.pendingViewer; } };
    },
  });
  return { ...service, api, FS, files, requests, opens, deleted, cancelled: () => cancelled };
}
for (const [filename, mime] of [['Welcome Guide.pdf', 'application/pdf'], ['Meeting Photo.JPG', 'image/jpeg'], ['Meeting Photo.jpeg', 'image/jpeg']]) {
  test(`${filename}: authenticated download, original filename/extension, local Android viewer and cleanup`, async () => {
    const app = setup({ mime });
    await app.openNoticeAttachment(4, { ...attachment, original_filename: filename, mime_type: mime }, 'employee-token');
    assert.equal(app.requests.length, 1);
    const request = app.requests[0];
    assert.equal(request.url, 'https://crm.example/api/v1/mobile/notices/4/attachments/8/download/');
    assert.equal(request.settings.headers.Authorization, 'Token employee-token');
    assert.ok(request.uri.endsWith(`/${filename}`));
    assert.ok(!request.url.includes('employee-token')); assert.ok(!request.uri.includes('employee-token'));
    assert.equal(app.opens.length, 1);
    assert.equal(app.opens[0].action, 'android.intent.action.VIEW');
    assert.ok(app.opens[0].params.data.startsWith('content://'));
    assert.equal(app.opens[0].params.type, mime); assert.equal(app.opens[0].params.flags, 1);
    assert.equal(app.files.has(request.uri), false);
  });
}
for (const status of [401, 403, 404, 500]) test(`HTTP ${status} never opens a browser/viewer and cleans the response file`, async () => {
  const app = setup({ status });
  await assert.rejects(app.openNoticeAttachment(4, attachment, 'employee-token'), error => error.status === status && !error.message.includes('employee-token'));
  assert.equal(app.opens.length, 0); assert.equal(app.files.size, 0);
});
test('duplicate taps share one download and file remains until the viewer returns', async () => {
  let finish; const app = setup({ pendingViewer: new Promise(resolve => { finish = resolve; }) });
  const first = app.openNoticeAttachment(4, attachment, 'employee-token');
  assert.equal(first, app.openNoticeAttachment(4, attachment, 'employee-token'));
  await tick(); assert.equal(app.requests.length, 1); assert.equal(app.opens.length, 1);
  assert.ok(app.files.has(app.requests[0].uri));
  finish(); await first; assert.equal(app.files.size, 0);
});
test('network failure, empty content, HTML response and absent viewer produce safe errors and no cached file', async () => {
  for (const options of [{ networkFailure: true }, { empty: true }, { mime: 'text/html' }, { viewerFailure: true }, { missingModule: true }]) {
    const app = setup(options);
    await assert.rejects(app.openNoticeAttachment(4, attachment, 'employee-token'), /Could not|empty|expected attachment|viewer update/);
    assert.equal(app.files.size, 0);
  }
});
test('session/unmount cancellation aborts the native download without opening anything', async () => {
  const controller = new AbortController(); const app = setup({ pendingDownload: new Promise(() => {}) });
  const pending = app.openNoticeAttachment(4, attachment, 'employee-token', controller.signal);
  await tick(); controller.abort(); await assert.rejects(pending, /cancelled/);
  assert.equal(app.cancelled(), 1); assert.equal(app.opens.length, 0); assert.equal(app.files.size, 0);
});
test('safe filename rejects traversal, URI escapes and control characters while retaining extension', () => {
  const app = setup();
  assert.equal(app.safeAttachmentFilename('../../private/Photo.JPEG', 'image/jpeg'), 'Photo.JPEG');
  assert.equal(app.safeAttachmentFilename('', 'application/pdf'), 'attachment.pdf');
  const name = app.safeAttachmentFilename('%2f..%2fsecret#\n.pdf', 'application/pdf');
  assert.ok(!/[/%#\n]/.test(name)); assert.ok(name.endsWith('.pdf'));
  assert.ok(app.safeAttachmentFilename('x'.repeat(300) + '.jpeg', 'image/jpeg').endsWith('.jpeg'));
});
test('stale crash files are removed, recent cache remains', async () => {
  const app = setup(); const root = app.FS.cacheDirectory + 'notice-attachments/';
  await app.FS.makeDirectoryAsync(root);
  app.files.set(root + 'notice-4-8-1-old/', { exists: true, modificationTime: 1 });
  app.files.set(root + 'notice-4-8-2-new/', { exists: true, modificationTime: Date.now() / 1000 });
  await app.cleanupNoticeAttachmentCache();
  assert.equal(app.files.has(root + 'notice-4-8-1-old/'), false);
  assert.equal(app.files.has(root + 'notice-4-8-2-new/'), true);
});
test('thumbnails and JSON requests reuse the existing Token header without token URLs', async () => {
  let request;
  const app = setup({ fetch: async (...args) => { request = args; return { ok: true, json: async () => ({ id: 1 }) }; } });
  const image = app.noticeAttachmentImageSource(4, 8, 'employee-token');
  assert.equal(image.uri, 'https://crm.example/api/v1/mobile/notices/4/attachments/8/download/');
  assert.equal(image.headers.Authorization, 'Token employee-token');
  await app.api.apiRequest('/mobile/employee/notices/', { token: 'employee-token' });
  assert.equal(request[1].headers.Authorization, 'Token employee-token');
  await assert.rejects(app.api.apiDownloadFile('/mobile/notices/4/attachments/8/download/', 'file:///x', ''), /sign in/);
  await assert.rejects(app.api.apiDownloadFile('https://untrusted.example', 'file:///x', 'employee-token'), /Invalid/);
});

test('notice UI locks repeated taps, shows loading, reports 401 and permits retry', async () => {
  const slots = [], effects = [], alerts = []; let cursor = 0, reject, requests = 0;
  const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(initial) { const i = cursor++; return slots[i] || (slots[i] = { current: initial }); },
    useCallback: fn => fn,
    useEffect(fn) { const i = cursor++; if (!(i in slots)) { slots[i] = true; effects.push(fn); } },
  };
  const notice = { id: 4, title: 'Notice', body: 'Body', audience: 'ALL', created_at: new Date().toISOString(), attachments: [attachment] };
  const screen = compile('app/notices.tsx', {
    react: hooks, 'react/jsx-runtime': jsx, 'expo-router': { useLocalSearchParams: () => ({}), router: {} },
    'react-native': { ...Object.fromEntries(['View', 'Text', 'Pressable', 'Image', 'FlatList', 'ActivityIndicator', 'RefreshControl'].map(n => [n, n])), StyleSheet: { create: v => v }, Alert: { alert: (...args) => alerts.push(args) } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' }, '@/context/AuthContext': { useAuth: () => ({ token: 'employee-token' }) },
    '@/context/AppThemeContext': { useAppTheme: () => ({ colors: {} }), useAppStyles: () => ({}) },
    '@/components/AnimatedBackButton': { AnimatedBackButton: 'BackButton' }, '@/services/notices': { listNotices: async () => [notice] },
    '@/services/noticeAttachments': { cleanupNoticeAttachmentCache: async () => {}, openNoticeAttachment: async () => { requests++; await new Promise((_, fail) => { reject = fail; }); } },
  }).default;
  function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
  const render = () => { cursor = 0; return screen(); };
  render(); effects.forEach(fn => fn()); await tick();
  const row = () => nodes(render()).find(n => n.type === 'FlatList').props.renderItem({ item: notice });
  const button = () => nodes(row()).find(n => n.type === 'Pressable');
  const first = button().props.onPress(); const second = button().props.onPress();
  assert.equal(requests, 1); assert.equal(button().props.disabled, true);
  assert.ok(nodes(row()).some(n => n.type === 'ActivityIndicator'));
  reject(new Error('Your session has expired. Please sign in again to open this attachment.'));
  await Promise.all([first, second]);
  assert.match(alerts[0][1], /sign in again/); assert.equal(button().props.disabled, false);
});
