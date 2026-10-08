import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, PermissionsAndroid, Platform } from 'react-native';
import SpeechRecognitionModule from '../../modules/speech-recognition/src';

export type SpeechRecognitionState = {
  isListening: boolean;
  isAvailable: boolean;
  start: () => Promise<boolean>;
  stop: () => Promise<boolean>;
  toggle: () => Promise<boolean>;
};

export type UseSpeechToTextOptions = {
  onResult?: (text: string) => void;
  onError?: (message: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
  language?: string;
};

export async function requestMicrophonePermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
      );
      if (granted) return true;

      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission',
          message:
            'Vaani needs access to your microphone for voice dictation in note fields.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        }
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn('Microphone permission check failed:', err);
      return false;
    }
  }
  return true;
}

export function useSpeechToText(options?: UseSpeechToTextOptions): SpeechRecognitionState {
  const [isListening, setIsListening] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);
  const activeListeners = useRef<{ remove: () => void }[]>([]);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let mounted = true;
    if (SpeechRecognitionModule?.isRecognitionAvailable) {
      SpeechRecognitionModule.isRecognitionAvailable()
        .then((avail) => {
          if (mounted) setIsAvailable(avail);
        })
        .catch(() => {
          if (mounted) setIsAvailable(false);
        });
    } else {
      setIsAvailable(Platform.OS === 'web');
    }
    return () => {
      mounted = false;
    };
  }, []);

  const cleanupListeners = useCallback(() => {
    activeListeners.current.forEach((sub) => {
      try {
        sub.remove();
      } catch {}
    });
    activeListeners.current = [];
  }, []);

  const stop = useCallback(async (): Promise<boolean> => {
    setIsListening(false);
    try {
      if (SpeechRecognitionModule?.stopListening) {
        await SpeechRecognitionModule.stopListening();
      }
    } catch {}
    cleanupListeners();
    optionsRef.current?.onEnd?.();
    return true;
  }, [cleanupListeners]);

  const start = useCallback(async (): Promise<boolean> => {
    if (!SpeechRecognitionModule) {
      Alert.alert(
        'Speech Recognition Unavailable',
        'Speech recognition is not supported on this device.'
      );
      return false;
    }

    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      Alert.alert(
        'Microphone Permission Required',
        'Please grant microphone permission to use voice dictation.'
      );
      optionsRef.current?.onError?.('Microphone permission denied');
      return false;
    }

    try {
      cleanupListeners();

      if (SpeechRecognitionModule.addListener) {
        const subStart = SpeechRecognitionModule.addListener('onSpeechStart', () => {
          setIsListening(true);
          optionsRef.current?.onStart?.();
        });
        const subResults = SpeechRecognitionModule.addListener('onSpeechResults', (event) => {
          if (event?.value) {
            optionsRef.current?.onResult?.(event.value);
          }
        });
        const subPartial = SpeechRecognitionModule.addListener('onSpeechPartialResults', (event) => {
          if (event?.value) {
            optionsRef.current?.onResult?.(event.value);
          }
        });
        const subError = SpeechRecognitionModule.addListener('onSpeechError', (event) => {
          setIsListening(false);
          const msg = event?.message || 'Speech recognition error';
          console.warn('Speech recognition error:', msg);
          optionsRef.current?.onError?.(msg);
        });
        const subEnd = SpeechRecognitionModule.addListener('onSpeechEnd', () => {
          setIsListening(false);
          optionsRef.current?.onEnd?.();
        });

        activeListeners.current = [subStart, subResults, subPartial, subError, subEnd];
      }

      await SpeechRecognitionModule.startListening(optionsRef.current?.language);
      setIsListening(true);
      return true;
    } catch (error) {
      setIsListening(false);
      cleanupListeners();
      const msg = error instanceof Error ? error.message : 'Unable to start speech recognition.';
      Alert.alert('Voice Dictation', msg);
      optionsRef.current?.onError?.(msg);
      return false;
    }
  }, [cleanupListeners]);

  const toggle = useCallback(async (): Promise<boolean> => {
    if (isListening) {
      return stop();
    } else {
      return start();
    }
  }, [isListening, start, stop]);

  useEffect(() => {
    return () => {
      cleanupListeners();
      if (SpeechRecognitionModule?.destroy) {
        SpeechRecognitionModule.destroy().catch(() => {});
      }
    };
  }, [cleanupListeners]);

  return {
    isListening,
    isAvailable,
    start,
    stop,
    toggle,
  };
}
