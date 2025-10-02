const admin = require("firebase-admin");
admin.initializeApp();

const { verifySolanaAddress } = require("./verifySolanaAddress");
const { verifyEthAddress } = require("./verifyEthAddress");
const { updateRatings } = require("./updateRatings");
const { startMatchTimer, claimMatchVictoryByTimer } = require("./matchTimers");
const { automatch } = require("./automatch");
const { cancelAutomatch } = require("./cancelAutomatch");
const { editUsername } = require("./editUsername");
const { getNfts } = require("./getNfts");

exports.verifySolanaAddress = verifySolanaAddress;
exports.verifyEthAddress = verifyEthAddress;
exports.startMatchTimer = startMatchTimer;
exports.claimMatchVictoryByTimer = claimMatchVictoryByTimer;
exports.automatch = automatch;
exports.cancelAutomatch = cancelAutomatch;
exports.updateRatings = updateRatings;
exports.editUsername = editUsername;
exports.getNfts = getNfts;