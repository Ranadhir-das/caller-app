import { useEffect, useSyncExternalStore } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useAppStyles, type AppColors } from '@/context/AppThemeContext';
import { downloadLatestApk, getAppUpdateInfo, getUpdateState, installDownloadedApk, openInstallPermissionSettings, subscribeToUpdates } from '@/services/appUpdater';

const labels = { checking: 'Checking for updates', up_to_date: 'Your app is up to date', update_available: 'An update is available', downloading: 'Downloading update', downloaded: 'Update ready to install', installing: 'Opening Android installer', error: 'Update could not be completed' };
export function AppUpdatePanel() {
  const { token } = useAuth();
  const state = useSyncExternalStore(subscribeToUpdates, getUpdateState, getUpdateState);
  const styles = useAppStyles(createStyles);
  useEffect(() => {
    if (Platform.OS === 'android' && state.status === 'checking') void getAppUpdateInfo(token || undefined);
    // Registration is local to this panel; download work safely survives panel unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  if (Platform.OS !== 'android') return <Text style={styles.text}>APK updates are available on Android only.</Text>;
  const busy = ['checking', 'downloading', 'installing'].includes(state.status);
  const available = !!state.info && !!state.current && state.info.version_code > state.current.versionCode;
  const button = (label: string, action: () => Promise<void>) => <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} style={[styles.button, busy && styles.disabled]} onPress={() => { void action(); }}><Text style={styles.buttonText}>{label}</Text></Pressable>;
  return <View style={styles.card}>
    <Text style={styles.heading}>App updates</Text>
    <Text style={styles.text}>Current version: {state.current ? `${state.current.version} (${state.current.versionCode})` : 'Not available yet'}</Text>
    <Text style={styles.text}>Latest version: {state.info ? `${state.info.latest_version} (${state.info.version_code})` : 'Check for updates'}</Text>
    <Text accessibilityLiveRegion="polite" style={styles.heading}>{labels[state.status]}</Text>
    {available && state.info && (state.info.mandatory || (state.current?.versionCode || 0) < state.info.minimum_version_code) && <Text style={styles.text}>Your administrator requires this update. Install it when you are ready; your current work will not be interrupted.</Text>}
    {busy && <ActivityIndicator />}
    {state.status === 'downloading' && <View accessibilityRole="progressbar" accessibilityValue={state.progress === undefined ? { text: 'Downloading' } : { min: 0, max: 100, now: Math.round(state.progress * 100) }}>
      <Text style={styles.text}>{state.progress === undefined ? `${((state.bytes || 0) / 1048576).toFixed(1)} MB downloaded` : `${Math.round(state.progress * 100)}% downloaded`}</Text>
      {state.progress !== undefined && <View style={styles.track}><View style={[styles.fill, { width: `${state.progress * 100}%` }]} /></View>}
      <Text style={styles.text}>You can keep using Vaani while this downloads. If Android stops the app, retry the download.</Text>
    </View>}
    {!!state.error && <Text accessibilityRole="alert" style={styles.text}>{state.error}</Text>}
    {!!state.message && <Text style={styles.text}>{state.message}</Text>}
    {button('Check for Update', () => getAppUpdateInfo(token || undefined))}
    {available && !state.fileUri && button(state.status === 'error' ? 'Retry Download' : 'Download Update', downloadLatestApk)}
    {!!state.fileUri && button('Install Update', installDownloadedApk)}
    {state.permissionRequired && button('Open Android install settings', openInstallPermissionSettings)}
    {!!state.info?.release_notes.length && <View style={styles.notes}><Text style={styles.heading}>Release notes</Text>{state.info.release_notes.map((note, index) => <Text style={styles.text} key={index}>{'•'} {note}</Text>)}</View>}
  </View>;
}
const createStyles = (colors: AppColors) => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 18, gap: 12 },
  heading: { color: colors.text, fontSize: 16, fontWeight: '600' },
  text: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  button: { backgroundColor: colors.primary, padding: 13, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: colors.onPrimary, fontWeight: '600' }, disabled: { opacity: 0.5 },
  notes: { gap: 8 }, track: { height: 6, backgroundColor: colors.border, borderRadius: 3, marginVertical: 8 },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
});
