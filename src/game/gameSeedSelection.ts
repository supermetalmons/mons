import type { RouteState } from "../navigation/routeState";
import {
  buildGameSeedForStoredVariant,
  buildRandomGameSeed,
  GameSeed,
  legacyDefaultGameVariant,
} from "./gameVariants";

const routeUsesRandomInitialSeed = (
  routeState: Pick<RouteState, "mode">,
): boolean => {
  return (
    routeState.mode === "home" ||
    routeState.mode === "event" ||
    routeState.mode === "watch"
  );
};

export const buildInitialRouteGameSeed = (
  routeState: Pick<RouteState, "mode">,
  random: () => number = Math.random,
): GameSeed => {
  if (routeUsesRandomInitialSeed(routeState)) {
    return buildRandomGameSeed(random);
  }
  return buildGameSeedForStoredVariant(legacyDefaultGameVariant);
};
