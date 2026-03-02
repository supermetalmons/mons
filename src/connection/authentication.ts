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
const ETH_INTENT_STORAGE_KEY = "ethIntentByNonceV1";
const ETH_INTENT_MAX_ITEMS = 200;
const ETH_INTENT_MAX_AGE_MS = 10 * 60 * 1000;

type EthIntentRecord = {
  nonce: string;
  intentId: string;
  createdAtMs: number;
};

const ethIntentIdByNonce = new Map<string, { intentId: string; createdAtMs: number }>();

const readStoredEthIntentRecords = (): EthIntentRecord[] => {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.sessionStorage.getItem(ETH_INTENT_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const nowMs = Date.now();
    return parsed
      .map((item) => {
        const nonce = typeof item?.nonce === "string" ? item.nonce : "";
        const intentId = typeof item?.intentId === "string" ? item.intentId : "";
        const createdAtMs = typeof item?.createdAtMs === "number" ? item.createdAtMs : Number(item?.createdAtMs);
        if (!nonce || !intentId || !Number.isFinite(createdAtMs)) {
          return null;
        }
        if (nowMs - createdAtMs > ETH_INTENT_MAX_AGE_MS) {
          return null;
        }
        return {
          nonce,
          intentId,
          createdAtMs: Math.floor(createdAtMs),
        };
      })
      .filter((record): record is EthIntentRecord => !!record);
  } catch {
    return [];
  }
};

const writeStoredEthIntentRecords = (records: EthIntentRecord[]): void => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (records.length === 0) {
      window.sessionStorage.removeItem(ETH_INTENT_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(ETH_INTENT_STORAGE_KEY, JSON.stringify(records));
  } catch {}
};

const pruneAndPersistEthIntentRecords = (): void => {
  const nowMs = Date.now();
  const records = Array.from(ethIntentIdByNonce.entries())
    .map(([nonce, value]) => ({
      nonce,
      intentId: value.intentId,
      createdAtMs: value.createdAtMs,
    }))
    .filter((record) => {
      return record.nonce !== "" && record.intentId !== "" && nowMs - record.createdAtMs <= ETH_INTENT_MAX_AGE_MS;
    })
    .sort((left, right) => left.createdAtMs - right.createdAtMs)
    .slice(-ETH_INTENT_MAX_ITEMS);
  ethIntentIdByNonce.clear();
  records.forEach((record) => {
    ethIntentIdByNonce.set(record.nonce, {
      intentId: record.intentId,
      createdAtMs: record.createdAtMs,
    });
  });
  writeStoredEthIntentRecords(records);
};

const ensureEthIntentRecordsLoaded = (): void => {
  if (ethIntentIdByNonce.size > 0) {
    return;
  }
  const records = readStoredEthIntentRecords();
  records.forEach((record) => {
    ethIntentIdByNonce.set(record.nonce, {
      intentId: record.intentId,
      createdAtMs: record.createdAtMs,
    });
  });
  pruneAndPersistEthIntentRecords();
};

const saveEthIntentRecord = (nonce: string, intentId: string): void => {
  if (!nonce || !intentId) {
    return;
  }
  ensureEthIntentRecordsLoaded();
  ethIntentIdByNonce.set(nonce, {
    intentId,
    createdAtMs: Date.now(),
  });
  pruneAndPersistEthIntentRecords();
};

