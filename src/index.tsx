import "@rainbow-me/rainbowkit/styles.css";
import "./index.css";
import ReactDOM from "react-dom/client";
import React, { useCallback, useEffect, useState } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitAuthenticationProvider, RainbowKitProvider, lightTheme, darkTheme } from "@rainbow-me/rainbowkit";

import BoardComponent from "./ui/BoardComponent";
import MainMenu, { toggleInfoVisibility } from "./ui/MainMenu";
import { config } from "./utils/wagmi";
import { useAuthStatus, createEthereumAuthAdapter } from "./connection/authentication";
import { signIn } from "./connection/connection";
import BottomControls from "./ui/BottomControls";
import { isMobile } from "./utils/misc";
import { FaVolumeUp, FaMusic, FaVolumeMute, FaStop, FaInfoCircle, FaUndo, FaRegGem, FaPowerOff } from "react-icons/fa";
import { soundPlayer } from "./utils/SoundPlayer";
import { startPlayingMusic, stopPlayingMusic } from "./content/music";
import { storage } from "./utils/storage";
import ProfileSignIn, { handleLogout, showInventory } from "./ui/ProfileSignIn";
import FullScreenAlert from "./ui/FullScreenAlert";
import { showTalkingDude } from "./game/board";
import { didClickIdCardEditUndoButton } from "./ui/ShinyCard";

let globalIsMuted: boolean = (() => {
  return storage.getIsMuted(false);
})();

export const getIsMuted = (): boolean => globalIsMuted;

const queryClient = new QueryClient();

let getIsFullScreenAlertOpen: () => boolean = () => false;

export function hasFullScreenAlertVisible(): boolean {
  return getIsFullScreenAlertOpen();
}

let showAlertGlobal: (title: string, subtitle: string) => void;
let hideAlertGlobal: () => void;
export let enterProfileEditingMode: (enter: boolean) => void;
export let enableCardEditorUndo: (enable: boolean) => void;

export function hideFullScreenAlert() {
  if (hideAlertGlobal) {
    hideAlertGlobal();
  }
}
export function showFullScreenAlert(title: string, subtitle: string) {
  if (showAlertGlobal) {
    showAlertGlobal(title, subtitle);
  }
}

export let setIsMusicPlayingGlobal: (playing: boolean) => void;

