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

export const teardownMatchScope = () => {
  closeTransientUi();
  connection.beginMatchSessionTeardown();
  disposeGameSession();
  disposeBoardRuntime();
  connection.detachFromMatchSession();
  resetWagerStore();
  resetWagerMaterialsState();
  resetMainGameLoadedState();
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