const takeEthIntentId = (nonce: string): string | undefined => {
  if (!nonce) {
    return undefined;
  }
  ensureEthIntentRecordsLoaded();
  const record = ethIntentIdByNonce.get(nonce);
  ethIntentIdByNonce.delete(nonce);
  pruneAndPersistEthIntentRecords();
  if (!record) {
    return undefined;
  }
  if (Date.now() - record.createdAtMs > ETH_INTENT_MAX_AGE_MS) {
    return undefined;
  }
  return record.intentId;
};

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
  const authChangeVersionRef = useRef(0);

  useEffect(() => {
    globalSetAuthStatus = setAuthStatus;
    return () => {
      globalSetAuthStatus = null;
    };
  }, [setAuthStatus]);

  useEffect(() => {
    let isCancelled = false;
    const authAttemptTimeoutIds = authAttemptTimeoutIdsRef.current;
    const scheduleDidAttemptAuthentication = () => {
      if (isCancelled) {
        return;
      }
      const sessionGuard = connection.createSessionGuard();
      const timeoutId = window.setTimeout(() => {
        authAttemptTimeoutIds.delete(timeoutId);
        if (isCancelled || !sessionGuard()) {
          return;
        }
        didAttemptAuthentication();
      }, 23);
      authAttemptTimeoutIds.add(timeoutId);
    };
    const unsubscribe = connection.subscribeToAuthChanges((uid) => {
      if (isCancelled) {
        return;
      }
      authChangeVersionRef.current += 1;
      const authChangeVersion = authChangeVersionRef.current;
      const isCurrentAuthChange = () => authChangeVersionRef.current === authChangeVersion;
      if (uid === null) {
        setAuthStatus("unauthenticated");
        scheduleDidAttemptAuthentication();
        return;
      }

      const storedLoginId = storage.getLoginId("");
      const storedEthAddress = storage.getEthAddress("");
      const storedSolAddress = storage.getSolAddress("");
      const storedUsername = storage.getUsername("");
      const profileId = storage.getProfileId("");
      if (profileId === "" || storedLoginId !== uid) {
        setAuthStatus("unauthenticated");
        scheduleDidAttemptAuthentication();
        return;
      }

      connection.refreshTokenIfNeeded();
      const sessionGuard = connection.createSessionGuard();
      void (async () => {
        const isStillValid = () => !isCancelled && sessionGuard() && isCurrentAuthChange();
        let resolvedProfileId = profileId;
        let resolvedUsername = storedUsername;
        let resolvedEthAddress = storedEthAddress;
        let resolvedSolAddress = storedSolAddress;
        const storedEmojiRaw = Number.parseInt(storage.getPlayerEmojiId("1"), 10);
        let resolvedEmoji = Number.isFinite(storedEmojiRaw) && storedEmojiRaw > 0 ? storedEmojiRaw : 1;
        let resolvedAura = storage.getPlayerEmojiAura("");

        try {
          const claimSyncResult = await connection.syncProfileClaim();
          if (!isStillValid()) {
            return;
          }
          const syncedProfileId = typeof claimSyncResult?.profileId === "string" ? claimSyncResult.profileId : "";
          if (!syncedProfileId) {
            setAuthStatus("unauthenticated");
            scheduleDidAttemptAuthentication();
            return;
          }
          if (syncedProfileId !== profileId) {
            const authoritativeProfile = await connection.getProfileByLoginId(uid);
            if (!isStillValid()) {
              return;
            }
            const authoritativeProfileId = typeof authoritativeProfile.id === "string" ? authoritativeProfile.id : "";
            if (!authoritativeProfileId) {
              setAuthStatus("unauthenticated");
              scheduleDidAttemptAuthentication();
              return;
            }
            resolvedProfileId = authoritativeProfileId;
            resolvedUsername = authoritativeProfile.username ?? "";
            resolvedEthAddress = authoritativeProfile.eth ?? "";
            resolvedSolAddress = authoritativeProfile.sol ?? "";
            const authoritativeEmoji =
              Number.isFinite(authoritativeProfile.emoji) && authoritativeProfile.emoji > 0
                ? Math.floor(authoritativeProfile.emoji)
                : resolvedEmoji;
            resolvedEmoji = authoritativeEmoji;
            resolvedAura = authoritativeProfile.aura ?? "";
            storage.setProfileId(resolvedProfileId);
            storage.setUsername(resolvedUsername);
            storage.setEthAddress(resolvedEthAddress);
            storage.setSolAddress(resolvedSolAddress);
            storage.setPlayerEmojiId(resolvedEmoji.toString());
            storage.setPlayerEmojiAura(resolvedAura);
          }
        } catch {
          if (!isStillValid()) {
            return;
          }
        }

        if (!isStillValid()) {
          return;
        }
        const profile = {
          id: resolvedProfileId,
          username: resolvedUsername,
          eth: resolvedEthAddress,
          sol: resolvedSolAddress,
          rating: undefined,
          nonce: undefined,
          win: undefined,
          emoji: resolvedEmoji,
          aura: resolvedAura,
          cardBackgroundId: undefined,
          cardSubtitleId: undefined,
          profileCounter: undefined,
          profileMons: undefined,
          cardStickers: undefined,
          completedProblemIds: undefined,
          isTutorialCompleted: undefined,
        };
        updateProfileDisplayName(resolvedUsername, resolvedEthAddress, resolvedSolAddress);
        const resolvedLoginUid = connection.getSameProfilePlayerUid() ?? uid;
        setupLoggedInPlayerProfile(profile, resolvedLoginUid);
        setAuthStatus("authenticated");
        scheduleDidAttemptAuthentication();
      })();
    });
    return () => {
      isCancelled = true;
      authChangeVersionRef.current += 1;
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
      saveEthIntentRecord(intent.nonce, intent.intentId);
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
        intentId = takeEthIntentId(parsed.nonce);
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
