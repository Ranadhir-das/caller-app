import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import * as FS from 'expo-file-system/legacy';
import { ApiError, apiRequest } from './api';

export type UpdateInfo = {
  version: string;
  versionCode: number;
  apkUrl: string;
  releaseNotes: string[];
  mandatory: boolean;
  sha256?: string;
  minimumSupportedVersionCode?: number;
  // Legacy aliases for backward compatibility
  latest_version: string;
  version_code: number;
  download_url: string;
  release_notes: string[];
  minimum_version_code: number;
};

export type InstalledApp = { version: string; versionCode: number; packageName: string };
export type UpdateStatus = 'checking' | 'up_to_date' | 'update_available' | 'downloading' | 'downloaded' | 'installing' | 'error';

type Installer = {
  getInstalledAppInfo(): Promise<InstalledApp>;
  validateApk(uri: string, code: number, sha256?: string): Promise<boolean>;
  installApk(uri: string, code: number, sha256?: string): Promise<'permission_required' | 'installer_opened'>;
  openInstallSettings(): Promise<void>;
  getApkSha256?(uri: string): Promise<string>;
};

export type UpdateState = {
  status: UpdateStatus;
  current?: InstalledApp;
  info?: UpdateInfo;
  progress?: number;
  bytes?: number;
  error?: string;
  message?: string;
  permissionRequired?: boolean;
  fileUri?: string;
};

export const DEFAULT_UPDATE_METADATA_URL = 'https://vaaniapp.co.in/app/download/latest.json';

let state: UpdateState = { status: 'checking' };
let busy = false;
const listeners = new Set<() => void>();

export const getUpdateState = () => state;
export const subscribeToUpdates = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const update = (patch: Partial<UpdateState>) => {
  state = { ...state, ...patch };
  listeners.forEach(fn => fn());
};

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
  if (!value || typeof value !== 'object') {
    throw new Error('The update server returned invalid version information.');
  }
  const obj = value as Record<string, unknown>;

  const rawVersion = typeof obj.version === 'string' ? obj.version : obj.latest_version;
  if (typeof rawVersion !== 'string' || !rawVersion.trim()) {
    throw new Error('The update server returned invalid version information.');
  }
  const version = rawVersion.trim();

  const rawCode = obj.versionCode !== undefined ? obj.versionCode : obj.version_code;
  const versionCode = typeof rawCode === 'number' ? rawCode : Number(rawCode);
  if (!Number.isSafeInteger(versionCode) || versionCode < 1) {
    throw new Error('The update server returned invalid version information.');
  }

  const rawMinCode =
    obj.minimumSupportedVersionCode !== undefined
      ? obj.minimumSupportedVersionCode
      : obj.minimum_version_code !== undefined
      ? obj.minimum_version_code
      : 1;
  const minCode = typeof rawMinCode === 'number' ? rawMinCode : Number(rawMinCode);
  if (!Number.isSafeInteger(minCode) || minCode < 1 || minCode > versionCode) {
    throw new Error('The update server returned invalid version information.');
  }

  const mandatory = typeof obj.mandatory === 'boolean' ? obj.mandatory : false;

  const rawUrl = typeof obj.apkUrl === 'string' ? obj.apkUrl : obj.download_url;
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error('The update server returned an invalid APK URL.');
  }
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error('The update server returned an invalid APK URL.');
  }

  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('The APK URL must use HTTPS without credentials or query parameters.');
  }

  // Trusted host verification: only allow production host (plus standard local hosts in dev/test)
  const trustedHosts = ['vaaniapp.co.in', 'www.vaaniapp.co.in'];
  const isDevOrTest = (typeof __DEV__ !== 'undefined' && __DEV__) || (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test');
  if (isDevOrTest) {
    trustedHosts.push('localhost', '127.0.0.1', '10.0.2.2', 'example.com');
  }
  if (!trustedHosts.includes(url.hostname)) {
    throw new Error('The APK URL must point to the trusted production domain.');
  }

  let releaseNotes: string[] = [];
  const rawNotes = obj.releaseNotes !== undefined ? obj.releaseNotes : obj.release_notes;
  if (typeof rawNotes === 'string') {
    releaseNotes = rawNotes.trim() ? [rawNotes.trim()] : [];
  } else if (Array.isArray(rawNotes)) {
    if (rawNotes.some(note => typeof note !== 'string')) {
      throw new Error('Invalid release notes.');
    }
    releaseNotes = rawNotes;
  } else if (rawNotes !== undefined && rawNotes !== null) {
    throw new Error('Invalid release notes.');
  }

  let sha256: string | undefined = undefined;
  if (obj.sha256 !== undefined && obj.sha256 !== null) {
    if (typeof obj.sha256 !== 'string' || !/^[a-fA-F0-9]{64}$/.test(obj.sha256.trim())) {
      throw new Error('The update server returned an invalid SHA-256 checksum.');
    }
    sha256 = obj.sha256.trim().toLowerCase();
  }

  return {
    version,
    versionCode,
    apkUrl: url.toString(),
    releaseNotes,
    mandatory,
    sha256,
    minimumSupportedVersionCode: minCode,
    latest_version: version,
    version_code: versionCode,
    download_url: url.toString(),
    release_notes: releaseNotes,
    minimum_version_code: minCode,
  };
}

