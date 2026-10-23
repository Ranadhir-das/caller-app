import React, { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import CallstateModule, { type CallStateEvent } from '../../modules/callstate/src/CallstateModule';
import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';

export function IncomingCallBanner() {
  const styles = useAppStyles(createStyles);
  const { colors } = useAppTheme();
  const [ringingNumber, setRingingNumber] = useState<string | null>(null);
  const [promptNumber, setPromptNumber] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    try {
      const subscription = CallstateModule.addListener(
        'onCallStateChanged',
        (event: CallStateEvent) => {
          const number = event.phoneNumber?.trim();
          if (event.state === 'RINGING') {
            if (number && number.length >= 7) {
              setRingingNumber(number);
            }
          } else if (event.state === 'IDLE') {
            if (ringingNumber) {
              setPromptNumber(ringingNumber);
              setRingingNumber(null);
            } else if (number && number.length >= 7) {
              setPromptNumber(number);
            }
          }
        }
      );

      return () => {
        subscription.remove();
      };
    } catch (e) {
      // CallstateModule might not be available in Expo Go or non-native builds
      console.warn('Callstate listener could not be registered:', e);
    }
  }, [ringingNumber]);

  if (!promptNumber) return null;

  const handleRegister = () => {
    const num = promptNumber;
    setPromptNumber(null);
    router.push({
      pathname: '/incoming-enquiry' as never,
      params: { phone_number: num },
    });
  };

  const handleDismiss = () => {
    setPromptNumber(null);
  };

  return (
    <Modal
      transparent
      animationType="fade"
      visible={!!promptNumber}
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Text style={styles.phoneIcon}>📞</Text>
          </View>
          <Text style={styles.title}>Incoming Call Detected</Text>
          <Text style={styles.subtitle}>
            Call from <Text style={styles.highlightNumber}>{promptNumber}</Text> ended. Would you like to register it as an enquiry?
          </Text>

          <View style={styles.buttonRow}>
            <Pressable style={styles.dismissButton} onPress={handleDismiss}>
              <Text style={styles.dismissButtonText}>Dismiss</Text>
            </Pressable>
            <Pressable style={styles.registerButton} onPress={handleRegister}>
              <Text style={styles.registerButtonText}>Register Enquiry</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 24,
      width: '100%',
      maxWidth: 380,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 6,
    },
    iconCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    phoneIcon: {
      fontSize: 24,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 14,
      color: colors.muted,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 20,
    },
    highlightNumber: {
      color: colors.primary,
      fontWeight: '700',
    },
    buttonRow: {
      flexDirection: 'row',
      width: '100%',
      gap: 10,
    },
    dismissButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    dismissButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    registerButton: {
      flex: 1.3,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center',
    },
    registerButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#ffffff',
    },
  });
