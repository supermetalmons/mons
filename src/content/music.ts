import { setIsMusicPlayingGlobal } from "../index";

const tracks = ["arploop", "band", "bell-dance", "bell-glide", "bounce", "bubble-jam", "buzz", "change", "chimes-photography_going-home", "clock-tower", "cloud-propeller-2", "cloud-propeller", "crumbs", "driver", "drreams", "ewejam", "gilded", "gustofwind", "honkshoooo-memememeee-zzzZZZ", "jelly-jam", "mana-pool", "melodine", "object", "organwhawha", "ping", "runner", "spirit-track", "super", "whale2"];

let audioElement: HTMLAudioElement | null = null;
let currentTrack = "";
let mediaMetadata: MediaMetadata | null = null;

export function showMonsAlbumArtwork(title: string) {
  if (!mediaMetadata) {
    mediaMetadata = new MediaMetadata({
      artist: "mons.link",
      artwork: [
        {
          src: "/assets/misc/cover.jpg",
          sizes: "512x512",
        },
      ],
    });
  }

  if ("mediaSession" in navigator) {
    mediaMetadata.title = title;
    navigator.mediaSession.metadata = mediaMetadata;
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

    if ("mediaSession" in navigator) {
      navigator.mediaSession.setActionHandler("nexttrack", () => {
        playNextTrack();
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        playNextTrack();
      });
    }
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

    if ("mediaSession" in navigator) {
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
    }

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
