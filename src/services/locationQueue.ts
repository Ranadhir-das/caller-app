import type { LocationObject } from 'expo-location';

export type EmployeeLocationPoint = {
  latitude: number; longitude: number; accuracy: number;
  altitude: number | null; speed: number | null; heading: number | null; recorded_at: string;
};
export type TrackingSession = { session_id: string; started_at: string; expires_at: string; userId: number };
export type LocationQueue = { session: TrackingSession; enabled: boolean; points: EmployeeLocationPoint[]; lastPoint: EmployeeLocationPoint | null };
export const MAX_QUEUE_POINTS = 5000;
export const MAX_QUEUE_AGE_MS = 2 * 24 * 60 * 60 * 1000;

export function distanceMeters(a: EmployeeLocationPoint, b: EmployeeLocationPoint): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad, dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export function queueLocations(queue: LocationQueue, locations: LocationObject[], now = Date.now()): LocationQueue {
  const next = { ...queue, points: queue.points.filter(point => Date.parse(point.recorded_at) >= now - MAX_QUEUE_AGE_MS) };
  for (const location of [...locations].sort((a, b) => a.timestamp - b.timestamp)) {
    const c = location.coords;
    if (![location.timestamp, c.latitude, c.longitude, c.accuracy].every(Number.isFinite)
      || Math.abs(c.latitude) > 90 || Math.abs(c.longitude) > 180 || c.accuracy! < 0 || c.accuracy! > 150
      || location.timestamp < Math.max(Date.parse(queue.session.started_at), now - MAX_QUEUE_AGE_MS)
      || location.timestamp >= Date.parse(queue.session.expires_at) || location.timestamp > now + 60000) continue;
    const point: EmployeeLocationPoint = {
      latitude: c.latitude, longitude: c.longitude, accuracy: c.accuracy!,
      altitude: c.altitude != null && Number.isFinite(c.altitude) && c.altitude >= -15000 && c.altitude <= 100000 ? c.altitude : null,
      speed: c.speed != null && Number.isFinite(c.speed) && c.speed >= 0 && c.speed <= 500 ? c.speed : null,
      heading: c.heading != null && Number.isFinite(c.heading) && c.heading >= 0 && c.heading <= 360 ? c.heading : null,
      recorded_at: new Date(location.timestamp).toISOString(),
    };
    if (next.lastPoint) {
      const elapsed = location.timestamp - Date.parse(next.lastPoint.recorded_at);
      const distance = distanceMeters(next.lastPoint, point);
      const moving = (point.speed ?? 0) >= 0.8 || distance >= Math.max(15, point.accuracy + next.lastPoint.accuracy);
      const significant = distance >= Math.max(30, point.accuracy + next.lastPoint.accuracy);
      if (elapsed <= 0 || elapsed < (significant ? 5000 : moving ? 10000 : 60000)) continue;
    }
    next.points.push(point);
    next.lastPoint = point;
  }
  next.points = next.points.slice(-MAX_QUEUE_POINTS);
  return next;
}

export function acknowledgeLocations(queue: LocationQueue, timestamps: string[]): LocationQueue {
  const accepted = new Set(timestamps.map(Date.parse));
  return { ...queue, points: queue.points.filter(point => !accepted.has(Date.parse(point.recorded_at))) };
}
