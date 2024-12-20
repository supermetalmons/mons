import "@rainbow-me/rainbowkit/styles.css";
import "./index.css";
import ReactDOM from "react-dom/client";
import React, { useCallback, useEffect, useState } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { ConnectButton, RainbowKitAuthenticationProvider, RainbowKitProvider, lightTheme, darkTheme } from "@rainbow-me/rainbowkit";

import BoardComponent from "./ui/BoardComponent";
import MainMenu, { toggleInfoVisibility } from "./ui/MainMenu";
import { config } from "./utils/wagmi";
import { useAuthStatus, createAuthAdapter } from "./connection/authentication";
import { signIn } from "./connection/connection";
import BottomControls from "./ui/BottomControls";
import { isMobile } from "./utils/misc";
import { FaVolumeUp, FaMusic, FaVolumeMute, FaStop, FaInfoCircle } from "react-icons/fa";
import { isMobileOrVision } from "./utils/misc";
import { soundPlayer } from "./utils/SoundPlayer";
import { startPlayingMusic, stopPlayingMusic } from "./content/music";

let globalIsMuted: boolean = (() => {
  const isMuted = localStorage.getItem("isMuted");
  return isMuted === "true" || (isMuted === null && isMobileOrVision);
})();

export const getIsMuted = (): boolean => globalIsMuted;

const queryClient = new QueryClient();

const App = () => {
  const { authStatus, setAuthStatus } = useAuthStatus();
  const authenticationAdapter = createAuthAdapter(setAuthStatus);
  const [isMuted, setIsMuted] = useState(globalIsMuted);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);

  useEffect(() => {
    localStorage.setItem("isMuted", isMuted.toString());
    globalIsMuted = isMuted;
    soundPlayer.didBecomeMuted(isMuted);
  }, [isMuted]);

  const handleMuteToggle = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsMuted((prev) => !prev);
    soundPlayer.initialize(true);
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

  const handleInfoButtonClick = (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    toggleInfoVisibility();
  };

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitAuthenticationProvider adapter={authenticationAdapter} status={authStatus}>
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
                  <div className="small-top-control-buttons">
                    <button className="info-button" onClick={!isMobile ? handleInfoButtonClick : undefined} onTouchStart={isMobile ? handleInfoButtonClick : undefined}>
                      <FaInfoCircle />
                    </button>
                    <button className="music-button" onClick={handleMusicToggle} aria-label={isMusicPlaying ? "Stop Music" : "Play Music"}>
                      {isMusicPlaying ? <FaStop /> : <FaMusic />}
                    </button>
                    <button className="sound-button" onClick={handleMuteToggle} aria-label={isMuted ? "Unmute" : "Mute"}>
                      {isMuted ? <FaVolumeMute /> : <FaVolumeUp />}
                    </button>
                  </div>
                )}
                <div className="connect-button-container">
                  <ConnectButton
                    showBalance={false}
                    chainStatus="none"
                    accountStatus={{
                      smallScreen: "avatar",
                      largeScreen: "full",
                    }}
                  />
                </div>
              </div>
              <BoardComponent />
              <MainMenu />
              <BottomControls />
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
