export class Logger {
  private debugEnabled: boolean;

  constructor(debug: boolean = false) {
    this.debugEnabled = debug;
  }

  log(message: string, ...args: any[]): void {
    console.log(`[VoiceTracker] ${message}`, ...args);
  }

  error(message: string, error?: any): void {
    console.error(`[VoiceTracker ERROR] ${message}`, error);
  }

  warn(message: string, ...args: any[]): void {
    console.warn(`[VoiceTracker WARN] ${message}`, ...args);
  }

  debug(message: string, ...args: any[]): void {
    if (this.debugEnabled) {
      console.log(`[VoiceTracker DEBUG] ${message}`, ...args);
    }
  }
}
