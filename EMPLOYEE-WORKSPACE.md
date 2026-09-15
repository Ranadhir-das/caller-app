# Employee workspace

Active CRM roles can sign in and land in Employee workspace. First-time employees capture an enrollment photo before entering the caller workspace. Callers can open their calling tabs after submitting enrollment; attendance requires approved enrollment. Other staff cannot navigate to calling pages. Employee APIs always scope leave, projects, attendance, and reports to the authenticated employee. Administrative leave approvals stay in CRM.

## Live-photo attendance

1. Capture an enrollment photo with the front camera.
2. Python/OpenCV requires exactly one visible face. Photos are resized, re-encoded as JPEG, and kept privately in the database, never in public media URLs.
3. An administrator approves enrollment in CRM > Attendance photo review.
4. Check-in/check-out each require a fresh camera capture and a one-use, 3-minute server challenge.
5. An administrator compares the attendance image with approved enrollment. Attendance uses the server submission timestamp after approval. Employees cannot approve their own requests.

Face detection is NOT face matching or liveness verification. A camera capture alone cannot prevent photographing another image. This release deliberately requires manual identity review; it does not claim automatic biometric verification. Photos are retained for review; manage database access and retention according to your workplace policy. No phone biometric templates or third-party face service are used.

## Native setup

Camera permission is configured in app.json. Rebuild the Android/iOS app after changing native permissions. The existing expo-image-picker dependency handles camera capture; expo-local-authentication is not used. Backend requires pinned Pillow and OpenCV dependencies in requirements.txt and the web attendance-photo migration.

## Verification

Backend tests cover role login, employee ownership, cross-account rejection, invalid/no-face photos, challenge replay/expiry, and approval before attendance. TypeScript compilation checks the employee UI. Real camera capture and identity review require a physical-device acceptance check.

## Repeatable Windows build

Run `powershell -ExecutionPolicy Bypass -File scripts/build-android.ps1` from caller-app. The script uses the workspace Microsoft OpenJDK 17, restores shell environment values, and builds an ARM64 debug APK. Android Studio Java 25 caused a native Prefab configuration failure in this environment. The debug APK requires the Expo development server (`npm start`); it is not a standalone production release.
