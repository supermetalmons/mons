import { storage } from "../utils/storage";
import { setupLoggedInPlayerProfile, updateEmojiIfNeeded } from "../game/board";
import { connection } from "./connection";
import { updateProfileDisplayName } from "../ui/ProfileSignIn";
import { handleFreshlySignedInProfileInGameIfNeeded, isWatchOnly } from "../game/gameController";
import { PlayerProfile } from "../connection/connectionModels";

export type AddressKind = "eth" | "sol";

interface VerifyResponse {
  ok: true;
  uid: string;
  profileId: string;
  username: string;
  address: string;
  emoji: number;
  rating?: number;
  nonce?: number;
  win?: number;
  cardBackgroundId?: number;
  cardSubtitleId?: number;
  profileMons?: any;
  cardStickers?: any;
  completedProblems?: any;
  tutorialCompleted?: any;
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
    profileMons: undefined,
    cardStickers: undefined,
    emoji,
    completedProblemIds: undefined, // TODO: setup based on the response
    isTutorialCompleted: undefined, // TODO: setup based on the response
  };

  if (addressKind === "eth") {
    (profile as any).eth = res.address;
  } else {
    (profile as any).sol = res.address;
  }

  if (res.rating !== undefined) profile.rating = res.rating;
  if (res.nonce !== undefined) profile.nonce = res.nonce;
  if (res.cardBackgroundId !== undefined) profile.cardBackgroundId = res.cardBackgroundId;
  if (res.cardStickers !== undefined) profile.cardStickers = res.cardStickers;
  if (res.cardSubtitleId !== undefined) profile.cardSubtitleId = res.cardSubtitleId;
  if (res.profileMons !== undefined) profile.profileMons = res.profileMons;

  // completedProblemIds // TODO: setup based on the response
  // isTutorialCompleted // TODO: setup based on the response
  // TODO: use import { syncTutorialProgress } from "../content/problems";
  // TODO: handle tutorial data

  setupLoggedInPlayerProfile(profile, res.uid);

  storage.setUsername(res.username);
  storage.setProfileId(profileId);
  storage.setPlayerEmojiId(emoji.toString());
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
  if (res.cardBackgroundId !== undefined) storage.setCardBackgroundId(res.cardBackgroundId);
  if (res.cardStickers !== undefined) storage.setCardStickers(res.cardStickers);
  if (res.cardSubtitleId !== undefined) storage.setCardSubtitleId(res.cardSubtitleId);
  if (res.profileMons !== undefined) storage.setProfileMons(res.profileMons);

  connection.forceTokenRefresh();

  if (!isWatchOnly) {
    updateEmojiIfNeeded(emoji.toString(), false);
  }

  handleFreshlySignedInProfileInGameIfNeeded(profileId);
}
