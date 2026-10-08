import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Alert, AppState, Platform } from 'react-native';
import { ApiError, apiRequest } from './api';
import { getStoredSessionId, getStoredToken } from './auth';
import { acknowledgeLocations, queueLocations, type LocationQueue, type TrackingSession } from './locationQueue';

export const MOVING_LOCATION_TASK = 'vaani-employee-location-moving-v1';
export const STATIONARY_LOCATION_TASK = 'vaani-employee-location-stationary-v1';
const QUEUE_KEY = 'vaani_employee_location_queue_v1';
const BACKLOG_KEY = 'vaani_employee_location_backlog_v1';
const DISCLOSURE_KEY = 'vaani_location_disclosure_v1';
const TASKS = [MOVING_LOCATION_TASK, STATIONARY_LOCATION_TASK];
type Status = 'ready' | 'unavailable' | 'stopped' | 'unsupported';
let status: Status = 'stopped';
const listeners = new Set<(value: Status) => void>();
let serial: Promise<unknown> = Promise.resolve();
let generation = 0, nextUploadAt = 0, nextBacklogAt = 0, failures = 0;
let lastReportedState = '';
let startup: {userId:number; generation:number; promise:Promise<void>} | null = null;
// Older development binaries may not contain the newly installed native module.
// Register synchronously at bundle scope when available, without breaking their login screen.
let TaskManager: typeof import('expo-task-manager') | null = null;
try { TaskManager = require('expo-task-manager'); } catch { /* A native rebuild is required. */ }

function exclusive<T>(action: () => Promise<T>): Promise<T> {
  const pending = serial.then(action, action);
  serial = pending.catch(() => {});
  return pending;
}
function report(value: Status) { status = value; listeners.forEach(listener => listener(value)); }
export function subscribeLocationStatus(listener: (value: Status) => void) {
  listeners.add(listener); listener(status);
  return () => { listeners.delete(listener); };
}
async function readQueue(): Promise<LocationQueue | null> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as LocationQueue;
    if (!data.session?.session_id || !Number.isFinite(Date.parse(data.session.expires_at)) || !Array.isArray(data.points)) return null;
    return data;
  } catch { return null; }
}
const writeQueue = (queue: LocationQueue) => AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
async function request<T>(endpoint: string, token: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try { return await apiRequest<T>(endpoint, { token, method: body === undefined ? 'GET' : 'POST', body, signal: controller.signal, suppressErrorLog: true }); }
  finally { clearTimeout(timer); }
}
async function stopNative() {
  await Promise.all(TASKS.map(async task => {
    try { if (await Location.hasStartedLocationUpdatesAsync(task)) await Location.stopLocationUpdatesAsync(task); }
    catch { /* Permission revocation or an older native build may already have stopped it. */ }
  }));
}
async function validToken(queue: LocationQueue) {
  const [token, sessionId] = await Promise.all([getStoredToken(), getStoredSessionId()]);
  if (!token || sessionId !== queue.session.session_id || Date.now() >= Date.parse(queue.session.expires_at)) return null;
  return token;
}
async function invalidate() {
  await stopNative();
  // Expiry/revocation stops capture, but retains bounded offline samples for the same
  // employee to acknowledge after authenticating again. Explicit logout clears them.
  const queue = await readQueue();
  if (queue) await writeQueue({...queue, enabled:false});
  lastReportedState = ''; report('stopped');
}
async function readBacklog(userId: number): Promise<LocationQueue[]> {
  try {
    const stored: LocationQueue[] = JSON.parse(await AsyncStorage.getItem(BACKLOG_KEY) || '[]');
    return boundBacklog(stored, userId);
  } catch { return []; }
}
function boundBacklog(stored:LocationQueue[], userId:number):LocationQueue[] {
  let remaining = 5000;
  return stored.filter(queue => queue.session.userId === userId).reverse().map(queue => {
    const bounded = queueLocations(queue, []);
    bounded.points = remaining ? bounded.points.slice(-remaining) : [];
    remaining -= bounded.points.length;
    return bounded;
  }).filter(queue => queue.points.length).reverse();
}
async function flushBacklog(userId:number, token:string, force=false) {
  if (!force && Date.now() < nextBacklogAt) return;
  const backlog = await readBacklog(userId);
  if (!backlog.length) { await AsyncStorage.removeItem(BACKLOG_KEY); return; }
  const before = backlog[0].points.length;
  backlog[0] = await flush(backlog[0], token, true, false);
  nextBacklogAt = Date.now() + (backlog[0].points.length < before ? 5000 : 60000);
  await AsyncStorage.setItem(BACKLOG_KEY, JSON.stringify(backlog.filter(queue => queue.points.length)));
}
async function setServerState(queue: LocationQueue, token: string, state: 'ACTIVE' | 'UNAVAILABLE' | 'STOPPED') {
  if (lastReportedState === `${queue.session.session_id}:${state}`) return;
  await request('/mobile/location/status/', token, {session_id: queue.session.session_id, state});
  lastReportedState = `${queue.session.session_id}:${state}`;
}
async function flush(queue: LocationQueue, token: string, force = false, persist = true): Promise<LocationQueue> {
  if (!force && Date.now() < nextUploadAt) return queue;
  queue = queueLocations(queue, []); // Bound age/size before an upload as well as before appending.
  if (!queue.points.length) return queue;
  try {
    const result = await request<{accepted: string[]}>('/mobile/location/', token, {
      session_id: queue.session.session_id, points: queue.points.slice(0, 100),
    });
    if (!Array.isArray(result.accepted)) throw new Error('Missing acknowledgement');
    queue = acknowledgeLocations(queue, result.accepted);
    if (persist) await writeQueue(queue);
    failures = 0; nextUploadAt = Date.now() + (queue.points.length ? 5000 : 15000);
  } catch (error) {
    if (error instanceof ApiError && [401, 403].includes(error.status)) { await invalidate(); throw error; }
    if (error instanceof ApiError && error.status === 400) {
      const rejected = (error.details as {rejected?:string[]} | undefined)?.rejected;
      if (Array.isArray(rejected)) {
        queue = acknowledgeLocations(queue, rejected);
        if (persist) await writeQueue(queue);
      }
    }
    failures++; nextUploadAt = Date.now() + Math.min(60000, 5000 * 2 ** Math.min(failures, 4));
    // Keep unacknowledged points. Do not log coordinates, request bodies or credentials.
    if (__DEV__) console.info('[Location] Batch retained for retry.');
  }
  return queue;
}

