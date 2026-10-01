# Push registration (client only)

`PushNotificationRegistration` is mounted once inside AuthProvider. It observes
the authenticated user/token after login and session restoration; no login method
awaits it. Changes to the user/session remove all listeners and cancel an in-flight
backend registration. No push token is manually persisted in AsyncStorage.

`src/services/notifications.ts` exports permission, Expo-token, registration and
listener setup functions. Android channel `default` uses HIGH importance, vibration
and default sound. Foreground notifications and taps only log data in development;
no navigation or foreground presentation UI is added.

The project ID comes from Constants.expoConfig.extra.eas.projectId with an easConfig
fallback. Native FCM/APNs token change events are exchanged for an Expo token before
posting; native tokens are never sent as expo_push_token. Repeated successful tokens
are suppressed within the session. Failed registration is retried on foregrounding
after 60 seconds, or on the next authenticated mount. Backend requests time out after
15 seconds. Notification/permission/native setup failures do not affect login.

POST `${API_BASE_URL}/mobile/push-devices/` uses the existing apiRequest and DRF
`Authorization: Token ...` mechanism, with:

```json
{"expo_push_token":"ExponentPushToken[...]","platform":"android","device_name":"device name"}
```

404 means the backend phase is not available yet. It is logged in development and
does not show an alert, log the user out, or claim success. Other backend/network
errors are also contained. Auth credentials/passwords are never logged by this
service. Expo push tokens and received notification data are logged only in development.

## Native prerequisites and device check

- The installed dependencies already include expo-notifications 57.0.21,
  expo-constants 57.0.19 and expo-device 57.0.1; no package changes were needed.
- app.json now includes the notifications plugin/default channel. The existing
  Android manifest also specifies POST_NOTIFICATIONS and the default channel,
  because this repository keeps its native project. Do not run a destructive clean
  prebuild over the custom Callstate module.
- This checkout has no android/app/google-services.json or Google Services Gradle
  integration. Configure the matching Firebase Android app (`com.vaani.caller`)
  and Google Services native setup before expecting FCM/Expo token generation.
  Configure Expo push delivery credentials later when implementing sending.
- Rebuild/install the native development/release app on a physical Android device;
  Android Expo Go is intentionally skipped. Missing project ID, unavailable physical
  device, denied permission and token-generation errors are safe skips.
- Sign in and allow notifications. Check `[Push] Permission status`, Expo push token,
  and registration logs. Until the backend exists, expect a non-blocking 404.
- Restart while signed in to verify session-start registration. Deny permission or
  disable networking to confirm normal login/use continues. Log out/in to verify
  listener cleanup. Native token changes update registration without navigation.
- Device token generation and tap delivery were not tested on hardware in this task.
  This phase creates no backend model, notification sender or website routing.

Reference: https://docs.expo.dev/versions/v57.0.0/sdk/notifications/
