import { getIsMuted } from "../index";

export class SoundPlayer {
  private audioContext!: AudioContext;
  private audioBufferCache = new Map<string, AudioBuffer>();
  private isInitialized = false;

  constructor() {
    document.addEventListener("touchend", () => this.initializeOnUserInteraction(), { once: true });
    document.addEventListener("click", () => this.initializeOnUserInteraction(), { once: true });
    this.attachVisibilityHandlers();
  }

  public async initializeOnUserInteraction(force: boolean = false) {
    const isMuted = getIsMuted();
    if (this.isInitialized || (isMuted && !force)) return;
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    await this.unlockOnce(force);
    this.isInitialized = true;
  }

  private attachVisibilityHandlers() {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.cleanup();
      } else if (document.visibilityState === "visible") {
        this.setupRestartListeners();
      }
    });
  }

  private cleanup() {
    if (!this.isInitialized) return;
    this.audioContext.suspend();
  }

  private unlockOnce = async (force: boolean = false) => {
    if (getIsMuted() && !force) {
      return;
    }
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
    const buffer = this.audioContext.createBuffer(1, 1, this.audioContext.sampleRate);
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    source.start(0);
  };

  private async loadAudioBuffer(url: string): Promise<AudioBuffer> {
    if (this.audioBufferCache.has(url)) {
      return this.audioBufferCache.get(url)!;
    }
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    this.audioBufferCache.set(url, audioBuffer);
    return audioBuffer;
  }

  private setupRestartListeners(): void {
    const handler = async () => {
      await this.unlockOnce();
      document.removeEventListener("touchend", handler);
      document.removeEventListener("click", handler);
    };
    document.addEventListener("touchend", handler, { once: true });
    document.addEventListener("click", handler, { once: true });
  }

  public async playSound(url: string): Promise<void> {
    if (!this.isInitialized) return;
    if (this.audioContext.state === "suspended") {
      this.setupRestartListeners();
      await this.audioContext.resume();
    }
    const audioBuffer = await this.loadAudioBuffer(url);
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    source.start(0);
  }
}

export const soundPlayer = new SoundPlayer();
