import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from './api';

export type CallPayload = {
  client_event_id: string; lead?: number; phone_number?: string;
  started_at: string; ended_at: string; duration_seconds: number;
  outcome: string; notes: string; callback_at?: string;
};
export type CallDraft = {
  id: string; userId: number; phone: string; name: string; leadId?: string;
  direct: boolean; startedAt?: string; endedAt?: string; durationSeconds?: number;
  outcome?: string; notes?: string; callbackAt?: string; payload?: CallPayload;
};
const prefix = (userId: number) => `@call-draft:${encodeURIComponent(API_BASE_URL)}:${userId}:`;
const key = (userId: number, id: string) => prefix(userId) + id;
let writes: Promise<unknown> = Promise.resolve();
function serialize<T>(action: () => Promise<T>): Promise<T> {
  const next = writes.then(action, action);
  writes = next.catch(() => {});
  return next;
}
// A random UUID for deduplication only; never used as a credential.
export const newCallId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const n = Math.floor(Math.random() * 16);
  return (c === 'x' ? n : (n & 3) | 8).toString(16);
});
export async function readCallDraft(userId: number, id: string): Promise<CallDraft | null> {
  await writes;
  const value = await AsyncStorage.getItem(key(userId, id));
  return value ? JSON.parse(value) : null;
}
export function saveCallDraft(draft: CallDraft) {
  return serialize(() => AsyncStorage.setItem(key(draft.userId, draft.id), JSON.stringify(draft)));
}
export function patchCallDraft(userId: number, id: string, patch: Partial<CallDraft>) {
  return serialize(async () => {
    const value = await AsyncStorage.getItem(key(userId, id));
    if (!value) throw new Error('Call draft is missing. Please return to the dialer.');
    const draft: CallDraft = JSON.parse(value);
    await AsyncStorage.setItem(key(userId, id), JSON.stringify({ ...draft, ...patch, id, userId }));
  });
}
export function removeCallDraft(userId: number, id: string) {
  return serialize(() => AsyncStorage.removeItem(key(userId, id)));
}
export async function listCallDrafts(userId: number): Promise<CallDraft[]> {
  await writes;
  const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(prefix(userId)));
  return (await AsyncStorage.multiGet(keys)).flatMap(([, value]) => value ? [JSON.parse(value) as CallDraft] : []);
}
