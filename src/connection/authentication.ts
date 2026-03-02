import { useState, useEffect, useRef } from "react";
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
const ethIntentIdByNonce = new Map<string, string>();

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
    if (profileId !== "" && storedLoginId !== "") {
      updateProfileDisplayName(storedUsername, storedEthAddress, storedSolAddress);
      return "authenticated";
    }
    return "unauthenticated";
  });
  const authAttemptTimeoutIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    globalSetAuthStatus = setAuthStatus;
    return () => {
      globalSetAuthStatus = null;
    };
  }, [setAuthStatus]);

  useEffect(() => {
    const authAttemptTimeoutIds = authAttemptTimeoutIdsRef.current;
    const scheduleDidAttemptAuthentication = () => {
      const sessionGuard = connection.createSessionGuard();
      const timeoutId = window.setTimeout(() => {
        authAttemptTimeoutIds.delete(timeoutId);
        if (!sessionGuard()) {
          return;
        }
        didAttemptAuthentication();
      }, 23);
      authAttemptTimeoutIds.add(timeoutId);
    };
    const unsubscribe = connection.subscribeToAuthChanges((uid) => {
      if (uid !== null) {
        const storedLoginId = storage.getLoginId("");
        const storedEthAddress = storage.getEthAddress("");
        const storedSolAddress = storage.getSolAddress("");
        const storedUsername = storage.getUsername("");
        const profileId = storage.getProfileId("");
        if (profileId !== "" && storedLoginId === uid) {
          connection.refreshTokenIfNeeded();
          void connection.syncProfileClaim().catch(() => {});
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
            aura: storage.getPlayerEmojiAura(""),
            cardBackgroundId: undefined,
            cardSubtitleId: undefined,
            profileCounter: undefined,
            profileMons: undefined,
            cardStickers: undefined,
            completedProblemIds: undefined,
            isTutorialCompleted: undefined,
          };
          updateProfileDisplayName(storedUsername, storedEthAddress, storedSolAddress);
          const resolvedLoginUid = connection.getSameProfilePlayerUid() ?? uid;
          setupLoggedInPlayerProfile(profile, resolvedLoginUid);
          setAuthStatus("authenticated");
          scheduleDidAttemptAuthentication();
        } else {
          setAuthStatus("unauthenticated");
          scheduleDidAttemptAuthentication();
        }
      } else {
        setAuthStatus("unauthenticated");
        scheduleDidAttemptAuthentication();
      }
    });
    return () => {
      authAttemptTimeoutIds.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      authAttemptTimeoutIds.clear();
      unsubscribe();
    };
  }, []);

  return { authStatus, setAuthStatus };
}

export const createEthereumAuthAdapter = (setAuthStatus: (status: AuthStatus) => void) => {
  return createAuthenticationAdapter({
    getNonce: async () => {
      const intent = await connection.beginAuthIntent("eth");
      ethIntentIdByNonce.set(intent.nonce, intent.intentId);
      if (ethIntentIdByNonce.size > 200) {
        const oldestNonce = ethIntentIdByNonce.keys().next().value;
        if (typeof oldestNonce === "string" && oldestNonce !== "") {
          ethIntentIdByNonce.delete(oldestNonce);
        }
      }
      return intent.nonce;
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
      let intentId: string | undefined;
      try {
        const parsed = new SiweMessage(message);
        intentId = ethIntentIdByNonce.get(parsed.nonce);
        if (parsed.nonce) {
          ethIntentIdByNonce.delete(parsed.nonce);
        }
      } catch {
        intentId = undefined;
      }
      if (!intentId) {
        throw new Error("Missing Ethereum auth intent. Please retry sign in.");
      }
      const res = await connection.verifyEthAddress(message, signature, intentId);
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
};
