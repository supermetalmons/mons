import { getIsMuted } from "../index";
import { isMobile } from "./misc";

export class SoundPlayer {
  private audioContext!: AudioContext;
  private audioBufferCache = new Map<string, AudioBuffer>();
  private isInitialized = false;
  private isResuming = false;

  constructor() {
    document.addEventListener("touchend", () => this.initializeOnUserInteraction(), { once: true });
    document.addEventListener("click", () => this.initializeOnUserInteraction(), { once: true });
    this.attachVisibilityHandlers();
  }

  public async initializeOnUserInteraction(force: boolean = false) {
    const isMuted = getIsMuted();
    if (this.isInitialized || (isMuted && !force)) return;
    if (document.visibilityState !== "visible" && !force) return;
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.attachStateChangeHandler();
    await this.unlockOnce(force);
    this.isInitialized = true;
  }

  private attachVisibilityHandlers() {
    if (isMobile) {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          this.cleanup();
        } else if (document.visibilityState === "visible") {
          this.setupRestartListeners();
        }
      });
      window.addEventListener("pagehide", () => {
        this.cleanup();
      });
      window.addEventListener("pageshow", () => {
        this.setupRestartListeners();
      });
    }
  }

  private cleanup() {
    if (!this.isInitialized) return;
    try {
      if (this.audioContext && this.audioContext.state !== "closed") {
        this.audioContext.suspend();
      }
    } catch (_) {}
  }

  private unlockOnce = async (force: boolean = false) => {
    if ((getIsMuted() && !force) || document.visibilityState !== "visible") return;
    if (!this.audioContext) return;
    if (this.audioContext.state === "closed") return;
    try {
      if (this.audioContext.state !== "running") {
        if (this.isResuming) return;
        this.isResuming = true;
        await this.audioContext.resume();
        this.isResuming = false;
      }
      const buffer = this.audioContext.createBuffer(1, 1, this.audioContext.sampleRate);
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext.destination);
      source.start(0);
    } catch (_) {
      this.isResuming = false;
      this.setupRestartListeners();
    }
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

  private async prepareContext(): Promise<AudioContext | null> {
    if (!this.isInitialized) return null;
    if (!this.audioContext) return null;
    if (this.audioContext.state === "closed") {
      this.isInitialized = false;
      this.setupRestartListeners();
      return null;
    }
    try {
      if (this.audioContext.state !== "running") {
        if (!this.isResuming) {
          this.isResuming = true;
          await this.audioContext.resume();
          this.isResuming = false;
        }
      }
      return this.audioContext;
    } catch (_) {
      this.isResuming = false;
      this.setupRestartListeners();
      return null;
    }
  }

  private attachStateChangeHandler(): void {
    if (!this.audioContext) return;
    const ctx: any = this.audioContext as any;
    const handle = () => {
      if (!this.audioContext) return;
      if (this.audioContext.state !== "running") {
        this.setupRestartListeners();
      }
    };
    if (typeof this.audioContext.addEventListener === "function") {
      this.audioContext.addEventListener("statechange", handle as EventListener);
    } else {
      (this.audioContext as any).onstatechange = handle;
    }
    if (ctx && typeof ctx.addEventListener === "function") {
      try {
        ctx.addEventListener("interruptionend", () => this.setupRestartListeners());
      } catch (_) {}
    }
  }

  public async playSound(url: string): Promise<void> {
    if (!this.isInitialized) return;
    if (document.visibilityState !== "visible" && isMobile) return;
    const ctx = await this.prepareContext();
    if (!ctx) return;
    try {
      const audioBuffer = await this.loadAudioBuffer(url);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch (_) {
      this.setupRestartListeners();
    }
  }

  public async preloadSound(url: string): Promise<void> {
    if (!this.isInitialized) return;
    if (document.visibilityState !== "visible" && isMobile) return;
    const ctx = await this.prepareContext();
    if (!ctx) return;
    try {
      await this.loadAudioBuffer(url);
    } catch (_) {
      this.setupRestartListeners();
    }
  }
}

export const soundPlayer = new SoundPlayer();
