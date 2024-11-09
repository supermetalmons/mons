import { generateNewInviteId } from "../utils/misc";
import { Reaction } from "./connectionModels";

const initialPath = window.location.pathname.replace(/^\/|\/$/g, "");
export const isCreateNewInviteFlow = initialPath === "";

let firebaseConnection: any;
let newInviteId = "";
let didCreateNewGameInvite = false;
let currentUid: string | null = "";

export async function subscribeToAuthChanges(callback: (uid: string | null) => void) {
  const connection = await getFirebaseConnection();
  connection.subscribeToAuthChanges((newUid: string | null) => {
    if (newUid !== currentUid) {
      currentUid = newUid;
      callback(newUid);
    }
  });
}

export function sendRematchProposal() {
  firebaseConnection.sendRematchProposal();
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

export function sendEmojiUpdate(newId: number) {
  firebaseConnection.updateEmoji(newId);
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

export async function startTimer(): Promise<any> {
  return firebaseConnection.startTimer();
}

export async function sendAutomatchRequest(): Promise<any> {
  return firebaseConnection.automatch();
}

export async function claimVictoryByTimer(): Promise<any> {
  return firebaseConnection.claimVictoryByTimer();
}

export async function prepareOnchainVictoryTx(): Promise<any> {
  return firebaseConnection.prepareOnchainVictoryTx();
}

export function connectToGame(inviteId: string, autojoin: boolean) {
  signIn().then((uid) => {
    if (uid) {
      firebaseConnection.connectToGame(uid, inviteId, autojoin);
    } else {
      // TODO: try to reconnect
      console.log("failed to get game info");
    }
  });
}

function createNewMatchInvite(completion: any) {
  signIn().then((uid) => {
    if (uid) {
      firebaseConnection.createInvite(uid, newInviteId); // TODO: retry if failed to create
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
