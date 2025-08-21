import { useState, useEffect } from "react";
import { createAuthenticationAdapter } from "@rainbow-me/rainbowkit";
import { SiweMessage } from "siwe";
import { connection } from "./connection";
import { handleLoginSuccess } from "./loginSuccess";
import { storage } from "../utils/storage";
import { setupLoggedInPlayerProfile } from "../game/board";
import { didAttemptAuthentication } from "../game/gameController";
import { updateProfileDisplayName } from "../ui/ProfileSignIn";
export type AuthStatus = "loading" | "unauthenticated" | "authenticated";

let globalSetAuthStatus: ((status: AuthStatus) => void) | null = null;

export function setAuthStatusGlobally(status: AuthStatus) {
  if (globalSetAuthStatus) {
    globalSetAuthStatus(status);
  }
}

export function useAuthStatus() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>(() => {
    const profileId = storage.getProfileId("");
    const storedLoginId = storage.getLoginId("");
    const storedEthAddress = storage.getEthAddress("");
    const storedSolAddress = storage.getSolAddress("");
    const storedUsername = storage.getUsername("");
    if (profileId !== "" && storedLoginId !== "" && storedUsername !== "" && (storedEthAddress !== "" || storedSolAddress !== "")) {
      updateProfileDisplayName(storedUsername, storedEthAddress, storedSolAddress);
      return "authenticated";
    }
    return "unauthenticated";
  });

  useEffect(() => {
    globalSetAuthStatus = setAuthStatus;
    return () => {
      globalSetAuthStatus = null;
    };
  }, [setAuthStatus]);

  useEffect(() => {
    let didPerformInitialSetup = false;
    connection.subscribeToAuthChanges((uid) => {
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
          connection.refreshTokenIfNeeded();
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
            // TODO: add aura
            cardBackgroundId: undefined,
            cardSubtitleId: undefined,
            profileMons: undefined,
            cardStickers: undefined,
            completedProblemIds: undefined,
            isTutorialCompleted: undefined,
          };
          updateProfileDisplayName(storedUsername, storedEthAddress, storedSolAddress);
          setupLoggedInPlayerProfile(profile, uid);
          setTimeout(() => didAttemptAuthentication(), 23);
        } else {
          setAuthStatus("unauthenticated");
          setTimeout(() => didAttemptAuthentication(), 23);
        }
      } else {
        setAuthStatus("unauthenticated");
        setTimeout(() => didAttemptAuthentication(), 23);
      }
    });
  }, []);

  return { authStatus, setAuthStatus };
}

export const createEthereumAuthAdapter = (setAuthStatus: (status: AuthStatus) => void) =>
  createAuthenticationAdapter({
    getNonce: async () => {
      const nonce = await connection.signIn();
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
      const res = await connection.verifyEthAddress(message, signature);
      if (res && res.ok === true) {
        handleLoginSuccess(res, "eth");
        setAuthStatus("authenticated");
        return true;
      } else {
        setAuthStatus("unauthenticated");
        return false;
      }
    },

    signOut: async () => {},
  });
