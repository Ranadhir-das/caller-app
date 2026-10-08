import { registerWebModule, NativeModule } from 'expo';

type WebSpeechEvents = {
  onSpeechStart: () => void;
  onSpeechResults: (event: { value: string }) => void;
  onSpeechPartialResults: (event: { value: string }) => void;
  onSpeechError: (event: { error: number; message: string }) => void;
  onSpeechEnd: () => void;
};

class SpeechRecognitionModule extends NativeModule<WebSpeechEvents> {
  private recognition: any = null;

  async isRecognitionAvailable(): Promise<boolean> {
    return typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
  }

  async startListening(language?: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionClass) return false;

    await this.stopListening();
    this.recognition = new SpeechRecognitionClass();
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    if (language) this.recognition.lang = language;

    this.recognition.onstart = () => {
      this.emit('onSpeechStart');
    };
    this.recognition.onresult = (event: any) => {
      const text = event.results?.[0]?.[0]?.transcript || '';
      if (text) this.emit('onSpeechResults', { value: text });
    };
    this.recognition.onerror = (event: any) => {
      this.emit('onSpeechError', { error: 0, message: event.error || 'Speech error' });
    };
    this.recognition.onend = () => {
      this.emit('onSpeechEnd');
    };

    try {
      this.recognition.start();
      return true;
    } catch {
      return false;
    }
  }

  async stopListening(): Promise<boolean> {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
      this.recognition = null;
    }
    return true;
  }

  async destroy(): Promise<boolean> {
    return this.stopListening();
  }
}

export default registerWebModule(SpeechRecognitionModule, 'SpeechRecognition');
