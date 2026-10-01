# Call recording CRM integration

The existing native recorder is unchanged. This phase attaches its closed local
`.m4a` file to the existing Call returned by the outcome API. No audio quality,
two-way capture, transcription, cloud storage, or consent work was performed.

## Flow

1. Existing OFFHOOK/IDLE handling records call timing and stops the native recorder.
2. `dialer.tsx` waits for the existing `stopRecording()` result before persisting
   the recording path alongside the outcome draft. A failed/denied recorder does
   not prevent normal call outcome submission.
3. Outcome POST `/api/v1/calls/` is unchanged and returns the Call ID.
4. The draft stores that ID before uploading. Both lead and external calls use
   the same endpoint and queue; a recording never requires a Lead.
5. Multipart upload succeeds with HTTP 201, or 200 for an identical retry.
   The client checks the returned Call ID and file size, then persists confirmation.
6. Only after that confirmation does it delete the local file and remove the draft.

On timeout, HTTP error, app interruption, or invalid confirmation, the file and
draft remain. Direct Dialer lists pending recordings with an explicit **Retry
recording / cleanup** action. There is no automatic retry loop. Cleanup failures
retain an `uploaded` marker so a retry can finish cleanup without another upload.
Pending recordings cannot be discarded using the outcome-draft discard button.
The queue retains the existing account + API-host storage isolation.

## Backend and deployment

- Migration: `calls.0006_callrecording` (depends on the existing direct-call migration).
- New `CallRecording`: one-to-one Call, file, duration, server-calculated size,
  created timestamp, SHA-256 for duplicate/retry verification.
- `POST /api/v1/calls/<call_id>/recording/`: existing token/work-session authentication;
  multipart fields `recording` and `duration_seconds`.
- `GET /api/v1/calls/<call_id>/recording/`: protected audio playback using API auth.
- `GET /calls/<call_id>/recording/`: protected session-authenticated CRM playback.
- Callers can upload/play only recordings for calls they authored, including
  external calls and their historical calls. Admin, Manager, Super Admin use
  the existing management role permissions. Unauthorized ownership is 403;
  a missing Call or recording is 404. Unauthenticated API requests are 401.
- Identical bytes + duration retry returns 200; different content/duration for an
  existing recording returns 409. No replacement/delete API was added.
- Files must have an `.m4a` extension and M4A container header, and be 12 bytes to
  200 MB. This is format validation, not audio analysis.

Files live under `aspiring-crm/private-call-recordings/call-recordings/YYYY/MM/DD/`
with generated filenames, outside MEDIA_ROOT. Storage refuses public `.url`
access; API responses contain metadata only. Protected responses use private,
no-store caching and audio/mp4. The web server must **not** alias or expose this
directory. Give the Django process write access and persist this directory across
deployments. Configure the production proxy upload limit/timeouts to accommodate
the intended recording sizes; the application limit is 200 MB.

Deploy backend code and run `python manage.py migrate` before using the updated
mobile build. Restart Django and collect static files through the existing
deployment process if applicable. Local migration execution does not deploy to
`vaaniapp.co.in`; the app's API host was not changed.

## Files changed in this phase

Mobile (`caller-app/`):

- `src/services/callDrafts.ts`: recording path, saved Call ID, retry/confirmation metadata.
- `src/services/recordingUploads.ts`: multipart upload, confirmation, safe cleanup.
- `src/app/dialer.tsx`: capture the closed recording path.
- `src/app/call-outcome.tsx`: upload after Call creation; preserve success on upload failure.
- `src/app/direct-dialer.tsx`: pending upload/cleanup retry action; protect queued drafts.
- `package.json`, `package-lock.json`: explicitly declare already installed SDK 57 `expo-file-system`.
- `scripts/test-recording-uploads.cjs`: isolated upload/cleanup behavior tests.
- `docs/recording-crm-integration.md`: this guide.

Backend (`aspiring-crm/`):

- `.gitignore`: exclude private recordings.
- `apps/calls/models.py`, `apps/calls/migrations/0006_callrecording.py`.
- `apps/calls/recording_storage.py`, `apps/calls/recordings.py`.
- `apps/calls/api/recordings.py`, `apps/calls/api/urls.py`.
- `apps/calls/test_recordings.py`.
- `apps/web/recording_views.py`, `apps/web/urls.py`.
- `apps/web/views.py`, `apps/web/external_call_views.py`: preload recording relations.
- `apps/web/templates/web/call_recording.html`: reusable protected player/availability.
- `apps/web/templates/web/calls.html`, `lead_detail.html`, `external_calls.html`,
  `external_call_detail.html`: display recording information.

## Device acceptance check

1. With the updated backend deployed, log in through the existing verified session.
2. Call an assigned lead, end it, and submit an outcome. Confirm the Call appears
   once and its recording appears in CRM Call activity and the lead's history.
3. Repeat using a number with no Lead from Direct Dialer. Confirm the existing
   External Calls / Feedback list/detail displays its recording.
4. Test an upload-only network failure (allow call creation, block the recording
   POST using a test proxy). Confirm the Call and any callback remain saved,
   the local `.m4a` remains, and Direct Dialer offers recording retry.
5. Restore connectivity and retry. Confirm one server recording exists and the
   local file is removed only after success. A lost success response can safely
   retry identical bytes; the server returns the existing recording.
