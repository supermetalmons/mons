import { useState, useEffect } from "react";
import { createAuthenticationAdapter } from "@rainbow-me/rainbowkit";
import { SiweMessage } from "siwe";
import { subscribeToAuthChanges, signIn, verifyEthAddress } from "./connection";
import { setupLoggedInPlayerProfile, updateEmojiIfNeeded } from "../game/board";
import { storage } from "../utils/storage";

export type AuthStatus = "loading" | "unauthenticated" | "authenticated";

export function useAuthStatus() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");

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
        if (storedLoginId === uid && (storedEthAddress !== "" || storedSolAddress !== "")) {
          setAuthStatus("authenticated");
          const profileId = storage.getProfileId("");
          const emojiString = storage.getPlayerEmojiId("1");
          const emoji = parseInt(emojiString);
          const profile = {
            id: profileId,
            eth: storedEthAddress,
            sol: storedSolAddress,
            rating: undefined,
            nonce: undefined,
            win: undefined,
            emoji: emoji,
          };
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
        const profile = {
          id: profileId,
          eth: res.address,
          rating: undefined,
          nonce: undefined,
          win: undefined,
          emoji: emoji,
        };
        setupLoggedInPlayerProfile(profile, res.uid);

        storage.setEthAddress(res.address);
        storage.setPlayerEmojiId(emoji.toString());
        storage.setProfileId(profileId);
        storage.setLoginId(res.uid);
        updateEmojiIfNeeded(emoji, false);

        setAuthStatus("authenticated");
        return true;
      } else {
        setAuthStatus("unauthenticated");
        return false;
      }
    },

    signOut: async () => {},
  });
