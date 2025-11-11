import { storage } from "../utils/storage";
import { setupLoggedInPlayerProfile, updateEmojiAndAuraIfNeeded } from "../game/board";
import { connection } from "./connection";
import { updateProfileDisplayName } from "../ui/ProfileSignIn";
import { handleFreshlySignedInProfileInGameIfNeeded, isWatchOnly } from "../game/gameController";
import { PlayerMiningData, PlayerProfile } from "../connection/connectionModels";
import { syncTutorialProgress } from "../content/problems";
import { rocksMiningService } from "../services/rocksMiningService";

export type AddressKind = "eth" | "sol";

interface VerifyResponse {
  ok: true;
  uid: string;
  profileId: string;
  username: string;
  address: string;
  emoji: number;
  aura?: string | null;
  rating?: number;
  nonce?: number;
  totalManaPoints?: number;
  win?: number;
  cardBackgroundId?: number;
  cardSubtitleId?: number;
  profileCounter?: string;
  profileMons?: any;
  cardStickers?: any;
  completedProblems?: any;
  tutorialCompleted?: any;
  mining?: PlayerMiningData;
}

export function handleLoginSuccess(res: VerifyResponse, addressKind: AddressKind): void {
  const { emoji, profileId } = res;

  const profile: PlayerProfile = {
    id: profileId,
    username: res.username,
    rating: undefined,
    nonce: undefined,
    win: undefined,
    cardBackgroundId: undefined,
    cardSubtitleId: undefined,
    profileCounter: undefined,
    profileMons: undefined,
    cardStickers: undefined,
    emoji,
    aura: res.aura ?? undefined,
    completedProblemIds: undefined,
    isTutorialCompleted: undefined,
  };

  if (addressKind === "eth") {
    (profile as any).eth = res.address;
  } else {
    (profile as any).sol = res.address;
  }

  if (res.rating !== undefined) profile.rating = res.rating;
  if (res.nonce !== undefined) profile.nonce = res.nonce;
  if (res.totalManaPoints !== undefined) (profile as any).totalManaPoints = res.totalManaPoints;
  if (res.cardBackgroundId !== undefined) profile.cardBackgroundId = res.cardBackgroundId;
  if (res.cardStickers !== undefined) profile.cardStickers = res.cardStickers;
  if (res.cardSubtitleId !== undefined) profile.cardSubtitleId = res.cardSubtitleId;
  if (res.profileCounter !== undefined) profile.profileCounter = res.profileCounter;
  if (res.profileMons !== undefined) profile.profileMons = res.profileMons;

  syncTutorialProgress(res.completedProblems ?? [], res.tutorialCompleted ?? false);
  setupLoggedInPlayerProfile(profile, res.uid);

  storage.setUsername(res.username);
  storage.setProfileId(profileId);
  storage.setPlayerEmojiId(emoji.toString());
  storage.setPlayerEmojiAura(res.aura ?? "");
  storage.setLoginId(res.uid);

  if (addressKind === "eth") {
    storage.setEthAddress(res.address);
    updateProfileDisplayName(res.username, res.address, null);
  } else {
    storage.setSolAddress(res.address);
    updateProfileDisplayName(res.username, null, res.address);
  }

  if (res.rating !== undefined) storage.setPlayerRating(res.rating);
  if (res.nonce !== undefined) storage.setPlayerNonce(res.nonce);
  if (res.totalManaPoints !== undefined) storage.setPlayerTotalManaPoints(res.totalManaPoints);
  if (res.cardBackgroundId !== undefined) storage.setCardBackgroundId(res.cardBackgroundId);
  if (res.cardStickers !== undefined) storage.setCardStickers(res.cardStickers);
  if (res.cardSubtitleId !== undefined) storage.setCardSubtitleId(res.cardSubtitleId);
  if (res.profileCounter !== undefined) storage.setProfileCounter(res.profileCounter);
  if (res.profileMons !== undefined) storage.setProfileMons(res.profileMons);
  if (res.mining) {
    storage.setMiningLastRockDate(res.mining.lastRockDate ?? null);
    storage.setMiningMaterials(res.mining.materials);
    rocksMiningService.setFromServer(res.mining, { persist: false });
  }

  connection.forceTokenRefresh();

  if (!isWatchOnly) {
    updateEmojiAndAuraIfNeeded(emoji.toString(), res.aura ?? undefined, false);
  }

  handleFreshlySignedInProfileInGameIfNeeded(profileId);
}
