import * as bottomControls from "../ui/controls/bottomControlsPort";
import { setIslandButtonDimmed } from "../runtime/islandButtonPort";
import { PrimaryActionType } from "../ui/controls/primaryAction";

export type RouteControlsPreset =
  "automatchTransition" | "watch" | "snapshot" | "lobby" | "invite";

type SessionControlsCommands = Pick<
  typeof bottomControls,
  | "setHomeVisible"
  | "setBrushAndNavigationButtonDimmed"
  | "setNavigationListButtonVisible"
  | "setAutomatchWaitingState"
  | "setInviteLinkActionVisible"
  | "setAutomatchVisible"
  | "setBotGameOptionVisible"
  | "setUndoVisible"
  | "setAutomoveActionVisible"
  | "showMoveHistoryButton"
  | "setPlaySamePuzzleAgainButtonVisible"
  | "setAutomatchEnabled"
  | "setAutomoveActionEnabled"
  | "setUndoEnabled"
  | "setWatchOnlyVisible"
  | "showVoiceReactionButton"
  | "hideTimerButtons"
  | "disableAndHideUndoResignAndTimerControls"
  | "setEndMatchVisible"
  | "setEndMatchConfirmed"
  | "showWaitingStateText"
  | "showPrimaryAction"
> & {
  setIslandButtonDimmed: typeof setIslandButtonDimmed;
};

export function createSessionControlsPresenter(
  commands: SessionControlsCommands,
) {
  const applyRouteControlsPreset = (preset: RouteControlsPreset): void => {
    if (preset === "lobby") {
      commands.setInviteLinkActionVisible(true);
      commands.setAutomatchVisible(true);
      commands.setBotGameOptionVisible(true);
      commands.setNavigationListButtonVisible(true);
      return;
    }

    commands.setHomeVisible(true);
    commands.setIslandButtonDimmed(true);
    commands.setBrushAndNavigationButtonDimmed(true);

    switch (preset) {
      case "automatchTransition":
        commands.setNavigationListButtonVisible(false);
        commands.setAutomatchWaitingState(true);
        return;
      case "watch":
        commands.setInviteLinkActionVisible(false);
        commands.setAutomatchVisible(false);
        commands.setBotGameOptionVisible(false);
        commands.setNavigationListButtonVisible(false);
        return;
      case "snapshot":
        commands.setUndoVisible(true);
        commands.setInviteLinkActionVisible(false);
        commands.setAutomatchVisible(false);
        commands.setBotGameOptionVisible(false);
        commands.setNavigationListButtonVisible(false);
        commands.setAutomoveActionVisible(true);
        commands.showMoveHistoryButton(true);
        return;
      case "invite":
        commands.setNavigationListButtonVisible(false);
    }
  };

  const applyDisposedControlsPreset = (preserveAutomatchUi: boolean): void => {
    commands.setHomeVisible(preserveAutomatchUi);
    commands.setInviteLinkActionVisible(false);
    if (!preserveAutomatchUi) {
      commands.setAutomatchVisible(false);
    }
    commands.setBotGameOptionVisible(false);
    commands.setNavigationListButtonVisible(false);
    commands.setPlaySamePuzzleAgainButtonVisible(false);
    if (!preserveAutomatchUi) {
      commands.setAutomatchWaitingState(false);
      commands.setAutomatchEnabled(true);
    }
    commands.setBrushAndNavigationButtonDimmed(preserveAutomatchUi);
    commands.setUndoVisible(false);
    commands.setAutomoveActionVisible(false);
    commands.setAutomoveActionEnabled(true);
    commands.setUndoEnabled(false);
    commands.setWatchOnlyVisible(false);
    commands.showVoiceReactionButton(false);
    commands.showMoveHistoryButton(false);
    commands.hideTimerButtons();
    commands.disableAndHideUndoResignAndTimerControls();
    commands.setEndMatchVisible(false);
    commands.setEndMatchConfirmed(false);
    commands.showWaitingStateText("");
    commands.showPrimaryAction(PrimaryActionType.None);
  };

  return { applyRouteControlsPreset, applyDisposedControlsPreset };
}

const sessionControls = createSessionControlsPresenter({
  ...bottomControls,
  setIslandButtonDimmed,
});

export const applyRouteControlsPreset =
  sessionControls.applyRouteControlsPreset;
export const applyDisposedControlsPreset =
  sessionControls.applyDisposedControlsPreset;
