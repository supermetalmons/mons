import { showMonsAlbumArtwork } from "../content/music";
import { getIsMuted } from "../index";
import { isMobileOrVision, createSilentAudioDataUrl } from "./misc";

export class SoundPlayer {
  private audioContext!: AudioContext;
  private audioBufferCache: Map<string, AudioBuffer>;
  private isInitialized: boolean;
  private silentAudio: HTMLAudioElement | null;

  constructor() {
    this.audioBufferCache = new Map();
    this.isInitialized = false;
    this.silentAudio = null;
  }

  public initialize(force: boolean): void {
    if (this.isInitialized) return;
    if (force || !getIsMuted()) {
      if (isMobileOrVision) {
        const silentAudioUrl = createSilentAudioDataUrl(3);
        this.silentAudio = new Audio(silentAudioUrl);
        this.silentAudio.loop = true;
        this.silentAudio.volume = 0.01;
      }

      this.startSilentAudioIfNeeded();
      this.audioContext = new AudioContext();
      this.isInitialized = true;
    }
  }

  private startSilentAudioIfNeeded() {
    if (!getIsMuted() && isMobileOrVision) {
      this.silentAudio?.play().catch((_) => {});
      showMonsAlbumArtwork();
    }
  }

  private pauseSilentAudioIfNeeded() {
    if (isMobileOrVision) {
      this.silentAudio?.pause();
    }
  }

  public didBecomeMuted(muted: boolean) {
    if (muted) {
      this.pauseSilentAudioIfNeeded();
    } else {
      this.startSilentAudioIfNeeded();
    }
  }

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

  public async playSound(url: string): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    if (this.audioContext.state === "suspended") {
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

document.addEventListener(
  "touchend",
  async () => {
    soundPlayer.initialize(false);
  },
  { once: true }
);

document.addEventListener(
  "click",
  async () => {
    soundPlayer.initialize(false);
  },
  { once: true }
);
