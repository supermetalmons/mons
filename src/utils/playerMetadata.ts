import { getProfileByLoginId } from "../connection/connection";
import { PlayerProfile } from "../connection/connectionModels";
import glicko2 from "glicko2";

export type PlayerMetadata = {
  uid: string;
  displayName: string | undefined;
  ethAddress: string | undefined;
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
  ens: undefined,
  emojiId: "",
  voiceReactionText: "",
  voiceReactionDate: undefined,
  rating: undefined,
});

export function openEthAddress(address: string) {
  const etherscanBaseUrl = "https://etherscan.io/address/";
  const etherscanUrl = etherscanBaseUrl + address;
  window.open(etherscanUrl, "_blank", "noopener,noreferrer");
}

export function recalculateRatingsLocally(victoryAddress: string, defeatAddress: string) {
  const rating1 = getRating(victoryAddress);
  const rating2 = getRating(defeatAddress);
  const nonce1 = getNonce(victoryAddress);
  const nonce2 = getNonce(defeatAddress);

  if (!rating1 || !rating2 || nonce1 === undefined || nonce2 === undefined) {
    return;
  }

  const newNonce1 = nonce1 + 1;
  const newNonce2 = nonce2 + 1;

  const [newRating1, newRating2] = updateRating(rating1, newNonce1, rating2, newNonce2);

  setRatingAndNonce(victoryAddress, newRating1, newNonce1);
  setRatingAndNonce(defeatAddress, newRating2, newNonce2);
}

export function getStashedPlayerAddress(uid: string) {
  return ethAddresses[uid];
}

export function updatePlayerMetadataWithProfile(profile: PlayerProfile, loginId: string, onSuccess: () => void) {
  if (profile.eth === undefined || profile.eth === "" || !profile.eth) {
    return;
  }
  const address = profile.eth;
  ethAddresses[loginId] = address;

  if (profile.rating !== undefined && profile.nonce !== undefined) {
    allProfilesDict[address] = profile;
    onSuccess();
  } else {
    getProfileByLoginId(loginId)
      .then((profile) => {
        allProfilesDict[address] = profile;
        onSuccess();
      })
      .catch(() => {});
  }

  if (!ensDict[address]) {
    fetch(`https://api.ensideas.com/ens/resolve/${address}`)
      .then((response) => {
        if (response.ok) {
          return response.json();
        }
        return null;
      })
      .then((data) => {
        if (data && data.name && data.name.trim() !== "") {
          ensDict[address] = {
            name: data.name,
            avatar: data.avatar,
          };
          onSuccess();
        }
      })
      .catch(() => {});
  }
}

export function getRating(address: string): number | undefined {
  if (!address) return undefined;
  return allProfilesDict[address]?.rating;
}

function getNonce(address: string): number | undefined {
  if (!address) return undefined;
  return allProfilesDict[address]?.nonce;
}

function setRatingAndNonce(address: string, rating: number, nonce: number): void {
  if (!address) return;
  if (allProfilesDict[address]) {
    allProfilesDict[address].rating = rating;
    allProfilesDict[address].nonce = nonce;
  }
}

export function getEnsName(address: string): string | undefined {
  if (!address) return undefined;
  return ensDict[address]?.name;
}

const ethAddresses: { [key: string]: string } = {};
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