export async function handleLocationUpdates(locations: Location.LocationObject[], taskError = false) {
  return exclusive(async () => {
    let queue = await readQueue();
    if (!queue?.enabled) { await stopNative(); return; }
    const token = await validToken(queue);
    if (!token) { await invalidate(); return; }
    const [foreground, background, gps] = await Promise.all([Location.getForegroundPermissionsAsync(), Location.getBackgroundPermissionsAsync(), Location.hasServicesEnabledAsync()]);
    if (taskError || !gps || foreground.status !== 'granted' || background.status !== 'granted' || foreground.android?.accuracy === 'coarse') {
      report('unavailable');
      await stopNative();
      await setServerState(queue, token, 'UNAVAILABLE').catch(() => {});
      return;
    }
    queue = queueLocations(queue, locations);
    await writeQueue(queue); // Durable before network; overlapping native streams serialize here.
    report('ready');
    try {
      await setServerState(queue, token, 'ACTIVE');
      await flush(queue, token);
      await flushBacklog(queue.session.userId, token);
    } catch (error) {
      if (error instanceof ApiError && [401, 403].includes(error.status)) await invalidate();
    }
  }).catch(() => { if (__DEV__) console.info('[Location] Tracking update could not be processed.'); });
}
if (TaskManager && Platform.OS === 'android') {
  for (const task of TASKS) {
    if (!TaskManager.isTaskDefined(task)) TaskManager.defineTask<{locations: Location.LocationObject[]}>(task,
      async ({data, error}) => handleLocationUpdates(data?.locations ?? [], !!error));
  }
}

async function permissions(prompt: boolean) {
  let foreground = await Location.getForegroundPermissionsAsync();
  if (prompt && foreground.status !== 'granted' && foreground.canAskAgain) foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted' || foreground.android?.accuracy === 'coarse') return false;
  let background = await Location.getBackgroundPermissionsAsync();
  if (prompt && background.status !== 'granted') {
    if (!(await AsyncStorage.getItem(DISCLOSURE_KEY))) {
      const accepted = await new Promise<boolean>(resolve => Alert.alert('Work location',
        'Vaani shares your work location and route with Admin and Super Admin while you are signed in, including when the app is in the background. History is retained for 90 days. Android shows a tracking notification. You can revoke location permission in device settings.',
        [{text:'Not now', onPress:() => resolve(false)}, {text:'Continue', onPress:() => resolve(true)}],
        {cancelable:true, onDismiss:() => resolve(false)}));
      if (!accepted) return false;
      await AsyncStorage.setItem(DISCLOSURE_KEY, 'shown');
    }
    background = await Location.requestBackgroundPermissionsAsync();
  }
  return background.status === 'granted' && await Location.hasServicesEnabledAsync();
}

export function startEmployeeLocation(userId: number, prompt = true): Promise<void> {
  if (startup?.userId === userId && startup.generation === generation) return startup.promise;
  const promise = startSession(userId, prompt).finally(() => { if (startup?.promise === promise) startup = null; });
  startup = {userId, generation, promise};
  return promise;
}

