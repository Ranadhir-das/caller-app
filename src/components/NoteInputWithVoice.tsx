import React, { useCallback, useRef, useState } from 'react';
import { useKeyboardField } from './KeyboardAwareContainer';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { useAppTheme } from '@/context/AppThemeContext';
import { useSpeechToText } from '@/services/speech';

export interface NoteInputWithVoiceProps extends Omit<TextInputProps, 'onChangeText' | 'value'> {
  value: string;
  onChangeText: (text: string) => void;
  label?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  voiceLanguage?: string;
  showStatusBanner?: boolean;
}

export function NoteInputWithVoice({
  value,
  onChangeText,
  label,
  error,
  containerStyle,
  inputStyle,
  placeholder,
  multiline = true,
  numberOfLines = 3,
  editable = true,
  voiceLanguage,
  showStatusBanner = true,
  ...textInputProps
}: NoteInputWithVoiceProps) {
  const { colors, mode } = useAppTheme();
  const wrapper = useRef<View>(null);
  const active = useRef(false);
  const { reveal, availableHeight } = useKeyboardField();
  const [textHeight, setTextHeight] = useState(88);
  const visibleHeight = Math.min(Math.max(88, textHeight), Math.max(64, Math.min(180, availableHeight - 32)));
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const handleSpeechResult = useCallback(
    (dictatedText: string) => {
      const clean = dictatedText.trim();
      if (!clean) return;
      if (!value || !value.trim()) {
        onChangeText(clean);
      } else {
        // Append dictated speech to existing content with appropriate spacing
        const separator = value.endsWith('\n') || value.endsWith(' ') ? '' : ' ';
        onChangeText(`${value}${separator}${clean}`);
      }
    },
    [value, onChangeText]
  );

  const { isListening, toggle, isAvailable } = useSpeechToText({
    onResult: handleSpeechResult,
    language: voiceLanguage,
    onStart: () => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    },
    onEnd: () => {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    },
  });

  const micColor = isListening ? '#ef4444' : colors.primary;
  const micSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="${micColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" x2="12" y1="19" y2="22"/>
  </svg>`;

  return (
    <View style={[styles.container, containerStyle]}>
      {!!label && <Text style={[styles.label, { color: colors.text }]}>{label}</Text>}

      <View
        ref={wrapper}
        onLayout={() => { if (active.current) reveal(wrapper.current); }}
        style={[
          styles.inputWrapper,
          {
            borderColor: error ? colors.danger : isListening ? '#ef4444' : colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        <TextInput
          {...textInputProps}
          accessibilityLabel={label || placeholder || 'Note text input with voice dictation'}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          keyboardAppearance={mode}
          value={value}
          onChangeText={onChangeText}
          multiline={multiline}
          numberOfLines={numberOfLines}
          textAlignVertical={multiline ? 'top' : 'center'}
          editable={editable}
          style={[
            styles.input,
            {
              color: colors.text,
              minHeight: multiline ? Math.min(88, visibleHeight) : 46,
            },
            inputStyle,
            multiline && { height: visibleHeight, maxHeight: visibleHeight, minHeight: Math.min(88, visibleHeight) },
          ]}
          scrollEnabled={multiline}
          onFocus={event => { active.current = true; reveal(wrapper.current); textInputProps.onFocus?.(event); }}
          onBlur={event => { active.current = false; reveal(null); textInputProps.onBlur?.(event); }}
          onContentSizeChange={event => { setTextHeight(event.nativeEvent.contentSize.height); if (active.current) reveal(wrapper.current); textInputProps.onContentSizeChange?.(event); }}
          onSelectionChange={event => { if (active.current) reveal(wrapper.current); textInputProps.onSelectionChange?.(event); }}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isListening ? 'Stop voice recording' : 'Start voice dictation'}
          accessibilityHint="Tap to dictate text into this note field using speech recognition"
          disabled={!editable}
          onPress={() => void toggle()}
          style={({ pressed }) => [
            styles.micButton,
            {
              backgroundColor: isListening
                ? 'rgba(239, 68, 68, 0.15)'
                : 'rgba(2, 132, 199, 0.08)',
              borderColor: isListening ? '#ef4444' : 'transparent',
              opacity: !editable ? 0.4 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Image
              source={{ uri: `data:image/svg+xml;base64,${btoa(micSvg)}` }}
              style={styles.micIcon}
              contentFit="contain"
              transition={0}
              accessible={false}
              importantForAccessibility="no"
            />
          </Animated.View>
        </Pressable>
      </View>

      {isListening && showStatusBanner && (
        <View style={styles.listeningBadge}>
          <View style={styles.recordingDot} />
          <Text style={[styles.listeningText, { color: '#ef4444' }]}>
            Listening... Speak now to dictate (tap mic to stop)
          </Text>
        </View>
      )}

      {!!error && <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  inputWrapper: {
    position: 'relative',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  input: {
    padding: 12,
    paddingRight: 48,
    fontSize: 15,
    lineHeight: 22,
  },
  micButton: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    zIndex: 2,
  },
  micIcon: {
    width: 20,
    height: 20,
  },
  listeningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  listeningText: {
    fontSize: 12,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 12,
    marginTop: 2,
  },
});
