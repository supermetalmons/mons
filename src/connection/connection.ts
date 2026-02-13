import { initializeApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth, signInAnonymously, onAuthStateChanged, signOut } from "firebase/auth";
import { getDatabase, Database, ref, set, onValue, off, get, update } from "firebase/database";
import { getFirestore, Firestore, collection, query, where, limit, getDocs, orderBy, updateDoc, doc } from "firebase/firestore";
import { didFindInviteThatCanBeJoined, didReceiveMatchUpdate, initialFen, didRecoverMyMatch, enterWatchOnlyMode, didFindYourOwnInviteThatNobodyJoined, didReceiveRematchesSeriesEndIndicator, didDiscoverExistingRematchProposalWaitingForResponse, didJustCreateRematchProposalSuccessfully, failedToCreateRematchProposal } from "../game/gameController";
import { getPlayersEmojiId, didGetPlayerProfile, setupPlayerId } from "../game/board";
import { getFunctions, Functions, httpsCallable } from "firebase/functions";
import { Match, Invite, Reaction, PlayerProfile, PlayerMiningData, PlayerMiningMaterials, MINING_MATERIAL_NAMES, MiningMaterialName, MatchWagerState, WagerProposal, WagerAgreement } from "./connectionModels";
import { storage } from "../utils/storage";
import { generateNewInviteId } from "../utils/misc";
import { setDebugViewText } from "../ui/MainMenu";
import { getWagerState, setCurrentWagerMatch, setWagerState } from "../game/wagerState";
import { applyFrozenMaterialsDelta, computeAvailableMaterials, getFrozenMaterials, setFrozenMaterials } from "../services/wagerMaterialsService";
import { rocksMiningService } from "../services/rocksMiningService";
import { getCurrentRouteState } from "../navigation/routeState";
import { pushRoutePath } from "../navigation/appNavigation";
import { decrementLifecycleCounter, incrementLifecycleCounter } from "../lifecycle/lifecycleDiagnostics";

const createEmptyMiningMaterials = (): PlayerMiningMaterials => ({
  dust: 0,
  slime: 0,
  gum: 0,
  metal: 0,
  ice: 0,
});

const normalizeMiningData = (source: any): PlayerMiningData => {
  const materialsInput = source && typeof source === "object" ? (source.materials ?? source) : undefined;
  const materials = createEmptyMiningMaterials();
  MINING_MATERIAL_NAMES.forEach((name) => {
    const raw = materialsInput ? (materialsInput as Record<string, unknown>)[name] : undefined;
    const numeric = typeof raw === "number" ? raw : Number(raw);
    const value = Number.isFinite(numeric) ? Math.max(0, Math.round(numeric as number)) : 0;
    materials[name] = value;
  });
  const lastRockDate = source && typeof source.lastRockDate === "string" ? source.lastRockDate : null;
  return {
    lastRockDate,
    materials,
  };
};

const controllerVersion = 2;
const LEADERBOARD_ENTRY_LIMIT = 99;

let routePath = "";
export let isCreateNewInviteFlow = true;
export let isBoardSnapshotFlow = false;
export let isBotsLoopMode = false;
let snapshotIdFromRoute: string | null = null;
let routeAutojoin = false;

const applyCurrentRouteState = () => {
  const routeState = getCurrentRouteState();
  routePath = routeState.path;
  isCreateNewInviteFlow = routeState.mode === "home";
  isBoardSnapshotFlow = routeState.mode === "snapshot";
  isBotsLoopMode = routeState.mode === "watch";
  snapshotIdFromRoute = routeState.snapshotId;
  routeAutojoin = routeState.autojoin;
};

applyCurrentRouteState();

export function getSnapshotIdAndClearPathIfNeeded(): string | null {
  applyCurrentRouteState();
  return snapshotIdFromRoute;
}

class Connection {
  private app: FirebaseApp;
  private auth: Auth;
  private db: Database;
  private firestore: Firestore;
  private functions: Functions;

  private hostRematchesRef: any = null;
  private guestRematchesRef: any = null;
  private wagersRef: any = null;
  private miningFrozenRef: any = null;
  private matchRefs: { [key: string]: any } = {};
  private profileRefs: { [key: string]: any } = {};

  private loginUid: string | null = null;
  private sameProfilePlayerUid: string | null = null;
  private optimisticResolvedMatchIds = new Set<string>();

  private latestInvite: Invite | null = null;
  private myMatch: Match | null = null;
  private inviteId: string | null = null;
  private matchId: string | null = null;

  private newInviteId = "";
  private didCreateNewGameInvite = false;
  private currentUid: string | null = "";
  private sessionEpoch = 0;
  private inviteWaitRefs = new Set<any>();
  private authUnsubscribers = new Set<() => void>();

  public syncRouteState() {
    applyCurrentRouteState();
  }

  private bumpSessionEpoch() {
    this.sessionEpoch += 1;
    return this.sessionEpoch;
  }

  private isSessionEpochActive(epoch: number) {
    return this.sessionEpoch === epoch;
  }

  public beginMatchSessionTeardown() {
    this.bumpSessionEpoch();
  }

  public createSessionGuard(): () => boolean {
    const epoch = this.sessionEpoch;
    return () => this.isSessionEpochActive(epoch);
  }

  private trackInviteWaitRef(inviteRef: any) {
    this.inviteWaitRefs.add(inviteRef);
    incrementLifecycleCounter("connectionObservers");
  }

  private releaseInviteWaitRef(inviteRef: any) {
    if (this.inviteWaitRefs.has(inviteRef)) {
      this.inviteWaitRefs.delete(inviteRef);
      decrementLifecycleCounter("connectionObservers");
    }
  }

  constructor() {
    const firebaseConfig = {
      apiKey: process.env.REACT_APP_MONS_FIREBASE_API_KEY || "AIzaSyC8Ihr4kDd34z-RXe8XTBCFtFbXebifo5Y",
      authDomain: "mons-link.firebaseapp.com",
      projectId: "mons-link",
      storageBucket: "mons-link.firebasestorage.app",
      messagingSenderId: "390871694056",
      appId: "1:390871694056:web:49d0679d38f3045030675d",
    };

    this.app = initializeApp(firebaseConfig);
    this.auth = getAuth(this.app);
    this.db = getDatabase(this.app);
    this.firestore = getFirestore(this.app);
    this.functions = getFunctions(this.app);
  }

  private cloneWagerState(state: MatchWagerState | null): MatchWagerState | null {
    if (!state) {
      return null;
    }
    const proposals = state.proposals
      ? Object.keys(state.proposals).reduce((acc, key) => {
          const proposal = state.proposals ? state.proposals[key] : null;
          if (proposal) {
            acc[key] = { material: proposal.material, count: proposal.count, createdAt: proposal.createdAt };
          }
          return acc;
        }, {} as Record<string, WagerProposal>)
      : undefined;
    const proposedBy = state.proposedBy ? { ...state.proposedBy } : undefined;
    const agreed = state.agreed ? { ...state.agreed } : undefined;
    const resolved = state.resolved ? { ...state.resolved } : undefined;
    return {
      proposals,
      proposedBy,
      agreed,
      resolved,
    };
  }

