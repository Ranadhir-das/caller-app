import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import { AnimatedBackButton } from '@/components/AnimatedBackButton';
import { CallerAvatar } from '@/components/CallerAvatar';
import { VectorIcon } from '@/components/VectorIcon';
import { useAuth } from '@/context/AuthContext';
import { useEmployeeWorkspace } from '@/context/EmployeeWorkspaceContext';

export default function ProfileScreen() {
  const styles = useAppStyles(createStyles);
  const { mode, toggleTheme, colors } = useAppTheme();
  const { user, photo, setPhoto, logout } = useAuth();
  const { data } = useEmployeeWorkspace();
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const loggingOut = useRef(false);

  const name = user?.name?.trim() || user?.username || 'Employee';
  const roleLabel = data?.role_label || user?.role?.replace(/_/g, ' ') || 'Team Member';

  const choosePhoto = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ImagePicker = await import('expo-image-picker');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.3,
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.base64) throw new Error('Could not read this photo. Please choose another image.');
      if (asset.base64.length > 1_500_000) throw new Error('Please choose a smaller photo (under 1 MB).');
      await setPhoto(`data:image/jpeg;base64,${asset.base64}`);
    } catch (error) {
      Alert.alert('Photo could not be saved', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = () => {
    Alert.alert(
      'Remove Photo',
      'Are you sure you want to remove your profile photo? Your initial will be displayed instead.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await setPhoto(null);
            } catch {
              Alert.alert('Photo could not be removed', 'Please try again.');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const signOut = () => {
    Alert.alert(
      'Sign Out of Vaani',
      'Are you sure you want to sign out? Your attendance checkout will be recorded server-side.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            if (loggingOut.current) return;
            loggingOut.current = true;
            setSigningOut(true);
            try {
              await logout();
              router.replace('/login');
            } catch {
              Alert.alert('Could not log out', 'Please check your connection and try again.');
            } finally {
              loggingOut.current = false;
              setSigningOut(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header Bar */}
      <View style={styles.topBar}>
        <AnimatedBackButton />
        <Text style={styles.headerTitle}>My Profile</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Current theme is ${mode}. Tap to switch.`}
          onPress={toggleTheme}
          style={styles.themePill}
        >
          <Text style={styles.themePillText}>
            {mode === 'dark' ? '🌙 Dark' : '☀️ Light'}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Hero Profile Card */}
        <View style={styles.heroCard}>
          <View style={styles.avatarWrapper}>
            <CallerAvatar size={88} />
            <Pressable
              style={styles.cameraBadge}
              onPress={choosePhoto}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
            >
              <VectorIcon name="camera" color="#FFFFFF" size={15} />
            </Pressable>
          </View>

          <Text style={styles.heroName}>{name}</Text>
          <Text style={styles.heroUsername}>@{user?.username || 'user'}</Text>

          <View style={styles.heroRolePill}>
            <Text style={styles.heroRoleText}>{roleLabel.toUpperCase()}</Text>
          </View>

          {/* Photo Actions Row */}
          <View style={styles.photoActionsRow}>
            <Pressable
              style={styles.photoActionBtn}
              onPress={choosePhoto}
              disabled={busy}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <VectorIcon name="camera" color={colors.primary} size={15} />
                  <Text style={styles.photoActionText}>
                    {photo ? 'Change Photo' : 'Upload Photo'}
                  </Text>
                </>
              )}
            </Pressable>

            {photo ? (
              <Pressable
                style={[styles.photoActionBtn, styles.photoRemoveBtn]}
                onPress={removePhoto}
                disabled={busy}
                accessibilityRole="button"
              >
                <Text style={styles.photoRemoveText}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Section: Account Information */}
        <Text style={styles.sectionHeader}>ACCOUNT INFORMATION</Text>
        <View style={styles.infoGroupCard}>
          <View style={styles.infoRow}>
            <View style={[styles.infoIconBox, { backgroundColor: colors.accentSoft }]}>
              <VectorIcon name="user" color={colors.primary} size={18} />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>Full Name</Text>
              <Text style={styles.infoValue} selectable>{name}</Text>
            </View>
          </View>

          <View style={styles.rowDivider} />

          <View style={styles.infoRow}>
            <View style={[styles.infoIconBox, { backgroundColor: colors.accentSoft }]}>
              <VectorIcon name="admission" color={colors.primary} size={18} />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>Username</Text>
              <Text style={styles.infoValue} selectable>@{user?.username}</Text>
            </View>
          </View>

          <View style={styles.rowDivider} />

          <View style={styles.infoRow}>
            <View style={[styles.infoIconBox, { backgroundColor: colors.accentSoft }]}>
              <VectorIcon name="chat" color={colors.primary} size={18} />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>Email Address</Text>
              <Text style={styles.infoValue} selectable>{user?.email || 'Not provided'}</Text>
            </View>
          </View>

          <View style={styles.rowDivider} />

          <View style={styles.infoRow}>
            <View style={[styles.infoIconBox, { backgroundColor: colors.accentSoft }]}>
              <VectorIcon name="briefcase" color={colors.primary} size={18} />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>Role & Department</Text>
              <Text style={styles.infoValue}>{roleLabel}</Text>
            </View>
          </View>

          <View style={styles.rowDivider} />

          <View style={styles.infoRow}>
            <View style={[styles.infoIconBox, { backgroundColor: colors.accentSoft }]}>
              <VectorIcon name="clock" color={colors.primary} size={18} />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>Shift & Attendance Policy</Text>
              <Text style={styles.infoValue}>
                {user?.shift_workflow_enabled ? 'Face ID Verification Active' : 'Standard Attendance'}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.disclaimerText}>
          Account details and permissions are managed by your administrator.
        </Text>

        {/* Section: Preferences */}
        <Text style={styles.sectionHeader}>PREFERENCES & SETTINGS</Text>
        <View style={styles.infoGroupCard}>
          <Pressable
            style={styles.infoRow}
            onPress={toggleTheme}
            accessibilityRole="button"
            accessibilityLabel={`Switch theme. Currently ${mode}.`}
          >
            <View style={[styles.infoIconBox, { backgroundColor: colors.accentSoft }]}>
              <Text style={{ fontSize: 17 }}>{mode === 'dark' ? '🌙' : '☀️'}</Text>
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>App Appearance</Text>
              <Text style={styles.infoValue}>
                {mode === 'dark' ? 'Dark Mode' : 'Light Mode'}
              </Text>
            </View>
            <View style={styles.themeToggleChip}>
              <Text style={styles.themeToggleChipText}>
                Switch to {mode === 'dark' ? 'Light' : 'Dark'}
              </Text>
            </View>
          </Pressable>

          <View style={styles.rowDivider} />

          <Pressable
            style={styles.infoRow}
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
          >
            <View style={[styles.infoIconBox, { backgroundColor: colors.accentSoft }]}>
              <VectorIcon name="settings" color={colors.primary} size={18} />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>App Settings</Text>
              <Text style={styles.infoValue}>Permissions, notifications & storage</Text>
            </View>
            <VectorIcon name="chevron-right" color={colors.muted} size={18} />
          </Pressable>
        </View>

        {/* Section: Session Management */}
        <Text style={styles.sectionHeader}>SESSION</Text>
        <Pressable
          style={styles.signOutButton}
          disabled={busy || signingOut}
          onPress={signOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out of account"
        >
          {signingOut ? (
            <ActivityIndicator size="small" color={colors.danger} />
          ) : (
            <View style={styles.signOutContent}>
              <Text style={styles.signOutIcon}>🚪</Text>
              <Text style={styles.signOutText}>Check Out & Sign Out</Text>
            </View>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -0.2,
    },
    themePill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    themePillText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 36,
    },
    heroCard: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 24,
      paddingHorizontal: 16,
      alignItems: 'center',
      marginTop: 6,
      marginBottom: 20,
      elevation: 2,
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    avatarWrapper: {
      position: 'relative',
      marginBottom: 14,
    },
    cameraBadge: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.surface,
      elevation: 3,
    },
    heroName: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -0.3,
    },
    heroUsername: {
      fontSize: 14,
      color: colors.muted,
      marginTop: 2,
    },
    heroRolePill: {
      backgroundColor: colors.accentSoft || '#EBF3FF',
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
      marginTop: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    heroRoleText: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: 0.6,
    },
    photoActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 16,
    },
    photoActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 14,
      backgroundColor: colors.accentSoft || '#EBF3FF',
      borderWidth: 1,
      borderColor: colors.border,
    },
    photoActionText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.primary,
    },
    photoRemoveBtn: {
      backgroundColor: 'transparent',
      borderColor: colors.danger + '40',
    },
    photoRemoveText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.danger,
    },
    sectionHeader: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.muted,
      letterSpacing: 1.2,
      marginBottom: 8,
      marginTop: 4,
      marginLeft: 4,
    },
    infoGroupCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 8,
      marginBottom: 8,
      elevation: 1,
      shadowColor: '#000',
      shadowOpacity: 0.03,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 1 },
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
    },
    infoIconBox: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    infoTextContainer: {
      flex: 1,
    },
    infoLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.muted,
    },
    infoValue: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      marginTop: 2,
    },
    rowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginLeft: 50,
    },
    disclaimerText: {
      fontSize: 12,
      color: colors.muted,
      lineHeight: 17,
      marginLeft: 6,
      marginBottom: 20,
    },
    themeToggleChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 10,
      backgroundColor: colors.accentSoft || '#EBF3FF',
      borderWidth: 1,
      borderColor: colors.border,
    },
    themeToggleChipText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
    },
    signOutButton: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: colors.danger + '40',
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    signOutContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    signOutIcon: {
      fontSize: 16,
    },
    signOutText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.danger,
    },
  });
