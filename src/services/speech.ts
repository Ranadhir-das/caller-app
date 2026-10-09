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
  onPartialResult?: (text: string) => void;
  onError?: (message: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
  language?: string;
};

/**
 * Appends new dictated text to existing text with sensible spacing.
 * Preserves manually typed text and avoids repeated or malformed spacing.
 */
export function appendDictatedText(existing: string, dictated: string): string {
  const clean = (dictated || '').trim();
  if (!clean) return existing || '';
  const current = existing || '';
  if (!current.trim()) {
    return clean;
  }
  const separator = current.endsWith('\n') || current.endsWith(' ') ? '' : ' ';
  return `${current}${separator}${clean}`;
}

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

// Global coordinator ensuring only ONE field/session can actively record at any time
type GlobalSession = {
  sessionId: number;
  ownerId: string;
  cancel: () => void;
};

let currentGlobalSession: GlobalSession | null = null;
let globalSessionSequence = 0;

export function useSpeechToText(options?: UseSpeechToTextOptions): SpeechRecognitionState {
  const [isListening, setIsListening] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);

  const instanceId = useRef<string>('');
  if (!instanceId.current) {
    instanceId.current = `speech_hook_${++globalSessionSequence}_${Math.random().toString(36).slice(2, 7)}`;
  }

  const activeListeners = useRef<{ remove: () => void }[]>([]);
  const activeSessionIdRef = useRef<number>(0);
  const hasDeliveredFinalResultRef = useRef<boolean>(false);
  const lastPartialTranscriptRef = useRef<string>('');
  const isTogglingRef = useRef<boolean>(false);

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
    const currentSessionId = activeSessionIdRef.current;
    activeSessionIdRef.current = 0;
    setIsListening(false);

    if (currentGlobalSession?.ownerId === instanceId.current) {
      currentGlobalSession = null;
    }

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

    // Stop any previously active recognition session anywhere in the app
    if (currentGlobalSession && currentGlobalSession.ownerId !== instanceId.current) {
      currentGlobalSession.cancel();
      currentGlobalSession = null;
    }

    // Clean up any existing listeners on this instance
    cleanupListeners();

    const sessionId = ++globalSessionSequence;
    activeSessionIdRef.current = sessionId;
    hasDeliveredFinalResultRef.current = false;
    lastPartialTranscriptRef.current = '';

    currentGlobalSession = {
      sessionId,
      ownerId: instanceId.current,
      cancel: () => {
        if (activeSessionIdRef.current === sessionId) {
          activeSessionIdRef.current = 0;
          setIsListening(false);
          cleanupListeners();
          optionsRef.current?.onEnd?.();
          try {
            SpeechRecognitionModule?.stopListening?.();
          } catch {}
        }
      },
    };

    try {
      if (SpeechRecognitionModule.addListener) {
        const subStart = SpeechRecognitionModule.addListener('onSpeechStart', () => {
          if (activeSessionIdRef.current !== sessionId) return;
          setIsListening(true);
          optionsRef.current?.onStart?.();
        });

        // Partial / interim results: update preview only, NEVER append to final notes text!
        const subPartial = SpeechRecognitionModule.addListener('onSpeechPartialResults', (event) => {
          if (activeSessionIdRef.current !== sessionId) return;
          if (hasDeliveredFinalResultRef.current) return;
          const text = event?.value?.trim();
          if (text) {
            lastPartialTranscriptRef.current = text;
            optionsRef.current?.onPartialResult?.(text);
          }
        });

        // Final recognition results: processed exactly once per session
        const subResults = SpeechRecognitionModule.addListener('onSpeechResults', (event) => {
          if (activeSessionIdRef.current !== sessionId) return;
          const rawText = event?.value;
          const text = typeof rawText === 'string' ? rawText.trim() : '';
          if (!text) return;

          // Prevent duplicate final processing in the same session
          if (hasDeliveredFinalResultRef.current) {
            return;
          }
          hasDeliveredFinalResultRef.current = true;
          optionsRef.current?.onResult?.(text);
        });

        const subError = SpeechRecognitionModule.addListener('onSpeechError', (event) => {
          if (activeSessionIdRef.current !== sessionId) return;
          activeSessionIdRef.current = 0;
          setIsListening(false);
          cleanupListeners();
          if (currentGlobalSession?.sessionId === sessionId) {
            currentGlobalSession = null;
          }
          const msg = event?.message || 'Speech recognition error';
          console.warn('Speech recognition error:', msg);
          optionsRef.current?.onError?.(msg);
        });

        const subEnd = SpeechRecognitionModule.addListener('onSpeechEnd', () => {
          if (activeSessionIdRef.current !== sessionId) return;
          activeSessionIdRef.current = 0;
          setIsListening(false);

          // If onSpeechResults was not received but partial text was recorded before normal end,
          // deliver the partial transcript once as fallback
          if (!hasDeliveredFinalResultRef.current && lastPartialTranscriptRef.current) {
            hasDeliveredFinalResultRef.current = true;
            optionsRef.current?.onResult?.(lastPartialTranscriptRef.current);
          }

          cleanupListeners();
          if (currentGlobalSession?.sessionId === sessionId) {
            currentGlobalSession = null;
          }
          optionsRef.current?.onEnd?.();
        });

        activeListeners.current = [subStart, subPartial, subResults, subError, subEnd];
      }

      await SpeechRecognitionModule.startListening(optionsRef.current?.language);
      setIsListening(true);
      return true;
    } catch (error) {
      activeSessionIdRef.current = 0;
      setIsListening(false);
      cleanupListeners();
      if (currentGlobalSession?.sessionId === sessionId) {
        currentGlobalSession = null;
      }
      const msg = error instanceof Error ? error.message : 'Unable to start speech recognition.';
      Alert.alert('Voice Dictation', msg);
      optionsRef.current?.onError?.(msg);
      return false;
    }
  }, [cleanupListeners]);

  const toggle = useCallback(async (): Promise<boolean> => {
    if (isTogglingRef.current) return false;
    isTogglingRef.current = true;
    try {
      if (isListening) {
        return await stop();
      } else {
        return await start();
      }
    } finally {
      isTogglingRef.current = false;
    }
  }, [isListening, start, stop]);

  useEffect(() => {
    return () => {
      cleanupListeners();
      if (currentGlobalSession?.ownerId === instanceId.current) {
        currentGlobalSession = null;
      }
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
