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
}

export default requireNativeModule<CallstateModule>('Callstate');