import { initializeApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getDatabase, Database, ref, set, onValue, off, get, update } from "firebase/database";
import { didFindInviteThatCanBeJoined, didReceiveMatchUpdate, initialFen, didRecoverMyMatch, enterWatchOnlyMode, didFindYourOwnInviteThatNobodyJoined, didReceiveRematchesSeriesEndIndicator, didDiscoverExistingRematchProposalWaitingForResponse, didJustCreateRematchProposalSuccessfully, failedToCreateRematchProposal } from "../game/gameController";
import { getPlayersEmojiId, didGetEthAddress } from "../game/board";
import { getFunctions, Functions, httpsCallable } from "firebase/functions";
import { Match, Invite, Reaction } from "./connectionModels";

const controllerVersion = 2;

class FirebaseConnection {
  private app: FirebaseApp;
  private auth: Auth;
  private db: Database;
  private functions: Functions;
  private opponentRematchesRef: any = null;
  private matchRefs: { [key: string]: any } = {};

  private uid: string | null = null;

  private latestInvite: Invite | null = null;
  private myMatch: Match | null = null;
  private inviteId: string | null = null;
  private matchId: string | null = null;

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
    this.functions = getFunctions(this.app);
  }

  public async signIn(): Promise<string | undefined> {
    try {
      await signInAnonymously(this.auth);
      // TODO: make it work with custom sign in with eth
      const uid = this.auth.currentUser?.uid;
      return uid;
    } catch (error) {
      console.error("Failed to sign in anonymously:", error);
      return undefined;
    }
  }

  public async verifyEthAddress(message: string, signature: string): Promise<any> {
    try {
      await this.ensureAuthenticated();
      const verifyEthAddressFunction = httpsCallable(this.functions, "verifyEthAddress");
      const response = await verifyEthAddressFunction({ message, signature });
      return response.data;
    } catch (error) {
      console.error("Error verifying Ethereum address:", error);
      throw error;
    }
  }

  public subscribeToAuthChanges(callback: (uid: string | null) => void): void {
    onAuthStateChanged(this.auth, (user) => {
      callback(user ? user.uid : null);
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
    const endingAsHost = this.latestInvite.hostId === this.uid;
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

    const proposingAsHost = this.latestInvite.hostId === this.uid;
    const emojiId = getPlayersEmojiId();
    const proposalIndexIsEven = parseInt(newRematchProposalIndex, 10) % 2 === 0;
    const initialGuestColor = this.latestInvite.hostColor === "white" ? "black" : "white";
    const newColor = proposalIndexIsEven ? (proposingAsHost ? this.latestInvite.hostColor : initialGuestColor) : proposingAsHost ? initialGuestColor : this.latestInvite.hostColor;
    const asHost = this.latestInvite?.hostId === this.uid;
    let newRematchesProposalsString = "";

    const inviteId = this.inviteId;
    const nextMatchId = inviteId + newRematchProposalIndex;
    const nextMatch: Match = {
      version: controllerVersion,
      color: newColor,
      emojiId,
      fen: initialFen,
      status: "",
      flatMovesString: "",
      timer: "",
    };

    const updates: { [key: string]: any } = {};
    updates[`players/${this.uid}/matches/${nextMatchId}`] = nextMatch;

    if (asHost) {
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
          if (asHost) {
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

    const proposingAsHost = this.latestInvite.hostId === this.uid;
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
    if (!this.latestInvite || !this.uid) {
      return "";
    }

    if (this.latestInvite.hostId === this.uid) {
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
      const response = await startTimerFunction({ inviteId: this.inviteId, matchId: this.matchId, opponentId: opponentId });
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
      const response = await claimVictoryByTimerFunction({ inviteId: this.inviteId, matchId: this.matchId, opponentId: opponentId });
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
      const automatch = httpsCallable(this.functions, "automatch");
      const response = await automatch({ emojiId });
      return response.data;
    } catch (error) {
      console.error("Error calling automatch:", error);
      throw error;
    }
  }

  public async prepareOnchainVictoryTx(): Promise<any> {
    try {
      await this.ensureAuthenticated();
      const attestVictoryFunction = httpsCallable(this.functions, "attestMatchVictory");
      const opponentId = this.getOpponentId();
      const response = await attestVictoryFunction({ inviteId: this.inviteId, matchId: this.matchId, opponentId: opponentId });
      return response.data;
    } catch (error) {
      console.error("Error preparing onchain victory tx:", error);
      throw error;
    }
  }

  public updateEmoji(newId: number): void {
    if (!this.myMatch) return;
    this.myMatch.emojiId = newId;
    set(ref(this.db, `players/${this.uid}/matches/${this.matchId}/emojiId`), newId).catch((error) => {
      console.error("Error updating emoji:", error);
    });
  }

  public sendVoiceReaction(reaction: Reaction): void {
    if (!this.myMatch) return;
    this.myMatch.reaction = reaction;
    set(ref(this.db, `players/${this.uid}/matches/${this.matchId}/reaction`), reaction).catch((error) => {
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

  private sendMatchUpdate(): void {
    set(ref(this.db, `players/${this.uid}/matches/${this.matchId}`), this.myMatch)
      .then(() => {
        console.log("Match update sent successfully");
      })
      .catch((error) => {
        console.error("Error sending match update:", error);
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

  private getLatestBothSidesApprovedOrProposedByMeMatchId(): string {
    let rematchIndex = this.getLatestBothSidesApprovedRematchIndex();
    if (!this.inviteId || !this.latestInvite) {
      return "";
    } else if (!this.rematchSeriesEndIsIndicated() && this.latestInvite.guestRematches?.length !== this.latestInvite.hostRematches?.length) {
      const guestRematchesLength = this.latestInvite.guestRematches?.length ?? 0;
      const hostRematchesLength = this.latestInvite.hostRematches?.length ?? 0;
      const proposedMoreAsHost = this.latestInvite.hostId === this.uid && hostRematchesLength > guestRematchesLength;
      const proposedMoreAsGuest = this.latestInvite.guestId === this.uid && guestRematchesLength > hostRematchesLength;
      if (proposedMoreAsHost || proposedMoreAsGuest) {
        rematchIndex = rematchIndex ? rematchIndex + 1 : 1;
        didDiscoverExistingRematchProposalWaitingForResponse();
      }
    }
    if (!rematchIndex) {
      return this.inviteId;
    } else {
      return this.inviteId + rematchIndex.toString();
    }
  }

  public connectToGame(uid: string, inviteId: string, autojoin: boolean): void {
    this.uid = uid;
    this.inviteId = inviteId;
    const inviteRef = ref(this.db, `invites/${inviteId}`);
    get(inviteRef)
      .then((snapshot) => {
        const inviteData: Invite | null = snapshot.val();
        if (!inviteData) {
          console.log("No invite data found");
          return;
        }

        this.latestInvite = inviteData;
        this.observeRematchOrEndMatchIndicators();
        const matchId = this.getLatestBothSidesApprovedOrProposedByMeMatchId();
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
            this.enterWatchOnlyMode(matchId, inviteData.hostId, inviteData.guestId);
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

        set(ref(this.db, `players/${this.uid}/matches/${matchId}`), match)
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
      fen: initialFen,
      status: "",
      flatMovesString: "",
      timer: "",
    };

    this.myMatch = match;
    this.uid = uid;
    this.inviteId = inviteId;
    this.latestInvite = invite;

    const matchId = inviteId;
    this.matchId = matchId;

    const updates: { [key: string]: any } = {};
    updates[`players/${uid}/matches/${matchId}`] = match;
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

  private observeRematchOrEndMatchIndicators() {
    if (this.opponentRematchesRef || !this.latestInvite || this.rematchSeriesEndIsIndicated()) return;
    const observeAsGuest = !(this.latestInvite.hostId === this.uid);

    const observationPath = `invites/${this.inviteId}/${observeAsGuest ? "hostRematches" : "guestRematches"}`;
    this.opponentRematchesRef = ref(this.db, observationPath);

    onValue(this.opponentRematchesRef, (snapshot) => {
      const rematchesString: string | null = snapshot.val();
      if (rematchesString !== null) {
        if (observeAsGuest) {
          this.latestInvite!.hostRematches = rematchesString;
        } else {
          this.latestInvite!.guestRematches = rematchesString;
        }

        // TODO: handle if waiting for opponent's rematch

        if (this.rematchSeriesEndIsIndicated()) {
          didReceiveRematchesSeriesEndIndicator();
          off(this.opponentRematchesRef);
          this.opponentRematchesRef = null;
        }
      }
    });
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

    this.getPlayerEthAddress(playerId)
      .then((ethAddress) => {
        if (ethAddress) {
          didGetEthAddress(ethAddress, playerId);
        }
      })
      .catch((error) => {
        console.error("Error getting ETH address:", error);
      });

    // TODO: start listening for player profile updates when unable to get eth address right away
  }

  private async getPlayerEthAddress(uid: string): Promise<string> {
    try {
      const { getFirestore, collection, query, where, limit, getDocs } = require("firebase/firestore");

      const firestore = getFirestore();
      const usersRef = collection(firestore, "users");
      const q = query(usersRef, where("logins", "array-contains", uid), limit(1));
      const userQuery = await getDocs(q);

      if (!userQuery.empty) {
        const userDoc = userQuery.docs[0];
        const userData = userDoc.data();
        return userData.eth;
      }
    } catch (error) {
      console.error("Error getting player ETH address:", error);
    }
    return "";
  }

  private stopObservingAllMatches(): void {
    for (const key in this.matchRefs) {
      off(this.matchRefs[key]);
      console.log(`Stopped observing match for key ${key}`);
    }
    this.matchRefs = {};
  }
}

export const firebaseConnection = new FirebaseConnection();
