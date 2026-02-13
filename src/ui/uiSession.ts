import { closeAllKindsOfPopups } from "./MainMenu";
import { closeNavigationAndAppearancePopupIfAny } from "./BottomControls";
import { hideNotificationBanner } from "./ProfileSignIn";
import { hideShinyCard } from "./ShinyCard";
import { resetIslandOverlayState } from "./islandOverlayState";
import { clearBoardTransientUi } from "./BoardComponent";

export const closeTransientUi = () => {
  closeNavigationAndAppearancePopupIfAny();
  closeAllKindsOfPopups();
  hideNotificationBanner();
  hideShinyCard();
  resetIslandOverlayState();
  clearBoardTransientUi(false);
};

