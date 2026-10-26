import { useEffect, useSyncExternalStore } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useAppStyles, type AppColors } from '@/context/AppThemeContext';
import {
  downloadLatestApk,
  getAppUpdateInfo,
  getUpdateState,
  installDownloadedApk,
  openInstallPermissionSettings,
  subscribeToUpdates,
} from '@/services/appUpdater';

const labels: Record<string, string> = {
  checking: 'Checking for updates...',
  up_to_date: 'You’re using the latest version',
  update_available: 'A newer version is available',
  downloading: 'Downloading update...',
  downloaded: 'Update downloaded — ready to install',
  installing: 'Opening Android package installer...',
  error: 'Update check or download could not be completed',
};

export function AppUpdatePanel() {
  const { token } = useAuth();
  const state = useSyncExternalStore(subscribeToUpdates, getUpdateState, getUpdateState);
  const styles = useAppStyles(createStyles);

  useEffect(() => {
    if (Platform.OS === 'android' && state.status === 'checking') {
      void getAppUpdateInfo(token || undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (Platform.OS !== 'android') {
    return (
      <View style={styles.card}>
        <Text style={styles.heading}>App updates</Text>
        <Text style={styles.text}>APK updates and package installation are available on Android only.</Text>
      </View>
    );
  }

  const busy = ['checking', 'downloading', 'installing'].includes(state.status);
  const available = !!state.info && !!state.current && state.info.versionCode > state.current.versionCode;

  const renderButton = (label: string, action: () => Promise<void>, variant: 'primary' | 'secondary' = 'primary') => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      style={[
        styles.button,
        variant === 'secondary' && styles.secondaryButton,
        busy && styles.disabled,
      ]}
      onPress={() => {
        void action();
      }}
    >
      <Text style={[styles.buttonText, variant === 'secondary' && styles.secondaryButtonText]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>App updates</Text>
        {busy && <ActivityIndicator size="small" color={styles.button.backgroundColor} />}
      </View>

      <View style={styles.infoRow}>
        <Text style={styles.metaLabel}>Installed version:</Text>
        <Text style={styles.metaValue}>
          {state.current ? `${state.current.version} (${state.current.versionCode})` : 'Detecting...'}
        </Text>
      </View>

      {state.info && (
        <View style={styles.infoRow}>
          <Text style={styles.metaLabel}>Latest published:</Text>
          <Text style={styles.metaValue}>
            {state.info.version} ({state.info.versionCode})
          </Text>
        </View>
      )}

      <Text accessibilityLiveRegion="polite" style={[styles.statusBadge, state.status === 'up_to_date' && styles.upToDateBadge, state.status === 'update_available' && styles.updateBadge]}>
        {labels[state.status] || 'Ready'}
      </Text>

      {available && state.info && (state.info.mandatory || (state.current?.versionCode || 0) < (state.info.minimumSupportedVersionCode || 1)) && (
        <Text style={styles.warningText}>
          Your organization requires this update. You can complete it whenever convenient; your current workspace and calls will not be lost.
        </Text>
      )}

      {state.status === 'downloading' && (
        <View
          accessibilityRole="progressbar"
          accessibilityValue={
            state.progress === undefined
              ? { text: 'Downloading...' }
              : { min: 0, max: 100, now: Math.round(state.progress * 100) }
          }
          style={styles.progressContainer}
        >
          <Text style={styles.text}>
            {state.progress === undefined
              ? `${((state.bytes || 0) / (1024 * 1024)).toFixed(1)} MB downloaded`
              : `${Math.round(state.progress * 100)}% (${((state.bytes || 0) / (1024 * 1024)).toFixed(1)} MB)`}
          </Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round((state.progress || 0) * 100)}%` }]} />
          </View>
          <Text style={styles.subtext}>You can continue using Vaani during the download.</Text>
        </View>
      )}

      {!!state.error && (
        <View style={styles.errorBox}>
          <Text accessibilityRole="alert" style={styles.errorText}>
            {state.error}
          </Text>
        </View>
      )}

      {!!state.message && (
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>{state.message}</Text>
        </View>
      )}

      <View style={styles.actions}>
        {renderButton(busy && state.status === 'checking' ? 'Checking...' : 'Check for Updates', () => getAppUpdateInfo(token || undefined), available ? 'secondary' : 'primary')}

        {available && !state.fileUri && renderButton(state.status === 'error' ? 'Retry Download' : 'Download Update', downloadLatestApk, 'primary')}

        {!!state.fileUri && renderButton('Install Update', installDownloadedApk, 'primary')}

        {state.permissionRequired && renderButton('Open Android Install Settings', openInstallPermissionSettings, 'secondary')}
      </View>

      {!!state.info?.releaseNotes?.length && (
        <View style={styles.notesContainer}>
          <Text style={styles.notesTitle}>What’s new in {state.info.version}:</Text>
          {state.info.releaseNotes.map((note, index) => (
            <Text style={styles.noteItem} key={index}>
              • {note}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 18,
      gap: 12,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    heading: {
      color: colors.text,
      fontSize: 17,
      fontWeight: '600',
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    metaLabel: {
      color: colors.muted,
      fontSize: 14,
    },
    metaValue: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    statusBadge: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '500',
      paddingVertical: 4,
    },
    upToDateBadge: {
      color: colors.success || '#10b981',
    },
    updateBadge: {
      color: colors.accent,
      fontWeight: '600',
    },
    text: {
      color: colors.text,
      fontSize: 14,
      lineHeight: 20,
    },
    subtext: {
      color: colors.muted,
      fontSize: 12,
      marginTop: 4,
    },
    warningText: {
      color: colors.warning || '#f59e0b',
      fontSize: 13,
      lineHeight: 18,
    },
    actions: {
      gap: 10,
      marginTop: 4,
    },
    button: {
      backgroundColor: colors.primary,
      padding: 13,
      borderRadius: 12,
      alignItems: 'center',
    },
    buttonText: {
      color: colors.onPrimary,
      fontWeight: '600',
      fontSize: 15,
    },
    secondaryButton: {
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryButtonText: {
      color: colors.text,
      fontWeight: '600',
      fontSize: 15,
    },
    disabled: {
      opacity: 0.5,
    },
    progressContainer: {
      gap: 4,
    },
    track: {
      height: 6,
      backgroundColor: colors.border,
      borderRadius: 3,
      marginVertical: 4,
      overflow: 'hidden',
    },
    fill: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.primary,
    },
    errorBox: {
      backgroundColor: (colors.danger || '#ef4444') + '15',
      borderColor: colors.danger || '#ef4444',
      borderWidth: 1,
      borderRadius: 10,
      padding: 12,
    },
    errorText: {
      color: colors.danger || '#ef4444',
      fontSize: 13,
      lineHeight: 18,
    },
    messageBox: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 10,
      padding: 12,
    },
    messageText: {
      color: colors.text,
      fontSize: 13,
      lineHeight: 18,
    },
    notesContainer: {
      marginTop: 6,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 6,
    },
    notesTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    noteItem: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 18,
    },
  });
