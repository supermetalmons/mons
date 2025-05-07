import { useState, useEffect } from "react";
import { createAuthenticationAdapter } from "@rainbow-me/rainbowkit";
import { SiweMessage } from "siwe";
import { subscribeToAuthChanges, signIn, verifyEthAddress, forceTokenRefresh, refreshTokenIfNeeded } from "./connection";
import { setupLoggedInPlayerProfile, updateEmojiIfNeeded } from "../game/board";
import { storage } from "../utils/storage";
import { updateProfileDisplayName } from "../ui/ProfileSignIn";
import { handleFreshlySignedInProfileInGameIfNeeded, isWatchOnly } from "../game/gameController";
export type AuthStatus = "loading" | "unauthenticated" | "authenticated";

let globalSetAuthStatus: ((status: AuthStatus) => void) | null = null;

export function setAuthStatusGlobally(status: AuthStatus) {
  if (globalSetAuthStatus) {
    globalSetAuthStatus(status);
  }
}

export function useAuthStatus() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    globalSetAuthStatus = setAuthStatus;
    return () => {
      globalSetAuthStatus = null;
    };
  }, [setAuthStatus]);

  useEffect(() => {
    let didPerformInitialSetup = false;
    subscribeToAuthChanges((uid) => {
      if (didPerformInitialSetup) {
        return;
      }
      didPerformInitialSetup = true;
      if (uid !== null) {
        const storedLoginId = storage.getLoginId("");
        const storedEthAddress = storage.getEthAddress("");
        const storedSolAddress = storage.getSolAddress("");
        const storedUsername = storage.getUsername("");
        const profileId = storage.getProfileId("");
        if (profileId !== "" && storedLoginId === uid && (storedEthAddress !== "" || storedSolAddress !== "")) {
          setAuthStatus("authenticated");
          refreshTokenIfNeeded();
          const emojiString = storage.getPlayerEmojiId("1");
          const emoji = parseInt(emojiString);
          const profile = {
            id: profileId,
            username: storedUsername,
            eth: storedEthAddress,
            sol: storedSolAddress,
            rating: undefined,
            nonce: undefined,
            win: undefined,
            emoji: emoji,
            cardBackgroundId: undefined,
            cardSubtitleId: undefined,
            profileMons: undefined,
            cardStickers: undefined,
          };
          // TODO: setup with correct profile and card id values on auth
          updateProfileDisplayName(storedUsername, storedEthAddress, storedSolAddress);
          setupLoggedInPlayerProfile(profile, uid);
        } else {
          setAuthStatus("unauthenticated");
        }
      } else {
        setAuthStatus("unauthenticated");
      }
    });
  }, []);

  return { authStatus, setAuthStatus };
}

export const createEthereumAuthAdapter = (setAuthStatus: (status: AuthStatus) => void) =>
  createAuthenticationAdapter({
    getNonce: async () => {
      const nonce = await signIn();
      if (!nonce) throw new Error("Failed to get nonce");
      return nonce;
    },

    createMessage: ({ nonce, address, chainId }) => {
      return new SiweMessage({
        domain: window.location.host,
        address,
        statement: "mons ftw",
        uri: window.location.origin,
        version: "1",
        chainId,
        nonce,
      }).prepareMessage();
    },

    verify: async ({ message, signature }) => {
      const res = await verifyEthAddress(message, signature);
      if (res && res.ok === true) {
        const emoji = res.emoji;
        const profileId = res.profileId;
        const username = res.username;
        const profile = {
          id: profileId,
          username: username,
          eth: res.address,
          rating: undefined,
          nonce: undefined,
          win: undefined,
          cardBackgroundId: undefined,
          cardSubtitleId: undefined,
          profileMons: undefined,
          cardStickers: undefined,
          emoji: emoji,
        };
        setupLoggedInPlayerProfile(profile, res.uid);
        // TODO: setup with correct profile and card id values on auth

        storage.setUsername(username);
        storage.setEthAddress(res.address);
        storage.setPlayerEmojiId(emoji.toString());
        storage.setProfileId(profileId);
        forceTokenRefresh();
        storage.setLoginId(res.uid);
        updateProfileDisplayName(username, res.address, null);
        if (!isWatchOnly) {
          updateEmojiIfNeeded(emoji, false);
        }

        setAuthStatus("authenticated");
        handleFreshlySignedInProfileInGameIfNeeded(profileId);
        return true;
      } else {
        setAuthStatus("unauthenticated");
        return false;
      }
    },

    signOut: async () => {},
  });
