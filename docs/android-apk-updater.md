# Android in-app updater ? version 17 to 18 diagnosis

## Confirmed cause (2026-10-09)

The reported message, ?App update information is not available yet. Contact your
administrator,? is returned by the CRM's `/api/v1/mobile/app-update/` endpoint with
**HTTP 503 when configured release metadata fails validation**. Uploading an APK does
not populate that metadata. Local CRM validation also found a blank latest_version and
version_code 0; the individual invalid production fields were not read using a live token.
The user's production response establishes invalid/unpublished release configuration.

The version comparison is correct: `1.0.1 (18)` is newer than `1.0.1 (17)` because
versionCode, not the human-readable version name, determines upgrade eligibility.

A second confirmed publishing problem: the documented/default URL
`https://vaaniapp.co.in/dist/vaani.apk` returns **404** for HEAD and GET. The existing
public download endpoint **`https://vaaniapp.co.in/app/download/`** returns the uploaded
APK successfully. Merely setting version_code=18 while retaining the broken URL would
move the failure from checking to downloading.

## Verified published artifact

Read-only download from `/app/download/` on 2026-10-09:

| Check | Observed result |
| --- | --- |
| HTTP / MIME | 200, application/vnd.android.package-archive |
| Download length | 108,275,364 bytes, matching Content-Length |
| Application ID | com.vaani.caller |
| Version name / code | 1.0.1 / 18 |
| Minimum / target Android API | 24 / 36 |
| APK verification | apksigner succeeds; v2 signature |
| Bundled API origin | https://vaaniapp.co.in/api/v1 |
| Native updater | ApkUpdaterModule present in DEX |
| Install configuration | REQUEST_INSTALL_PACKAGES; non-exported grant-enabled FileProvider with authority com.vaani.caller.apkupdater.files |

APK SHA-256:
`e879ad1df5e30d035aeca5f70e1519bab46a029e2a850120c8bae9d46a96d0a9`

Signing certificate SHA-256:
`c726d282a77b9c07a6b1b1f3ee9586e6bf1ffc1ec8e94e1a476df482d68871a1`

The audit copy is `E:\react\updater-audit-published.apk`, downloaded from the server;
it was not generated or installed. The connected USB device reported **1.0.1 (1),
DEBUGGABLE, Android API 36**, not the user's version-17 installation. The available local
debug artifact uses a different signing certificate from release 18. Do not use that
build as proof of a release-17 ? release-18 update, change signing keys, or uninstall
an employee's app to bypass a mismatch. The version-17 certificate still needs comparison.

## Required server configuration ? prepared, not applied

**No new APK is needed to unblock the existing version-17 updater.** On the production
CRM server, update these entries in its existing `/opt/vaani/.env` (edit existing entries;
avoid duplicate definitions):

```dotenv
CALLER_APP_LATEST_VERSION=1.0.1
CALLER_APP_VERSION_CODE=18
CALLER_APP_DOWNLOAD_URL=https://vaaniapp.co.in/app/download/
```

Preserve the current mandatory/minimum-version policy and release notes. If unset, the
existing application defaults are minimum code 1, mandatory false, and no notes. If set,
minimum code must be a positive integer no greater than 18, mandatory must be boolean,
and release notes must be a JSON list of strings. Do not change `CALLER_APK_PATH`: the
existing public endpoint is already serving build 18. No new Nginx route is necessary.

Validate the existing updater configuration without displaying credentials:

```bash
cd /opt/vaani
./venv/bin/python manage.py shell -c "from django.conf import settings; from apps.accounts.api.app_update import AppReleaseSerializer; s=AppReleaseSerializer(data=settings.CALLER_APP_UPDATE); print('Valid release metadata:', s.is_valid()); print(s.errors)"
./venv/bin/python manage.py check
```

Require `Valid release metadata: True` and `{}`. During a separately authorized server
configuration rollout, reload the running application's settings:

```bash
sudo systemctl restart vaani
sudo systemctl is-active vaani
curl --fail --head https://vaaniapp.co.in/app/download/
```

Then use the existing signed-in version-17 app to check again. The authenticated JSON
response must advertise latest_version `1.0.1`, version_code `18`, and the working URL
above. Authentication remains required for metadata; no tokens belong in URLs or logs.
The APK request is public and must not carry the employee token.

