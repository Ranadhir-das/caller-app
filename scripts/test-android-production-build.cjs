const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PRODUCTION_API_BASE_URL, assertProductionApiUrl, resolveBuildConfig } = require('./android-build-config.cjs');

test('production selects the exact URL before Expo dotenv/config evaluation', () => {
  const env = { EXPO_PUBLIC_API_BASE_URL: 'http://192.168.1.8:8000/api/v1' };
  const config = { version: '1.0.6', android: { package: 'com.vaani.caller', versionCode: 23 }, extra: { eas: { projectId: 'existing' } } };
  const result = resolveBuildConfig('/fixture', 'production', { env,
    loadEnv(root, options) { assert.equal(root, '/fixture'); assert.equal(options.silent, true); assert.equal(env.NODE_ENV, 'production'); assert.equal(env.EXPO_PUBLIC_API_BASE_URL, PRODUCTION_API_BASE_URL); },
    getConfig() { return { exp: { ...config, extra: { ...config.extra, apiBaseUrl: env.EXPO_PUBLIC_API_BASE_URL } } }; },
  });
  assert.equal(result.extra.apiBaseUrl, 'https://vaaniapp.co.in/api/v1');
  assert.equal(result.android.versionCode, 23); assert.equal(result.extra.eas.projectId, 'existing');
});

for (const value of [
  'http://vaaniapp.co.in/api/v1', 'https://localhost/api/v1', 'https://127.0.0.1/api/v1',
  'https://192.168.1.8/api/v1', 'https://10.0.0.1/api/v1', 'https://172.16.0.1/api/v1',
  'https://[::1]/api/v1', 'https://unapproved.example/api/v1', 'https://vaaniapp.co.in/wrong',
  'https://user:secret@vaaniapp.co.in/api/v1', 'not-a-url', undefined,
]) test(`production rejects unsafe resolved config: ${value ? new URL(value.includes('://') ? value : 'https://invalid.example').hostname : 'missing'}`, () => {
  assert.throws(() => assertProductionApiUrl(value));
  assert.throws(() => resolveBuildConfig('/fixture', 'production', { env: {}, loadEnv() {},
    getConfig: () => ({ exp: { extra: { apiBaseUrl: value } } }) }));
});

