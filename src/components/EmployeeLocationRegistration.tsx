import { useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { startEmployeeLocation, stopEmployeeLocation, subscribeLocationDiagnostics, maintainEmployeeLocation, type LocationDiagnostics } from '@/services/employeeLocation';

/** Tracks the existing authenticated session without changing login or workspace routing. */
export function EmployeeLocationRegistration() {
  const {user, token, loading} = useAuth();
  const [state, setState] = useState<LocationDiagnostics>({status:'stopped',reason:'',lastSyncedAt:null,sync:'unknown'});
  const insets = useSafeAreaInsets();
  useEffect(() => subscribeLocationDiagnostics(setState), []);
  useEffect(() => {
    if (loading) return;
    if (!user || !token) { void stopEmployeeLocation(false); return; }
    void startEmployeeLocation(user.id);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void startEmployeeLocation(user.id, false);
    });
    // Android native callbacks collect GPS in the background. This timer only retries an
    // existing queue/checks expiry while foregrounded; it never requests GPS positions.
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void maintainEmployeeLocation(user.id);
    }, 30000);
    return () => { subscription.remove(); clearInterval(timer); void stopEmployeeLocation(false); };
  }, [loading, user?.id, token]);
  if (!user) return null;
  const message = state.reason === 'PERMISSION_DENIED' ? 'Location permission required' : state.reason === 'GPS_UNAVAILABLE' ? 'GPS unavailable'
    : state.status === 'unsupported' ? 'Location unavailable — check native build' : state.status === 'ready' ? (state.lowPower ? 'Work location · power saving' : 'Work location enabled') : 'Work location paused';
  return <View pointerEvents="none" style={[styles.notice, {top:insets.top + 4}]} accessibilityLiveRegion="polite"><Text style={styles.text}>{message} · {state.sync === 'offline' ? 'Waiting to sync' : state.sync === 'error' ? 'Sync failed; will retry' : state.sync === 'pending' ? 'Sync pending' : 'Last sync: ' + (state.lastSyncedAt ? new Date(state.lastSyncedAt).toLocaleTimeString() : 'not yet')}</Text></View>;
}
const styles = StyleSheet.create({
  notice:{position:'absolute', alignSelf:'center', maxWidth:'94%', zIndex:1000, backgroundColor:'#fff4dc', borderColor:'#dfb65c', borderWidth:1, borderRadius:8, paddingHorizontal:14, paddingVertical:8},
  text:{color:'#60430b', fontSize:13},
});
