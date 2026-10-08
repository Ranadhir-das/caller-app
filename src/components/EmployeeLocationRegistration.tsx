import { useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { startEmployeeLocation, stopEmployeeLocation, subscribeLocationStatus, maintainEmployeeLocation } from '@/services/employeeLocation';

/** Tracks the existing authenticated session without changing login or workspace routing. */
export function EmployeeLocationRegistration() {
  const {user, token, loading} = useAuth();
  const [unavailable, setUnavailable] = useState(false);
  const insets = useSafeAreaInsets();
  useEffect(() => subscribeLocationStatus(status => setUnavailable(status === 'unavailable')), []);
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
      if (AppState.currentState === 'active') void maintainEmployeeLocation();
    }, 30000);
    return () => { subscription.remove(); clearInterval(timer); void stopEmployeeLocation(false); };
  }, [loading, user?.id, token]);
  if (!user || !unavailable) return null;
  return <View pointerEvents="none" style={[styles.notice, {top:insets.top + 4}]} accessibilityLiveRegion="polite"><Text style={styles.text}>Please enable location.</Text></View>;
}
const styles = StyleSheet.create({
  notice:{position:'absolute', alignSelf:'center', zIndex:1000, backgroundColor:'#fff4dc', borderColor:'#dfb65c', borderWidth:1, borderRadius:8, paddingHorizontal:14, paddingVertical:8},
  text:{color:'#60430b', fontSize:13},
});