  private setLocalWagerState(state: MatchWagerState | null): void {
    if (!this.matchId) {
      return;
    }
    if (this.latestInvite) {
      if (!this.latestInvite.wagers) {
        this.latestInvite.wagers = {};
      }
      if (state) {
        this.latestInvite.wagers[this.matchId] = state;
      } else if (this.latestInvite.wagers) {
        delete this.latestInvite.wagers[this.matchId];
      }
    }
    setWagerState(this.matchId, state);
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private shouldRetryWagerResult(result: any): boolean {
    const reason = result && typeof result.reason === "string" ? result.reason : "";
    return reason === "proposal-unavailable" || reason === "proposal-missing" || reason === "match-not-found";
  }

  private async callWagerFunctionWithRetry(label: string, call: () => Promise<any>, maxAttempts = 3): Promise<any> {
    let attempt = 0;
    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        if (attempt > 1) {
          console.log(`${label}:retry`, { attempt });
        }
        const response = await call();
        const data = response && typeof response === "object" && "data" in response ? (response as any).data : response;
        if (data && data.ok === false && this.shouldRetryWagerResult(data) && attempt < maxAttempts) {
          await this.delay(160 * attempt);
          continue;
        }
        return data;
      } catch (error) {
        if (attempt < maxAttempts) {
          console.log(`${label}:retry`, { attempt, error });
          await this.delay(180 * attempt);
          continue;
        }
        throw error;
      }
    }
    return null;
  }

  public setupConnection(autojoin: boolean): void {
    applyCurrentRouteState();
    if (!isCreateNewInviteFlow) {
      const sessionGuard = this.createSessionGuard();
      const inviteId = routePath;
      if (!inviteId) {
        return;
      }
      const shouldAutojoin = autojoin || routeAutojoin;
      this.signIn().then((uid) => {
        if (uid && sessionGuard()) {
          this.connectToGame(uid, inviteId, shouldAutojoin);
        } else {
          console.log("failed to get game info");
        }
      });
    }
  }

  public connectToAutomatch(inviteId: string): void {
    const sessionGuard = this.createSessionGuard();
    this.newInviteId = inviteId;
    this.updatePath(this.newInviteId);
    this.signIn().then((uid) => {
      if (uid && sessionGuard()) {
        this.connectToGame(uid, inviteId, true);
      } else {
        console.log("failed to get game info");
      }
    });
  }

  public didClickInviteButton(completion: (success: boolean) => void): void {
    applyCurrentRouteState();
    if (this.didCreateNewGameInvite) {
      this.writeInviteLinkToClipboard();
      completion(true);
    } else {
      if (isCreateNewInviteFlow) {
        this.newInviteId = generateNewInviteId();
        this.writeInviteLinkToClipboard();
        this.createNewMatchInvite(completion);
      } else {
        this.newInviteId = routePath;
        this.writeInviteLinkToClipboard();
        completion(true);
      }
    }
  }

  private writeInviteLinkToClipboard(): void {
    const link = window.location.origin + "/" + this.newInviteId;
    navigator.clipboard.writeText(link);
  }

  private updatePath(newInviteId: string): void {
    const newPath = `/${newInviteId}`;
    pushRoutePath(newPath);
    applyCurrentRouteState();
  }

  private createNewMatchInvite(completion: (success: boolean) => void): void {
    const sessionGuard = this.createSessionGuard();
    this.signIn().then((uid) => {
      if (uid && sessionGuard()) {
        this.createInvite(uid, this.newInviteId);
        this.didCreateNewGameInvite = true;
        this.updatePath(this.newInviteId);
        completion(true);
      } else {
        console.log("failed to sign in");
        completion(false);
      }
    });
  }

  public async refreshTokenIfNeeded(): Promise<void> {
    try {
      if (!this.auth.currentUser) {
        console.warn("Cannot refresh token: No authenticated user");
        return;
      }

      const token = await this.auth.currentUser.getIdTokenResult();

      if (!token.claims.profileId) {
        console.log("No profileId in claims, forcing token refresh");
        await this.forceTokenRefresh();
      }
    } catch (error) {
      console.error("Error checking or refreshing token:", error);
    }
  }

  public async seeIfFreshlySignedInProfileIsOneOfThePlayers(profileId: string): Promise<void> {
    applyCurrentRouteState();
    const sessionGuard = this.createSessionGuard();
    if (!this.latestInvite) {
      return;
    }
    const match = await this.checkBothPlayerProfiles(this.latestInvite.hostId, this.latestInvite.guestId ?? "", profileId);
    if (!sessionGuard()) {
      return;
    }
    if (match !== null) {
      const inviteToReconnect = this.inviteId ?? routePath;
      if (!inviteToReconnect) {
        return;
      }
      this.signIn().then((uid) => {
        if (uid && sessionGuard()) {
          this.connectToGame(uid, inviteToReconnect, false);
        }
      });
    }
  }

  public async forceTokenRefresh(): Promise<void> {
    try {
      if (!this.auth.currentUser) {
        console.warn("Cannot refresh token: No authenticated user");
      } else {
        await this.auth.currentUser.getIdToken(true);
      }
    } catch (error) {
      console.error("Failed to refresh authentication token:", error);
    }
  }

  public async signIn(): Promise<string | undefined> {
    try {
      await signInAnonymously(this.auth);
      const uid = this.auth.currentUser?.uid;
      return uid;
    } catch (error) {
      console.error("Failed to sign in anonymously:", error);
      return undefined;
    }
  }

  public async signOut(): Promise<void> {
    try {
      await signOut(this.auth);
      this.detachFromMatchSession();
      this.detachFromProfileSession();
      this.loginUid = null;
      this.setSameProfilePlayerUid(null);
      this.cleanupWagerObserver();
      rocksMiningService.resetProfileMiningState();
      const [nftService, playerMetadata, ensResolver, leaderboard] = await Promise.all([
        import("../services/nftService"),
        import("../utils/playerMetadata"),
        import("../utils/ensResolver"),
        import("../ui/Leaderboard"),
      ]);
      nftService.resetNftCache();
      playerMetadata.resetPlayerMetadataCaches();
      ensResolver.resetEnsCache();
      leaderboard.resetLeaderboardCache();
      setFrozenMaterials(null);
    } catch (error) {
      console.error("Failed to sign out:", error);
      throw error;
    }
  }

  public detachFromMatchSession(): void {
    this.bumpSessionEpoch();
    this.cleanupRematchObservers();
    this.cleanupWagerObserver();
    this.stopObservingAllMatches();
    this.inviteWaitRefs.forEach((inviteRef) => {
      off(inviteRef);
      decrementLifecycleCounter("connectionObservers");
    });
    this.inviteWaitRefs.clear();
    this.latestInvite = null;
    this.myMatch = null;
    this.inviteId = null;
    this.matchId = null;
    this.didCreateNewGameInvite = false;
    this.newInviteId = "";
    this.optimisticResolvedMatchIds.clear();
    setCurrentWagerMatch(null);
  }

  public detachFromProfileSession(): void {
    this.loginUid = null;
    this.setSameProfilePlayerUid(null);
    this.currentUid = null;
    this.observeMiningFrozen(null);
    this.materialLeaderboardCache.clear();
    this.materialLeaderboardCacheTime = 0;
  }

  public async getProfileByLoginId(loginId: string): Promise<PlayerProfile> {
    await this.ensureAuthenticated();
    const usersRef = collection(this.firestore, "users");
    const q = query(usersRef, where("logins", "array-contains", loginId), limit(1));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      const data = doc.data();
      const mining = normalizeMiningData(data.mining);
      return {
        id: doc.id,
        username: data.username || null,
        eth: data.eth || null,
        sol: data.sol || null,
        rating: data.rating || 1500,
        nonce: data.nonce === undefined ? -1 : data.nonce,
        totalManaPoints: data.totalManaPoints ?? 0,
        win: data.win ?? true,
        emoji: data.custom?.emoji ?? emojis.getEmojiIdFromString(doc.id),
        aura: data.custom?.aura,
        cardBackgroundId: data.custom?.cardBackgroundId,
        cardSubtitleId: data.custom?.cardSubtitleId,
        profileCounter: data.custom?.profileCounter,
        profileMons: data.custom?.profileMons,
        cardStickers: data.custom?.cardStickers,
        feb2026UniqueOpponentsCount: data.feb2026UniqueOpponentsCount ?? 0,
        completedProblemIds: data.custom?.completedProblems,
        isTutorialCompleted: data.custom?.tutorialCompleted,
        mining,
      };
    }
    throw new Error("Profile not found");
  }

  private materialLeaderboardCache: Map<MiningMaterialName, PlayerProfile[]> = new Map();
  private materialLeaderboardCacheTime: number = 0;
  private static LEADERBOARD_CACHE_TTL = 60000;

  private docToProfile(doc: any): PlayerProfile {
    const data = doc.data();
    const mining = normalizeMiningData(data.mining);
    return {
      id: doc.id,
      username: data.username || null,
      eth: data.eth || null,
      sol: data.sol || null,
      rating: data.rating || 1500,
      nonce: data.nonce === undefined ? -1 : data.nonce,
      totalManaPoints: data.totalManaPoints ?? 0,
      win: data.win ?? true,
      emoji: data.custom?.emoji ?? emojis.getEmojiIdFromString(doc.id),
      aura: data.custom?.aura,
      cardBackgroundId: data.custom?.cardBackgroundId,
      cardSubtitleId: data.custom?.cardSubtitleId,
      profileCounter: data.custom?.profileCounter,
      profileMons: data.custom?.profileMons,
      cardStickers: data.custom?.cardStickers,
      feb2026UniqueOpponentsCount: data.feb2026UniqueOpponentsCount ?? 0,
      completedProblemIds: undefined,
      isTutorialCompleted: undefined,
      mining,
    };
  }

  private async fetchAllMaterialLeaderboards(): Promise<void> {
    const usersRef = collection(this.firestore, "users");
    const materialQueries = MINING_MATERIAL_NAMES.map((material) =>
      getDocs(query(usersRef, orderBy(`mining.materials.${material}`, "desc"), limit(LEADERBOARD_ENTRY_LIMIT)))
    );
    const snapshots = await Promise.all(materialQueries);
    MINING_MATERIAL_NAMES.forEach((material, index) => {
      const profiles: PlayerProfile[] = [];
      snapshots[index].forEach((doc) => {
        profiles.push(this.docToProfile(doc));
      });
      this.materialLeaderboardCache.set(material, profiles);
    });
    this.materialLeaderboardCacheTime = Date.now();
  }

  private isMaterialCacheValid(): boolean {
    return this.materialLeaderboardCache.size === MINING_MATERIAL_NAMES.length &&
      Date.now() - this.materialLeaderboardCacheTime < Connection.LEADERBOARD_CACHE_TTL;
  }

  public async getLeaderboard(type: "rating" | "gp" | MiningMaterialName | "total" = "rating"): Promise<PlayerProfile[]> {
    await this.ensureAuthenticated();
    const usersRef = collection(this.firestore, "users");

    if (type === "total") {
      if (!this.isMaterialCacheValid()) {
        await this.fetchAllMaterialLeaderboards();
      }
      const profileMap = new Map<string, PlayerProfile>();
      MINING_MATERIAL_NAMES.forEach((material) => {
        const cached = this.materialLeaderboardCache.get(material);
        if (cached) {
          cached.forEach((profile) => {
            if (!profileMap.has(profile.id)) {
              profileMap.set(profile.id, profile);
            }
          });
        }
      });
      const profiles = Array.from(profileMap.values());
      profiles.sort((a, b) => {
        const totalA = a.mining ? Object.values(a.mining.materials).reduce((sum, val) => sum + val, 0) : 0;
        const totalB = b.mining ? Object.values(b.mining.materials).reduce((sum, val) => sum + val, 0) : 0;
        return totalB - totalA;
      });
      return profiles.slice(0, LEADERBOARD_ENTRY_LIMIT);
    }

    if (MINING_MATERIAL_NAMES.includes(type as MiningMaterialName)) {
      const materialType = type as MiningMaterialName;
      if (this.isMaterialCacheValid()) {
        const cached = this.materialLeaderboardCache.get(materialType);
        if (cached) {
          return cached;
        }
      }
      await this.fetchAllMaterialLeaderboards();
      return this.materialLeaderboardCache.get(materialType) ?? [];
    }

    // "gp" leaderboard is repurposed for Feb 2026 unique opponents.
    const leaderboardOrderField = type === "gp" ? "feb2026UniqueOpponentsCount" : "rating";
    const q = query(usersRef, orderBy(leaderboardOrderField, "desc"), limit(LEADERBOARD_ENTRY_LIMIT));
    const querySnapshot = await getDocs(q);

    const leaderboard: PlayerProfile[] = [];
    querySnapshot.forEach((doc) => {
      leaderboard.push(this.docToProfile(doc));
    });

    return leaderboard;
  }

  public async editUsername(username: string): Promise<any> {
    try {
      await this.ensureAuthenticated();
      const editUsernameFunction = httpsCallable(this.functions, "editUsername");
      const response = await editUsernameFunction({ username });
      return response.data;
    } catch (error) {
      console.error("Error editing username:", error);
      throw error;
    }
  }

  public async verifySolanaAddress(address: string, signature: string): Promise<any> {
    try {
      await this.ensureAuthenticated();
      const verifySolanaAddressFunction = httpsCallable(this.functions, "verifySolanaAddress");
      const emojiString = storage.getPlayerEmojiId("1");
      const emoji = parseInt(emojiString);
      const aura = storage.getPlayerEmojiAura("");
      const response = await verifySolanaAddressFunction({ address, signature, emoji, aura });
      return response.data;
    } catch (error) {
      console.error("Error verifying Solana address:", error);
      throw error;
    }
  }

  public async getNfts(sol: string, eth: string): Promise<any> {
    try {
      await this.ensureAuthenticated();
      const getNftsFunction = httpsCallable(this.functions, "getNfts");
      const response = await getNftsFunction({ sol, eth });
      return response.data;
    } catch (error) {
      console.error("Error getting nfts:", error);
      throw error;
    }
  }

  public async mineRock(date: string, materials: PlayerMiningMaterials): Promise<any> {
    try {
      await this.ensureAuthenticated();
      const mineRockFunction = httpsCallable(this.functions, "mineRock");
      const response = await mineRockFunction({ date, materials });
      return response.data;
    } catch (error) {
      console.error("Error mining rock:", error);
      throw error;
    }
  }

  public async verifyEthAddress(message: string, signature: string): Promise<any> {
    try {
      await this.ensureAuthenticated();
      const verifyEthAddressFunction = httpsCallable(this.functions, "verifyEthAddress");
      const emojiString = storage.getPlayerEmojiId("1");
      const emoji = parseInt(emojiString);
      const aura = storage.getPlayerEmojiAura("");
      const response = await verifyEthAddressFunction({ message, signature, emoji, aura });
      return response.data;
    } catch (error) {
      console.error("Error verifying Ethereum address:", error);
      throw error;
    }
  }

  public subscribeToAuthChanges(callback: (uid: string | null) => void): () => void {
    incrementLifecycleCounter("connectionAuthSubscribers");
    const unsubscribe = onAuthStateChanged(this.auth, (user) => {
      const newUid = user?.uid ?? null;
      if (newUid !== this.currentUid) {
        this.currentUid = newUid;
        callback(newUid);
      }
    });
    this.authUnsubscribers.add(unsubscribe);
    return () => {
      if (this.authUnsubscribers.has(unsubscribe)) {
        this.authUnsubscribers.delete(unsubscribe);
        decrementLifecycleCounter("connectionAuthSubscribers");
      }
      unsubscribe();
    };
  }

  public getSameProfilePlayerUid(): string | null {
    return this.sameProfilePlayerUid;
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.auth.currentUser) {
      const uid = await this.signIn();
      if (!uid) {
        throw new Error("Failed to authenticate user");
      }
    }
  }

  private applyOptimisticWagerResolution(isWin?: boolean): boolean {
    if (!this.matchId || !this.sameProfilePlayerUid) {
      return false;
    }
    const matchId = this.matchId;
    if (this.optimisticResolvedMatchIds.has(matchId)) {
      return false;
    }
    const state = getWagerState();
    if (!state) {
      return false;
    }
    const resolved = state.resolved ?? null;
    const agreed = state.agreed ?? null;
    let material: MiningMaterialName | null = null;
    let count = 0;
    let winnerId: string | null = null;
    let loserId: string | null = null;
    if (resolved && resolved.material) {
      const resolvedCount = Number(resolved.count) || 0;
      if (resolvedCount <= 0) {
        return false;
      }
      material = resolved.material;
      count = Math.max(0, Math.round(resolvedCount));
      winnerId = resolved.winnerId || null;
      loserId = resolved.loserId || null;
    } else if (agreed && agreed.material) {
      if (typeof isWin !== "boolean") {
        return false;
      }
      const agreedCount = agreed.count ?? (agreed.total ? Math.max(0, Math.round(agreed.total / 2)) : 0);
      if (!agreedCount) {
        return false;
      }
      const opponentId = this.getOpponentId();
      if (!opponentId) {
        return false;
      }
      material = agreed.material;
      count = Math.max(0, Math.round(agreedCount));
      winnerId = isWin ? this.sameProfilePlayerUid : opponentId;
      loserId = isWin ? opponentId : this.sameProfilePlayerUid;
      const resolvedState: MatchWagerState = {
        ...(state ?? {}),
        proposals: undefined,
        resolved: {
          winnerId,
          loserId,
          material,
          count,
          total: count * 2,
          resolvedAt: Date.now(),
        },
      };
      this.setLocalWagerState(resolvedState);
    }
    if (!material || !count || !winnerId || !loserId) {
      return false;
    }
    const myId = this.sameProfilePlayerUid;
    if (myId !== winnerId && myId !== loserId) {
      return false;
    }
    const delta = myId === winnerId ? count : -count;
    applyFrozenMaterialsDelta({ [material]: -count });
    if (delta !== 0) {
      const snapshot = rocksMiningService.getSnapshot();
      const currentMaterials = snapshot.materials;
      const nextMaterials = { ...currentMaterials, [material]: Math.max(0, (currentMaterials[material] ?? 0) + delta) };
      rocksMiningService.setFromServer({ ...snapshot, materials: nextMaterials }, { persist: true });
    }
    this.optimisticResolvedMatchIds.add(matchId);
    return true;
  }

  public isAutomatch(): boolean {
    if (this.inviteId) {
      return this.inviteId.startsWith("auto_");
    } else {
      return false;
    }
  }

  public sendEndMatchIndicator(): void {
    if (!this.latestInvite || this.rematchSeriesEndIsIndicated()) return;
    const endingAsHost = this.latestInvite.hostId === this.sameProfilePlayerUid;
    const currentRematchesString = endingAsHost ? this.latestInvite.hostRematches : this.latestInvite.guestRematches;
    const updatedRematchesString = currentRematchesString ? currentRematchesString + "x" : "x";
    set(ref(this.db, `invites/${this.inviteId}/${endingAsHost ? "hostRematches" : "guestRematches"}`), updatedRematchesString);
  }

  public sendRematchProposal(): void {
    const sessionGuard = this.createSessionGuard();
    const newRematchProposalIndex = this.getRematchIndexAvailableForNewProposal();
    if (!newRematchProposalIndex || !this.latestInvite || !this.inviteId) {
      return;
    }

    this.stopObservingAllMatches();

    const proposingAsHost = this.latestInvite.hostId === this.sameProfilePlayerUid;
    const emojiId = getPlayersEmojiId();
    const proposalIndexIsEven = parseInt(newRematchProposalIndex, 10) % 2 === 0;
    const initialGuestColor = this.latestInvite.hostColor === "white" ? "black" : "white";
    const newColor = proposalIndexIsEven ? (proposingAsHost ? this.latestInvite.hostColor : initialGuestColor) : proposingAsHost ? initialGuestColor : this.latestInvite.hostColor;
    let newRematchesProposalsString = "";

    const inviteId = this.inviteId;
    const nextMatchId = inviteId + newRematchProposalIndex;
    const nextMatch: Match = {
      version: controllerVersion,
      color: newColor,
      emojiId,
      aura: storage.getPlayerEmojiAura(""),
      fen: initialFen,
      status: "",
      flatMovesString: "",
      timer: "",
    };

    const updates: { [key: string]: any } = {};
    updates[`players/${this.sameProfilePlayerUid}/matches/${nextMatchId}`] = nextMatch;

    if (proposingAsHost) {
      newRematchesProposalsString = this.latestInvite.hostRematches ? this.latestInvite.hostRematches + ";" + newRematchProposalIndex : newRematchProposalIndex;
      updates[`invites/${this.inviteId}/hostRematches`] = newRematchesProposalsString;
    } else {
      newRematchesProposalsString = this.latestInvite?.guestRematches ? this.latestInvite.guestRematches + ";" + newRematchProposalIndex : newRematchProposalIndex;
      updates[`invites/${this.inviteId}/guestRematches`] = newRematchesProposalsString;
    }

    update(ref(this.db), updates)
      .then(() => {
        if (!sessionGuard()) {
          return;
        }
        this.myMatch = nextMatch;
        this.matchId = nextMatchId;
        this.updateWagerStateForCurrentMatch();
        if (this.latestInvite) {
          if (proposingAsHost) {
            this.latestInvite.hostRematches = newRematchesProposalsString;
          } else {
            this.latestInvite.guestRematches = newRematchesProposalsString;
          }
        }
        console.log("Successfully updated match and rematches");
        didJustCreateRematchProposalSuccessfully(inviteId);
      })
      .catch((error) => {
        if (!sessionGuard()) {
          return;
        }
        console.error("Error updating match and rematches:", error);
        failedToCreateRematchProposal();
      });
  }

  public rematchSeriesEndIsIndicated(): boolean | null {
    if (!this.latestInvite) return null;
    return this.latestInvite.guestRematches?.endsWith("x") || this.latestInvite.hostRematches?.endsWith("x") || false;
  }

  private getRematchIndexAvailableForNewProposal(): string | null {
    if (!this.latestInvite || this.rematchSeriesEndIsIndicated()) return null;

    const proposingAsHost = this.latestInvite.hostId === this.sameProfilePlayerUid;
    const guestRematchesLength = this.latestInvite.guestRematches ? this.latestInvite.guestRematches.length : 0;
    const hostRematchesLength = this.latestInvite.hostRematches ? this.latestInvite.hostRematches.length : 0;

    const proposerRematchesLength = proposingAsHost ? hostRematchesLength : guestRematchesLength;
    const otherPlayerRematchesLength = proposingAsHost ? guestRematchesLength : hostRematchesLength;

    const latestCommonIndex = this.getLatestBothSidesApprovedRematchIndex();

    if (!latestCommonIndex) {
      if (proposerRematchesLength === 0 && otherPlayerRematchesLength === 0) {
        return "1";
      } else if (proposerRematchesLength >= otherPlayerRematchesLength) {
        return null;
      } else if (proposerRematchesLength < otherPlayerRematchesLength) {
        if (proposerRematchesLength === 0) {
          return "1";
        } else {
          return null;
        }
      } else {
        return null;
      }
    } else {
      if (proposerRematchesLength > otherPlayerRematchesLength) {
        return null;
      } else {
        return (latestCommonIndex + 1).toString();
      }
    }
  }

  public getOpponentId(): string {
    if (!this.latestInvite || !this.sameProfilePlayerUid) {
      return "";
    }

    if (this.latestInvite.hostId === this.sameProfilePlayerUid) {
      return this.latestInvite.guestId ?? "";
    } else {
      return this.latestInvite.hostId ?? "";
    }
  }

  public async startTimer(): Promise<any> {
    try {
      await this.ensureAuthenticated();
      const startTimerFunction = httpsCallable(this.functions, "startMatchTimer");
      const opponentId = this.getOpponentId();
      const response = await startTimerFunction({ playerId: this.sameProfilePlayerUid, inviteId: this.inviteId, matchId: this.matchId, opponentId: opponentId });
      return response.data;
    } catch (error) {
      console.error("Error starting a timer:", error);
      throw error;
    }
  }

  public async claimVictoryByTimer(): Promise<any> {
    try {
      await this.ensureAuthenticated();
      const claimVictoryByTimerFunction = httpsCallable(this.functions, "claimMatchVictoryByTimer");
      const opponentId = this.getOpponentId();
      const response = await claimVictoryByTimerFunction({ playerId: this.sameProfilePlayerUid, inviteId: this.inviteId, matchId: this.matchId, opponentId: opponentId });
      return response.data;
    } catch (error) {
      console.error("Error claiming victory by timer:", error);
      throw error;
    }
  }

  public async automatch(): Promise<any> {
    try {
      await this.ensureAuthenticated();
      const emojiId = getPlayersEmojiId();
      const aura = storage.getPlayerEmojiAura("");
      const automatch = httpsCallable(this.functions, "automatch");
      const response = await automatch({ emojiId, aura });
      return response.data;
    } catch (error) {
      console.error("Error calling automatch:", error);
      throw error;
    }
  }

  public async cancelAutomatch(): Promise<any> {
    try {
      await this.ensureAuthenticated();
      const cancelAutomatchFn = httpsCallable(this.functions, "cancelAutomatch");
      const response = await cancelAutomatchFn({});
      return response.data;
    } catch (error) {
      console.error("Error canceling automatch:", error);
      throw error;
    }
  }

  public async updateRatings(): Promise<any> {
    const sessionGuard = this.createSessionGuard();
    const profileIdAtRequest = storage.getProfileId("");
    try {
      await this.ensureAuthenticated();
      const updateRatingsFunction = httpsCallable(this.functions, "updateRatings");
      const opponentId = this.getOpponentId();
      const response = await updateRatingsFunction({ playerId: this.sameProfilePlayerUid, inviteId: this.inviteId, matchId: this.matchId, opponentId: opponentId });
      const data = response.data as { mining?: PlayerMiningData } | null;
      if (data && data.mining && sessionGuard() && storage.getProfileId("") === profileIdAtRequest) {
        rocksMiningService.setFromServer(data.mining, { persist: true });
      }
      return data;
    } catch (error) {
      console.error("Error updating ratings:", error);
      throw error;
    }
  }

  public async resolveWagerOutcome(isWin?: boolean): Promise<any> {
    const sessionGuard = this.createSessionGuard();
    const profileIdAtRequest = storage.getProfileId("");
    try {
      await this.ensureAuthenticated();
      if (!this.inviteId || !this.matchId || !this.sameProfilePlayerUid) {
        return { ok: false };
      }
      const opponentId = this.getOpponentId();
      if (!opponentId) {
        return { ok: false };
      }
      this.applyOptimisticWagerResolution(isWin);
      console.log("wager:resolve:start", { inviteId: this.inviteId, matchId: this.matchId, opponentId });
      const resolveWagerOutcomeFunction = httpsCallable(this.functions, "resolveWagerOutcome");
      const data = await this.callWagerFunctionWithRetry("wager:resolve", () =>
        resolveWagerOutcomeFunction({ playerId: this.sameProfilePlayerUid, inviteId: this.inviteId, matchId: this.matchId, opponentId })
      );
      const responseData = data as { mining?: PlayerMiningData } | null;
      console.log("wager:resolve:done", responseData);
      if (responseData && responseData.mining && sessionGuard() && storage.getProfileId("") === profileIdAtRequest) {
        rocksMiningService.setFromServer(responseData.mining, { persist: true });
      }
      return responseData;
    } catch (error) {
      console.error("Error resolving wager outcome:", error);
      throw error;
    }
  }

  public async sendWagerProposal(material: MiningMaterialName, count: number): Promise<any> {
    let prevState: MatchWagerState | null = null;
    let prevFrozen: Record<MiningMaterialName, number> | null = null;
    let optimisticCount = 0;
    let optimisticApplied = false;
    try {
      await this.ensureAuthenticated();
      if (!this.inviteId || !this.matchId || !this.sameProfilePlayerUid) {
        console.log("wager:send:skipped", { inviteId: this.inviteId, matchId: this.matchId });
        return { ok: false };
      }
      const playerUid = this.sameProfilePlayerUid;
      const currentState = getWagerState();
      if (!currentState?.agreed && !currentState?.resolved) {
        const totalMaterials = rocksMiningService.getSnapshot().materials;
        const frozenMaterials = getFrozenMaterials();
        const available = computeAvailableMaterials(totalMaterials, frozenMaterials);
        const availableCount = available[material] ?? 0;
        optimisticCount = Math.max(0, Math.min(Math.round(count), availableCount));
        if (optimisticCount > 0) {
          prevState = this.cloneWagerState(currentState);
          prevFrozen = frozenMaterials;
          const proposals = { ...(currentState?.proposals ?? {}) };
          proposals[playerUid] = { material, count: optimisticCount, createdAt: Date.now() };
          const proposedBy = { ...(currentState?.proposedBy ?? {}) };
          proposedBy[playerUid] = true;
          const nextState: MatchWagerState = {
            ...(currentState ?? {}),
            proposals,
            proposedBy,
          };
          this.setLocalWagerState(nextState);
          applyFrozenMaterialsDelta({ [material]: optimisticCount });
          optimisticApplied = true;
        }
      }
      console.log("wager:send:start", { inviteId: this.inviteId, matchId: this.matchId, material, count });
      const sendWagerProposalFunction = httpsCallable(this.functions, "sendWagerProposal");
      const data = await this.callWagerFunctionWithRetry("wager:send", () => sendWagerProposalFunction({ inviteId: this.inviteId, matchId: this.matchId, material, count }));
      console.log("wager:send:done", data);
      if (optimisticApplied) {
        if (data && data.ok === false) {
          const latestState = getWagerState();
          const proposal = latestState?.proposals && playerUid ? latestState.proposals[playerUid] : null;
          const shouldRollback = !!proposal && proposal.material === material && proposal.count === optimisticCount && !latestState?.agreed && !latestState?.resolved;
          if (shouldRollback) {
            this.setLocalWagerState(prevState);
            if (prevFrozen) {
              setFrozenMaterials(prevFrozen);
            }
          }
        } else if (data && data.agreed) {
          const agreed = data.agreed as WagerAgreement;
          const rawCount = typeof agreed.count === "number" ? agreed.count : Number(agreed.count);
          const agreedCount = Number.isFinite(rawCount)
            ? Math.max(0, Math.round(rawCount))
            : agreed.total
            ? Math.max(0, Math.round(agreed.total / 2))
            : 0;
          const nextAgreed: WagerAgreement = { ...agreed, count: agreedCount, total: agreed.total ?? agreedCount * 2 };
          const latestState = getWagerState();
          if (!latestState?.resolved) {
            const nextState: MatchWagerState = {
              ...(latestState ?? {}),
              proposals: undefined,
              agreed: nextAgreed,
            };
            this.setLocalWagerState(nextState);
            const delta = agreedCount - optimisticCount;
            if (delta !== 0) {
              applyFrozenMaterialsDelta({ [material]: delta });
            }
          }
        } else if (data && typeof data.count === "number") {
          const serverCount = Math.max(0, Math.round(data.count));
          if (serverCount !== optimisticCount) {
            const latestState = getWagerState();
            const proposal = latestState?.proposals && playerUid ? latestState.proposals[playerUid] : null;
            if (proposal && proposal.material === material && proposal.count === optimisticCount && !latestState?.agreed && !latestState?.resolved) {
              const proposals = { ...(latestState?.proposals ?? {}) };
              proposals[playerUid] = { ...proposal, count: serverCount };
              const nextState: MatchWagerState = { ...(latestState ?? {}), proposals };
              this.setLocalWagerState(nextState);
              const delta = serverCount - optimisticCount;
              if (delta !== 0) {
                applyFrozenMaterialsDelta({ [material]: delta });
              }
            }
          }
        }
      }
      return data;
    } catch (error) {
      console.error("wager:send:error", error);
      if (optimisticApplied) {
        const latestState = getWagerState();
        const proposal = latestState?.proposals && this.sameProfilePlayerUid ? latestState.proposals[this.sameProfilePlayerUid] : null;
        const shouldRollback =
          !!proposal && proposal.material === material && proposal.count === optimisticCount && !latestState?.agreed && !latestState?.resolved;
        if (shouldRollback) {
          this.setLocalWagerState(prevState);
          if (prevFrozen) {
            setFrozenMaterials(prevFrozen);
          }
        }
      }
      throw error;
    }
  }

  public async cancelWagerProposal(): Promise<any> {
    let prevState: MatchWagerState | null = null;
    let prevFrozen: Record<MiningMaterialName, number> | null = null;
    let optimisticApplied = false;
    let proposal: WagerProposal | null = null;
    try {
      await this.ensureAuthenticated();
      if (!this.inviteId || !this.matchId || !this.sameProfilePlayerUid) {
        console.log("wager:cancel:skipped", { inviteId: this.inviteId, matchId: this.matchId });
        return { ok: false };
      }
      const playerUid = this.sameProfilePlayerUid;
      const currentState = getWagerState();
      const existingProposal = currentState?.proposals && playerUid ? currentState.proposals[playerUid] : null;
      if (existingProposal && !currentState?.agreed && !currentState?.resolved) {
        prevState = this.cloneWagerState(currentState);
        prevFrozen = getFrozenMaterials();
        proposal = existingProposal;
        const proposals = { ...(currentState?.proposals ?? {}) };
        delete proposals[playerUid];
        const nextState: MatchWagerState = {
          ...(currentState ?? {}),
          proposals: Object.keys(proposals).length > 0 ? proposals : undefined,
          proposedBy: currentState?.proposedBy,
        };
        this.setLocalWagerState(nextState);
        applyFrozenMaterialsDelta({ [proposal.material]: -proposal.count });
        optimisticApplied = true;
      }
      console.log("wager:cancel:start", { inviteId: this.inviteId, matchId: this.matchId });
      const cancelWagerProposalFunction = httpsCallable(this.functions, "cancelWagerProposal");
      const data = await this.callWagerFunctionWithRetry("wager:cancel", () => cancelWagerProposalFunction({ inviteId: this.inviteId, matchId: this.matchId }));
      console.log("wager:cancel:done", data);
      if (optimisticApplied && data && data.ok === false) {
        const latestState = getWagerState();
        const hasAgreedOrResolved = !!latestState?.agreed || !!latestState?.resolved;
        const stillMissing = !latestState?.proposals || (playerUid && !latestState.proposals[playerUid]);
        if (!hasAgreedOrResolved && stillMissing) {
          this.setLocalWagerState(prevState);
          if (prevFrozen) {
            setFrozenMaterials(prevFrozen);
          }
        }
      }
      return data;
    } catch (error) {
      console.error("wager:cancel:error", error);
      if (optimisticApplied) {
        const latestState = getWagerState();
        const hasAgreedOrResolved = !!latestState?.agreed || !!latestState?.resolved;
        const stillMissing = !latestState?.proposals || (this.sameProfilePlayerUid && !latestState.proposals[this.sameProfilePlayerUid]);
        if (!hasAgreedOrResolved && stillMissing) {
          this.setLocalWagerState(prevState);
          if (prevFrozen) {
            setFrozenMaterials(prevFrozen);
          }
        }
      }
      throw error;
    }
  }

  public async declineWagerProposal(): Promise<any> {
    let prevState: MatchWagerState | null = null;
    let optimisticApplied = false;
    let opponentUid: string | null = null;
    try {
      await this.ensureAuthenticated();
      if (!this.inviteId || !this.matchId || !this.sameProfilePlayerUid) {
        console.log("wager:decline:skipped", { inviteId: this.inviteId, matchId: this.matchId });
        return { ok: false };
      }
      opponentUid = this.getOpponentId();
      const currentState = getWagerState();
      const existingProposal = opponentUid && currentState?.proposals ? currentState.proposals[opponentUid] : null;
      if (existingProposal && !currentState?.agreed && !currentState?.resolved) {
        prevState = this.cloneWagerState(currentState);
        const proposals = { ...(currentState?.proposals ?? {}) };
        delete proposals[opponentUid];
        const nextState: MatchWagerState = {
          ...(currentState ?? {}),
          proposals: Object.keys(proposals).length > 0 ? proposals : undefined,
          proposedBy: currentState?.proposedBy,
        };
        this.setLocalWagerState(nextState);
        optimisticApplied = true;
      }
      console.log("wager:decline:start", { inviteId: this.inviteId, matchId: this.matchId });
      const declineWagerProposalFunction = httpsCallable(this.functions, "declineWagerProposal");
      const data = await this.callWagerFunctionWithRetry("wager:decline", () => declineWagerProposalFunction({ inviteId: this.inviteId, matchId: this.matchId }));
      console.log("wager:decline:done", data);
      if (optimisticApplied && data && data.ok === false) {
        const latestState = getWagerState();
        const hasAgreedOrResolved = !!latestState?.agreed || !!latestState?.resolved;
        const stillMissing = !latestState?.proposals || (opponentUid && !latestState.proposals[opponentUid]);
        if (!hasAgreedOrResolved && stillMissing) {
          this.setLocalWagerState(prevState);
        }
      }
      return data;
    } catch (error) {
      console.error("wager:decline:error", error);
      if (optimisticApplied) {
        const latestState = getWagerState();
        const hasAgreedOrResolved = !!latestState?.agreed || !!latestState?.resolved;
        const stillMissing = !latestState?.proposals || (opponentUid && !latestState.proposals[opponentUid]);
        if (!hasAgreedOrResolved && stillMissing) {
          this.setLocalWagerState(prevState);
        }
      }
      throw error;
    }
  }

  public async acceptWagerProposal(): Promise<any> {
    let prevState: MatchWagerState | null = null;
    let prevFrozen: Record<MiningMaterialName, number> | null = null;
    let optimisticApplied = false;
    let optimisticAgreement: WagerAgreement | null = null;
    let opponentUid: string | null = null;
    try {
      await this.ensureAuthenticated();
      if (!this.inviteId || !this.matchId || !this.sameProfilePlayerUid) {
        console.log("wager:accept:skipped", { inviteId: this.inviteId, matchId: this.matchId });
        return { ok: false };
      }
      const playerUid = this.sameProfilePlayerUid;
      opponentUid = this.getOpponentId();
      const currentState = getWagerState();
      const proposals = currentState?.proposals ?? null;
      const opponentProposal = opponentUid && proposals ? proposals[opponentUid] : null;
      const ownProposal = playerUid && proposals ? proposals[playerUid] : null;
      if (opponentProposal && !currentState?.agreed && !currentState?.resolved) {
        const totalMaterials = rocksMiningService.getSnapshot().materials;
        const frozenMaterials = getFrozenMaterials();
        const available = computeAvailableMaterials(totalMaterials, frozenMaterials);
        const opponentCount = Math.max(0, Math.round(opponentProposal.count));
        const extraAvailable = ownProposal && ownProposal.material === opponentProposal.material ? Math.max(0, Math.round(ownProposal.count)) : 0;
        const acceptedCount = Math.min(opponentCount, (available[opponentProposal.material] ?? 0) + extraAvailable);
        if (acceptedCount > 0) {
          prevState = this.cloneWagerState(currentState);
          prevFrozen = frozenMaterials;
          optimisticAgreement = {
            material: opponentProposal.material,
            count: acceptedCount,
            total: acceptedCount * 2,
            proposerId: opponentUid,
            accepterId: playerUid,
            acceptedAt: Date.now(),
          };
          const nextState: MatchWagerState = {
            ...(currentState ?? {}),
            proposals: undefined,
            proposedBy: currentState?.proposedBy,
            agreed: optimisticAgreement,
          };
          this.setLocalWagerState(nextState);
          const deltas: Partial<Record<MiningMaterialName, number>> = {};
          if (ownProposal) {
            const ownCount = Math.max(0, Math.round(ownProposal.count));
            if (ownCount > 0) {
              deltas[ownProposal.material] = (deltas[ownProposal.material] ?? 0) - ownCount;
            }
          }
          deltas[opponentProposal.material] = (deltas[opponentProposal.material] ?? 0) + acceptedCount;
          applyFrozenMaterialsDelta(deltas);
          optimisticApplied = true;
        }
      }
      console.log("wager:accept:start", { inviteId: this.inviteId, matchId: this.matchId });
      const acceptWagerProposalFunction = httpsCallable(this.functions, "acceptWagerProposal");
      const data = await this.callWagerFunctionWithRetry("wager:accept", () => acceptWagerProposalFunction({ inviteId: this.inviteId, matchId: this.matchId }));
      console.log("wager:accept:done", data);
      if (optimisticApplied && optimisticAgreement) {
        if (data && data.ok === false) {
          const latestState = getWagerState();
          const agreed = latestState?.agreed;
          const shouldRollback =
            !!agreed &&
            !latestState?.resolved &&
            agreed.material === optimisticAgreement.material &&
            agreed.count === optimisticAgreement.count &&
            agreed.proposerId === optimisticAgreement.proposerId &&
            agreed.accepterId === optimisticAgreement.accepterId;
          if (shouldRollback) {
            this.setLocalWagerState(prevState);
            if (prevFrozen) {
              setFrozenMaterials(prevFrozen);
            }
          }
        } else if (data && typeof data.count === "number") {
          const serverCount = Math.max(0, Math.round(data.count));
          if (serverCount !== optimisticAgreement.count) {
            const latestState = getWagerState();
            const agreed = latestState?.agreed;
            if (
              agreed &&
              !latestState?.resolved &&
              agreed.material === optimisticAgreement.material &&
              agreed.proposerId === optimisticAgreement.proposerId &&
              agreed.accepterId === optimisticAgreement.accepterId
            ) {
              const nextAgreed = { ...agreed, count: serverCount, total: serverCount * 2 };
              const nextState: MatchWagerState = { ...(latestState ?? {}), agreed: nextAgreed };
              this.setLocalWagerState(nextState);
              const delta = serverCount - optimisticAgreement.count;
              if (delta !== 0) {
                applyFrozenMaterialsDelta({ [optimisticAgreement.material]: delta });
              }
            }
          }
        }
      }
      return data;
    } catch (error) {
      console.error("wager:accept:error", error);
      if (optimisticApplied && optimisticAgreement) {
        const latestState = getWagerState();
        const agreed = latestState?.agreed;
        const shouldRollback =
          !!agreed &&
          !latestState?.resolved &&
          agreed.material === optimisticAgreement.material &&
          agreed.count === optimisticAgreement.count &&
          agreed.proposerId === optimisticAgreement.proposerId &&
          agreed.accepterId === optimisticAgreement.accepterId;
        if (shouldRollback) {
          this.setLocalWagerState(prevState);
          if (prevFrozen) {
            setFrozenMaterials(prevFrozen);
          }
        }
      }
      throw error;
    }
  }

  public updateEmoji(newId: number, matchOnly: boolean, aura: string | null | undefined): void {
    if (!matchOnly) {
      this.updateStoredEmoji(newId, aura);
    }
    if (!this.myMatch) return;
    this.myMatch.emojiId = newId;
    this.myMatch.aura = aura ?? undefined;
    set(ref(this.db, `players/${this.sameProfilePlayerUid}/matches/${this.matchId}/emojiId`), newId).catch((error) => {
      console.error("Error updating emoji:", error);
    });
    if (this.myMatch.aura !== undefined) set(ref(this.db, `players/${this.sameProfilePlayerUid}/matches/${this.matchId}/aura`), this.myMatch.aura).catch(() => {});
  }

  private getLocalProfileId(): string | null {
    const id = storage.getProfileId("");
    return id === "" ? null : id;
  }

  private setSameProfilePlayerUid(uid: string | null): void {
    if (this.sameProfilePlayerUid === uid) {
      return;
    }
    this.sameProfilePlayerUid = uid;
    this.observeMiningFrozen(uid);
    if (uid) {
      const expectedUid = uid;
      const expectedEpoch = this.sessionEpoch;
      setupPlayerId(uid, false);
      this.getProfileByLoginId(uid)
        .then((profile) => {
          if (!this.isSessionEpochActive(expectedEpoch) || this.sameProfilePlayerUid !== expectedUid) {
            return;
          }
          didGetPlayerProfile(profile, expectedUid, true);
        })
        .catch(() => {});
    }
  }

  public getActiveMatchId(): string | null {
    return this.matchId;
  }

  public updateStoredEmoji(newId: number, aura: string | null | undefined): void {
    this.updateCustomField("emoji", newId);
    if (aura !== undefined && aura !== null) this.updateCustomField("aura", aura);
  }

  public updateCardBackgroundId(newId: number): void {
    this.updateCustomField("cardBackgroundId", newId);
  }

  public updateCardSubtitleId(newId: number): void {
    this.updateCustomField("cardSubtitleId", newId);
  }

  public updateProfileCounter(counter: string): void {
    this.updateCustomField("profileCounter", counter);
  }

  public updateProfileMons(mons: string): void {
    this.updateCustomField("profileMons", mons);
  }

  public updateCardStickers(stickers: string): void {
    this.updateCustomField("cardStickers", stickers);
  }

  public updateCompletedProblems(ids: string[]): void {
    this.updateCustomField("completedProblems", ids);
  }

  public updateTutorialCompleted(completed: boolean): void {
    this.updateCustomField("tutorialCompleted", completed);
  }

  private updateCustomField(fieldName: string, newValue: any): void {
    const id = this.getLocalProfileId();
    if (id === null) {
      return;
    }
    const userDocRef = doc(this.firestore, "users", id);
    updateDoc(userDocRef, {
      [`custom.${fieldName}`]: newValue,
    }).catch(() => {});
  }

  public sendVoiceReaction(reaction: Reaction): void {
    if (!this.myMatch) return;
    this.myMatch.reaction = reaction;
    set(ref(this.db, `players/${this.sameProfilePlayerUid}/matches/${this.matchId}/reaction`), reaction).catch((error) => {
      console.error("Error sending voice reaction:", error);
    });
  }

  public surrender(): void {
    if (!this.myMatch) return;
    this.myMatch.status = "surrendered";
    this.sendMatchUpdate();
  }

  public sendMove(moveFen: string, newBoardFen: string): void {
    if (!this.myMatch) return;
    this.myMatch.fen = newBoardFen;
    this.myMatch.flatMovesString = this.myMatch.flatMovesString ? `${this.myMatch.flatMovesString}-${moveFen}` : moveFen;
    this.sendMatchUpdate();
  }

  public signInIfNeededAndConnectToGame(inviteId: string, autojoin: boolean): void {
    const sessionGuard = this.createSessionGuard();
    this.signIn().then((uid) => {
      if (uid && sessionGuard()) {
        this.connectToGame(uid, inviteId, autojoin);
      } else {
        console.log("failed to get game info");
      }
    });
  }

  private sendMatchUpdate(): void {
    const sessionGuard = this.createSessionGuard();
    set(ref(this.db, `players/${this.sameProfilePlayerUid}/matches/${this.matchId}`), this.myMatch)
      .then(() => {
        console.log("Match update sent successfully");
      })
      .catch((error) => {
        if (!sessionGuard()) {
          return;
        }
        console.error("Error sending match update:", error);
        const inviteToReconnect = this.inviteId;
        if (!inviteToReconnect) {
          return;
        }
        this.signIn().then((uid) => {
          if (uid && sessionGuard()) {
            this.connectToGame(uid, inviteToReconnect, false);
          }
        });
      });
  }

  private getLatestBothSidesApprovedRematchIndex(): number | null {
    if (!this.inviteId || !this.latestInvite) {
      return null;
    }

    const guestRematchesString = this.latestInvite.guestRematches?.replace(/x+$/, "");
    const hostRematchesString = this.latestInvite.hostRematches?.replace(/x+$/, "");

    if (!guestRematchesString || !hostRematchesString) {
      return null;
    }

    let commonPrefix = "";
    for (let i = 0; i < Math.min(guestRematchesString.length, hostRematchesString.length); i++) {
      if (guestRematchesString[i] === hostRematchesString[i]) {
        commonPrefix += guestRematchesString[i];
      } else {
        break;
      }
    }

    if (!commonPrefix) {
      return null;
    }

    const lastNumber = parseInt(commonPrefix.includes(";") ? commonPrefix.split(";").pop()! : commonPrefix);
    if (isNaN(lastNumber)) {
      return null;
    }

    setDebugViewText("+" + lastNumber.toString());

    return lastNumber;
  }

  public connectToGame(uid: string, inviteId: string, autojoin: boolean): void {
    applyCurrentRouteState();
    const inviteChanged = this.inviteId && this.inviteId !== inviteId;
    if (this.sameProfilePlayerUid === null || this.loginUid !== uid) {
      this.setSameProfilePlayerUid(uid);
    }

    this.loginUid = uid;
    if (inviteChanged) {
      this.detachFromMatchSession();
    }
    const connectEpoch = this.bumpSessionEpoch();
    this.inviteId = inviteId;
    const inviteRef = ref(this.db, `invites/${inviteId}`);
    get(inviteRef)
      .then(async (snapshot) => {
        if (!this.isSessionEpochActive(connectEpoch)) {
          return;
        }
        const inviteData: Invite | null = snapshot.val();
        if (!inviteData) {
          console.log("No invite data found");
          return;
        }

        this.latestInvite = inviteData;
        this.observeRematchOrEndMatchIndicators();
        this.observeWagers();

        const matchId = await this.getLatestBothSidesApprovedOrProposedByMeMatchId();
        if (!this.isSessionEpochActive(connectEpoch)) {
          return;
        }
        this.matchId = matchId;
        setCurrentWagerMatch(matchId);
        this.updateWagerStateForCurrentMatch();

        if (!inviteData.guestId && inviteData.hostId !== uid) {
          if (autojoin) {
            set(ref(this.db, `invites/${inviteId}/guestId`), uid)
              .then(() => {
                if (!this.isSessionEpochActive(connectEpoch)) {
                  return;
                }
                if (this.latestInvite) {
                  this.latestInvite.guestId = uid;
                }
                this.getOpponentsMatchAndCreateOwnMatch(matchId, inviteData.hostId, connectEpoch);
              })
              .catch((error) => {
                console.error("Error joining as a guest:", error);
              });
          } else {
            didFindInviteThatCanBeJoined();
          }
        } else {
          if (inviteData.hostId === uid) {
            this.reconnectAsHost(inviteId, matchId, inviteData.hostId, inviteData.guestId, connectEpoch);
          } else if (inviteData.guestId === uid) {
            this.reconnectAsGuest(matchId, inviteData.hostId, inviteData.guestId, connectEpoch);
          } else {
            if (this.sameProfilePlayerUid !== null && this.sameProfilePlayerUid !== this.loginUid) {
              if (this.sameProfilePlayerUid === inviteData.hostId) {
                this.reconnectAsHost(inviteId, matchId, inviteData.hostId, inviteData.guestId, connectEpoch);
              } else {
                this.reconnectAsGuest(matchId, inviteData.hostId, inviteData.guestId ?? "", connectEpoch);
              }
              this.refreshTokenIfNeeded();
            } else {
              const profileId = this.getLocalProfileId();
              if (profileId !== null) {
                this.checkBothPlayerProfiles(inviteData.hostId, inviteData.guestId ?? "", profileId)
                  .then((matchingUid) => {
                    if (!this.isSessionEpochActive(connectEpoch)) {
                      return;
                    }
                    if (matchingUid === null) {
                      this.enterWatchOnlyMode(matchId, inviteData.hostId, inviteData.guestId);
                    } else if (matchingUid === inviteData.hostId) {
                      this.setSameProfilePlayerUid(matchingUid);
                      this.refreshTokenIfNeeded();
                      this.reconnectAsHost(inviteId, matchId, inviteData.hostId, inviteData.guestId, connectEpoch);
                    } else {
                      this.setSameProfilePlayerUid(matchingUid);
                      this.refreshTokenIfNeeded();
                      this.reconnectAsGuest(matchId, inviteData.hostId, inviteData.guestId ?? "", connectEpoch);
                    }
                  })
                  .catch(() => {
                    if (!this.isSessionEpochActive(connectEpoch)) {
                      return;
                    }
                    this.enterWatchOnlyMode(matchId, inviteData.hostId, inviteData.guestId);
                  });
              } else {
                this.enterWatchOnlyMode(matchId, inviteData.hostId, inviteData.guestId);
              }
            }
          }
        }
      })
      .catch((error) => {
        console.error("Failed to retrieve invite data:", error);
      });
  }

  private reconnectAsGuest(matchId: string, hostId: string, guestId: string, epoch: number): void {
    const myMatchRef = ref(this.db, `players/${guestId}/matches/${matchId}`);
    get(myMatchRef)
      .then((snapshot) => {
        if (!this.isSessionEpochActive(epoch)) {
          return;
        }
        const myMatchData: Match | null = snapshot.val();
        if (!myMatchData) {
          console.log("No match data found for guest");
          return;
        }
        this.myMatch = myMatchData;
        didRecoverMyMatch(myMatchData, matchId);
        this.observeMatch(hostId, matchId);
      })
      .catch((error) => {
        if (!this.isSessionEpochActive(epoch)) {
          return;
        }
        console.error("Failed to get guest's match:", error);
      });
  }

  private reconnectAsHost(inviteId: string, matchId: string, hostId: string, guestId: string | null | undefined, epoch: number): void {
    const myMatchRef = ref(this.db, `players/${hostId}/matches/${matchId}`);
    get(myMatchRef)
      .then((snapshot) => {
        if (!this.isSessionEpochActive(epoch)) {
          return;
        }
        const myMatchData: Match | null = snapshot.val();
        if (!myMatchData) {
          console.log("No match data found for host");
          return;
        }
        this.myMatch = myMatchData;
        didRecoverMyMatch(myMatchData, matchId);

        if (guestId) {
          this.observeMatch(guestId, matchId);
        } else {
          didFindYourOwnInviteThatNobodyJoined(inviteId.startsWith("auto_"));
          const inviteRef = ref(this.db, `invites/${inviteId}`);
          this.trackInviteWaitRef(inviteRef);
          onValue(inviteRef, (snapshot) => {
            if (!this.isSessionEpochActive(epoch)) {
              return;
            }
            const updatedInvite: Invite | null = snapshot.val();
            if (updatedInvite && updatedInvite.guestId) {
              if (this.latestInvite) {
                this.latestInvite.guestId = updatedInvite.guestId;
              }
              this.observeMatch(updatedInvite.guestId, matchId);
              off(inviteRef);
              this.releaseInviteWaitRef(inviteRef);
            }
          });
        }
      })
      .catch((error) => {
        if (!this.isSessionEpochActive(epoch)) {
          return;
        }
        console.error("Failed to get host's match:", error);
      });
  }

  private enterWatchOnlyMode(matchId: string, hostId: string, guestId?: string | null): void {
    enterWatchOnlyMode();
    this.observeMatch(hostId, matchId);
    if (guestId) {
      this.observeMatch(guestId, matchId);
    }
  }

  private getOpponentsMatchAndCreateOwnMatch(matchId: string, hostId: string, epoch: number): void {
    const opponentsMatchRef = ref(this.db, `players/${hostId}/matches/${matchId}`);
    get(opponentsMatchRef)
      .then((snapshot) => {
        if (!this.isSessionEpochActive(epoch)) {
          return;
        }
        const opponentsMatchData: Match | null = snapshot.val();
        if (!opponentsMatchData) {
          console.log("No opponent's match data found");
          return;
        }

        const color = opponentsMatchData.color === "black" ? "white" : "black";
        const emojiId = getPlayersEmojiId();
        const aura = storage.getPlayerEmojiAura("");
        const match: Match = {
          version: controllerVersion,
          color,
          emojiId,
          aura,
          fen: initialFen,
          status: "",
          flatMovesString: "",
          timer: "",
        };

        this.myMatch = match;

        set(ref(this.db, `players/${this.sameProfilePlayerUid}/matches/${matchId}`), match)
          .then(() => {
            if (!this.isSessionEpochActive(epoch)) {
              return;
            }
            this.observeMatch(hostId, matchId);
          })
          .catch((error) => {
            console.error("Error creating player match:", error);
          });
      })
      .catch((error) => {
        if (!this.isSessionEpochActive(epoch)) {
          return;
        }
        console.error("Failed to get opponent's match:", error);
      });
  }

  public createInvite(uid: string, inviteId: string): void {
    const epoch = this.bumpSessionEpoch();
    const hostColor = Math.random() < 0.5 ? "white" : "black";
    const emojiId = getPlayersEmojiId();

    const invite: Invite = {
      version: controllerVersion,
      hostId: uid,
      hostColor,
      guestId: null,
      wagers: {},
    };

    const match: Match = {
      version: controllerVersion,
      color: hostColor,
      emojiId,
      aura: storage.getPlayerEmojiAura(""),
      fen: initialFen,
      status: "",
      flatMovesString: "",
      timer: "",
    };

    this.myMatch = match;
    this.loginUid = uid;
    this.setSameProfilePlayerUid(uid);
    this.inviteId = inviteId;
    this.latestInvite = invite;

    const matchId = inviteId;
    this.matchId = matchId;
    this.observeWagers();
    this.updateWagerStateForCurrentMatch();

    const updates: { [key: string]: any } = {};
    updates[`players/${this.loginUid}/matches/${matchId}`] = match;
    updates[`invites/${inviteId}`] = invite;
    update(ref(this.db), updates)
      .then(() => {
        if (!this.isSessionEpochActive(epoch)) {
          return;
        }
        console.log("Match and invite created successfully");
      })
      .catch((error) => {
        if (!this.isSessionEpochActive(epoch)) {
          return;
        }
        console.error("Error creating match and invite:", error);
      });

    const inviteRef = ref(this.db, `invites/${inviteId}`);
    this.trackInviteWaitRef(inviteRef);
    onValue(inviteRef, (snapshot) => {
      if (!this.isSessionEpochActive(epoch)) {
        return;
      }
      const updatedInvite: Invite | null = snapshot.val();
      if (updatedInvite && updatedInvite.guestId) {
        console.log(`Guest ${updatedInvite.guestId} joined the invite ${inviteId}`);
        this.latestInvite = updatedInvite;
        this.observeRematchOrEndMatchIndicators();
        this.observeWagers();
        this.updateWagerStateForCurrentMatch();
        this.observeMatch(updatedInvite.guestId, matchId);
        off(inviteRef);
        this.releaseInviteWaitRef(inviteRef);
      }
    });
  }

  private async getLatestBothSidesApprovedOrProposedByMeMatchId(): Promise<string> {
    let rematchIndex = this.getLatestBothSidesApprovedRematchIndex();
    if (!this.inviteId || !this.latestInvite) {
      return "";
    } else if (!this.rematchSeriesEndIsIndicated() && this.latestInvite.guestRematches?.length !== this.latestInvite.hostRematches?.length) {
      const guestRematchesLength = this.latestInvite.guestRematches?.length ?? 0;
      const hostRematchesLength = this.latestInvite.hostRematches?.length ?? 0;

      if (guestRematchesLength !== hostRematchesLength) {
        const alreadyHasSamePlayerProfileIdCorrectlySetup = this.sameProfilePlayerUid !== null && this.sameProfilePlayerUid !== this.loginUid;
        if (!alreadyHasSamePlayerProfileIdCorrectlySetup) {
          const profileId = this.getLocalProfileId();
          if (profileId !== null) {
            const matchingUid = await this.checkBothPlayerProfiles(this.latestInvite.hostId, this.latestInvite.guestId ?? "", profileId);
            if (matchingUid !== null) {
              this.setSameProfilePlayerUid(matchingUid);
            }
          }
        }

        const proposedMoreAsHost = this.latestInvite.hostId === this.sameProfilePlayerUid && hostRematchesLength > guestRematchesLength;
        const proposedMoreAsGuest = this.latestInvite.guestId === this.sameProfilePlayerUid && guestRematchesLength > hostRematchesLength;
        if (proposedMoreAsHost || proposedMoreAsGuest) {
          rematchIndex = rematchIndex ? rematchIndex + 1 : 1;
          didDiscoverExistingRematchProposalWaitingForResponse();
        }
      }
    }
    if (!rematchIndex) {
      return this.inviteId;
    } else {
      return this.inviteId + rematchIndex.toString();
    }
  }

  private observeRematchOrEndMatchIndicators() {
    if ((this.hostRematchesRef && this.guestRematchesRef) || !this.latestInvite || this.rematchSeriesEndIsIndicated()) return;
    const observeEpoch = this.sessionEpoch;

    const hostObservationPath = `invites/${this.inviteId}/hostRematches`;
    this.hostRematchesRef = ref(this.db, hostObservationPath);
    incrementLifecycleCounter("connectionObservers");

    onValue(this.hostRematchesRef, (snapshot) => {
      if (!this.isSessionEpochActive(observeEpoch)) {
        return;
      }
      const rematchesString: string | null = snapshot.val();
      if (rematchesString !== null) {
        this.latestInvite!.hostRematches = rematchesString;
        if (this.rematchSeriesEndIsIndicated()) {
          didReceiveRematchesSeriesEndIndicator();
          this.cleanupRematchObservers();
        }
      }
    });

    const guestObservationPath = `invites/${this.inviteId}/guestRematches`;
    this.guestRematchesRef = ref(this.db, guestObservationPath);
    incrementLifecycleCounter("connectionObservers");

    onValue(this.guestRematchesRef, (snapshot) => {
      if (!this.isSessionEpochActive(observeEpoch)) {
        return;
      }
      const rematchesString: string | null = snapshot.val();
      if (rematchesString !== null) {
        this.latestInvite!.guestRematches = rematchesString;
        if (this.rematchSeriesEndIsIndicated()) {
          didReceiveRematchesSeriesEndIndicator();
          this.cleanupRematchObservers();
        }
      }
    });
  }

  private updateWagerStateForCurrentMatch() {
    if (!this.matchId) {
      return;
    }
    const wagers = this.latestInvite?.wagers ?? null;
    const matchWagerState = wagers && wagers[this.matchId] ? wagers[this.matchId] : null;
    setWagerState(this.matchId, matchWagerState);
  }

  private observeWagers() {
    if (this.wagersRef || !this.inviteId) {
      return;
    }
    const observeEpoch = this.sessionEpoch;
    const wagersRef = ref(this.db, `invites/${this.inviteId}/wagers`);
    this.wagersRef = wagersRef;
    incrementLifecycleCounter("connectionObservers");
    onValue(wagersRef, (snapshot) => {
      if (!this.isSessionEpochActive(observeEpoch)) {
        return;
      }
      const wagers = snapshot.val();
      if (this.latestInvite) {
        this.latestInvite.wagers = wagers;
      }
      this.updateWagerStateForCurrentMatch();
    });
  }

  private cleanupRematchObservers() {
    if (this.hostRematchesRef) {
      off(this.hostRematchesRef);
      this.hostRematchesRef = null;
      decrementLifecycleCounter("connectionObservers");
    }
    if (this.guestRematchesRef) {
      off(this.guestRematchesRef);
      this.guestRematchesRef = null;
      decrementLifecycleCounter("connectionObservers");
    }
  }

  private cleanupWagerObserver() {
    if (this.wagersRef) {
      off(this.wagersRef);
      this.wagersRef = null;
      decrementLifecycleCounter("connectionObservers");
    }
  }

  private observeMiningFrozen(uid: string | null) {
    if (this.miningFrozenRef) {
      off(this.miningFrozenRef);
      this.miningFrozenRef = null;
      decrementLifecycleCounter("connectionObservers");
    }
    if (!uid) {
      setFrozenMaterials(null);
      return;
    }
    const miningRef = ref(this.db, `players/${uid}/mining/frozen`);
    const observeEpoch = this.sessionEpoch;
    this.miningFrozenRef = miningRef;
    incrementLifecycleCounter("connectionObservers");
    onValue(miningRef, (snapshot) => {
      if (!this.isSessionEpochActive(observeEpoch)) {
        return;
      }
      setFrozenMaterials(snapshot.val());
    });
  }

  private observeMatch(playerId: string, matchId: string): void {
    const matchRef = ref(this.db, `players/${playerId}/matches/${matchId}`);
    const key = `${matchId}_${playerId}`;
    if (this.matchRefs[key]) {
      return;
    }
    const observeEpoch = this.sessionEpoch;
    this.matchRefs[key] = matchRef;
    incrementLifecycleCounter("connectionObservers");

    onValue(
      matchRef,
      (snapshot) => {
        if (!this.isSessionEpochActive(observeEpoch)) {
          return;
        }
        const matchData: Match | null = snapshot.val();
        if (matchData) {
          didReceiveMatchUpdate(matchData, playerId, matchId);
        }
      },
      (error) => {
        if (!this.isSessionEpochActive(observeEpoch)) {
          return;
        }
        console.error("Error observing match data:", error);
      }
    );

    this.getProfileByLoginId(playerId)
      .then((profile) => {
        if (!this.isSessionEpochActive(observeEpoch)) {
          return;
        }
        didGetPlayerProfile(profile, playerId, false);
      })
      .catch((error) => {
        if (!this.isSessionEpochActive(observeEpoch)) {
          return;
        }
        console.error("Error getting player profile:", error);
        this.observeProfile(playerId);
      });
  }

  private observeProfile(playerId: string): void {
    const profileRef = ref(this.db, `players/${playerId}/profile`);
    if (this.profileRefs[playerId]) {
      return;
    }
    const observeEpoch = this.sessionEpoch;
    this.profileRefs[playerId] = profileRef;
    incrementLifecycleCounter("connectionObservers");

    onValue(profileRef, (snapshot) => {
      if (!this.isSessionEpochActive(observeEpoch)) {
        return;
      }
      const profile = snapshot.val();
      if (profile) {
        off(profileRef);
        delete this.profileRefs[playerId];
        decrementLifecycleCounter("connectionObservers");
        this.getProfileByLoginId(playerId)
          .then((profile) => {
            if (!this.isSessionEpochActive(observeEpoch)) {
              return;
            }
            didGetPlayerProfile(profile, playerId, false);
          })
          .catch((error) => {
            if (!this.isSessionEpochActive(observeEpoch)) {
              return;
            }
            console.error("Error getting player profile:", error);
          });
      }
    });
  }

  public async checkBothPlayerProfiles(hostPlayerId: string, guestPlayerId: string, profileValue: string): Promise<string | null> {
    try {
      const hostProfileRef = ref(this.db, `players/${hostPlayerId}/profile`);

      if (guestPlayerId === "") {
        const hostSnapshot = await get(hostProfileRef);
        const hostProfile = hostSnapshot.val();

        if (hostProfile === profileValue) {
          return hostPlayerId;
        }
      } else {
        const guestProfileRef = ref(this.db, `players/${guestPlayerId}/profile`);

        const [hostSnapshot, guestSnapshot] = await Promise.all([get(hostProfileRef), get(guestProfileRef)]);

        const hostProfile = hostSnapshot.val();
        const guestProfile = guestSnapshot.val();

        if (hostProfile === profileValue) {
          return hostPlayerId;
        } else if (guestProfile === profileValue) {
          return guestPlayerId;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private stopObservingAllMatches(): void {
    let removedMatchCount = 0;
    for (const key in this.matchRefs) {
      off(this.matchRefs[key]);
      console.log(`Stopped observing match for key ${key}`);
      removedMatchCount += 1;
    }
    this.matchRefs = {};
    if (removedMatchCount > 0) {
      decrementLifecycleCounter("connectionObservers", removedMatchCount);
    }

    let removedProfileCount = 0;
    for (const key in this.profileRefs) {
      off(this.profileRefs[key]);
      console.log(`Stopped observing profile for key ${key}`);
      removedProfileCount += 1;
    }
    this.profileRefs = {};
    if (removedProfileCount > 0) {
      decrementLifecycleCounter("connectionObservers", removedProfileCount);
    }
  }
}

export const connection = new Connection();

const emojis = (await import("../content/emojis")).emojis;
