import { generateNewInviteId } from "../utils/misc";
import { PlayerProfile, Reaction } from "./connectionModels";

const initialPath = window.location.pathname.replace(/^\/|\/$/g, "");

export const isCreateNewInviteFlow = initialPath === "";
export const isBoardSnapshotFlow = initialPath.startsWith("snapshot/");

export function getSnapshotIdAndClearPathIfNeeded(): string | null {
  if (isBoardSnapshotFlow) {
    const snapshotId = initialPath.substring("snapshot/".length);
    return snapshotId;
  }
  return null;
}

let firebaseConnection: any;
let newInviteId = "";
let didCreateNewGameInvite = false;
let currentUid: string | null = "";

export function connectToAutomatch(inviteId: string) {
  newInviteId = inviteId;
  updatePath(newInviteId);
  connectToGame(inviteId, true);
}

export async function subscribeToAuthChanges(callback: (uid: string | null) => void) {
  const connection = await getFirebaseConnection();
  connection.subscribeToAuthChanges((newUid: string | null) => {
    if (newUid !== currentUid) {
      currentUid = newUid;
      callback(newUid);
    }
  });
}

export function sendEndMatchIndicator() {
  firebaseConnection.sendEndMatchIndicator();
}

export function sendRematchProposal() {
  firebaseConnection.sendRematchProposal();
}

export function rematchSeriesEndIsIndicated(): boolean {
  return firebaseConnection.rematchSeriesEndIsIndicated();
}

export function isAutomatch(): boolean {
  return firebaseConnection.isAutomatch();
}

export function setupConnection(autojoin: boolean) {
  if (!isCreateNewInviteFlow) {
    const shouldAutojoin = autojoin || initialPath.startsWith("auto_");
    connectToGame(initialPath, shouldAutojoin);
  }
}

export function didClickInviteButton(completion: any) {
  if (didCreateNewGameInvite) {
    writeInviteLinkToClipboard();
    completion(true);
  } else {
    if (isCreateNewInviteFlow) {
      newInviteId = generateNewInviteId();
      writeInviteLinkToClipboard();
      createNewMatchInvite(completion);
    } else {
      newInviteId = initialPath;
      writeInviteLinkToClipboard();
      completion(true);
    }
  }
}

function writeInviteLinkToClipboard() {
  const link = window.location.origin + "/" + newInviteId;
  navigator.clipboard.writeText(link);
}

export function sendResignStatus() {
  firebaseConnection.surrender();
}

export function sendMove(moveFen: string, newBoardFen: string) {
  firebaseConnection.sendMove(moveFen, newBoardFen);
}

export function sendVoiceReaction(reaction: Reaction) {
  firebaseConnection.sendVoiceReaction(reaction);
}

export function sendEmojiUpdate(newId: number, matchOnly: boolean) {
  firebaseConnection.updateEmoji(newId, matchOnly);
}

export async function verifyEthAddress(message: string, signature: string): Promise<any> {
  if (!firebaseConnection) {
    const uid = await signIn();
    if (!uid) {
      throw new Error("Failed to authenticate user");
    }
  }
  return firebaseConnection.verifyEthAddress(message, signature);
}

export async function verifySolanaAddress(address: string, signature: string): Promise<any> {
  if (!firebaseConnection) {
    const uid = await signIn();
    if (!uid) {
      throw new Error("Failed to authenticate user");
    }
  }
  return firebaseConnection.verifySolanaAddress(address, signature);
}

export async function editUsername(username: string): Promise<any> {
  return firebaseConnection.editUsername(username);
}

export async function startTimer(): Promise<any> {
  return firebaseConnection.startTimer();
}

export async function getLeaderboard(): Promise<PlayerProfile[]> {
  return firebaseConnection.getLeaderboard();
}

export async function getProfileByProfileId(id: string): Promise<PlayerProfile> {
  return firebaseConnection.getProfileByProfileId(id);
}

export async function getProfileByLoginId(loginId: string): Promise<PlayerProfile> {
  return firebaseConnection.getProfileByLoginId(loginId);
}

export async function seeIfFreshlySignedInProfileIsOneOfThePlayers(profileId: string): Promise<void> {
  return firebaseConnection.seeIfFreshlySignedInProfileIsOneOfThePlayers(profileId);
}

export async function signOut(): Promise<void> {
  return firebaseConnection.signOut();
}

export async function sendAutomatchRequest(): Promise<any> {
  return firebaseConnection.automatch();
}

export async function claimVictoryByTimer(): Promise<any> {
  return firebaseConnection.claimVictoryByTimer();
}

export async function refreshTokenIfNeeded(): Promise<any> {
  return firebaseConnection.refreshTokenIfNeeded();
}

export async function forceTokenRefresh(): Promise<any> {
  return firebaseConnection.forceTokenRefresh();
}

export async function updateRatings(): Promise<any> {
  return firebaseConnection.updateRatings();
}

export async function prepareOnchainVictoryTx(): Promise<any> {
  return firebaseConnection.prepareOnchainVictoryTx();
}

export function connectToGame(inviteId: string, autojoin: boolean) {
  signIn().then((uid) => {
    if (uid) {
      firebaseConnection.connectToGame(uid, inviteId, autojoin);
    } else {
      console.log("failed to get game info");
    }
  });
}

function createNewMatchInvite(completion: any) {
  signIn().then((uid) => {
    if (uid) {
      firebaseConnection.createInvite(uid, newInviteId);
      didCreateNewGameInvite = true;
      updatePath(newInviteId);
      completion(true);
    } else {
      console.log("failed to sign in");
      completion(false);
    }
  });
}

function updatePath(newInviteId: string) {
  const newPath = `/${newInviteId}`;
  window.history.pushState({ path: newPath }, "", newPath);
}

async function getFirebaseConnection() {
  if (!firebaseConnection) {
    firebaseConnection = (await import("./firebaseConnection")).firebaseConnection;
  }
  return firebaseConnection;
}

export async function signIn(): Promise<string | undefined> {
  const connection = await getFirebaseConnection();
  return connection.signIn();
}
