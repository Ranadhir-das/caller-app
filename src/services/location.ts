import * as Location from "expo-location";

export type Coords = { latitude: number; longitude: number };

/**
 * Best-effort GPS fix for attendance login. Never throws and never blocks login:
 * a denied permission or a timed-out fix just means the session is recorded
 * without a location, not that sign-in fails.
 */
export async function getCurrentCoords(): Promise<Coords | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  } catch {
    return null;
  }
}
