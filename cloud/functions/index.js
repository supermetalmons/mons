const admin = require("firebase-admin");
const { setGlobalOptions } = require("firebase-functions/v2/options");
admin.initializeApp();
setGlobalOptions({
  invoker: "public",
});

const { verifySolanaAddress } = require("./verifySolanaAddress");
const { verifyEthAddress } = require("./verifyEthAddress");
const { beginAuthIntent } = require("./beginAuthIntent");
const { beginGoogleRedirectAuth } = require("./beginGoogleRedirectAuth");
const { verifyAppleToken } = require("./verifyAppleToken");
const { verifyGoogleToken } = require("./verifyGoogleToken");
const { completeGoogleRedirectAuth } = require("./completeGoogleRedirectAuth");
const { googleAuthRedirectCallback } = require("./googleAuthRedirectCallback");
const { unlinkAuthMethod } = require("./unlinkAuthMethod");
const { getLinkedAuthMethods } = require("./getLinkedAuthMethods");
const { syncProfileClaim } = require("./syncProfileClaim");
const { updateRatings } = require("./updateRatings");
const { startMatchTimer, claimMatchVictoryByTimer } = require("./matchTimers");
const { automatch } = require("./automatch");
const { cancelAutomatch } = require("./cancelAutomatch");
const { removeNavigationGame } = require("./removeNavigationGame");
const { editUsername } = require("./editUsername");
const { getNfts } = require("./getNfts");
const { mineRock } = require("./mineRock");
const { sendWagerProposal } = require("./sendWagerProposal");
const { cancelWagerProposal } = require("./cancelWagerProposal");
const { declineWagerProposal } = require("./declineWagerProposal");
const { acceptWagerProposal } = require("./acceptWagerProposal");
const { resolveWagerOutcome } = require("./resolveWagerOutcome");
const {
  onInviteCreated,
  onInviteGuestIdChanged,
  onInviteHostRematchesChanged,
  onInviteGuestRematchesChanged,
  onMatchCreated,
  onAutomatchQueueWritten,
  onProfileLinkCreated,
  onProfileLinkWritten,
  onProfileDeleted,
} = require("./profileGamesProjector");

exports.verifySolanaAddress = verifySolanaAddress;
exports.verifyEthAddress = verifyEthAddress;
exports.beginAuthIntent = beginAuthIntent;
exports.beginGoogleRedirectAuth = beginGoogleRedirectAuth;
exports.verifyAppleToken = verifyAppleToken;
exports.verifyGoogleToken = verifyGoogleToken;
exports.completeGoogleRedirectAuth = completeGoogleRedirectAuth;
exports.googleAuthRedirectCallback = googleAuthRedirectCallback;
exports.unlinkAuthMethod = unlinkAuthMethod;
exports.getLinkedAuthMethods = getLinkedAuthMethods;
exports.syncProfileClaim = syncProfileClaim;
exports.startMatchTimer = startMatchTimer;
exports.claimMatchVictoryByTimer = claimMatchVictoryByTimer;
exports.automatch = automatch;
exports.cancelAutomatch = cancelAutomatch;
exports.removeNavigationGame = removeNavigationGame;
exports.updateRatings = updateRatings;
exports.editUsername = editUsername;
exports.getNfts = getNfts;
exports.mineRock = mineRock;
exports.sendWagerProposal = sendWagerProposal;
exports.cancelWagerProposal = cancelWagerProposal;
exports.declineWagerProposal = declineWagerProposal;
exports.acceptWagerProposal = acceptWagerProposal;
exports.resolveWagerOutcome = resolveWagerOutcome;
exports.projectProfileGamesOnInviteCreated = onInviteCreated;
exports.projectProfileGamesOnInviteGuestIdChanged = onInviteGuestIdChanged;
exports.projectProfileGamesOnInviteHostRematchesChanged = onInviteHostRematchesChanged;
exports.projectProfileGamesOnInviteGuestRematchesChanged = onInviteGuestRematchesChanged;
exports.projectProfileGamesOnMatchCreated = onMatchCreated;
exports.projectProfileGamesOnAutomatchQueueWritten = onAutomatchQueueWritten;
exports.projectProfileGamesOnProfileLinkCreated = onProfileLinkCreated;
exports.projectProfileGamesOnProfileLinkWritten = onProfileLinkWritten;
exports.projectProfileGamesOnProfileDeleted = onProfileDeleted;
