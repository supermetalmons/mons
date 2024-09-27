import { generateNewGameId } from "../utils/misc";

const initialPath = window.location.pathname.replace(/^\/|\/$/g, "");
export const isCreateNewInviteFlow = initialPath === "";
let newGameId = "";
let didCreateNewGameInvite = false;
let firebaseConnection: any;

export function setupConnection() {
  if (!isCreateNewInviteFlow) {
    connectToGame(initialPath);
  }
}

export function didClickInviteButton(completion) {
  if (didCreateNewGameInvite) {
    writeInviteLinkToClipboard();
    completion(true);
  } else {
    newGameId = generateNewGameId();
    writeInviteLinkToClipboard();
    createNewMatchInvite(completion);
  }
}

function writeInviteLinkToClipboard() {
  const link = window.location.origin + "/" + newGameId;
  navigator.clipboard.writeText(link);
}

// TODO: tmp here as long as we access connection from here
export function sendMove(moveFen: string, newBoardFen: string) {
  firebaseConnection.sendMove(moveFen, newBoardFen);
}

export function sendVoiceReaction(reaction: any) {
  firebaseConnection.sendVoiceReaction(reaction);
}

// TODO: tmp here as long as we access connection from here
export function sendEmojiUpdate(newId: number) {
  firebaseConnection.updateEmoji(newId);
}

export async function verifyEthAddress(message: string, signature: string): Promise<any> {
  if (!firebaseConnection) {
    signIn().then((uid) => {
      if (uid) {
        firebaseConnection.verifyEthAddress(message, signature);
      } else {
        throw new Error("Failed to authenticate user");
      }
    });
  } else {
    firebaseConnection.verifyEthAddress(message, signature);
  }
}

function connectToGame(gameId: string) {
  signIn().then((uid) => {
    if (uid) {
      firebaseConnection.connectToGame(uid, gameId);
      // TODO: do not update it too early
      // inviteButton.innerHTML = "connected"; // TODO: gotta be able to copy game link
      // TODO: configure new button differently
    } else {
      // TODO: show message that smth is wrong
      console.log("failed to get game info");
    }
  });
}

function createNewMatchInvite(completion) {
  signIn().then((uid) => {
    if (uid) {
      firebaseConnection.createInvite(uid, newGameId); // TODO: process create invite result
      didCreateNewGameInvite = true;
      updatePath(newGameId);
      completion(true);
    } else {
      console.log("failed to sign in");
      completion(false);
    }
  });
}

function updatePath(newGameId: string) {
  const newPath = `/${newGameId}`;
  window.history.pushState({ path: newPath }, "", newPath);
}

async function signIn(): Promise<string | undefined> {
  if (!firebaseConnection) {
    firebaseConnection = (await import("./firebaseConnection")).firebaseConnection;
  }
  return firebaseConnection.signIn();
}
