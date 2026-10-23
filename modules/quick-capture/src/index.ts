import QuickCaptureModule, {
  type ShareIntentEvent,
  type BoundingBox,
  type OcrElement,
  type OcrLine,
  type OcrBlock,
  type OcrDetailsResult,
} from './QuickCaptureModule';

export type {
  ShareIntentEvent,
  BoundingBox,
  OcrElement,
  OcrLine,
  OcrBlock,
  OcrDetailsResult,
};

export async function isOcrAvailable(): Promise<boolean> {
  if (!QuickCaptureModule) return false;
  try {
    return await QuickCaptureModule.isOcrAvailable();
  } catch {
    return false;
  }
}

export async function recognizeTextFromImage(imageUri: string): Promise<string> {
  if (!QuickCaptureModule) {
    throw new Error('QuickCapture native module is not available in the current runtime.');
  }
  return await QuickCaptureModule.recognizeText(imageUri);
}

export async function recognizeTextDetailsFromImage(imageUri: string): Promise<OcrDetailsResult> {
  if (!QuickCaptureModule) {
    throw new Error('QuickCapture native module is not available in the current runtime.');
  }
  if (typeof QuickCaptureModule.recognizeTextDetails === 'function') {
    return await QuickCaptureModule.recognizeTextDetails(imageUri);
  }
  const text = await QuickCaptureModule.recognizeText(imageUri);
  return { text, blocks: [] };
}

export async function getInitialShareIntent(): Promise<ShareIntentEvent | null> {
  if (!QuickCaptureModule) return null;
  try {
    return await QuickCaptureModule.getInitialShareIntent();
  } catch {
    return null;
  }
}

export async function clearShareIntent(): Promise<boolean> {
  if (!QuickCaptureModule) return true;
  try {
    return await QuickCaptureModule.clearShareIntent();
  } catch {
    return true;
  }
}

export function addShareIntentListener(listener: (event: ShareIntentEvent) => void) {
  if (!QuickCaptureModule) {
    return { remove: () => {} };
  }
  return QuickCaptureModule.addListener('onShareIntent', listener);
}
