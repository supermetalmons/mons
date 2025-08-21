import { initializeApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth, signInAnonymously, onAuthStateChanged, signOut } from "firebase/auth";
import { getDatabase, Database, ref, set, onValue, off, get, update } from "firebase/database";
import { getFirestore, Firestore, collection, query, where, limit, getDocs, orderBy, updateDoc, doc } from "firebase/firestore";
import { didFindInviteThatCanBeJoined, didReceiveMatchUpdate, initialFen, didRecoverMyMatch, enterWatchOnlyMode, didFindYourOwnInviteThatNobodyJoined, didReceiveRematchesSeriesEndIndicator, didDiscoverExistingRematchProposalWaitingForResponse, didJustCreateRematchProposalSuccessfully, failedToCreateRematchProposal } from "../game/gameController";
import { getPlayersEmojiId, didGetPlayerProfile } from "../game/board";
import { getFunctions, Functions, httpsCallable } from "firebase/functions";
import { Match, Invite, Reaction, PlayerProfile } from "./connectionModels";
import { storage } from "../utils/storage";
import { generateNewInviteId } from "../utils/misc";

const controllerVersion = 2;

const initialPath = window.location.pathname.replace(/^\/|\/$/g, "");
export const isCreateNewInviteFlow = initialPath === "";
export const isBoardSnapshotFlow = initialPath.startsWith("snapshot/");
export const isBotsLoopMode = initialPath === "watch";

export function getSnapshotIdAndClearPathIfNeeded(): string | null {
  if (isBoardSnapshotFlow) {
    const snapshotId = initialPath.substring("snapshot/".length);
    return snapshotId;
  }
  return null;
}

class Connection {
  private app: FirebaseApp;
  private auth: Auth;
  private db: Database;
  private firestore: Firestore;
  private functions: Functions;

  private hostRematchesRef: any = null;
  private guestRematchesRef: any = null;
  private matchRefs: { [key: string]: any } = {};
  private profileRefs: { [key: string]: any } = {};

  private loginUid: string | null = null;
  private sameProfilePlayerUid: string | null = null;

  private latestInvite: Invite | null = null;
  private myMatch: Match | null = null;
  private inviteId: string | null = null;
  private matchId: string | null = null;

  private newInviteId = "";
  private didCreateNewGameInvite = false;
  private currentUid: string | null = "";

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

  public setupConnection(autojoin: boolean): void {
    if (!isCreateNewInviteFlow) {
      const shouldAutojoin = autojoin || initialPath.startsWith("auto_");
      this.signIn().then((uid) => {
        if (uid) {
          this.connectToGame(uid, initialPath, shouldAutojoin);
        } else {
          console.log("failed to get game info");
        }
      });
    }
  }

  public connectToAutomatch(inviteId: string): void {
    this.newInviteId = inviteId;
    this.updatePath(this.newInviteId);
    this.signIn().then((uid) => {
      if (uid) {
        this.connectToGame(uid, inviteId, true);
      } else {
        console.log("failed to get game info");
      }
    });
  }

