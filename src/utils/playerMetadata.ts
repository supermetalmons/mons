import { getProfiles } from "../connection/connection";
import { PlayerProfile } from "../connection/connectionModels";

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
  
  // TODO: implement
}

export function getStashedPlayerAddress(uid: string) {
  return ethAddresses[uid];
}

export function resolveEthAddress(address: string, uid: string, onSuccess: () => void) {
  ethAddresses[uid] = address;
  if (!ensDict[address]) {
    getProfiles([uid])
      .then((profilesDict) => {
        const profile = profilesDict[uid];
        if (profile !== undefined) {
          allProfilesDict[address] = profile;
          onSuccess();
        }
      })
      .catch(() => {});

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

export function getEnsName(address: string): string | undefined {
  if (!address) return undefined;
  return ensDict[address]?.name;
}

const ethAddresses: { [key: string]: string } = {};
const ensDict: { [key: string]: { name: string; avatar: string } } = {};
const allProfilesDict: { [key: string]: PlayerProfile } = {};
