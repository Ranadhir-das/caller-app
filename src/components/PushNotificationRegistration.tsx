import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { setupNotificationListeners } from '@/services/notifications';
import { router, useRootNavigationState } from 'expo-router';
import { websiteLeadNotificationTarget } from '@/services/notificationRouting';
import { markPushNotificationRead } from '@/services/notificationCenter';

/** Observes login/session restoration without participating in authentication. */
export function PushNotificationRegistration() {
  const { token, user, loading } = useAuth();
  const userId = user?.id;
  const navigation = useRootNavigationState();
  const canOpenLead = user?.role === 'CALLER' && !user.needs_onboarding;
  const canOpenCounselor = user?.role === 'COUNSELOR' && !user.needs_onboarding;
  useEffect(() => {
    if (loading || !token || userId == null || !navigation?.key) return;
    let disposed = false;
    const requests = new Set<AbortController>();
    const cleanup = setupNotificationListeners(token, (data, identifier) => {
      const target = websiteLeadNotificationTarget(data, canOpenLead, true, canOpenCounselor);
      if (!target) return false;
      const controller = new AbortController();
      requests.add(controller);
      const timeout = setTimeout(() => controller.abort(), 5000);
      void markPushNotificationRead(token, data, controller.signal).finally(() => {
        clearTimeout(timeout);
        requests.delete(controller);
        if (!disposed) router.push({ ...target, params: {
          ...target.params, notificationId: identifier,
          ...(data.type === 'LEAD_ASSIGNED' || data.type === 'FOLLOWUP_DUE' ? { fromNotification: '1' } : {}),
        } } as never);
      });
      return true;
    });
    return () => { disposed = true; requests.forEach(request => request.abort()); cleanup(); };
  }, [loading, token, userId, navigation?.key, canOpenLead, canOpenCounselor]);
  return null;
}
