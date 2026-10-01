import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { AppState, Platform } from 'react-native';
import type { DevicePushToken } from 'expo-notifications';
import { apiRequest, ApiError } from './api';
import { notificationCenterChanged } from './notificationCenter';

export interface PushDeviceRegistration {
  expo_push_token: string;
  platform: 'android' | 'ios';
  device_name: string;
}

export type NotificationData = Record<string, unknown>;
const log = (message: string, data?: unknown) => {
  if (__DEV__) console.log(`[Push] ${message}`, data ?? '');
};
const supported = () => {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return false;
  if (!Device.isDevice || Constants.appOwnership === 'expo') {
    log('Registration skipped: use a physical device with a native development/release build.');
    return false;
  }
  return true;
};
const notifications = () => import('expo-notifications');

export async function requestNotificationPermission(): Promise<boolean> {
  if (!supported()) return false;
  try {
    const n = await notifications();
    if (Platform.OS === 'android') {
      await n.setNotificationChannelAsync('default', {
        name: 'Vaani CRM notifications',
        importance: n.AndroidImportance.HIGH,
        enableVibrate: true,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
    let permission = await n.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) permission = await n.requestPermissionsAsync();
    log('Permission status:', permission.status);
    return permission.granted;
  } catch {
    log('Permission request failed: native notification support unavailable.');
    return false;
  }
}

export async function getExpoPushToken(devicePushToken?: DevicePushToken): Promise<string | null> {
  if (!supported()) return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (typeof projectId !== 'string' || !projectId.trim()) {
    log('Token generation failed: projectId missing from Expo configuration.');
    return null;
  }
  try {
    const n = await notifications();
    const token = (await n.getExpoPushTokenAsync({ projectId, devicePushToken })).data;
    log('Expo push token:', token);
    return token;
  } catch {
    log('Token generation failed: check network, native build and Firebase/Expo credentials.');
    return null;
  }
}

export async function registerForPushNotificationsAsync(devicePushToken?: DevicePushToken): Promise<string | null> {
  return await requestNotificationPermission() ? getExpoPushToken(devicePushToken) : null;
}

export async function registerPushDevice(authToken: string, expoPushToken: string, signal?: AbortSignal): Promise<boolean> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return false;
  const body: PushDeviceRegistration = {
    expo_push_token: expoPushToken, platform: Platform.OS,
    device_name: Device.deviceName ?? Device.modelName ?? 'Unknown device',
  };
  log('Registering device:', { platform: body.platform });
  try {
    await apiRequest<unknown>('/mobile/push-devices/', {
      method: 'POST', body, token: authToken, signal, suppressErrorLog: true,
    });
    log('Device registration successful:');
    return true;
  } catch (error) {
    if (!signal?.aborted) log('Device registration failed:', error instanceof ApiError
      ? (error.status === 404 ? 'Endpoint not available yet (404); session remains active.' : `HTTP ${error.status}`)
      : 'Network request failed. Will retry on app activation.');
    return false;
  }
}

let stopCurrentSession: (() => void) | undefined;
let lastHandledResponse: string | undefined;

/** One listener owner. Cleanup also cancels in-flight backend registration. */
export function setupNotificationListeners(
  authToken: string,
  onResponse?: (data: NotificationData, identifier: string) => boolean,
): () => void {
  stopCurrentSession?.();
  let disposed = false;
  let running = false;
  let pending = false;
  let nativeToken: DevicePushToken | undefined;
  let registeredToken: string | null = null;
  let lastAttempt = 0;
  const subscriptions: { remove(): void }[] = [];
  let requestController: AbortController | undefined;

  const refresh = async () => {
    if (disposed) return;
    if (running) { pending = true; return; }
    running = true;
    lastAttempt = Date.now();
    try {
      const token = await registerForPushNotificationsAsync(nativeToken);
      if (!disposed && token && token !== registeredToken) {
        const controller = new AbortController();
        requestController = controller;
        const timeout = setTimeout(() => {
          log('Device registration failed: request timed out.');
          controller.abort();
        }, 15000);
        try {
          if (await registerPushDevice(authToken, token, controller.signal)) registeredToken = token;
        } finally { clearTimeout(timeout); requestController = undefined; }
      }
    } catch {
      log('Device registration failed: unexpected notification error.');
    } finally {
      running = false;
      if (pending && !disposed) { pending = false; void refresh(); }
    }
  };
  const cleanup = () => {
    disposed = true;
    requestController?.abort();
    subscriptions.forEach(subscription => subscription.remove());
    if (stopCurrentSession === cleanup) stopCurrentSession = undefined;
  };
  stopCurrentSession = cleanup;

  void (async () => {
    try {
      if (!supported()) return;
      const n = await notifications();
      if (disposed) return;
      n.setNotificationHandler({ handleNotification: async () => ({
        shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
      }) });
      const handleResponse = (response: import('expo-notifications').NotificationResponse) => {
        if (disposed) return;
        const request = response.notification.request;
        log('Notification response data:', request.content.data);
        if (lastHandledResponse === request.identifier) return;
        if (onResponse?.(request.content.data ?? {}, request.identifier)) {
          lastHandledResponse = request.identifier;
          void n.clearLastNotificationResponseAsync().catch(() => {});
        }
      };
      subscriptions.push(n.addNotificationReceivedListener(notification => {
        log('Foreground notification data:', notification.request.content.data as NotificationData);
        notificationCenterChanged();
      }));
      subscriptions.push(n.addNotificationResponseReceivedListener(response => {
        handleResponse(response);
      }));
      subscriptions.push(n.addPushTokenListener(token => {
        // This is a native FCM/APNs token, not an Expo token. Exchange it first.
        if (nativeToken?.type === token.type && nativeToken.data === token.data) return;
        nativeToken = token;
        void refresh();
      }));
      const initial = n.getLastNotificationResponse();
      if (initial) handleResponse(initial);
      subscriptions.push(AppState.addEventListener('change', state => {
        if (state === 'active' && Date.now() - lastAttempt > 60000) void refresh();
      }));
      void refresh();
    } catch { log('Notification listeners unavailable in this build.'); }
  })();
  return cleanup;
}
