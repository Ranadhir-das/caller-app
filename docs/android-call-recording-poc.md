# Phase 1: local Android cellular recording POC

The existing `Callstate` Expo module now exposes:

```ts
prepareRecording(): Promise<boolean> // Call while activity is visible, before startCall.
startRecording(): Promise<string | null>
stopRecording(): Promise<string | null>
isRecording(): boolean
getRecordingPath(): string | null
```

The dialer requests optional `RECORD_AUDIO` permission and awaits preparation of a
microphone foreground service before the existing `startCall` launches the Phone
app. The existing native phone-state listener starts recording on `OFFHOOK` and
stops it on `IDLE`; JS does not need to stay active to process these transitions.
`OFFHOOK` includes dialing and does not prove that the other party answered. The
existing call timing and outcome logic has not been changed.

Recording uses the ordinary `MIC` source, mono AAC, 44.1 kHz, 96 kbps, in an M4A
container. It does not request audio focus, change routing, enable speakerphone,
or attempt privileged `VOICE_CALL` access. Android reserves direct voice-call
capture for privileged/system cases, and ordinary apps may receive silence
during a cellular call. A nonempty, playable file is not proof of two-way capture.
Speakerphone pickup, if it works, is acoustic pickup, not direct downlink capture.

References:
- https://developer.android.com/media/platform/sharing-audio-input
- https://developer.android.com/reference/android/media/MediaRecorder.AudioSource
- https://developer.android.com/develop/background-work/services/fgs/service-types#microphone

## Local storage and lifecycle

Files are saved as `call_<timestamp>_<UUID>.m4a` in
`context.noBackupFilesDir/call-recordings` (typically
`/data/user/0/com.vaani.caller/no_backup/call-recordings`). No storage permission,
upload, playback UI, API change, or database change is involved. Completed files
remain until app data is cleared, the app is uninstalled, or they are manually
removed. The path getter is process-local, not a persisted recording index.
During recording it returns the in-progress path; after stop it returns the last
successfully finalized path. Failed/incomplete recordings return null and are
deleted when possible.

The foreground service remains active while the Phone app is visible or the
screen is locked. It stops at `IDLE`, explicit stop, dialer unmount, module/service
destruction, task removal, or recorder failure. A two-second native idle check
handles missing `IDLE` callbacks; preparation expires after 60 seconds without
`OFFHOOK`. Duplicate starts/stops are harmless. It is not restarted automatically.
Force-stop, power loss, or abrupt process death cannot guarantee M4A finalization;
Android releases the microphone but a partial file can remain. No recovery is
claimed for such files.

## Build and test one real call

1. Build/install a **new native Android debug build** (Expo Go or an OTA update
   cannot add this service). From the project directory:

   ```powershell
   npx expo prebuild --platform android --no-install
   npx expo run:android --device
   ```

   If the live installed app has a different signing key, use a test device/build
   installation; do not uninstall the live app just to bypass a signature error.

2. With USB debugging enabled, capture native logs in another terminal:

   ```powershell
   adb logcat -v time CALL_RECORDING:I CALLSTATE:D ReactNativeJS:I '*:S'
   ```

3. Open the normal dialer with a test lead, grant microphone access, and make a
   cellular call to a consenting test partner. Speak alternately for 20–30 seconds.
   Keep the normal earpiece route for the first test. Expect service-ready then
   `Recording started ... source=MIC ... path=...` around `OFFHOOK`.

4. Hang up. Expect `Recording stopped`, `durationMs`, `bytes`, and `path`, or an
   explicit error/no-valid-recording log. Confirm the notification disappears and
   the normal outcome screen, timing, Call Back/Follow-Up and API save still work.
   Recording duration is independent from the existing call-duration calculation.

5. For a debuggable build, retrieve and listen to the file:

   ```powershell
   adb shell run-as com.vaani.caller ls -l no_backup/call-recordings
   # Replace FILE.m4a with the exact filename from the stop log/listing.
   # cmd redirection preserves binary output even with Windows PowerShell 5.
   cmd /c "adb exec-out run-as com.vaani.caller cat no_backup/call-recordings/FILE.m4a > call-test.m4a"
   ```

   Android Studio Device Explorer is another option for a debuggable app.
   `run-as` generally cannot extract files from a release build. Listen to both
   parties separately: classify the result as both sides, local only, remote only,
   silence, or recording error. Record the device model, Android version, route
   (earpiece/speaker/Bluetooth), and file duration. Do not infer audio success
   from log messages or file size alone.

## Additional regression checks

- Deny microphone permission: the call, timing, outcome, and Follow-Up must work.
- Lock the screen / switch apps during a call: stop and path logs should still occur.
- End a call immediately: a MediaRecorder stop error may discard a too-short file;
  the outcome flow must continue normally.
- Make a second call: expect a different filename and no duplicate recorder.
- Leave the dialer or remove the app task: recording should stop and release resources.
- Cancel before `OFFHOOK`: the service must stop on unmount or the 60-second timeout.

Checks to run after changes:

```powershell
npx tsc --noEmit
cd android
.\gradlew.bat :app:assembleDebug :app:lintDebug --console=plain -PreactNativeArchitectures=arm64-v8a
```

## Source changes

- `modules/callstate/android/src/main/java/expo/modules/callstate/CallRecordingService.kt`:
  foreground service, recorder, local files, lifecycle cleanup, and native logs.
- `modules/callstate/android/src/main/java/expo/modules/callstate/CallstateModule.kt`:
  recording methods and hooks beside the existing call events.
- `modules/callstate/android/src/main/AndroidManifest.xml`: microphone/foreground
  service permissions and private service declaration.
- `modules/callstate/src/CallstateModule.ts`: Android recording method types.
- `src/app/dialer.tsx`: optional microphone request, preparation before calling,
  duplicate pending-request guard, and unmount cleanup.
- `app.json`: remove image-picker's microphone permission block by supplying a
  microphone permission description. Prebuild otherwise strips `RECORD_AUDIO`.
- This guide. Generated `android/` output remains ignored as before.

## Verification in this workspace (2026-09-22)

- `npx tsc --noEmit`: passed.
- Expo Android prebuild: passed; merged manifest includes `RECORD_AUDIO`,
  `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, and the non-exported
  microphone service.
- `:callstate:compileDebugKotlin`: passed.
- `:app:assembleDebug` for `arm64-v8a`: passed. APK:
  `android/app/build/outputs/apk/debug/app-debug.apk`. Debug builds require Metro.
- Full-project lint: blocked by a tool crash in
  `:react-native-worklets:lintAnalyzeDebug`: `Cannot find a KaModule for the VirtualFile`.
- Callstate-only lint: zero errors, two duplicate `UseKtx` warnings on the existing
  `Uri.parse` call. To obtain this report, dependency main-source lint analysis was
  excluded **for this verification command only**, not disabled in project settings:

  ```powershell
  .\gradlew.bat :app:assembleDebug :callstate:lintDebug -x :react-native-worklets:lintAnalyzeDebug -x :expo-modules-core:lintAnalyzeDebug --console=plain --no-daemon --max-workers=2 -PreactNativeArchitectures=arm64-v8a
  ```

  Report: `modules/callstate/android/build/reports/lint-results-debug.html`.
  This is not a full-project lint pass.
- No device was connected to ADB. Cellular capture quality and the live regression
  scenarios above still require a real-device test; two-way audio is unverified.