  public didClickInviteButton(completion: (success: boolean) => void): void {
    if (this.didCreateNewGameInvite) {
      this.writeInviteLinkToClipboard();
      completion(true);
    } else {
      if (isCreateNewInviteFlow) {
        this.newInviteId = generateNewInviteId();
        this.writeInviteLinkToClipboard();
        this.createNewMatchInvite(completion);
      } else {
        this.newInviteId = initialPath;
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
    window.history.pushState({ path: newPath }, "", newPath);
  }

  private createNewMatchInvite(completion: (success: boolean) => void): void {
    this.signIn().then((uid) => {
      if (uid) {
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
    if (!this.latestInvite) {
      return;
    }
    const match = await this.checkBothPlayerProfiles(this.latestInvite.hostId, this.latestInvite.guestId ?? "", profileId);
    if (match !== null) {
      window.location.reload();
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
      this.loginUid = null;
      this.sameProfilePlayerUid = null;
    } catch (error) {
      console.error("Failed to sign out:", error);
      throw error;
    }
  }

  public async getProfileByLoginId(loginId: string): Promise<PlayerProfile> {
    await this.ensureAuthenticated();
    const usersRef = collection(this.firestore, "users");
    const q = query(usersRef, where("logins", "array-contains", loginId), limit(1));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      const data = doc.data();
      return {
        id: doc.id,
        username: data.username || null,
        eth: data.eth || null,
        sol: data.sol || null,
        rating: data.rating || 1500,
        nonce: data.nonce === undefined ? -1 : data.nonce,
        win: data.win ?? true,
        emoji: data.custom?.emoji ?? emojis.getEmojiIdFromString(doc.id),
        // TODO: add aura
        cardBackgroundId: data.custom?.cardBackgroundId,
        cardSubtitleId: data.custom?.cardSubtitleId,
        profileMons: data.custom?.profileMons,
        cardStickers: data.custom?.cardStickers,
        completedProblemIds: data.custom?.completedProblems,
        isTutorialCompleted: data.custom?.tutorialCompleted,
      };
    }
    throw new Error("Profile not found");
  }

  public async getLeaderboard(): Promise<PlayerProfile[]> {
    await this.ensureAuthenticated();
    const usersRef = collection(this.firestore, "users");
    const q = query(usersRef, orderBy("rating", "desc"), limit(50));
    const querySnapshot = await getDocs(q);

    const leaderboard: PlayerProfile[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      leaderboard.push({
        id: doc.id,
        username: data.username || null,
        eth: data.eth || null,
        sol: data.sol || null,
        rating: data.rating || 1500,
        nonce: data.nonce === undefined ? -1 : data.nonce,
        win: data.win ?? true,
        emoji: data.custom?.emoji ?? emojis.getEmojiIdFromString(doc.id),
        // TODO: add aura
        cardBackgroundId: data.custom?.cardBackgroundId,
        cardSubtitleId: data.custom?.cardSubtitleId,
        profileMons: data.custom?.profileMons,
        cardStickers: data.custom?.cardStickers,
        completedProblemIds: undefined,
        isTutorialCompleted: undefined,
      });
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
      const response = await verifySolanaAddressFunction({ address, signature, emoji });
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

  public async verifyEthAddress(message: string, signature: string): Promise<any> {
    try {
      await this.ensureAuthenticated();
      const verifyEthAddressFunction = httpsCallable(this.functions, "verifyEthAddress");
      const emojiString = storage.getPlayerEmojiId("1");
      const emoji = parseInt(emojiString);
      const response = await verifyEthAddressFunction({ message, signature, emoji });
      return response.data;
    } catch (error) {
      console.error("Error verifying Ethereum address:", error);
      throw error;
    }
  }

  public subscribeToAuthChanges(callback: (uid: string | null) => void): void {
    onAuthStateChanged(this.auth, (user) => {
      const newUid = user?.uid ?? null;
      if (newUid !== this.currentUid) {
        this.currentUid = newUid;
        callback(newUid);
      }
    });
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.auth.currentUser) {
      const uid = await this.signIn();
      if (!uid) {
        throw new Error("Failed to authenticate user");
      }
    }
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
      // TODO: add aura
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
        this.myMatch = nextMatch;
        this.matchId = nextMatchId;
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
      // TODO: add aura
      const automatch = httpsCallable(this.functions, "automatch");
      const response = await automatch({ emojiId });
      return response.data;
    } catch (error) {
      console.error("Error calling automatch:", error);
      throw error;
    }
  }

  public async updateRatings(): Promise<any> {
    try {
      await this.ensureAuthenticated();
      const updateRatingsFunction = httpsCallable(this.functions, "updateRatings");
      const opponentId = this.getOpponentId();
      const response = await updateRatingsFunction({ playerId: this.sameProfilePlayerUid, inviteId: this.inviteId, matchId: this.matchId, opponentId: opponentId });
      return response.data;
    } catch (error) {
      console.error("Error updating ratings:", error);
      throw error;
    }
  }

  public updateEmoji(newId: number, matchOnly: boolean): void {
    if (!matchOnly) {
      this.updateStoredEmoji(newId);
    }
    if (!this.myMatch) return;
    this.myMatch.emojiId = newId;
    // TODO: add aura
    set(ref(this.db, `players/${this.sameProfilePlayerUid}/matches/${this.matchId}/emojiId`), newId).catch((error) => {
      console.error("Error updating emoji:", error);
    });
  }

  private getLocalProfileId(): string | null {
    const id = storage.getProfileId("");
    return id === "" ? null : id;
  }

  public updateStoredEmoji(newId: number): void {
    this.updateCustomField("emoji", newId);
    // TODO: add aura
  }

  public updateCardBackgroundId(newId: number): void {
    this.updateCustomField("cardBackgroundId", newId);
  }

  public updateCardSubtitleId(newId: number): void {
    this.updateCustomField("cardSubtitleId", newId);
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
    this.signIn().then((uid) => {
      if (uid) {
        this.connectToGame(uid, inviteId, autojoin);
      } else {
        console.log("failed to get game info");
      }
    });
  }

  private sendMatchUpdate(): void {
    set(ref(this.db, `players/${this.sameProfilePlayerUid}/matches/${this.matchId}`), this.myMatch)
      .then(() => {
        console.log("Match update sent successfully");
      })
      .catch((error) => {
        console.error("Error sending match update:", error);
        window.location.reload();
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

    return lastNumber;
  }

  public connectToGame(uid: string, inviteId: string, autojoin: boolean): void {
    if (this.sameProfilePlayerUid === null || this.loginUid !== uid) {
      this.sameProfilePlayerUid = uid;
    }

    this.loginUid = uid;
    this.inviteId = inviteId;
    const inviteRef = ref(this.db, `invites/${inviteId}`);
    get(inviteRef)
      .then(async (snapshot) => {
        const inviteData: Invite | null = snapshot.val();
        if (!inviteData) {
          console.log("No invite data found");
          return;
        }

        this.latestInvite = inviteData;
        this.observeRematchOrEndMatchIndicators();

        const matchId = await this.getLatestBothSidesApprovedOrProposedByMeMatchId();
        this.matchId = matchId;

        if (!inviteData.guestId && inviteData.hostId !== uid) {
          if (autojoin) {
            set(ref(this.db, `invites/${inviteId}/guestId`), uid)
              .then(() => {
                if (this.latestInvite) {
                  this.latestInvite.guestId = uid;
                }
                this.getOpponentsMatchAndCreateOwnMatch(matchId, inviteData.hostId);
              })
              .catch((error) => {
                console.error("Error joining as a guest:", error);
              });
          } else {
            didFindInviteThatCanBeJoined();
          }
        } else {
          if (inviteData.hostId === uid) {
            this.reconnectAsHost(inviteId, matchId, inviteData.hostId, inviteData.guestId);
          } else if (inviteData.guestId === uid) {
            this.reconnectAsGuest(matchId, inviteData.hostId, inviteData.guestId);
          } else {
            if (this.sameProfilePlayerUid !== null && this.sameProfilePlayerUid !== this.loginUid) {
              if (this.sameProfilePlayerUid === inviteData.hostId) {
                this.reconnectAsHost(inviteId, matchId, inviteData.hostId, inviteData.guestId);
              } else {
                this.reconnectAsGuest(matchId, inviteData.hostId, inviteData.guestId ?? "");
              }
              this.refreshTokenIfNeeded();
            } else {
              const profileId = this.getLocalProfileId();
              if (profileId !== null) {
                this.checkBothPlayerProfiles(inviteData.hostId, inviteData.guestId ?? "", profileId)
                  .then((matchingUid) => {
                    if (matchingUid === null) {
                      this.enterWatchOnlyMode(matchId, inviteData.hostId, inviteData.guestId);
                    } else if (matchingUid === inviteData.hostId) {
                      this.sameProfilePlayerUid = matchingUid;
                      this.refreshTokenIfNeeded();
                      this.reconnectAsHost(inviteId, matchId, inviteData.hostId, inviteData.guestId);
                    } else {
                      this.sameProfilePlayerUid = matchingUid;
                      this.refreshTokenIfNeeded();
                      this.reconnectAsGuest(matchId, inviteData.hostId, inviteData.guestId ?? "");
                    }
                  })
                  .catch(() => {
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

  private reconnectAsGuest(matchId: string, hostId: string, guestId: string): void {
    const myMatchRef = ref(this.db, `players/${guestId}/matches/${matchId}`);
    get(myMatchRef)
      .then((snapshot) => {
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
        console.error("Failed to get guest's match:", error);
      });
  }

  private reconnectAsHost(inviteId: string, matchId: string, hostId: string, guestId: string | null | undefined): void {
    const myMatchRef = ref(this.db, `players/${hostId}/matches/${matchId}`);
    get(myMatchRef)
      .then((snapshot) => {
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
          onValue(inviteRef, (snapshot) => {
            const updatedInvite: Invite | null = snapshot.val();
            if (updatedInvite && updatedInvite.guestId) {
              if (this.latestInvite) {
                this.latestInvite.guestId = updatedInvite.guestId;
              }
              this.observeMatch(updatedInvite.guestId, matchId);
              off(inviteRef);
            }
          });
        }
      })
      .catch((error) => {
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

  private getOpponentsMatchAndCreateOwnMatch(matchId: string, hostId: string): void {
    const opponentsMatchRef = ref(this.db, `players/${hostId}/matches/${matchId}`);
    get(opponentsMatchRef)
      .then((snapshot) => {
        const opponentsMatchData: Match | null = snapshot.val();
        if (!opponentsMatchData) {
          console.log("No opponent's match data found");
          return;
        }

        const color = opponentsMatchData.color === "black" ? "white" : "black";
        const emojiId = getPlayersEmojiId();
        // TODO: add aura
        const match: Match = {
          version: controllerVersion,
          color,
          emojiId,
          fen: initialFen,
          status: "",
          flatMovesString: "",
          timer: "",
        };

        this.myMatch = match;

        set(ref(this.db, `players/${this.sameProfilePlayerUid}/matches/${matchId}`), match)
          .then(() => {
            this.observeMatch(hostId, matchId);
          })
          .catch((error) => {
            console.error("Error creating player match:", error);
          });
      })
      .catch((error) => {
        console.error("Failed to get opponent's match:", error);
      });
  }

  public createInvite(uid: string, inviteId: string): void {
    const hostColor = Math.random() < 0.5 ? "white" : "black";
    const emojiId = getPlayersEmojiId();

    const invite: Invite = {
      version: controllerVersion,
      hostId: uid,
      hostColor,
      guestId: null,
    };

    const match: Match = {
      version: controllerVersion,
      color: hostColor,
      emojiId,
      // TODO: add aura
      fen: initialFen,
      status: "",
      flatMovesString: "",
      timer: "",
    };

    this.myMatch = match;
    this.loginUid = uid;
    this.sameProfilePlayerUid = uid;
    this.inviteId = inviteId;
    this.latestInvite = invite;

    const matchId = inviteId;
    this.matchId = matchId;

    const updates: { [key: string]: any } = {};
    updates[`players/${this.loginUid}/matches/${matchId}`] = match;
    updates[`invites/${inviteId}`] = invite;
    update(ref(this.db), updates)
      .then(() => {
        console.log("Match and invite created successfully");
      })
      .catch((error) => {
        console.error("Error creating match and invite:", error);
      });

    const inviteRef = ref(this.db, `invites/${inviteId}`);
    onValue(inviteRef, (snapshot) => {
      const updatedInvite: Invite | null = snapshot.val();
      if (updatedInvite && updatedInvite.guestId) {
        console.log(`Guest ${updatedInvite.guestId} joined the invite ${inviteId}`);
        this.latestInvite = updatedInvite;
        this.observeRematchOrEndMatchIndicators();
        this.observeMatch(updatedInvite.guestId, matchId);
        off(inviteRef);
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
              this.sameProfilePlayerUid = matchingUid;
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

    const hostObservationPath = `invites/${this.inviteId}/hostRematches`;
    this.hostRematchesRef = ref(this.db, hostObservationPath);

    onValue(this.hostRematchesRef, (snapshot) => {
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

    onValue(this.guestRematchesRef, (snapshot) => {
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

  private cleanupRematchObservers() {
    if (this.hostRematchesRef) {
      off(this.hostRematchesRef);
      this.hostRematchesRef = null;
    }
    if (this.guestRematchesRef) {
      off(this.guestRematchesRef);
      this.guestRematchesRef = null;
    }
  }

  private observeMatch(playerId: string, matchId: string): void {
    const matchRef = ref(this.db, `players/${playerId}/matches/${matchId}`);
    const key = `${matchId}_${playerId}`;
    this.matchRefs[key] = matchRef;

    onValue(
      matchRef,
      (snapshot) => {
        const matchData: Match | null = snapshot.val();
        if (matchData) {
          didReceiveMatchUpdate(matchData, playerId, matchId);
        }
      },
      (error) => {
        console.error("Error observing match data:", error);
      }
    );

    this.getProfileByLoginId(playerId)
      .then((profile) => {
        didGetPlayerProfile(profile, playerId, false);
      })
      .catch((error) => {
        console.error("Error getting player profile:", error);
        this.observeProfile(playerId);
      });
  }

  private observeProfile(playerId: string): void {
    const profileRef = ref(this.db, `players/${playerId}/profile`);
    this.profileRefs[playerId] = profileRef;

    onValue(profileRef, (snapshot) => {
      const profile = snapshot.val();
      if (profile) {
        off(profileRef);
        delete this.profileRefs[playerId];
        this.getProfileByLoginId(playerId)
          .then((profile) => {
            didGetPlayerProfile(profile, playerId, false);
          })
          .catch((error) => {
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
    for (const key in this.matchRefs) {
      off(this.matchRefs[key]);
      console.log(`Stopped observing match for key ${key}`);
    }
    this.matchRefs = {};

    for (const key in this.profileRefs) {
      off(this.profileRefs[key]);
      console.log(`Stopped observing profile for key ${key}`);
    }
    this.profileRefs = {};
  }
}

export const connection = new Connection();

const emojis = (await import("../content/emojis")).emojis;
