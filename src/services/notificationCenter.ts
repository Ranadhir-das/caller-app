import { apiRequest } from './api';

export interface CallerNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: CallerNotification[];
}

export function positiveNotificationId(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  return /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
}

const changed = new Set<() => void>();
export function notificationCenterChanged() { changed.forEach(listener => listener()); }
export function subscribeNotificationCenter(listener: () => void) {
  changed.add(listener);
  return () => { changed.delete(listener); };
}

export function getNotifications(token: string, page = 1, signal?: AbortSignal) {
  // Construct only our own relative URL; never forward auth to a pagination URL.
  return apiRequest<NotificationPage>(`/mobile/notifications/?page=${page}`, { token, signal });
}

export async function getUnreadCount(token: string, signal?: AbortSignal) {
  const result = await apiRequest<{ unread_count: number }>('/mobile/notifications/unread-count/', { token, signal });
  if (!Number.isSafeInteger(result.unread_count) || result.unread_count < 0) throw new Error('Invalid unread count.');
  return result.unread_count;
}

export async function markNotificationRead(token: string, id: unknown, signal?: AbortSignal) {
  const validId = positiveNotificationId(id);
  if (!validId) return null;
  const result = await apiRequest<CallerNotification>(`/mobile/notifications/${validId}/read/`, {
    token, method: 'POST', signal,
  });
  notificationCenterChanged();
  return result;
}

export async function markAllNotificationsRead(token: string, signal?: AbortSignal) {
  const result = await apiRequest<{ updated: number }>('/mobile/notifications/read-all/', {
    token, method: 'POST', signal,
  });
  notificationCenterChanged();
  return result;
}

/** Old/malformed payloads still open a valid lead; read failures never block taps. */
export async function markPushNotificationRead(token: string, data: Record<string, unknown>, signal?: AbortSignal) {
  if (!['LEAD_ASSIGNED', 'TEAM_CHAT', 'NOTICE', 'FOLLOWUP_DUE'].includes(String(data.type))) return;
  try { await markNotificationRead(token, data.notification_id, signal); }
  catch { if (__DEV__) console.warn('[Notifications] Could not mark notification read.'); }
}

export function unreadBadge(count: number) { return count > 99 ? '99+' : count > 0 ? String(count) : ''; }
