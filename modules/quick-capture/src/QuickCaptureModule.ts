import { NativeModule, requireNativeModule } from 'expo';

export type ShareIntentEvent = {
  uri: string;
  mimeType: string;
};

export type BoundingBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type OcrElement = {
  text: string;
  boundingBox?: BoundingBox;
};

export type OcrLine = {
  text: string;
  boundingBox?: BoundingBox;
  elements?: OcrElement[];
};

export type OcrBlock = {
  text: string;
  boundingBox?: BoundingBox;
  lines?: OcrLine[];
};

export type OcrDetailsResult = {
  text: string;
  blocks?: OcrBlock[];
};

declare class QuickCaptureModuleType extends NativeModule<{
  onShareIntent: (event: ShareIntentEvent) => void;
}> {
  isOcrAvailable(): Promise<boolean>;
  recognizeText(imageUri: string): Promise<string>;
  recognizeTextDetails?(imageUri: string): Promise<OcrDetailsResult>;
  getInitialShareIntent(): Promise<ShareIntentEvent | null>;
  clearShareIntent(): Promise<boolean>;
}

let nativeModule: QuickCaptureModuleType | null = null;
try {
  nativeModule = requireNativeModule<QuickCaptureModuleType>('QuickCapture');
} catch {
  // Fallback if native module is not yet compiled into current runtime
}

export default nativeModule;
