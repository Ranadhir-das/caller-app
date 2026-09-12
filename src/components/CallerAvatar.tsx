import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme } from '@/context/AppThemeContext';

export function CallerAvatar({ size = 44 }: { size?: number }) {
  const { colors } = useAppTheme();
  const { user, photo } = useAuth();
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const name = user?.name?.trim() || user?.username || 'Caller';
  return (
    <View accessibilityLabel={`${name} profile`} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {photo && photo !== failedUri ? (
        <Image source={{ uri: photo }} style={{ width: size, height: size }} onError={() => setFailedUri(photo)} />
      ) : (
        <Text style={{ color: colors.onPrimary, fontSize: size * 0.4, fontWeight: '700' }}>{Array.from(name)[0].toUpperCase()}</Text>
      )}
    </View>
  );
}
