import { Platform } from 'react-native';
import * as FS from 'expo-file-system/legacy';
import { API_BASE_URL, apiAuthHeaders, apiDownloadFile } from './api';
import type { NoticeAttachment } from './notices';

const inFlight = new Map<string, Promise<void>>();
const activeDirectories = new Set<string>();
const MAX_CACHE_AGE_SECONDS = 24 * 60 * 60;

function endpoint(noticeId: number, attachmentId: number) {
  if (![noticeId, attachmentId].every(id => Number.isSafeInteger(id) && id > 0)) throw new Error('Invalid attachment.');
  return `/mobile/notices/${noticeId}/attachments/${attachmentId}/download/`;
}

// Never attach credentials to a file_url supplied by a notice or to a storage host.
export function noticeAttachmentImageSource(noticeId: number, attachmentId: number, token: string) {
  return { uri: `${API_BASE_URL}${endpoint(noticeId, attachmentId)}`, headers: apiAuthHeaders(token) };
}

export function safeAttachmentFilename(name: string, mime: string) {
  const base = (name || '').split(/[\\/]/).pop()!
    .replace(/[\u0000-\u001f\u007f<>:"|?*%#\u202a-\u202e\u2066-\u2069]/g, '_').replace(/^[.\s]+|[.\s]+$/g, '');
  const extension = base.match(/\.[a-zA-Z0-9]{1,10}$/)?.[0] ||
    (({ 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' } as Record<string, string>)[mime] || '');
  const stem = extension && base.toLowerCase().endsWith(extension.toLowerCase()) ? base.slice(0, -extension.length) : base;
  // At most 240 UTF-8 bytes before the extension, including non-Latin filenames.
  return `${Array.from(stem || 'attachment').slice(0, 60).join('')}${extension}`;
}

function cacheRoot() {
  if (!FS.cacheDirectory) throw new Error('Attachment storage is unavailable. Please restart the app.');
  return `${FS.cacheDirectory}notice-attachments/`;
}

/** Remove abandoned downloads after crashes, without deleting files being viewed. */
export async function cleanupNoticeAttachmentCache() {
  try {
    const root = cacheRoot();
    if (!(await FS.getInfoAsync(root)).exists) return;
    for (const name of await FS.readDirectoryAsync(root)) {
      if (!/^notice-\d+-\d+-\d+-[a-z0-9]+$/.test(name)) continue;
      const dir = `${root}${name}/`;
      if (activeDirectories.has(dir)) continue;
      const info = await FS.getInfoAsync(dir);
      if (info.exists && info.modificationTime < Date.now() / 1000 - MAX_CACHE_AGE_SECONDS) {
        await FS.deleteAsync(dir, { idempotent: true });
      }
    }
  } catch { /* Cache maintenance must not prevent opening a notice. */ }
}

async function downloadAndOpen(noticeId: number, attachment: NoticeAttachment, token: string, signal?: AbortSignal) {
  if (Platform.OS !== 'android') throw new Error('Opening notice attachments is currently supported on Android.');
  // Lazy loading keeps older native builds usable and surfaces a friendly error on tap.
  let launcher: typeof import('expo-intent-launcher');
  try { launcher = await import('expo-intent-launcher'); }
  catch { throw new Error('This app build needs the attachment viewer update. Please install the updated Vaani app.'); }
  if (signal?.aborted) return;
  const path = endpoint(noticeId, attachment.id);
  await cleanupNoticeAttachmentCache();
  const dir = `${cacheRoot()}notice-${noticeId}-${attachment.id}-${Date.now()}-${Math.random().toString(36).slice(2)}/`;
  activeDirectories.add(dir);
  try {
    await FS.makeDirectoryAsync(dir, { intermediates: true });
    const mime = attachment.mime_type.toLowerCase().split(';')[0].trim();
    const uri = `${dir}${safeAttachmentFilename(attachment.original_filename, mime)}`;
    const result = await apiDownloadFile(path, uri, token, signal);
    if (signal?.aborted) return;
    const info = await FS.getInfoAsync(uri);
    if (!info.exists || info.isDirectory || info.size === 0) throw new Error('The attachment is empty or incomplete. Please try again.');
    const responseType = (result.mimeType || Object.entries(result.headers || {}).find(([key]) => key.toLowerCase() === 'content-type')?.[1] || mime).split(';')[0].trim().toLowerCase();
    if (['text/html', 'application/json'].includes(responseType) || (responseType !== mime && responseType !== 'application/octet-stream')) {
      throw new Error('The server did not return the expected attachment. Please try again.');
    }
    const contentUri = await FS.getContentUriAsync(uri);
    if (signal?.aborted) return;
    try {
      // Grant only temporary read access to the local file. No URL or token goes to the viewer.
      await launcher.startActivityAsync('android.intent.action.VIEW', { data: contentUri, type: mime, flags: 1 });
    } catch {
      throw new Error('Could not open the attachment. Install a compatible PDF or image viewer, then try again.');
    }
  } finally {
    // startActivityAsync resolves after the viewer returns, not immediately on launch.
    await FS.deleteAsync(dir, { idempotent: true }).catch(() => {});
    activeDirectories.delete(dir);
  }
}

export function openNoticeAttachment(noticeId: number, attachment: NoticeAttachment, token: string, signal?: AbortSignal) {
  const key = `${token}:${noticeId}:${attachment.id}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const operation = downloadAndOpen(noticeId, attachment, token, signal).finally(() => inFlight.delete(key));
  inFlight.set(key, operation);
  return operation;
}
