import { logoBase64 } from "../content/uiAssets";
import { setIsMusicPlayingGlobal } from "../index";

const tracks = ["arploop", "band", "bell-dance", "bell-glide", "bounce", "bubble-jam", "buzz", "change", "chimes-photography_going-home", "clock-tower", "cloud-propeller-2", "cloud-propeller", "crumbs", "driver", "drreams", "ewejam", "gilded", "gustofwind", "honkshoooo-memememeee-zzzZZZ", "jelly-jam", "mana-pool", "melodine", "object", "organwhawha", "ping", "runner", "spirit-track", "super", "whale2"];

let audioElement: HTMLAudioElement | null = null;
let currentTrack = "";

export function showMonsAlbumArtwork(title: string) {
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title,
      artist: "mons.link",
      artwork: [
        {
          src: logoBase64,
        },
      ],
    });
  }
}

const onPause = () => setIsMusicPlayingGlobal(false);
const onPlay = () => setIsMusicPlayingGlobal(true);

export function startPlayingMusic(): void {
  if (!audioElement) {
    audioElement = new Audio(getRandomTrackUrl());
    audioElement.addEventListener("ended", playNextTrack);
    audioElement.addEventListener("pause", onPause);
    audioElement.addEventListener("play", onPlay);
  }
  audioElement.play().catch((error) => {
    console.error("Error playing audio:", error);
  });
  showMonsAlbumArtwork(currentTrack);
}

export function stopPlayingMusic(): void {
  if (audioElement) {
    audioElement.pause();
    audioElement.currentTime = 0;
    audioElement.removeEventListener("ended", playNextTrack);
    audioElement.removeEventListener("pause", onPause);
    audioElement.removeEventListener("play", onPlay);
    audioElement = null;
  }
}

function playNextTrack(): void {
  if (audioElement) {
    audioElement.src = getRandomTrackUrl();
    audioElement.play().catch((error) => {
      console.error("Error playing next track:", error);
    });
    showMonsAlbumArtwork(currentTrack);
  }
}

function getRandomTrackUrl(): string {
  const randomIndex = Math.floor(Math.random() * tracks.length);
  const randomTrack = tracks[randomIndex];
  currentTrack = randomTrack;
  return `https://assets.mons.link/music/${randomTrack}.aac`;
}
