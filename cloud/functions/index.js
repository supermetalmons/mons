const admin = require("firebase-admin");
admin.initializeApp();

const { verifySolanaAddress } = require("./verifySolanaAddress");
const { verifyEthAddress } = require("./verifyEthAddress");
const { attestMatchVictory } = require("./attestMatchVictory");
const { updateRatings } = require("./updateRatings");
const { startMatchTimer, claimMatchVictoryByTimer } = require("./matchTimers");
const { automatch } = require("./automatch");
const { editUsername } = require("./editUsername");
const { getNfts } = require("./getNfts");

exports.verifySolanaAddress = verifySolanaAddress;
exports.verifyEthAddress = verifyEthAddress;
exports.attestMatchVictory = attestMatchVictory;
exports.startMatchTimer = startMatchTimer;
exports.claimMatchVictoryByTimer = claimMatchVictoryByTimer;
exports.automatch = automatch;
exports.updateRatings = updateRatings;
exports.editUsername = editUsername;
exports.getNfts = getNfts;