import { useAppStyles, type AppColors } from '@/context/AppThemeContext';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnimatedBackButton } from '@/components/AnimatedBackButton';
import { CallerAvatar } from '@/components/CallerAvatar';
import { useAuth } from '@/context/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ProfileScreen() {
  const styles = useAppStyles(createStyles);
  const { user, photo, setPhoto } = useAuth();
  const [busy, setBusy] = useState(false);
  const name = user?.name?.trim() || user?.username || 'Caller';
  const choosePhoto = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ImagePicker = await import('expo-image-picker');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.3, base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.base64) throw new Error('Could not read this photo. Please choose another image.');
      if (asset.base64.length > 1_500_000) throw new Error('Please choose a smaller photo (under 1 MB).');
      await setPhoto(`data:image/jpeg;base64,${asset.base64}`);
    } catch (error) {
      Alert.alert('Photo could not be saved', error instanceof Error ? error.message : 'Please try again.');
    } finally { setBusy(false); }
  };
  const removePhoto = async () => {
    setBusy(true);
    try { await setPhoto(null); }
    catch { Alert.alert('Photo could not be removed', 'Please try again.'); }
    finally { setBusy(false); }
  };
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
      <AnimatedBackButton /><Text style={[styles.title, { marginTop: 16 }]}>My Profile</Text>
      <Text style={styles.subtitle}>
        Your CRM account and profile photo.
      </Text>

      <View style={styles.profileCard}>
        <Pressable style={{ marginRight: 14 }} disabled={busy} onPress={choosePhoto} accessibilityRole="button" accessibilityLabel="Choose profile photo">
          <CallerAvatar size={50} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.role}>{user?.role?.replace(/_/g, ' ') || 'Caller'}</Text>
        </View>
      </View>

      <Pressable style={styles.option} disabled={busy} onPress={choosePhoto} accessibilityRole="button">
        <Text style={styles.optionText}>{busy ? 'Saving…' : photo ? 'Change profile photo' : 'Add profile photo'}</Text>
      </Pressable>
      {photo && (
        <Pressable style={styles.option} disabled={busy} onPress={removePhoto} accessibilityRole="button">
          <Text style={styles.optionText}>Remove photo — use first initial</Text>
        </Pressable>
      )}

      {[
        ['Full name', name], ['Username', user?.username],
        ['Email', user?.email || 'Not provided'],
        ['Role', user?.role?.replace(/_/g, ' ')],
      ].map(([label, value]) => (
        <View key={label} style={[styles.option, { flexDirection: 'column', alignItems: 'flex-start', gap: 6 }]}>
          <Text style={styles.role}>{label}</Text>
          <Text selectable style={styles.name}>{value}</Text>
        </View>
      ))}
      <Text style={[styles.subtitle, { marginTop: 20 }]}>Account details are managed by your CRM administrator. Your profile photo is saved on this device.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: colors.muted,
  },
  profileCard: {
    marginTop: 25,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  profileText: {
    color: colors.onPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  role: {
    marginTop: 4,
    fontSize: 13,
    color: colors.muted,
  },
  option: {
    marginTop: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionIcon: {
    color: colors.text,
    fontSize: 20,
    width: 40,
  },
  optionText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.secondary,
  },
});
