export type ShareIntentEvent = {
  uri: string;
  mimeType: string;
};

const QuickCaptureModuleWeb = {
  isOcrAvailable: async () => false,
  recognizeText: async (_imageUri: string) => '',
  recognizeTextDetails: async (_imageUri: string) => ({ text: '', blocks: [] }),
  getInitialShareIntent: async () => null,
  clearShareIntent: async () => true,
  addListener: () => ({ remove: () => {} }),
  removeListeners: () => {},
};

export default QuickCaptureModuleWeb;