const App = () => {
  const { authStatus, setAuthStatus } = useAuthStatus();
  const [isProfileEditingMode, setIsProfileEditingMode] = useState(false);
  const [isMuted, setIsMuted] = useState(globalIsMuted);
  const [isUndoEnabled, setIsUndoEnabled] = useState(false);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [alertState, setAlertState] = useState<{ title: string; subtitle: string } | null>(null);
  const ethereumAuthAdapter = createEthereumAuthAdapter(setAuthStatus);

  setIsMusicPlayingGlobal = setIsMusicPlaying;

  enterProfileEditingMode = (enter: boolean) => {
    setIsProfileEditingMode(enter);
  };

  enableCardEditorUndo = (enable: boolean) => {
    setIsUndoEnabled(enable);
  };

  useEffect(() => {
    showAlertGlobal = (title: string, subtitle: string) => {
      showTalkingDude(true).then(() => {
        setAlertState({ title, subtitle });
      });
    };
    hideAlertGlobal = () => {
      setAlertState(null);
      showTalkingDude(false);
    };
    return () => {
      showAlertGlobal = () => {};
      hideAlertGlobal = () => {};
    };
  }, []);

  getIsFullScreenAlertOpen = () => alertState !== null;

  useEffect(() => {
    storage.setIsMuted(isMuted);
    globalIsMuted = isMuted;
  }, [isMuted]);

  const handleMuteToggle = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsMuted((prev) => !prev);
    soundPlayer.initializeOnUserInteraction();
  }, []);

  const handleMusicToggle = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsMusicPlaying((prev) => {
      if (prev) {
        stopPlayingMusic();
        return false;
      } else {
        startPlayingMusic();
        return true;
      }
    });
  }, []);

  const handleLogOutButtonClick = (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    handleLogout();
  };

  const handleUndoEditButtonClick = (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    didClickIdCardEditUndoButton();
  };

  const handleGemButtonClick = (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    showInventory();
  };

  const handleInfoButtonClick = (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (alertState !== null) {
      hideFullScreenAlert();
    }
    toggleInfoVisibility();
  };

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitAuthenticationProvider adapter={ethereumAuthAdapter} status={authStatus}>
          <RainbowKitProvider
            showRecentTransactions={false}
            modalSize="compact"
            theme={{
              lightMode: lightTheme(),
              darkMode: darkTheme(),
            }}>
            <div className="app-container">
              <div className="top-buttons-container">
                {authStatus !== "loading" && (
                  <>
                    <div className="small-top-control-buttons">
                      {!isProfileEditingMode ? (
                        <>
                          <button className="info-button" onClick={!isMobile ? handleInfoButtonClick : undefined} onTouchStart={isMobile ? handleInfoButtonClick : undefined} aria-label="Info">
                            <FaInfoCircle />
                          </button>
                          <button className="music-button" onClick={handleMusicToggle} aria-label={isMusicPlaying ? "Stop Music" : "Play Music"}>
                            {isMusicPlaying ? <FaStop /> : <FaMusic />}
                          </button>
                          <button className="sound-button" onClick={handleMuteToggle} aria-label={isMuted ? "Unmute" : "Mute"}>
                            {isMuted ? <FaVolumeMute /> : <FaVolumeUp />}
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="info-button" onClick={!isMobile ? handleUndoEditButtonClick : undefined} onTouchStart={isMobile ? handleUndoEditButtonClick : undefined} aria-label="Undo" disabled={!isUndoEnabled}>
                            <FaUndo />
                          </button>
                          <button className="music-button" onClick={!isMobile ? handleGemButtonClick : undefined} onTouchStart={isMobile ? handleGemButtonClick : undefined} aria-label="NFTs">
                            <FaRegGem />
                          </button>
                          <button className="sound-button" onClick={handleLogOutButtonClick} aria-label={"Log Out"}>
                            <FaPowerOff />
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
                {authStatus !== "loading" && <ProfileSignIn authStatus={authStatus} />}
              </div>
              <BoardComponent />
              <MainMenu />
              <BottomControls />
              {alertState && <FullScreenAlert title={alertState.title} subtitle={alertState.subtitle} />}
            </div>
          </RainbowKitProvider>
        </RainbowKitAuthenticationProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

let lastTouchStartTime = 0;
const MIN_TIME_BETWEEN_TOUCHSTARTS = 555; // have seen a tooltip with 500

export function preventTouchstartIfNeeded(event: TouchEvent | MouseEvent) {
  if (!isMobile) {
    return;
  }
  const currentTime = event.timeStamp;
  const shouldPrevent = currentTime - lastTouchStartTime < MIN_TIME_BETWEEN_TOUCHSTARTS;
  if (!shouldPrevent) {
    lastTouchStartTime = currentTime;
  } else {
    event.preventDefault();
    event.stopPropagation();
  }
}

if (isMobile) {
  document.addEventListener(
    "touchstart",
    (e) => {
      preventTouchstartIfNeeded(e);
    },
    { passive: false }
  );
}

document.addEventListener(
  "contextmenu",
  function (e) {
    e.preventDefault();
  },
  false
);

signIn();

(function suppressThirdPartyErrorOverlay() {
  if (typeof window === "undefined") return;

  const isBenignLibraryError = (err: unknown) => {
    try {
      if (!err) return false;
      const message = typeof err === "string" ? err : (err as { message?: string }).message ?? "";
      if (message.includes("this.provider.disconnect is not a function")) {
        return true;
      } else {
        return false;
      }
    } catch {
      return false;
    }
  };

  const stop = (evt: { preventDefault(): void; stopImmediatePropagation(): void }) => {
    evt.preventDefault();
    evt.stopImmediatePropagation();
  };

  window.addEventListener(
    "unhandledrejection",
    (e) => {
      if (isBenignLibraryError(e.reason)) stop(e);
    },
    { capture: true }
  );
})();
