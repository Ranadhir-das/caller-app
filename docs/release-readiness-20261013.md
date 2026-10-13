# Mobile release preparation — 2026-10-13

This report describes local validation and preparation. It does not authorize or
record production deployment or a real-device update test.

## Repository and intended commits

Branch `main`, starting commit `79a214b`, remote
`https://github.com/Ranadhir-das/caller-app.git` (`origin/main`). Existing unpushed
commits `290a445` (speech/notes fix) and `79a214b` (stop tracking Gradle caches) must
be retained; no history rewriting or force-push is needed.

Pending work is grouped into separate commits:

1. Location diagnostics/recovery: `package.json`, `package-lock.json`,
   `src/components/EmployeeLocationRegistration.tsx`, `src/services/employeeLocation.ts`,
   `src/services/locationQueue.ts`, `scripts/test-employee-location.cjs`.
   The already-added `expo-battery` supports power-aware tracking. Retained samples
   stay bound to the same employee; permissions, retries and session expiry are tested.
2. APK updater: `src/services/appUpdater.ts`, `src/components/AppUpdatePanel.tsx`,
   `scripts/test-app-updater.cjs`, `docs/android-apk-updater.md`, and the five source
   files under `modules/apk-updater/` (Expo module config, Gradle, manifest, Kotlin,
   FileProvider paths). Metadata uses the existing authenticated client; public APK
   downloads never receive the employee token. Android confirms installation.
3. Caller workflows: the files in `docs/direct-dialer-followups-fix.md`, plus the
   existing Apostille/login changes in `src/app/(tabs)/more.tsx`, `src/app/_layout.tsx`,
   `src/app/apostille-lead.tsx`, `src/app/apostille-leads.tsx`, `src/app/dialer.tsx`,
   `src/app/login.tsx`, `src/components/apostilleStyles.ts`, `src/services/apostille.ts`,
   `src/services/auth.ts`, `src/services/callDrafts.ts`, `src/services/callOutcome.ts`,
   `src/types/index.ts`, `src/utils/status.ts`, and `scripts/test-apostille-leads.cjs`.
   Shared outcome/provider files contain both reviewed workflow changes. Counselor
   photo exemption is honored only when the server explicitly returns `false`.
4. Release configuration: `.gitignore`, `app.json`, `src/services/api.ts`, and this
   document. Local backups/environment files are excluded, production fallback URL
   replaces the prior LAN fallback, and release metadata is advanced as described below.

Do not stage `build-error.txt` (tracked but locally changed), app config backups,
exported config, `.env` files, APKs, credentials or generated build/cache directories.
The tracked Android `google-services.json` is app configuration, not a service-account
private key. Its package was verified as `com.vaani.caller`; it is unchanged.

## Confirmed release findings

- Public production APK downloaded read-only from
  `https://vaaniapp.co.in/app/download/`: **1.0.4 (21)**, `com.vaani.caller`, minimum
  Android API 24, target API 36. Reusing code 21 would not produce an updater offer.
- Prepared next metadata: **1.0.5 (22)** in `app.json` and the existing ignored
  `android/app/build.gradle`. The Expo project remains
  `a7be21eb-1991-4ae0-ad6d-b71b01d8aa87`, SDK 57.0.0.
- Published APK SHA-256:
  `f48662407fffc08ba7ae09fac2e5ed13ef8f603f441da67d43f4d0bfc8e06081`.
- Published signing certificate SHA-256:
  `c726d282a77b9c07a6b1b1f3ee9586e6bf1ffc1ec8e94e1a476df482d68871a1`.
- Production API: `https://vaaniapp.co.in/api/v1`. `.env.production` agrees, but
  `.env.local` contains a LAN URL and Expo loads it preferentially. A local release
  command must explicitly set the public production URL in its process environment.
  No environment file was edited.
- The existing release Gradle configuration contains all required signing settings
  and references `credentials/android/keystore.jks`. Both are ignored. The previously
  discussed `android/keystore.properties` file is currently absent; do not print the
  inline settings or copy them into tracked source. No keystore was regenerated.
- `android/` is ignored. Native customizations must be preserved locally; do not use
  a destructive prebuild/clean to reproduce this checkout. EAS uses remote version
  management/autoIncrement, so separately reconcile cloud versioning before an EAS
  build; this audit prepares the existing local Gradle workflow.

## Checks and limitations

- All 17 mobile CJS test scripts: **179 tests passed**.
- `npx tsc --noEmit`: passed after the audit edits.
- Earlier Android Hermes JavaScript export passed; this verifies bundling, not APK
  signing, installation or physical-device calling.
- `npx expo config --json`: confirms 1.0.5, code 22, SDK/package/project above.
- Expo Doctor: **20/21 checks passed**. Its package-version check recommends these
  newer patches: `@expo/ui` 57.0.22 → ~57.0.23, `expo` 57.0.27 → ~57.0.28,
  `expo-location` 57.0.20 → ~57.0.21, `expo-router` 57.0.25 → ~57.0.26,
  `expo-splash-screen` 57.0.9 → ~57.0.10. No dependency version was changed just to
  clear this check, and no exclude setting was added to hide it.
- ESLint is not installed/configured. `expo lint` would automatically install
  dependencies/configuration, so it is not reported as passed.
- Physical Android paste/menu, calling, background location, permissions and APK
  replacement still need acceptance testing. No phone installation was performed.
- The CRM full suite passed **686 tests**; see its separate release checklist.

The final task report records native compilation, commit/push and any APK result.
Do not treat the old APK already in the release output directory as a new build.

## Release build procedure (only after remaining checks are accepted)

Preserve the old signed APK outside the output directory before generating a new
artifact. In PowerShell, explicitly set the process environment without changing
local configuration files:

```powershell
cd E:\react\caller-app\android
$env:EXPO_PUBLIC_API_BASE_URL = 'https://vaaniapp.co.in/api/v1'
$env:NODE_ENV = 'production'
.\gradlew.bat assembleRelease
```

Expected artifact: `android/app/build/outputs/apk/release/app-release.apk`.
Verify with the installed Android SDK's `apksigner verify --print-certs` and
`aapt dump badging`, then compute file size and SHA-256. Require package
`com.vaani.caller`, version `1.0.5`, code `22`, and the certificate above. Inspect
the packaged JS/Hermes bundle for the production API URL and absence of the local
development URL. Do not publish if any check fails. Never substitute another key,
uninstall the employee app, or label an older artifact as this release.

On a controlled Android test device running the matching-key code-21 app, test
update download/progress, unknown-source permission, installer cancel/retry, and
successful replacement without data loss. Exercise microphone dictation, login,
normal/Direct Dialer outcomes, points, counselor forwarding, due follow-ups and
location. Automated tests do not replace these acceptance steps.

## Publishing and rollback (not executed)

Deploy compatible CRM code first using its checklist. Publish only a verified
artifact and set CRM updater metadata to that artifact's actual name/code and
`https://vaaniapp.co.in/app/download/`. Preserve existing minimum/mandatory policy.
Verify metadata through an authenticated test session without exposing its token.
Keep the prior APK, checksum and metadata for operator-controlled rollback.

Restoring an older download does not downgrade devices that installed code 22.
If a mobile rollback is needed, ship a corrected build with the same package/key
and a higher code. Do not reset app data. No SSH, server restart, production migration,
live APK replacement or production configuration write is part of this audit.
