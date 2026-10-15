const fs = require('fs');
const path = require('path');

/**
 * Derives and synchronizes native Android version configuration from canonical app.json.
 * Ensures that android/app/build.gradle always matches expo.version and expo.android.versionCode
 * without requiring manual, untracked edits in the git-ignored android/ directory.
 */
function syncAndroidVersion(rootDir = path.join(__dirname, '..')) {
  const appJsonPath = path.join(rootDir, 'app.json');
  if (!fs.existsSync(appJsonPath)) {
    throw new Error(`app.json not found at ${appJsonPath}`);
  }

  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  const version = appJson?.expo?.version;
  const versionCode = appJson?.expo?.android?.versionCode;

  if (!version || typeof version !== 'string' || !version.trim()) {
    throw new Error('app.json is missing a valid expo.version string');
  }
  if (typeof versionCode !== 'number' || !Number.isSafeInteger(versionCode) || versionCode < 1) {
    throw new Error('app.json is missing a valid expo.android.versionCode positive integer');
  }

  const buildGradlePath = path.join(rootDir, 'android', 'app', 'build.gradle');
  if (!fs.existsSync(buildGradlePath)) {
    return {
      synced: false,
      reason: 'android/app/build.gradle does not exist yet (requires expo prebuild on fresh checkout)',
      version,
      versionCode,
    };
  }

  const content = fs.readFileSync(buildGradlePath, 'utf8');
  const codeRegex = /versionCode\s+\d+/;
  const nameRegex = /versionName\s+"[^"]+"/;

  if (!codeRegex.test(content) || !nameRegex.test(content)) {
    throw new Error('Could not find versionCode or versionName in android/app/build.gradle');
  }

  const currentCodeMatch = content.match(/versionCode\s+(\d+)/);
  const currentNameMatch = content.match(/versionName\s+"([^"]+)"/);

  const currentCode = currentCodeMatch ? parseInt(currentCodeMatch[1], 10) : null;
  const currentName = currentNameMatch ? currentNameMatch[1] : null;

  if (currentCode === versionCode && currentName === version) {
    return {
      synced: false,
      unchanged: true,
      version,
      versionCode,
    };
  }

  let updated = content.replace(codeRegex, `versionCode ${versionCode}`);
  updated = updated.replace(nameRegex, `versionName "${version}"`);

  fs.writeFileSync(buildGradlePath, updated, 'utf8');
  return {
    synced: true,
    previous: { version: currentName, versionCode: currentCode },
    current: { version, versionCode },
  };
}

if (require.main === module) {
  try {
    const res = syncAndroidVersion();
    if (res.synced) {
      console.log(`[sync-android-version] Synchronized android/app/build.gradle from app.json: versionName "${res.current.version}", versionCode ${res.current.versionCode} (was "${res.previous.version}", ${res.previous.versionCode})`);
    } else if (res.unchanged) {
      console.log(`[sync-android-version] android/app/build.gradle is already in sync with app.json (versionName "${res.version}", versionCode ${res.versionCode})`);
    } else {
      console.log(`[sync-android-version] ${res.reason}`);
    }
  } catch (err) {
    console.error(`[sync-android-version] ERROR: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { syncAndroidVersion };

