import { useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useAppTheme } from '@/context/AppThemeContext';

export function PasswordInput({ style, editable = true, ...props }: TextInputProps) {
  const [visible, setVisible] = useState(false);
  const { colors } = useAppTheme();
  // Match the CRM eye's paths, outline weight, and rounded caps exactly.
  const eyeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="${colors.muted}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${visible ? '<path d="m3 3 18 18"/>' : ''}</svg>`;

  return (
    <View style={styles.container}>
      <TextInput
        {...props}
        editable={editable}
        autoCorrect={false}
        secureTextEntry={!visible}
        style={[style, styles.input]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        accessibilityState={{ disabled: !editable }}
        disabled={!editable}
        onPress={() => setVisible((previous) => !previous)}
        style={({ pressed }) => [styles.toggle, { opacity: !editable ? 0.4 : pressed ? 0.6 : 1 }]}
      >
        <Image
          source={{ uri: `data:image/svg+xml;base64,${btoa(eyeSvg)}` }}
          style={styles.icon}
          contentFit="contain"
          transition={0}
          accessible={false}
          importantForAccessibility="no"
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative' },
  input: { paddingRight: 56 },
  toggle: { position: 'absolute', right: 2, top: 0, bottom: 0, width: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 22, height: 22 },
});
