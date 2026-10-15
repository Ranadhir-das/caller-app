const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { syncAndroidVersion } = require('./sync-android-version.cjs');

test('Current project app.json has canonical version 1.0.7 and versionCode 24', () => {
  const rootDir = path.join(__dirname, '..');
  const appJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'app.json'), 'utf8'));

  assert.equal(appJson.expo.version, '1.0.7');
  assert.equal(appJson.expo.android.versionCode, 24);
});

test('syncAndroidVersion reports unchanged when android/app/build.gradle already matches app.json in fixture', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vaani-sync-match-'));

  try {
    fs.writeFileSync(
      path.join(tmpDir, 'app.json'),
      JSON.stringify({ expo: { version: '1.0.6', android: { versionCode: 23 } } }, null, 2),
      'utf8'
    );

    const gradleDir = path.join(tmpDir, 'android', 'app');
    fs.mkdirSync(gradleDir, { recursive: true });
    const matchingGradle = `
android {
    defaultConfig {
        applicationId 'com.vaani.caller'
        versionCode 23
        versionName "1.0.6"
    }
}
`;
    fs.writeFileSync(path.join(gradleDir, 'build.gradle'), matchingGradle, 'utf8');

    const result = syncAndroidVersion(tmpDir);

    assert.equal(result.synced, false);
    assert.equal(result.unchanged, true);
    assert.equal(result.version, '1.0.6');
    assert.equal(result.versionCode, 23);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('syncAndroidVersion automatically updates stale fixture build.gradle from app.json without touching real workspace', () => {
  const rootDir = path.join(__dirname, '..');
  const realGradlePath = path.join(rootDir, 'android', 'app', 'build.gradle');
  const realGradleBefore = fs.existsSync(realGradlePath) ? fs.readFileSync(realGradlePath, 'utf8') : null;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vaani-sync-stale-'));

  try {
    // Write mock app.json with target version 1.0.6 / 23
    fs.writeFileSync(
      path.join(tmpDir, 'app.json'),
      JSON.stringify({ expo: { version: '1.0.6', android: { versionCode: 23 } } }, null, 2),
      'utf8'
    );

    // Write mock android/app/build.gradle with older version 1.0.5 / 22
    const gradleDir = path.join(tmpDir, 'android', 'app');
    fs.mkdirSync(gradleDir, { recursive: true });
    const initialGradle = `
android {
    defaultConfig {
        applicationId 'com.vaani.caller'
        versionCode 22
        versionName "1.0.5"
    }
}
`;
    fs.writeFileSync(path.join(gradleDir, 'build.gradle'), initialGradle, 'utf8');

    // Run sync on temporary fixture
    const res = syncAndroidVersion(tmpDir);

    assert.equal(res.synced, true);
    assert.deepEqual(res.previous, { version: '1.0.5', versionCode: 22 });
    assert.deepEqual(res.current, { version: '1.0.6', versionCode: 23 });

    // Verify fixture file content on disk was updated
    const updatedGradle = fs.readFileSync(path.join(gradleDir, 'build.gradle'), 'utf8');
    assert.match(updatedGradle, /versionCode 23/);
    assert.match(updatedGradle, /versionName "1.0.6"/);
    assert.doesNotMatch(updatedGradle, /versionCode 22/);
    assert.doesNotMatch(updatedGradle, /versionName "1.0.5"/);

    // Second run should be idempotent and report unchanged
    const res2 = syncAndroidVersion(tmpDir);
    assert.equal(res2.synced, false);
    assert.equal(res2.unchanged, true);

    // Verify real repository android/app/build.gradle was not modified
    if (realGradleBefore !== null) {
      const realGradleAfter = fs.readFileSync(realGradlePath, 'utf8');
      assert.equal(realGradleAfter, realGradleBefore, 'Real repository android/app/build.gradle must remain untouched');
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('syncAndroidVersion handles missing android directory safely for fresh checkouts', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vaani-fresh-checkout-'));

  try {
    fs.writeFileSync(
      path.join(tmpDir, 'app.json'),
      JSON.stringify({ expo: { version: '1.0.6', android: { versionCode: 23 } } }, null, 2),
      'utf8'
    );

    const res = syncAndroidVersion(tmpDir);
    assert.equal(res.synced, false);
    assert.equal(res.version, '1.0.6');
    assert.equal(res.versionCode, 23);
    assert.match(res.reason, /fresh checkout/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('syncAndroidVersion rejects invalid or missing version values in app.json', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vaani-invalid-app-json-'));

  try {
    fs.writeFileSync(
      path.join(tmpDir, 'app.json'),
      JSON.stringify({ expo: { version: '', android: { versionCode: 'not-a-number' } } }),
      'utf8'
    );

    assert.throws(
      () => syncAndroidVersion(tmpDir),
      /missing a valid expo\.version/
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('syncAndroidVersion throws if build.gradle lacks versionCode or versionName in fixture', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vaani-malformed-gradle-'));

  try {
    fs.writeFileSync(
      path.join(tmpDir, 'app.json'),
      JSON.stringify({ expo: { version: '1.0.6', android: { versionCode: 23 } } }, null, 2),
      'utf8'
    );

    const gradleDir = path.join(tmpDir, 'android', 'app');
    fs.mkdirSync(gradleDir, { recursive: true });
    fs.writeFileSync(path.join(gradleDir, 'build.gradle'), 'android { defaultConfig { applicationId "com.test" } }', 'utf8');

    assert.throws(
      () => syncAndroidVersion(tmpDir),
      /Could not find versionCode or versionName in android\/app\/build\.gradle/
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