test('production rejects public environment mutation even if extra contains the correct URL', () => {
  const env = {};
  assert.throws(() => resolveBuildConfig('/fixture', 'production', { env,
    loadEnv() { env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost/api/v1'; },
    getConfig: () => ({ exp: { extra: { apiBaseUrl: PRODUCTION_API_BASE_URL } } }),
  }));
});

test('development retains its selected LAN URL and uses the normal Expo loader', () => {
  const env = { EXPO_PUBLIC_API_BASE_URL: 'http://192.168.1.8:8000/api/v1' };
  const config = resolveBuildConfig('/fixture', 'development', { env, loadEnv() {},
    getConfig: () => ({ exp: { extra: { apiBaseUrl: env.EXPO_PUBLIC_API_BASE_URL } } }),
  });
  assert.equal(env.NODE_ENV, 'development');
  assert.equal(config.extra.apiBaseUrl, 'http://192.168.1.8:8000/api/v1');
});

test('app.config preserves metadata/plugins and exposes the same public variable as the API client', () => {
  const configure = require('../app.config.js');
  const prior = process.env.EXPO_PUBLIC_API_BASE_URL;
  try {
    process.env.EXPO_PUBLIC_API_BASE_URL = PRODUCTION_API_BASE_URL;
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../app.json'), 'utf8'));
    const result = configure({ config: config.expo });
    assert.equal(result.version, config.expo.version);
    assert.deepEqual(result.android, config.expo.android);
    assert.deepEqual(result.plugins, config.expo.plugins);
    assert.deepEqual(result.extra.eas, config.expo.extra.eas);
    assert.equal(result.extra.apiBaseUrl, PRODUCTION_API_BASE_URL);
  } finally { if (prior === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL; else process.env.EXPO_PUBLIC_API_BASE_URL = prior; }
});

// Exercise the actual PowerShell orchestration with the actual Expo guard and
// version-sync scripts. Gradle is a marker-only fixture: no APK is ever built.
function fixture(configUrl, mode, gradleExit = 0) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vaani-production-build-'));
  const project = path.join(temporaryRoot, 'caller-app');
  const scripts = path.join(project, 'scripts');
  const android = path.join(project, 'android');
  const runtime = path.join(temporaryRoot, '.build-tools/java17/runtime/bin');
  try {
    for (const dir of [scripts, path.join(android, 'app'), runtime]) fs.mkdirSync(dir, { recursive: true });
    for (const name of ['build-android.ps1', 'android-build-config.cjs', 'sync-android-version.cjs'])
      fs.copyFileSync(path.join(__dirname, name), path.join(scripts, name));
    fs.writeFileSync(path.join(runtime, 'java.exe'), 'fixture, never executed');
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ dependencies: { expo: '~57.0.27' } }));
    fs.writeFileSync(path.join(project, 'app.json'), JSON.stringify({ expo: { name: 'Fixture', slug: 'fixture', version: '1.0.6', android: { versionCode: 23 } } }));
    fs.writeFileSync(path.join(project, '.env.local'), 'EXPO_PUBLIC_API_BASE_URL=http://192.168.1.8:8000/api/v1\n');
    fs.writeFileSync(path.join(project, 'app.config.js'), `module.exports = ({ config }) => ({ ...config, extra: { apiBaseUrl: ${configUrl ? JSON.stringify(configUrl) : 'process.env.EXPO_PUBLIC_API_BASE_URL'} } });`);
    const native = path.join(android, 'app/build.gradle');
    const original = 'android { defaultConfig { versionCode 23\nversionName "1.0.6" } }';
    fs.writeFileSync(native, original);
    const marker = path.join(project, 'gradle-invoked.txt');
    fs.writeFileSync(path.join(android, 'gradlew.bat'), `@echo off\r\necho %*> "${marker}"\r\nexit /b ${gradleExit}\r\n`);
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(scripts, 'build-android.ps1')];
    if (mode) args.push('-Mode', mode);
    const result = spawnSync('powershell.exe', args, { encoding: 'utf8', timeout: 60000,
      env: { ...process.env, NODE_PATH: path.join(__dirname, '../node_modules'), EXPO_PUBLIC_API_BASE_URL: 'http://localhost:8000/api/v1' } });
    if (result.error) throw result.error;
    return { status: result.status, output: (result.stdout || '') + (result.stderr || ''),
      marker: fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : null,
      unchanged: fs.readFileSync(native, 'utf8') === original };
  } finally {
    assert.ok(path.resolve(temporaryRoot).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

test('actual production script overrides dotenv LAN and invokes only the release task', { skip: process.platform !== 'win32' }, () => {
  const result = fixture(null, 'Production');
  assert.equal(result.status, 0, result.output);
  assert.match(result.marker, /assembleRelease/); assert.ok(!result.marker.includes('assembleDebug'));
  assert.equal(result.unchanged, true); assert.ok(!result.output.includes('http://localhost'));
});

test('actual script rejects an unsafe dynamic Expo config before version sync or Gradle', { skip: process.platform !== 'win32' }, () => {
  const result = fixture('http://192.168.1.8:8000/api/v1', 'Production');
  assert.notEqual(result.status, 0); assert.equal(result.marker, null); assert.equal(result.unchanged, true);
  assert.match(result.output, /Gradle was not started/); assert.ok(!result.output.includes('192.168.1.8'));
});

test('default script remains debug and preserves Gradle failure handling', { skip: process.platform !== 'win32' }, () => {
  const debug = fixture(null, null); assert.equal(debug.status, 0, debug.output); assert.match(debug.marker, /assembleDebug/);
  const failure = fixture(null, 'Development', 7); assert.notEqual(failure.status, 0); assert.match(failure.output, /exit code 7/);
});
