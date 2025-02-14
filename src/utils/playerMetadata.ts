import { getProfileByLoginId, sendEmojiUpdate } from "../connection/connection";
import { PlayerProfile } from "../connection/connectionModels";
import glicko2 from "glicko2";
import { storage } from "./storage";
import { updateEmojiIfNeeded } from "../game/board";
import { isWatchOnly } from "../game/gameController";

export type PlayerMetadata = {
  uid: string;
  displayName: string | undefined;
  ethAddress: string | undefined;
  solAddress: string | undefined;
  ens: string | undefined;
  emojiId: string;
  voiceReactionText: string;
  voiceReactionDate: number | undefined;
  rating: number | undefined;
};

export const newEmptyPlayerMetadata = (): PlayerMetadata => ({
  uid: "",
  displayName: undefined,
  ethAddress: undefined,
  solAddress: undefined,
  ens: undefined,
  emojiId: "",
  voiceReactionText: "",
  voiceReactionDate: undefined,
  rating: undefined,
});

export function openSolAddress(address: string) {
  const explorerBaseUrl = "https://explorer.solana.com/address/";
  const explorerUrl = explorerBaseUrl + address;
  window.open(explorerUrl, "_blank", "noopener,noreferrer");
}

export function openEthAddress(address: string) {
  const etherscanBaseUrl = "https://etherscan.io/address/";
  const etherscanUrl = etherscanBaseUrl + address;
  window.open(etherscanUrl, "_blank", "noopener,noreferrer");
}

export function recalculateRatingsLocallyForUids(victoryUid: string, defeatUid: string) {
  const rating1 = getRatingForUid(victoryUid);
  const rating2 = getRatingForUid(defeatUid);
  const nonce1 = getNonceForUid(victoryUid);
  const nonce2 = getNonceForUid(defeatUid);

  if (!rating1 || !rating2 || nonce1 === undefined || nonce2 === undefined) {
    return;
  }

  const newNonce1 = nonce1 + 1;
  const newNonce2 = nonce2 + 1;

  const [newRating1, newRating2] = updateRating(rating1, newNonce1, rating2, newNonce2);

  setRatingAndNonceForUid(victoryUid, newRating1, newNonce1);
  setRatingAndNonceForUid(defeatUid, newRating2, newNonce2);
}

export function getStashedPlayerSolAddress(uid: string) {
  return solAddressesForUids[uid];
}

export function getStashedPlayerEthAddress(uid: string) {
  return ethAddressesForUids[uid];
}

export function updatePlayerMetadataWithProfile(profile: PlayerProfile, loginId: string, own: boolean, onSuccess: () => void) {
  const noSol = profile.sol === undefined || profile.sol === "" || !profile.sol;
  const noEth = profile.eth === undefined || profile.eth === "" || !profile.eth;
  if (noSol && noEth) {
    return;
  }

  if (noSol) {
    const ethAddress = profile.eth ?? "";
    ethAddressesForUids[loginId] = ethAddress;
    if (!ensDict[loginId]) {
      fetch(`https://api.ensideas.com/ens/resolve/${ethAddress}`)
        .then((response) => {
          if (response.ok) {
            return response.json();
          }
          return null;
        })
        .then((data) => {
          if (data && data.name && data.name.trim() !== "") {
            ensDict[loginId] = {
              name: data.name,
              avatar: data.avatar,
            };
            onSuccess();
          }
        })
        .catch(() => {});
    }
  } else {
    solAddressesForUids[loginId] = profile.sol ?? "";
  }

  if (profile.rating !== undefined && profile.nonce !== undefined) {
    allProfilesDict[loginId] = profile;
    onSuccess();
  } else {
    getProfileByLoginId(loginId)
      .then((profile) => {
        allProfilesDict[loginId] = profile;
        if (profile.emoji !== undefined && own) {
          storage.setPlayerEmojiId(profile.emoji.toString());
          if (!isWatchOnly) {
            updateEmojiIfNeeded(profile.emoji.toString(), false);
          }
          sendEmojiUpdate(profile.emoji, true);
        }
        onSuccess();
      })
      .catch(() => {});
  }
}

export function getRatingForUid(uid: string): number | undefined {
  if (!uid) return undefined;
  return allProfilesDict[uid]?.rating;
}

function getNonceForUid(uid: string): number | undefined {
  if (!uid) return undefined;
  return allProfilesDict[uid]?.nonce;
}

function setRatingAndNonceForUid(uid: string, rating: number, nonce: number): void {
  if (!uid) return;
  if (allProfilesDict[uid]) {
    allProfilesDict[uid].rating = rating;
    allProfilesDict[uid].nonce = nonce;
  }
}

export function getEnsNameForUid(uid: string): string | undefined {
  if (!uid) return undefined;
  return ensDict[uid]?.name;
}

const ethAddressesForUids: { [key: string]: string } = {};
const solAddressesForUids: { [key: string]: string } = {};
const ensDict: { [key: string]: { name: string; avatar: string } } = {};
const allProfilesDict: { [key: string]: PlayerProfile } = {};

const updateRating = (winRating: number, winPlayerGamesCount: number, lossRating: number, lossPlayerGamesCount: number) => {
  const settings = {
    tau: 0.75,
    rating: 1500,
    rd: 100,
    vol: 0.06,
  };

  const ranking = new glicko2.Glicko2(settings);
  const adjustRd = (gamesCount: number) => Math.max(60, 350 - gamesCount);
  const winner = ranking.makePlayer(winRating, adjustRd(winPlayerGamesCount), 0.06);
  const loser = ranking.makePlayer(lossRating, adjustRd(lossPlayerGamesCount), 0.06);
  const matches: [any, any, number][] = [[winner, loser, 1]];
  ranking.updateRatings(matches);

  const newWinRating = Math.round(winner.getRating());
  const newLossRating = Math.round(loser.getRating());

  return [newWinRating, newLossRating];
};
