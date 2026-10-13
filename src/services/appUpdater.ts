import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import * as FS from 'expo-file-system/legacy';
import { ApiError, apiRequest } from './api';

export type UpdateInfo = { latest_version: string; version_code: number; minimum_version_code: number; mandatory: boolean; download_url: string; release_notes: string[] };
export type InstalledApp = { version: string; versionCode: number; packageName: string };
export type UpdateStatus = 'checking' | 'up_to_date' | 'update_available' | 'downloading' | 'downloaded' | 'installing' | 'error';
type Installer = {
  getInstalledAppInfo(): Promise<InstalledApp>;
  validateApk(uri: string, code: number): Promise<boolean>;
  installApk(uri: string, code: number): Promise<'permission_required' | 'installer_opened'>;
  openInstallSettings(): Promise<void>;
};
export type UpdateState = { status: UpdateStatus; current?: InstalledApp; info?: UpdateInfo; progress?: number; bytes?: number; error?: string; message?: string; permissionRequired?: boolean; fileUri?: string };
let state: UpdateState = { status: 'checking' };
let busy = false;
const listeners = new Set<() => void>();
export const getUpdateState = () => state;
export const subscribeToUpdates = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const update = (patch: Partial<UpdateState>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
function native(): Installer {
  if (Platform.OS !== 'android') throw new Error('APK updates are available on Android only.');
  const module = requireOptionalNativeModule<Installer>('ApkUpdater');
  if (!module) throw new Error('This build does not include the APK installer. Install the new updater-enabled APK manually once.');
  return module;
}
function paths() {
  if (!FS.cacheDirectory) throw new Error('Update storage is unavailable.');
  const dir = FS.cacheDirectory + 'apk-updates/';
  return { dir, apk: dir + 'vaani-latest.apk', partial: dir + 'vaani-latest.part.apk' };
}
export function parseUpdateInfo(value: unknown): UpdateInfo {
  const x = value as UpdateInfo;
  if (!x || typeof x.latest_version !== 'string' || !x.latest_version.trim() || !Number.isSafeInteger(x.version_code) || x.version_code < 1 ||
      !Number.isSafeInteger(x.minimum_version_code) || x.minimum_version_code < 1 || x.minimum_version_code > x.version_code || typeof x.mandatory !== 'boolean') {
    throw new Error('The update server returned invalid version information.');
  }
  let url: URL;
  try { url = new URL(x.download_url); } catch { throw new Error('The update server returned an invalid APK URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('The APK URL must use HTTPS without credentials or query parameters.');
  if (x.release_notes !== undefined && (!Array.isArray(x.release_notes) || x.release_notes.some(note => typeof note !== 'string'))) throw new Error('Invalid release notes.');
  return { ...x, release_notes: x.release_notes || [] };
}
export const hasNewerVersion = (current: InstalledApp, info: UpdateInfo) => info.version_code > current.versionCode;
const fail = (error: unknown) => update({ status: 'error', error: error instanceof Error ? error.message : 'The update could not be completed. Please retry.' });

export async function getAppUpdateInfo(token?: string): Promise<void> {
  if (busy) return;
  busy = true;
  // A failed new check must not leave an older release installable/downloadable.
  // Keep the cache on disk so a later successful check can validate it again.
  update({ status: 'checking', info: undefined, fileUri: undefined, progress: undefined, bytes: undefined,
    error: undefined, message: undefined, permissionRequired: false });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const current = await native().getInstalledAppInfo();
    update({ current });
    const info = parseUpdateInfo(await apiRequest('/mobile/app-update/', { token, signal: controller.signal, suppressErrorLog: true }));
    update({ info, fileUri: undefined });
    if (!hasNewerVersion(current, info)) { update({ status: 'up_to_date' }); return; }
    const fileUri = paths().apk;
    const file = await FS.getInfoAsync(fileUri);
    if (file.exists && !file.isDirectory && file.size > 0) {
      try {
        await native().validateApk(fileUri, info.version_code);
        update({ status: 'downloaded', fileUri }); return;
      } catch { /* Old/incomplete APK cannot be offered for installation. */ }
    }
    update({ status: 'update_available' });
  } catch (error) {
    fail(error instanceof ApiError && error.status === 503
      ? new Error('The CRM has not configured a downloadable update yet. Contact your administrator to publish the release version and APK URL.')
      : error);
  }
  finally { clearTimeout(timer); busy = false; }
}

export async function downloadLatestApk(): Promise<void> {
  if (busy || !state.info || !state.current || !hasNewerVersion(state.current, state.info)) return;
  busy = true;
  const info = state.info;
  let partial: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancellation: Promise<void> | undefined;
  update({ status: 'downloading', progress: undefined, bytes: 0, error: undefined, fileUri: undefined, message: undefined });
  try {
    const p = paths(); partial = p.partial;
    await FS.makeDirectoryAsync(p.dir, { intermediates: true });
    await FS.deleteAsync(p.partial, { idempotent: true });
    const task = FS.createDownloadResumable(info.download_url, p.partial, {}, progress => {
      update({ bytes: progress.totalBytesWritten, progress: progress.totalBytesExpectedToWrite > 0 ? Math.min(1, progress.totalBytesWritten / progress.totalBytesExpectedToWrite) : undefined });
    });
    // The public APK request never receives the employee's authentication header.
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        cancellation = task.cancelAsync().catch(() => {});
        void cancellation.then(() => reject(new Error('Download timed out. Check your connection and retry.')));
      }, 10 * 60 * 1000);
    });
    const result = await Promise.race([task.downloadAsync(), timeout]);
    if (!result) throw new Error('APK download was interrupted. Please retry.');
    if (result.status === 404) throw new Error('The published APK download link was not found (HTTP 404). Contact your administrator to correct the release download URL.');
    if (result.status === 401 || result.status === 403) throw new Error('The APK download link is not publicly accessible. Contact your administrator.');
    if (result.status !== 200) throw new Error(`APK download failed (HTTP ${result.status}). Please retry.`);
    const file = await FS.getInfoAsync(p.partial);
    if (!file.exists || file.isDirectory || file.size <= 0) throw new Error('The downloaded APK is missing or empty. Please retry.');
    const headers = Object.fromEntries(Object.entries(result.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
    const expectedBytes = Number(headers['content-length']);
    // Content-Length describes the transferred representation; compare only when
    // the server did not compress it. Android still validates the actual APK below.
    if ((!headers['content-encoding'] || headers['content-encoding'] === 'identity') &&
        Number.isSafeInteger(expectedBytes) && expectedBytes > 0 && file.size !== expectedBytes) {
      throw new Error('The APK download is incomplete. Check your connection and download it again.');
    }
    await native().validateApk(p.partial, info.version_code);
    await FS.deleteAsync(p.apk, { idempotent: true });
    await FS.moveAsync({ from: p.partial, to: p.apk });
    update({ status: 'downloaded', fileUri: p.apk, progress: 1 });
  } catch (error) {
    await cancellation;
    if (partial) await FS.deleteAsync(partial, { idempotent: true }).catch(() => {});
    fail(error);
  } finally { if (timer) clearTimeout(timer); busy = false; }
}

export async function installDownloadedApk(): Promise<void> {
  if (busy || !state.info || !state.fileUri) return;
  busy = true;
  update({ status: 'installing', error: undefined, permissionRequired: false });
  try {
    const file = await FS.getInfoAsync(state.fileUri);
    if (!file.exists || file.isDirectory || file.size <= 0) {
      update({ fileUri: undefined }); throw new Error('APK was removed from cache. Download the update again.');
    }
    const result = await native().installApk(state.fileUri, state.info.version_code);
    update({ status: 'downloaded', permissionRequired: result === 'permission_required', message: result === 'permission_required'
      ? 'Allow Vaani to install unknown apps in Android Settings, return here, then tap Install Update.'
      : 'Android installer opened. Confirm there to update. If you cancel, Vaani keeps working and you can tap Install Update again.' });
  } catch (error) { fail(error); }
  finally { busy = false; }
}
export async function openInstallPermissionSettings(): Promise<void> {
  try { await native().openInstallSettings(); } catch (error) { fail(error); }
}
