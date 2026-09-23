import { NativeModule, requireNativeModule } from 'expo';

export type CallState =
  | 'RINGING'
  | 'OFFHOOK'
  | 'IDLE'
  | 'UNKNOWN';

export type CallStateEvent = {
  state: CallState;
};

declare class CallstateModule extends NativeModule<{
  onCallStateChanged: (event: CallStateEvent) => void;
}> {
  startMonitoring(): void;
  getCurrentState(): CallState;
  startCall(phoneNumber: string): void;
  /** Android: prepare microphone foreground service BEFORE opening the Phone app. */
  prepareRecording(): Promise<boolean>;
  startRecording(): Promise<string | null>;
  stopRecording(): Promise<string | null>;
  isRecording(): boolean;
  /** Current/last successful recording path in this process; null after failure. */
  getRecordingPath(): string | null;
}

export default requireNativeModule<CallstateModule>('Callstate');