export const hasNewerVersion = (current: InstalledApp, info: UpdateInfo) => info.versionCode > current.versionCode;
const fail = (error: unknown) =>
  update({
    status: 'error',
    error: error instanceof Error ? error.message : 'The update could not be completed. Please retry.',
  });

export async function fetchUpdateMetadata(token?: string, signal?: AbortSignal): Promise<UpdateInfo> {
  // 1. Try static HTTPS metadata at /app/download/latest.json
  if (typeof fetch === 'function') {
    try {
      const res = await fetch(DEFAULT_UPDATE_METADATA_URL, {
        method: 'GET',
        headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache' },
        signal,
      });
      if (res.ok) {
        const json = await res.json();
        return parseUpdateInfo(json);
      }
      if (res.status === 503) {
        throw new Error('The CRM has not configured a downloadable update yet. Contact your administrator to publish the release version and APK URL.');
      }
      // If 404 or other non-OK, continue to fallback below if token is provided
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      if (err instanceof Error && (err.message.includes('CRM has not configured') || err.message.includes('invalid') || err.message.includes('APK URL'))) {
        throw err;
      }
      // If offline / network error without token, rethrow friendly error
      if (!token) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('failed to fetch')) {
          throw new Error('Network unavailable. Check your connection and retry.');
        }
      }
    }
  }

  // 2. Fallback to authenticated CRM API if available
  try {
    const data = await apiRequest('/mobile/app-update/', { token, signal, suppressErrorLog: true });
    return parseUpdateInfo(data);
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) {
      throw new Error('The CRM has not configured a downloadable update yet. Contact your administrator to publish the release version and APK URL.');
    }
    if (error instanceof ApiError && error.status === 404) {
      throw new Error('Update server is currently unavailable. Contact your administrator.');
    }
    const msg = error instanceof Error ? error.message : '';
    if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('connection')) {
      throw new Error('Network unavailable. Check your connection and retry.');
    }
    throw error;
  }
}

export async function getAppUpdateInfo(token?: string): Promise<void> {
  if (busy) return;
  busy = true;
  update({
    status: 'checking',
    info: undefined,
    fileUri: undefined,
    progress: undefined,
    bytes: undefined,
    error: undefined,
    message: undefined,
    permissionRequired: false,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const current = await native().getInstalledAppInfo();
    update({ current });
    const info = await fetchUpdateMetadata(token, controller.signal);
    update({ info, fileUri: undefined });
    if (!hasNewerVersion(current, info)) {
      update({ status: 'up_to_date' });
      return;
    }
    const fileUri = paths().apk;
    const file = await FS.getInfoAsync(fileUri);
    if (file.exists && !file.isDirectory && file.size > 0) {
      try {
        await native().validateApk(fileUri, info.versionCode, info.sha256);
        update({ status: 'downloaded', fileUri });
        return;
      } catch {
        /* Old/incomplete APK cannot be offered for installation. */
      }
    }
    update({ status: 'update_available' });
  } catch (error) {
    fail(error);
  } finally {
    clearTimeout(timer);
    busy = false;
  }
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
    const p = paths();
    partial = p.partial;
    await FS.makeDirectoryAsync(p.dir, { intermediates: true });
    await FS.deleteAsync(p.partial, { idempotent: true });
    const task = FS.createDownloadResumable(info.apkUrl, p.partial, {}, progress => {
      update({
        bytes: progress.totalBytesWritten,
        progress: progress.totalBytesExpectedToWrite > 0 ? Math.min(1, progress.totalBytesWritten / progress.totalBytesExpectedToWrite) : undefined,
      });
    });
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
    if ((!headers['content-encoding'] || headers['content-encoding'] === 'identity') &&
        Number.isSafeInteger(expectedBytes) && expectedBytes > 0 && file.size !== expectedBytes) {
      throw new Error('The APK download is incomplete. Check your connection and download it again.');
    }
    await native().validateApk(p.partial, info.versionCode, info.sha256);
    await FS.deleteAsync(p.apk, { idempotent: true });
    await FS.moveAsync({ from: p.partial, to: p.apk });
    update({ status: 'downloaded', fileUri: p.apk, progress: 1 });
  } catch (error) {
    await cancellation;
    if (partial) await FS.deleteAsync(partial, { idempotent: true }).catch(() => {});
    fail(error);
  } finally {
    if (timer) clearTimeout(timer);
    busy = false;
  }
}

export async function installDownloadedApk(): Promise<void> {
  if (busy || !state.info || !state.fileUri) return;
  busy = true;
  update({ status: 'installing', error: undefined, permissionRequired: false });
  try {
    const file = await FS.getInfoAsync(state.fileUri);
    if (!file.exists || file.isDirectory || file.size <= 0) {
      update({ fileUri: undefined });
      throw new Error('APK was removed from cache. Download the update again.');
    }
    const result = await native().installApk(state.fileUri, state.info.versionCode, state.info.sha256);
    update({
      status: 'downloaded',
      permissionRequired: result === 'permission_required',
      message:
        result === 'permission_required'
          ? 'Allow Vaani to install unknown apps in Android Settings, return here, then tap Install Update.'
          : 'Android installer opened. Confirm there to update. If you cancel, Vaani keeps working and you can tap Install Update again.',
    });
  } catch (error) {
    fail(error);
  } finally {
    busy = false;
  }
}

export async function openInstallPermissionSettings(): Promise<void> {
  try {
    await native().openInstallSettings();
  } catch (error) {
    fail(error);
  }
}