**None of these production edits/restart commands were executed by this fix.** No commit,
push, deployment, release generation, or APK installation was performed. If the server is
configured differently, confirm its actual environment file/service rather than replacing
unrelated server configuration.

## Small client corrections

Only `src/services/appUpdater.ts`, `scripts/test-app-updater.cjs`, and this document were
changed during this updater fix:

- Explain a metadata 503 as unpublished CRM release configuration.
- Clear stale release/install actions at the start of a fresh metadata check. A failed
  check can no longer leave the previously checked release actionable. Keep a valid cached
  APK on disk so it can be revalidated after a later successful check.
- Identify APK HTTP 404 and 401/403 separately, instead of presenting every HTTP failure
  as an interrupted download.
- Compare the completed file against Content-Length when the response is not compressed;
  reject incomplete bytes before native validation. Unknown-length downloads still use
  Android's APK validation. The partial file is cleaned on failure.
- Add regressions for the exact 17 ? 18 version case, metadata 503, stale state, APK 404,
  token-free permission failures and incomplete downloads.

No changes to AppUpdatePanel layout, packages, app.json/EAS configuration, native installer,
FileProvider, Android permissions, authentication, microphone, or employee-location tracking.
Pre-existing/concurrent workspace changes are outside this task and were preserved.

The existing panel already renders error text, disables controls during work, and uses
fileUri/info to choose Download/Install actions, so the state fix requires no UI redesign.
The service retains its duplicate-operation lock and uses the existing authenticated
`apiRequest` for metadata. Downloads use `expo-file-system/legacy` into private cache,
then move the validated partial APK to the installable filename.

Native validation restricts files to the updater cache, checks the application ID and exact
advertised newer versionCode. FileProvider supplies a content URI with temporary read
permission. Android's installer performs final SDK/signature/package compatibility checks
and asks for confirmation. A successful launch means only ?installer opened,? never
?installation completed.? Unknown-app access goes through Android Settings after a user
action. No public-storage permission or token-bearing APK request is introduced.

## Exact Android-device acceptance steps

1. On the device actually running **1.0.1 (17)**, confirm `com.vaani.caller`, its version code
   and Android API level (must be at least 24). Compare the original build-17 artifact's
   signing certificate with the release-18 certificate above using `apksigner verify
   --print-certs build-17.apk`. If they differ, stop and obtain a matching-key release;
   do not uninstall or change signing.
2. After the operator applies/validates the server metadata, sign in normally. Open
   **Settings ? Update app ? Check for Update**. Expect current `1.0.1 (17)`, latest
   `1.0.1 (18)`, and **Download Update** despite identical version names.
3. Tap Download once, then tap again while downloading: only one operation should run.
   Verify measured byte/percentage progress. On an interrupted connection, expect a clear
   failure and a working retry; no partial APK should become installable.
4. After download, tap **Install Update**. If unknown-app installation is disabled, open
   the provided Android settings action, enable **Allow from this source** for Vaani,
   return, and tap Install Update again. The app must not silently grant this permission.
5. Confirm Android opens the package installer for a Vaani update. First cancel and verify
   Vaani still works and Install Update remains available. Then repeat and explicitly
   confirm installation on the device.
6. Reopen Vaani, verify `1.0.1 (18)` and preserved app/login data. Check for Update should now
   report up to date. Verify the already-working microphone still behaves normally.
7. For future client-build validation, test a deliberately unconfigured test-server release
   (503), missing APK URL (404), and interrupted download. Confirm useful errors, no stale
   Download/Install action after a failed metadata check, and recovery after correcting the
   test configuration. Never perform these negative cases by breaking production settings.

These checks have **not** been performed on the version-17 device. Read-only package
inspection of the separate connected debug device is not an installation-flow test.

## Automated validation

- Baseline updater tests: 7 passed.
- Updated updater tests: 13 passed (`node scripts/test-app-updater.cjs`).
- TypeScript: passed (`npx tsc --noEmit`).
- Public artifact: complete download, APK signature verification, manifest/package/version/
  minimum SDK, native module and FileProvider inspection succeeded.
- All mobile scripts: **162 tests passed across 15 scripts**, zero failures.
- `git diff --check`: passed; updater-file whitespace check also passed.

The installer boundary is mocked in JavaScript tests. Native source was unchanged, so no
native rebuild or release build was run. Actual version-17 signing compatibility, Android
permission interaction, installer cancellation and replacement remain device acceptance.
