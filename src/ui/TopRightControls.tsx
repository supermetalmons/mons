import React, { useEffect, useSyncExternalStore } from "react";
import styled from "styled-components";
import {
  FaPlay,
  FaStop,
  FaBackward,
  FaForward,
  FaCog,
  FaPowerOff,
  FaVolumeMute,
  FaVolumeUp,
  FaMusic,
  FaInfoCircle,
  FaRegGem,
  FaEllipsisH,
} from "react-icons/fa";
import type { AuthState } from "../connection/authModels";
import {
  startPlayingMusic,
  stopPlayingMusic,
  playNextTrack,
  playPreviousTrack,
  setMusicMuted,
  getIsMusicPlaying,
  subscribeToMusicPlayback,
} from "../content/music";
import {
  HowToPlayContent,
  HowToPlayPopoverSurface,
  HowToPlaySeparator,
  howToPlayContentStyles,
  InfoPopover,
} from "./InfoPopover";
import { InventoryModal } from "./InventoryModal";
import { TopRightPopoverBase } from "./TopRightPopoverBase";
import { didDismissSomethingWithOutsideTapJustNow } from "./controls/outsideTapState";
import { registerTopRightControlsApi } from "./controls/topRightControlsPort";
import { useTopRightPopover } from "./controls/useTopRightPopover";

const TOP_RIGHT_CONTROL_IDS = {
  info: "top-right-info-button",
  more: "top-right-more-button",
  music: "top-right-music-button",
  gem: "top-right-gem-button",
} as const;

const TOP_RIGHT_POPOVER_IDS = {
  info: "top-right-info-popover",
  more: "top-right-more-popover",
  music: "top-right-music-popover",
  inventory: "top-right-inventory-popover",
} as const;

const TopRightPopover = styled(TopRightPopoverBase)`
  box-sizing: border-box;
`;

const MorePopover = styled(HowToPlayPopoverSurface)``;

const MoreHelpContent = styled.div`
  ${howToPlayContentStyles}
`;

const MoreActions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  width: min(22em, 100%);
  padding-top: 2px;
  margin-bottom: 6px;
`;

const MoreActionButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
  min-height: 34px;
  padding: 0 10px;
  border: none;
  border-radius: 999px;
  background: rgba(118, 119, 135, 0.08);
  color: var(--iconLinkButtonTextHover);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 140ms ease,
    color 140ms ease,
    transform 140ms ease;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background: rgba(118, 119, 135, 0.13);
      color: var(--navigationTextMuted);
    }
  }

  &:active {
    background: rgba(118, 119, 135, 0.16);
    transform: scale(0.98);
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(118, 119, 135, 0.18);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }

  @media (prefers-color-scheme: dark) {
    background: rgba(255, 255, 255, 0.06);
    color: var(--iconLinkButtonTextHoverDark);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background: rgba(255, 255, 255, 0.1);
        color: var(--secondaryTextColorDark);
      }
    }

    &:active {
      background: rgba(255, 255, 255, 0.13);
    }

    &:focus-visible {
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.14);
    }
  }

  svg {
    width: 12px;
    height: 12px;
    flex: 0 0 auto;
  }

  @media (pointer: coarse) {
    min-height: 44px;
  }
`;

const MusicPopover = styled(TopRightPopover)`
  width: min(220px, 70dvw);
  padding: 10px;
  text-align: center;
  transform: none;
  transition: none;
`;

const MusicControlsContainer = styled.div`
  display: grid;
  grid-template-columns:
    repeat(3, minmax(0, 1fr)) 1px
    minmax(0, 1fr);
  gap: 4px;
  align-items: center;
`;

const MusicControlsSeparator = styled.span`
  width: 1px;
  height: 20px;
  background: rgba(118, 119, 135, 0.17);

  @media (prefers-color-scheme: dark) {
    background: rgba(153, 153, 168, 0.16);
  }
`;

const MusicControlButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-width: 0;
  min-height: 42px;
  padding: 10px 6px;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--color-blue-0066cc);
  cursor: pointer;
  font-size: 18px;
  outline: none;
  -webkit-touch-callout: none;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;

  @media (prefers-color-scheme: dark) {
    color: var(--color-blue-66b3ff);
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

interface TopRightControlsProps {
  authState: AuthState;
  isMuted: boolean;
  isVisible: boolean;
  onBeforeOpen: () => void;
  onToggleMute: () => void;
  onOpenSettings: (returnFocusId?: string) => void;
  onRequestLogout: (returnFocusId?: string) => void;
}

export const TopRightControls: React.FC<TopRightControlsProps> = ({
  authState,
  isMuted,
  isVisible,
  onBeforeOpen,
  onToggleMute,
  onOpenSettings,
  onRequestLogout,
}) => {
  const isAuthenticated = authState.authStatus === "authenticated";
  const isMusicPlaying = useSyncExternalStore(
    subscribeToMusicPlayback,
    getIsMusicPlaying,
  );
  const {
    visiblePopover: visibleTopRightPopover,
    primaryButtonRef,
    musicButtonRef,
    gemButtonRef,
    infoRef,
    moreRef,
    musicRef,
    inventoryRef,
    musicFirstControlRef,
    togglePopover,
    closePopover,
    dismissInventory: handleDismissInventory,
    hasVisiblePopover,
  } = useTopRightPopover({ isAuthenticated, isVisible, onBeforeOpen });
  const isInfoOpen = visibleTopRightPopover === "info";
  const isMoreOpen = visibleTopRightPopover === "more";
  const isMusicOpen = visibleTopRightPopover === "music";
  const isInventoryOpen = visibleTopRightPopover === "inventory";
  const inventoryIdentityKey = JSON.stringify([
    isAuthenticated,
    authState.profileId,
    authState.solAddress,
    authState.ethAddress,
  ]);

  useEffect(() => {
    return registerTopRightControlsApi({
      close: closePopover,
      hasVisiblePopover,
    });
  }, [closePopover, hasVisiblePopover]);

  useEffect(() => {
    setMusicMuted(isMuted);
  }, [isMuted]);

  const handleMusicPlaybackToggle = () => {
    if (isMusicPlaying) {
      stopPlayingMusic();
    } else {
      startPlayingMusic();
    }
  };

  const handleOpenSettingsFromMore = () => {
    closePopover();
    onOpenSettings(TOP_RIGHT_CONTROL_IDS.more);
  };

  const handleLogoutFromMore = () => {
    closePopover();
    onRequestLogout(TOP_RIGHT_CONTROL_IDS.more);
  };

  const primaryTopRightPopover = isAuthenticated ? "more" : "info";

  return (
    <>
      {isVisible && (
        <div className="small-top-control-buttons">
          <button
            ref={primaryButtonRef}
            id={TOP_RIGHT_CONTROL_IDS[primaryTopRightPopover]}
            type="button"
            className={isAuthenticated ? "more-button" : "info-button"}
            onClick={(event) => togglePopover(primaryTopRightPopover, event)}
            aria-label={isAuthenticated ? "More" : "Info"}
            aria-haspopup="dialog"
            aria-controls={TOP_RIGHT_POPOVER_IDS[primaryTopRightPopover]}
            aria-expanded={visibleTopRightPopover === primaryTopRightPopover}
          >
            {isAuthenticated ? <FaEllipsisH /> : <FaInfoCircle />}
          </button>
          <button
            ref={musicButtonRef}
            id={TOP_RIGHT_CONTROL_IDS.music}
            type="button"
            className="music-button"
            onClick={(event) => togglePopover("music", event)}
            aria-label="Music"
            aria-haspopup="dialog"
            aria-controls={TOP_RIGHT_POPOVER_IDS.music}
            aria-expanded={isMusicOpen}
          >
            <FaMusic />
          </button>
          <button
            ref={gemButtonRef}
            id={TOP_RIGHT_CONTROL_IDS.gem}
            type="button"
            className="gem-button"
            onClick={(event) => togglePopover("inventory", event)}
            aria-label="Collectibles"
            aria-haspopup="dialog"
            aria-controls={TOP_RIGHT_POPOVER_IDS.inventory}
            aria-expanded={isInventoryOpen}
          >
            <FaRegGem />
          </button>
        </div>
      )}

      {!isAuthenticated && (
        <InfoPopover
          ref={infoRef}
          id={TOP_RIGHT_POPOVER_IDS.info}
          isOpen={isInfoOpen}
        />
      )}

      {isAuthenticated && (
        <MorePopover
          ref={moreRef}
          id={TOP_RIGHT_POPOVER_IDS.more}
          $isOpen={isMoreOpen}
          role="dialog"
          aria-label="More"
          aria-hidden={!isMoreOpen}
          tabIndex={-1}
        >
          <MoreHelpContent>
            <HowToPlayContent />
            <br />
            <HowToPlaySeparator ariaHidden />
          </MoreHelpContent>
          <MoreActions>
            <MoreActionButton
              type="button"
              onClick={handleOpenSettingsFromMore}
            >
              <FaCog />
              <span>Settings</span>
            </MoreActionButton>
            <MoreActionButton type="button" onClick={handleLogoutFromMore}>
              <FaPowerOff />
              <span>Log Out</span>
            </MoreActionButton>
          </MoreActions>
        </MorePopover>
      )}

      <MusicPopover
        ref={musicRef}
        id={TOP_RIGHT_POPOVER_IDS.music}
        $isOpen={isMusicOpen}
        role="dialog"
        aria-label="Music"
        aria-hidden={!isMusicOpen}
        tabIndex={-1}
      >
        <MusicControlsContainer>
          <MusicControlButton
            ref={musicFirstControlRef}
            type="button"
            onClick={() => playPreviousTrack()}
            aria-label="Previous track"
          >
            <FaBackward />
          </MusicControlButton>
          <MusicControlButton
            type="button"
            onClick={handleMusicPlaybackToggle}
            aria-label={isMusicPlaying ? "Stop music" : "Play music"}
          >
            {isMusicPlaying ? <FaStop /> : <FaPlay />}
          </MusicControlButton>
          <MusicControlButton
            type="button"
            onClick={() => playNextTrack()}
            aria-label="Next track"
          >
            <FaForward />
          </MusicControlButton>
          <MusicControlsSeparator aria-hidden="true" />
          <MusicControlButton
            type="button"
            onClick={onToggleMute}
            aria-label={isMuted ? "Unmute all audio" : "Mute all audio"}
            aria-pressed={isMuted}
          >
            {isMuted ? <FaVolumeMute /> : <FaVolumeUp />}
          </MusicControlButton>
        </MusicControlsContainer>
      </MusicPopover>

      {isInventoryOpen && (
        <InventoryModal
          key={inventoryIdentityKey}
          ref={inventoryRef}
          id={TOP_RIGHT_POPOVER_IDS.inventory}
          authState={authState}
          onDismiss={handleDismissInventory}
          onPreviewOutsideDismiss={didDismissSomethingWithOutsideTapJustNow}
        />
      )}
    </>
  );
};
