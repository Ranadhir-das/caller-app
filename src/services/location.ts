import * as Location from "expo-location";
import { Linking, Platform } from "react-native";

export const MAX_PERMITTED_ACCURACY_METERS = 25.0;
export const MAX_PERMITTED_AGE_SECONDS = 60.0;
export const DEFAULT_ACQUISITION_TIMEOUT_MS = 10000;
export const MAX_ACQUISITION_ATTEMPTS = 3;

export type Coords = { latitude: number; longitude: number };

export type GpsReading = {
  latitude: number;
  longitude: number;
  accuracy: number;
  recorded_at: string; // ISO 8601 UTC string
  is_mocked: boolean;
};

export type LocationErrorCode =
  | 'SERVICES_DISABLED'
  | 'PERMISSION_DENIED'
  | 'PRECISE_LOCATION_REQUIRED'
  | 'TIMEOUT'
  | 'POOR_ACCURACY'
  | 'STALE_READING'
  | 'UNAVAILABLE';

export type LocationAcquisitionResult =
  | { success: true; reading: GpsReading }
  | {
      success: false;
      error: LocationErrorCode;
      message: string;
      canRetry: boolean;
      reading?: GpsReading;
    };

export type GetFreshGpsOptions = {
  timeoutMs?: number;
  maxAttempts?: number;
  targetAccuracyMeters?: number;
  onProgress?: (status: string) => void;
};

/**
 * Opens device location settings for Android or app settings for iOS.
 */
export async function openLocationSettings(): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      const IntentLauncher = await import('expo-intent-launcher');
      await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.LOCATION_SOURCE_SETTINGS);
      return;
    } catch {}
  }
  await Linking.openSettings().catch(() => {});
}

/**
 * Prompts user to enable location services on Android without leaving the app if possible.
 */
export async function promptEnableLocationServices(): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      await Location.enableNetworkProviderAsync();
      return await Location.hasServicesEnabledAsync();
    } catch {
      await openLocationSettings();
      return false;
    }
  }
  await openLocationSettings();
  return false;
}

/**
 * Acquires a fresh, accurate GPS fix meeting backend geofencing standards:
 * - Accuracy <= 25.0m
 * - Reading age <= 60.0s
 * - Handles permissions, disabled location services, and approximate vs precise modes.
 * - Never fabricates coordinates, accuracy, or timestamps.
 */
