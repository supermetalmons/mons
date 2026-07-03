import { setIsMusicPlayingGlobal } from "../ui/MainMenu";

const tracks = [
  "arploop",
  "band",
  "bell_dance",
  "bell_glide",
  "bounce",
  "bubble_jam",
  "buzz",
  "change",
  "chimes_photography_going_home",
  "clock_tower",
  "cloud_propeller_2",
  "cloud_propeller",
  "crumbs",
  "driver",
  "drreams",
  "ewejam",
  "gilded",
  "gustofwind",
  "honkshoooo_memememeee_zzzzzz",
  "jelly_jam",
  "mana_pool",
  "melodine",
  "object",
  "organwhawha",
  "ping",
  "runner",
  "spirit_track",
  "super",
  "whale2",
];

let audioElement: HTMLAudioElement | null = null;
let currentTrack = "";
let mediaMetadata: MediaMetadata | null = null;

function showMonsAlbumArtwork(title: string) {
  if (!mediaMetadata) {
    mediaMetadata = new MediaMetadata({
      artist: "mons.link",
      artwork: [
        {
          src: "/music-cover.jpg",
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

export function playNextTrack(): void {
  if (audioElement) {
    audioElement.src = getRandomTrackUrl();
    audioElement.play().catch((error) => {
      console.error("Error playing next track:", error);
    });
    showMonsAlbumArtwork(currentTrack);
  } else {
    startPlayingMusic();
  }
}

function getRandomTrackUrl(): string {
  const randomIndex = Math.floor(Math.random() * tracks.length);
  const randomTrack = tracks[randomIndex];
  currentTrack = randomTrack;
  return `https://cdn.lil.org/mons/music/original/${randomTrack}.aac`;
}
