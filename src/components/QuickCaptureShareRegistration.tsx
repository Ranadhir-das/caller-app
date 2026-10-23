import { isCounselorCapable } from '@/services/capabilities';
import { useEffect } from 'react';
import { router, usePathname } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import {
  addShareIntentListener,
  getInitialShareIntent,
  type ShareIntentEvent,
} from '../../modules/quick-capture/src';

/** Route image shares before the capture screen has mounted; it consumes the image. */
export function QuickCaptureShareRegistration() {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (loading || !user || !isCounselorCapable(user) || user.needs_onboarding) return;
    let active = true;
    let navigating = false;
    const openCapture = (event: ShareIntentEvent | null) => {
      if (!active || navigating || !event?.uri || !event.mimeType.startsWith('image/')) return;
      if (pathname === '/counselor/quick-capture') return;
      navigating = true;
      router.push('/counselor/quick-capture' as never);
    };
    const subscription = addShareIntentListener(openCapture);
    void getInitialShareIntent().then(openCapture).catch(() => {});
    return () => {
      active = false;
      subscription.remove();
    };
  }, [user, loading, pathname]);

  return null;
}
