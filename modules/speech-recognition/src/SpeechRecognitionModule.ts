import { NativeModule, requireNativeModule } from 'expo';

export type SpeechResultsEvent = {
  value: string;
};

export type SpeechErrorEvent = {
  error: number;
  message: string;
};

declare class SpeechRecognitionModule extends NativeModule<{
  onSpeechStart: () => void;
  onSpeechResults: (event: SpeechResultsEvent) => void;
  onSpeechPartialResults: (event: SpeechResultsEvent) => void;
  onSpeechError: (event: SpeechErrorEvent) => void;
  onSpeechEnd: () => void;
}> {
  isRecognitionAvailable(): Promise<boolean>;
  startListening(language?: string): Promise<boolean>;
  stopListening(): Promise<boolean>;
  destroy(): Promise<boolean>;
}

let nativeModule: SpeechRecognitionModule | null = null;
try {
  nativeModule = requireNativeModule<SpeechRecognitionModule>('SpeechRecognition');
} catch {
  // Graceful fallback if native module isn't loaded in the current runtime
}

export default nativeModule;
