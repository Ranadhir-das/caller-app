import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import {
  startEmployeeLocation,
  stopEmployeeLocation,
  maintainEmployeeLocation,
} from '@/services/employeeLocation';

/** Tracks the existing authenticated session without changing login or workspace routing. */
export function EmployeeLocationRegistration() {
  const { user, token, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user || !token) {
      void stopEmployeeLocation(false);
      return;
    }
    void startEmployeeLocation(user.id);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void startEmployeeLocation(user.id, false);
    });
    // Android native callbacks collect GPS in the background. This timer only retries an
    // existing queue/checks expiry while foregrounded; it never requests GPS positions.
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void maintainEmployeeLocation(user.id);
    }, 30000);
    return () => {
      subscription.remove();
      clearInterval(timer);
      void stopEmployeeLocation(false);
    };
  }, [loading, user, token]);

  return null;
}