export async function getFreshGpsReading(
  options?: GetFreshGpsOptions
): Promise<LocationAcquisitionResult> {
  // 1. Verify device location services
  const servicesEnabled = await Location.hasServicesEnabledAsync().catch(() => false);
  if (!servicesEnabled) {
    return {
      success: false,
      error: 'SERVICES_DISABLED',
      message: 'Device location services (GPS) are turned off. Please turn on Location in your device settings.',
      canRetry: true,
    };
  }

  // 2. Check and request foreground permissions
  let perm = await Location.getForegroundPermissionsAsync().catch(() => null);
  if (!perm || perm.status !== 'granted') {
    if (perm && !perm.canAskAgain) {
      return {
        success: false,
        error: 'PERMISSION_DENIED',
        message: 'Location permission was denied. Please allow location access in your device app settings.',
        canRetry: false,
      };
    }
    perm = await Location.requestForegroundPermissionsAsync().catch(() => null);
    if (!perm || perm.status !== 'granted') {
      return {
        success: false,
        error: 'PERMISSION_DENIED',
        message: 'Location permission is required for attendance and work session verification.',
        canRetry: perm?.canAskAgain ?? false,
      };
    }
  }

  // 3. Check for Android 12+ approximate vs precise location
  if (Platform.OS === 'android' && perm.android?.accuracy === 'coarse') {
    return {
      success: false,
      error: 'PRECISE_LOCATION_REQUIRED',
      message: 'Precise location is required for attendance verification. Please enable "Use precise location" in device settings.',
      canRetry: false,
    };
  }

  // 4. Bounded acquisition loop targeting high accuracy
  const maxAttempts = options?.maxAttempts ?? MAX_ACQUISITION_ATTEMPTS;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_ACQUISITION_TIMEOUT_MS;
  const targetAccuracy = options?.targetAccuracyMeters ?? MAX_PERMITTED_ACCURACY_METERS;

  let bestPosition: Location.LocationObject | null = null;
  const startTime = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (Date.now() - startTime >= timeoutMs) break;

    options?.onProgress?.(`Acquiring satellite fix (${attempt}/${maxAttempts})...`);

    try {
      const remainingTime = Math.max(2000, timeoutMs - (Date.now() - startTime));
      const attemptTimeout = Math.min(5000, remainingTime);

      const positionPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const position = await Promise.race([
        positionPromise,
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), attemptTimeout)
        ),
      ]);

      if (
        position &&
        position.coords &&
        Number.isFinite(position.coords.latitude) &&
        Number.isFinite(position.coords.longitude)
      ) {
        const accuracy = position.coords.accuracy ?? 999.0;
        const readingAgeSeconds = (Date.now() - position.timestamp) / 1000;

        if (
          !bestPosition ||
          (position.coords.accuracy ?? 999) < (bestPosition.coords.accuracy ?? 999)
        ) {
          bestPosition = position;
        }

        // Check if reading is fresh and accurate
        if (
          accuracy <= targetAccuracy &&
          readingAgeSeconds <= MAX_PERMITTED_AGE_SECONDS &&
          readingAgeSeconds >= -5.0
        ) {
          return {
            success: true,
            reading: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: Math.round(accuracy * 10) / 10,
              recorded_at: new Date(position.timestamp).toISOString(),
              is_mocked: !!position.mocked,
            },
          };
        }
      }
    } catch {
      // Ignored per-attempt timeout or transient hardware failure; retry next attempt
    }

    // Delay briefly between attempts so GPS provider can receive more satellite ephemeris
    if (attempt < maxAttempts && Date.now() - startTime < timeoutMs - 1500) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // 5. Evaluate the best available reading if target was not immediately met
  if (bestPosition) {
    const bestAccuracy = bestPosition.coords.accuracy ?? 999.0;
    const bestAge = (Date.now() - bestPosition.timestamp) / 1000;
    const bestReading: GpsReading = {
      latitude: bestPosition.coords.latitude,
      longitude: bestPosition.coords.longitude,
      accuracy: Math.round(bestAccuracy * 10) / 10,
      recorded_at: new Date(bestPosition.timestamp).toISOString(),
      is_mocked: !!bestPosition.mocked,
    };

    if (bestAge > MAX_PERMITTED_AGE_SECONDS) {
      return {
        success: false,
        error: 'STALE_READING',
        message: `GPS reading is stale (${Math.round(bestAge)}s old, maximum allowed is 60s). Please ensure GPS is active and retry.`,
        canRetry: true,
        reading: bestReading,
      };
    }

    if (bestAccuracy > targetAccuracy) {
      return {
        success: false,
        error: 'POOR_ACCURACY',
        message: `GPS accuracy is ±${bestAccuracy.toFixed(1)}m (target is ±${targetAccuracy.toFixed(0)}m or better). Please move near a window or open area, check that Wi-Fi scanning is on, and retry.`,
        canRetry: true,
        reading: bestReading,
      };
    }

    return {
      success: true,
      reading: bestReading,
    };
  }

  return {
    success: false,
    error: 'UNAVAILABLE',
    message: 'Could not obtain a GPS reading from your device. Please ensure location is enabled and retry.',
    canRetry: true,
  };
}

/**
 * Best-effort fresh GPS fix for attendance login and work sessions.
 * Returns real GpsReading with latitude, longitude, measured accuracy, and recorded_at timestamp.
 * Never fabricates values.
 */
export async function getCurrentCoords(): Promise<GpsReading | null> {
  try {
    const result = await getFreshGpsReading({ maxAttempts: 2, timeoutMs: 8000 });
    if (result.success) return result.reading;
    if (result.reading) return result.reading;
    return null;
  } catch {
    return null;
  }
}
