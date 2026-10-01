import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import { API_BASE_URL } from './api';
import { patchCallDraft, readCallDraft, removeCallDraft } from './callDrafts';

const active = new Set<string>();

export function localRecording(path: string) {
  // Only the recorder's private directory is eligible for upload or cleanup.
  const raw = path.replace(/^file:\/\//, '');
  if (!/^\/data\/(?:user\/\d+|data)\/[^/]+\/no_backup\/call-recordings\/[^/]+\.m4a$/.test(raw) || raw.includes('..')) {
    throw new Error('Unexpected recording path. The local file was kept.');
  }
  return new File(`file://${raw}`);
}

/** One explicit attempt; pending recordings are never automatically discarded. */
export async function uploadDraftRecording(userId: number, draftId: string, token: string) {
  const key = `${userId}:${draftId}`;
  if (active.has(key)) throw new Error('This recording is already uploading.');
  active.add(key);
  try {
    const draft = await readCallDraft(userId, draftId);
    if (!draft?.savedCallId || !draft.recordingPath) throw new Error('Saved call or recording path is unavailable.');
    const file = localRecording(draft.recordingPath);
    if (draft.recordingStatus !== 'uploaded') {
      await patchCallDraft(userId, draftId, {
        recordingStatus: 'pending', recordingAttempts: (draft.recordingAttempts || 0) + 1,
        recordingQueuedAt: draft.recordingQueuedAt || new Date().toISOString(), recordingError: undefined,
      });
      if (!file.exists || !file.size) throw new Error('Local recording is missing or empty. The saved call is unaffected.');
      const size = file.size;
      const body = new FormData();
      // Expo fetch accepts File/Blob parts, not React Native's legacy { uri } object.
      body.append('recording', file);
      body.append('duration_seconds', String(draft.durationSeconds || 0));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      try {
        console.log('RECORDING_UPLOAD: uploading for call', draft.savedCallId);
        const response = await fetch(`${API_BASE_URL}/calls/${draft.savedCallId}/recording/`, {
          method: 'POST', headers: { Authorization: `Token ${token}`, Accept: 'application/json' },
          body, signal: controller.signal,
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          const detail = result?.detail || result?.recording?.[0] || result?.duration_seconds?.[0];
          throw new Error(`Recording upload failed (HTTP ${response.status}).${typeof detail === 'string' ? ` ${detail}` : ''}`);
        }
        if (result?.call_id !== draft.savedCallId || result?.file_size !== size || !result?.sha256) {
          throw new Error('Upload confirmation did not match this recording. The file was kept.');
        }
        // Persist the server confirmation before attempting local cleanup.
        await patchCallDraft(userId, draftId, { recordingStatus: 'uploaded', recordingError: undefined });
      } finally { clearTimeout(timeout); }
    }
    if (file.exists) file.delete();
    await removeCallDraft(userId, draftId);
    console.log('RECORDING_UPLOAD: confirmed and local file cleaned for call', draft.savedCallId);
  } catch (error) {
    await patchCallDraft(userId, draftId, { recordingError: error instanceof Error ? error.message : 'Upload failed.' }).catch(console.warn);
    throw error;
  } finally { active.delete(key); }
}
