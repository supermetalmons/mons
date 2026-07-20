import "./session/pendingLogoutWipeBootstrap";
import "@rainbow-me/rainbowkit/styles.css";
import "./index.css";
import ReactDOM from "react-dom/client";
import React, {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import {
  RainbowKitAuthenticationProvider,
  RainbowKitProvider,
  lightTheme,
  darkTheme,
} from "@rainbow-me/rainbowkit";

import BoardComponent from "./ui/BoardComponent";
import MainMenu, {
  closeAllKindsOfPopups,
  TopRightControls,
} from "./ui/MainMenu";
import { config } from "./utils/wagmi";
import {
  useAuthStatus,
  createEthereumAuthAdapter,
} from "./connection/authentication";
import { connection } from "./connection/connection";
import BottomControls from "./ui/BottomControls";
import { isMobile } from "./utils/misc";
import { preloadSounds } from "./content/sounds";
import { soundPlayer } from "./utils/SoundPlayer";
import { storage } from "./utils/storage";
import ProfileSignIn, {
  handleLogout,
  isLogoutUiLocked,
  showInventory,
  showSettings,
  subscribeToLogoutUiLock,
} from "./ui/ProfileSignIn";
import EventModal from "./ui/EventModal";
import { isMainGameLoaded, onMainGameLoaded } from "./game/mainGameLoadState";
import { Sound } from "./utils/gameModels";
import { initializeAppSessionManager } from "./session/AppSessionManager";
import { getCurrentRouteState } from "./navigation/routeState";
import { installLogoutSync } from "./session/logoutOrchestrator";

const LazyIslandButton = lazy(() => import("./ui/IslandButton"));

let globalIsMuted: boolean = (() => {
  return storage.getIsMuted(false);
})();

export const getIsMuted = (): boolean => globalIsMuted;

const queryClient = new QueryClient();

export let setIslandButtonDimmed: (dimmed: boolean) => void = () => {};

const App = () => {
  const { authState, setAuthStatus } = useAuthStatus();
  const { authStatus } = authState;
  const [isMuted, setIsMuted] = useState(globalIsMuted);
  const [isIslandButtonDim, setIsIslandButtonDim] = useState(() => {
    const routeState = getCurrentRouteState();
    return routeState.mode !== "home" && routeState.mode !== "event";
  });
  const [shouldLoadIslandButton, setShouldLoadIslandButton] =
    useState(isMainGameLoaded());
  const [isLogoutUiLockedState, setIsLogoutUiLockedState] = useState(() =>
    isLogoutUiLocked(),
  );
  const ethereumAuthAdapter = useMemo(
    () => createEthereumAuthAdapter(setAuthStatus),
    [setAuthStatus],
  );
  const rainbowKitTheme = useMemo(
    () => ({
      lightMode: lightTheme(),
      darkMode: darkTheme(),
    }),
    [],
  );
  const shouldHideAuthControls =
    authStatus === "loading" || isLogoutUiLockedState;
  const isAuthenticated = authStatus === "authenticated";

  setIslandButtonDimmed = (dimmed: boolean) => {
    setIsIslandButtonDim(dimmed);
  };

  useEffect(() => {
    try {
      storage.setIsMuted(isMuted);
    } catch {}
    globalIsMuted = isMuted;
    soundPlayer.setMuted(isMuted);
  }, [isMuted]);

  useEffect(() => {
    if (shouldLoadIslandButton) {
      return;
    }
    const unsubscribe = onMainGameLoaded(() => {
      setShouldLoadIslandButton(true);
      preloadSounds([Sound.IslandShowUp]).catch(() => {});
    });
    return unsubscribe;
  }, [shouldLoadIslandButton]);

  useEffect(() => {
    return subscribeToLogoutUiLock((isLocked) => {
      setIsLogoutUiLockedState(isLocked);
    });
  }, []);

  const handleMuteToggle = useCallback(() => {
    const nextIsMuted = !isMuted;
    globalIsMuted = nextIsMuted;
    soundPlayer.setMuted(nextIsMuted);
    setIsMuted(nextIsMuted);
    if (!nextIsMuted) {
      void soundPlayer.initializeOnUserInteraction(true);
    }
  }, [isMuted]);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitAuthenticationProvider
          adapter={ethereumAuthAdapter}
          status={authStatus}
        >
          <RainbowKitProvider
            showRecentTransactions={false}
            modalSize="compact"
            theme={rainbowKitTheme}
          >
            <div className="app-container">
              <div className="top-buttons-container">
                {!shouldHideAuthControls && shouldLoadIslandButton && (
                  <Suspense fallback={null}>
                    <LazyIslandButton dimmed={isIslandButtonDim} />
                  </Suspense>
                )}
                <TopRightControls
                  isVisible={!shouldHideAuthControls}
                  isAuthenticated={isAuthenticated}
                  isMuted={isMuted}
                  onBeforeOpen={closeAllKindsOfPopups}
                  onToggleMute={handleMuteToggle}
                  onOpenInventory={showInventory}
                  onOpenSettings={showSettings}
                  onRequestLogout={handleLogout}
                />
                {!shouldHideAuthControls && (
                  <ProfileSignIn authState={authState} />
                )}
              </div>
              <BoardComponent />
              <MainMenu />
              <BottomControls authState={authState} />
              <EventModal />
            </div>
          </RainbowKitProvider>
        </RainbowKitAuthenticationProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

let lastTouchStartTime = 0;
const MIN_TIME_BETWEEN_TOUCHSTARTS = 555; // have seen a tooltip with 500

export function preventTouchstartIfNeeded(event: TouchEvent | MouseEvent) {
  if (!isMobile) {
    return;
  }
  const target = event.target;
  if (
    target instanceof Element &&
    target.closest(
      ".small-top-control-buttons, [data-top-right-popover='true']",
    )
  ) {
    return;
  }
  const currentTime = event.timeStamp;
  const shouldPrevent =
    currentTime - lastTouchStartTime < MIN_TIME_BETWEEN_TOUCHSTARTS;
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
    { passive: false },
  );
}

document.addEventListener(
  "contextmenu",
  function (e) {
    e.preventDefault();
  },
  false,
);

connection.signIn();
installLogoutSync();
initializeAppSessionManager();

(function suppressThirdPartyErrorOverlay() {
  if (typeof window === "undefined") return;

  const isBenignLibraryError = (err: unknown) => {
    try {
      if (!err) return false;
      const message =
        typeof err === "string"
          ? err
          : ((err as { message?: string }).message ?? "");
      if (message.includes("this.provider.disconnect is not a function")) {
        return true;
      } else {
        return false;
      }
    } catch {
      return false;
    }
  };

  const stop = (evt: {
    preventDefault(): void;
    stopImmediatePropagation(): void;
  }) => {
    evt.preventDefault();
    evt.stopImmediatePropagation();
  };

  window.addEventListener(
    "unhandledrejection",
    (e) => {
      if (isBenignLibraryError(e.reason)) stop(e);
    },
    { capture: true },
  );
})();
