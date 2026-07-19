"use strict";

const CONTROLLER_VERSION = 2;

function buildFreshMatchRecord({ color, emojiId, aura, seed }) {
  return {
    version: CONTROLLER_VERSION,
    color,
    emojiId,
    aura,
    gameVariant: seed.gameVariant,
    fen: seed.fen,
    status: "",
    flatMovesString: "",
    timer: "",
  };
}

module.exports = {
  CONTROLLER_VERSION,
  buildFreshMatchRecord,
};
