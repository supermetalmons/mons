import type { PlayerProfile } from "../connection/connectionModels";
import { storage } from "./storage";

type ProfileCosmetics = Pick<
  PlayerProfile,
  | "cardBackgroundId"
  | "cardStickers"
  | "cardSubtitleId"
  | "profileCounter"
  | "profileMons"
>;

export function createProfileCosmeticWrites(
  profile: ProfileCosmetics,
): Array<{ read(): string | null; write(): void }> {
  return [
    {
      read: () => localStorage.getItem("cardBackgroundId"),
      write: () =>
        storage.setCardBackgroundId(profile.cardBackgroundId ?? null),
    },
    {
      read: () => localStorage.getItem("cardStickers"),
      write: () => storage.setCardStickers(profile.cardStickers ?? null),
    },
    {
      read: () => localStorage.getItem("cardSubtitleId"),
      write: () => storage.setCardSubtitleId(profile.cardSubtitleId ?? null),
    },
    {
      read: () => localStorage.getItem("profileCounter"),
      write: () => storage.setProfileCounter(profile.profileCounter ?? null),
    },
    {
      read: () => localStorage.getItem("profileMons"),
      write: () => storage.setProfileMons(profile.profileMons ?? null),
    },
  ];
}