6. As another caller, direct playback/upload must return 403. As management,
   confirm protected playback works. Signed-out playback must require login.
7. A call without a recording must still save normally and display “Not available”.

These checks exercise integration only; whether both parties are audible remains
out of scope. Do not clear app storage/uninstall while recordings are pending.

## Limits

### Silent capture investigation — September 25

The local CRM recording for call 38 was decoded with Chromium's audio decoder:
42.1674 seconds, mono, peak amplitude 0, RMS 0. Every decoded sample was zero.
This is silence in the stored file, not a CRM volume/player problem. Amplifying
or re-uploading that file cannot recover speech. No audio was shared externally.

The native recorder now samples peak microphone amplitude and, on Android 10+,
checks `activeRecordingConfiguration.isClientSilenced`. At stop it logs the peak,
sample count and observed silencing, and exposes `getRecordingWarning()` for the
dialer to show a warning. These diagnostics preserve the file, existing upload,
calling, timing and outcome behavior. Nonzero amplitude is not proof of speech
or two-way capture; failed/short diagnostics are not classified as silence.

Android prioritizes cellular calls over ordinary microphone capture. A granted
RECORD_AUDIO permission does not grant privileged cellular uplink/downlink access:
https://developer.android.com/media/platform/sharing-audio-input
No privileged permissions, accessibility workaround, forced speaker routing or
unverified audio-source change was added. The device was not connected during
this investigation, so the exact reason for its zero signal remains unverified.

**A new native Android build is required** for these diagnostics; a Metro reload
alone does not update Kotlin code. After installation, make a short consented
cellular test call and inspect `adb logcat -s CALL_RECORDING`, the app warning and
CRM playback. If Android reports silencing, this ordinary-app MIC implementation
cannot guarantee recording on that device; a supported manufacturer recording
integration or a different calling architecture is required. Keep existing
recordings; reinstall/update without clearing app data.

Validation: `:callstate:compileDebugKotlin -PreactNativeArchitectures=arm64-v8a`
passed, TypeScript passed, and all eight upload regression tests passed. No new
cellular audio capture test was possible without the connected phone.

- Duration metadata reuses existing observed call duration; the native recorder
  does not expose a separate final audio duration. No audio inspection is performed.
- Uploads are foreground, bounded to a 60-second attempt, with manual retries.
- OS process termination before the final path is captured can leave an unlinked
  local recording. Existing files from older calls are not guessed or automatically
  attached to a Call. Native recovery/backfill and retention are not added here.
- Protected FileResponse playback streams the file; advanced range seeking is
  not implemented in this phase.
- Real cellular/device acceptance checks are required; automated tests use mocks
  and synthetic container bytes, not actual recorded conversations.

## Checks

### September 24 flow audit

- A pending recording on the connected Android device reported `Unsupported
  FormDataPart implementation`. Uploads now use `expo/fetch` with the actual
  `expo-file-system` File as the multipart part, replacing the unsupported legacy
  `{ uri, name, type }` object. Upload regression tests exercise the installed
  Expo multipart encoder, not just a mocked network request.
- Non-JSON HTTP errors and recording-field validation errors now retain the
  status/reason in the pending draft. Invalid/empty success confirmations never
  trigger file deletion.
- Unexpected dialer unmount now preserves the closed recording path on its
  existing draft. It does not fabricate call-end timing; incomplete timing still
  requires review. OS process-death recovery remains a limitation as noted above.
- Invalid CRM recording date filters no longer raise server errors.
- The local `.env` now allows the app's configured `10.58.15.156` host. The local
  backend was restarted and its unauthenticated recording endpoint returns 401
  instead of a host-validation 400. Production configuration was not changed.

Reload the mobile JavaScript bundle, then use Direct Dialer → Retry recording /
cleanup for the existing pending recording. Verify playback in CRM and that the
pending item disappears only after confirmed upload. A real new cellular call
is still required to verify capture and audibility of both parties.

Audit validation: Django check and migration consistency passed; the full default
Django suite passed 136 tests; eight upload tests passed; TypeScript and Android
Hermes export passed. Device capture quality and a signed-in device retry were
not verified (the device was at the login screen).
Native Kotlin compilation passed. The ARM64 lint run was blocked in the existing
`react-native-worklets:lintAnalyzeDebug` dependency by a Kotlin lint engine crash:
`Cannot find a KaModule for the VirtualFile`. No native source or dependency
versions were changed to suppress that failure; see `.recording-audit-android-arm64.log`.

Use `manage.py test apps...` with explicit app labels; existing root-level smoke
scripts are not isolated tests and must not be discovered against normal data.

- `python manage.py migrate --noinput`: applied `calls.0006_callrecording` locally.
- `python manage.py check`: passed.
- `python manage.py makemigrations --check --dry-run`: no changes detected.
- `python manage.py test apps.calls apps.followups apps.performance apps.web.test_caller_data --noinput`: 62 passed.
- `npx tsc --noEmit`: passed.
- `node scripts/test-recording-uploads.cjs`: 5 passed, including failed upload,
  confirmation mismatch, success cleanup, and cleanup-only retry.
- `npx expo export --platform android --max-workers 2 --output-dir .expo/recording-integration-export`: passed, including Hermes bytecode.
  Result is recorded in `.expo/recording-integration-export.log`.
  No native recording implementation was rebuilt or modified for this phase.