async function startSession(userId: number, prompt: boolean): Promise<void> {
  const attempt = ++generation;
  try {
    if (Platform.OS !== 'android' || !TaskManager || !(await TaskManager.isAvailableAsync())) { report('unsupported'); return; }
    const [token, sessionId] = await Promise.all([getStoredToken(), getStoredSessionId()]);
    if (!token || !sessionId) { await stopEmployeeLocation(false); return; }
    const previous = await readQueue();
    let session: TrackingSession;
    try {
      const remote = await request<Omit<TrackingSession, 'userId'>>('/mobile/location/status/', token);
      if (remote.session_id !== sessionId) { await stopEmployeeLocation(false); return; }
      session = { ...remote, userId };
    } catch (error) {
      if (error instanceof ApiError && [401,403].includes(error.status)) { await stopEmployeeLocation(false); return; }
      if (!previous || previous.session.session_id !== sessionId || previous.session.userId !== userId || Date.parse(previous.session.expires_at) <= Date.now()) return;
      session = previous.session;
    }
    const granted = await permissions(prompt);
    if (attempt !== generation) return;
    await exclusive(async () => {
      if (attempt !== generation) return;
      const existing = await readQueue();
      const backlog = await readBacklog(userId);
      if (existing && existing.session.session_id !== sessionId && existing.session.userId === userId && existing.points.length) {
        const retained = queueLocations(existing, []);
        if (retained.points.length && !backlog.some(item => item.session.session_id === retained.session.session_id)) backlog.push({...retained, enabled:false});
      }
      await AsyncStorage.setItem(BACKLOG_KEY, JSON.stringify(boundBacklog(backlog, userId)));
      const queue: LocationQueue = existing?.session.session_id === sessionId && existing.session.userId === userId
        ? { ...existing, session, enabled:granted } : { session, enabled:granted, points:[], lastPoint:null };
      await writeQueue(queue);
      if (!granted) {
        await stopNative(); report('unavailable');
        await setServerState(queue, token, 'UNAVAILABLE').catch(() => {});
        return;
      }
      if (AppState.currentState !== 'active') return; // Android requires foreground service start from visible app.
      const started = await Promise.all(TASKS.map(task => Location.hasStartedLocationUpdatesAsync(task)));
      if (!started.every(Boolean)) {
        await stopNative();
        // Both requests use Android's fused provider. The moving request requires displacement;
        // the slower balanced request supplies stationary samples without JS GPS polling.
        await Location.startLocationUpdatesAsync(MOVING_LOCATION_TASK, {
          accuracy:Location.Accuracy.High, timeInterval:10000, distanceInterval:15,
          deferredUpdatesInterval:0, deferredUpdatesDistance:0,
          foregroundService:{notificationTitle:'Vaani work location',
            notificationBody:'Location is shared with your administrators while you are signed in.', killServiceOnDestroy:true},
        });
        await Location.startLocationUpdatesAsync(STATIONARY_LOCATION_TASK, {
          accuracy:Location.Accuracy.Balanced, timeInterval:60000, distanceInterval:0,
          deferredUpdatesInterval:0, deferredUpdatesDistance:0,
        });
      }
      report('ready');
      await setServerState(queue, token, 'ACTIVE').catch(() => {});
      await flush(queue, token, true);
      await flushBacklog(userId, token, true);
    });
  } catch {
    await exclusive(async () => {
      if (attempt !== generation) return;
      await stopNative(); report('unsupported');
      const queue = await readQueue();
      if (queue) { queue.enabled = false; await writeQueue(queue); }
    }).catch(() => {});
    if (__DEV__) console.info('[Location] Background tracking unavailable. Check native build and permissions.');
  }
}

export async function stopEmployeeLocation(flushPending = true, clearPending = flushPending): Promise<void> {
  ++generation;
  await exclusive(async () => {
    await stopNative();
    let queue = await readQueue();
    if (queue) {
      queue.enabled = false;
      await writeQueue(queue);
      const token = await validToken(queue);
      if (token) {
        if (flushPending) {
          const deadline = Date.now() + 10000;
          // Drain acknowledged batches while online, without trapping logout on a bad network.
          for (let attempt = 0; queue.points.length && attempt < 100 && Date.now() < deadline; attempt++) {
            const before = queue.points.length;
            queue = await flush(queue, token, true).catch(() => queue!);
            if (queue.points.length >= before) break;
          }
        }
        await setServerState(queue, token, 'STOPPED').catch(() => {});
      }
    }
    // Explicit logout clears unacknowledged points. Expiry/unmount keeps a bounded queue
    // that only the same employee can replay within its original session's time window.
    if (clearPending) {
      await AsyncStorage.removeItem(QUEUE_KEY);
      await AsyncStorage.removeItem(BACKLOG_KEY);
    }
    lastReportedState = ''; nextUploadAt = 0; nextBacklogAt = 0; failures = 0; report('stopped');
  }).catch(() => {});
}

/** Connectivity retries and expiry checks, not a GPS polling loop. */
export async function maintainEmployeeLocation() {
  await handleLocationUpdates([]);
}
