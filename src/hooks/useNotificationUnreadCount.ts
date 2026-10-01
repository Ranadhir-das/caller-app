import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { getUnreadCount, subscribeNotificationCenter } from '@/services/notificationCenter';

export function useNotificationUnreadCount() {
  const { token } = useAuth();
  const [count, setCount] = useState(0);
  useFocusEffect(useCallback(() => {
    setCount(0);
    if (!token) return;
    let controller: AbortController | undefined;
    const refresh = () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      void getUnreadCount(token, request.signal).then(value => {
        if (!request.signal.aborted) setCount(value);
      }).catch(() => {});
    };
    refresh();
    const unsubscribe = subscribeNotificationCenter(refresh);
    const state = AppState.addEventListener('change', value => { if (value === 'active') refresh(); });
    return () => { controller?.abort(); unsubscribe(); state.remove(); };
  }, [token]));
  return count;
}
