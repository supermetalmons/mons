import { closeTransientUi } from "../ui/uiSession";
import { disposeGameSession } from "../game/gameController";
import { disposeBoardRuntime } from "../game/board";
import { connection } from "../connection/connection";
import { resetWagerStore } from "../game/wagerState";
import { resetMainGameLoadedState } from "../game/mainGameLoadState";
import { resetWagerMaterialsState } from "../services/wagerMaterialsService";
import { resetProfileMiningState } from "../services/rocksMiningService";
import { resetNftCache } from "../services/nftService";
import { resetPlayerMetadataCaches } from "../utils/playerMetadata";
import { resetEnsCache } from "../utils/ensResolver";
import { getLifecycleCounters } from "./lifecycleDiagnostics";

const reportMatchScopeCounterDrift = () => {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  const counters = getLifecycleCounters();
  const drift = {
    boardDomListeners: counters.boardDomListeners,
    boardIntervals: counters.boardIntervals,
    boardTimeouts: counters.boardTimeouts,
    boardRaf: counters.boardRaf,
    gameTimeouts: counters.gameTimeouts,
  };
  const hasDrift = Object.values(drift).some((value) => value !== 0);
  if (hasDrift) {
    console.warn("match-scope-counters-not-baseline", drift);
  }
};

export const teardownMatchScope = () => {
  closeTransientUi();
  connection.beginMatchSessionTeardown();
  disposeGameSession();
  disposeBoardRuntime();
  connection.detachFromMatchSession();
  resetWagerStore();
  resetWagerMaterialsState();
  resetMainGameLoadedState();
  reportMatchScopeCounterDrift();
};

export const teardownProfileScope = () => {
  connection.detachFromProfileSession();
  resetProfileMiningState();
  resetNftCache();
  resetPlayerMetadataCaches();
  resetEnsCache();
};

export const teardownForHomeTransition = () => {
  teardownMatchScope();
};

