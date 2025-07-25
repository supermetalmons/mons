import React, { useState, useEffect, useRef } from "react";
import { logoBase64 } from "../content/uiAssets";
import { didDismissSomethingWithOutsideTapJustNow, didNotDismissAnythingWithOutsideTapJustNow, closeNavigationAndAppearancePopupIfAny } from "./BottomControls";
import styled from "styled-components";
import { defaultEarlyInputEventName, isMobile, getBuildInfo } from "../utils/misc";
import { Leaderboard } from "./Leaderboard";
import { toggleExperimentalMode } from "../game/board";
import { closeProfilePopupIfAny } from "./ProfileSignIn";
import { getCurrentGameFen } from "../game/gameController";
import { FaTelegramPlane, FaUniversity, FaPlay, FaStop, FaBackward, FaForward } from "react-icons/fa";
import { showsShinyCardSomewhere } from "./ShinyCard";
import { startPlayingMusic, stopPlayingMusic, playNextTrack } from "../content/music";
import { InfoPopover } from "./InfoPopover";

const RockButtonContainer = styled.div`
  position: absolute;
  top: 9pt;
  left: 9pt;
  z-index: 10;

  @media screen and (max-height: 500px) {
    top: 7pt;
  }

  @media screen and (max-height: 453px) {
    top: 5pt;
  }

  @media screen and (max-width: 420px) {
    left: 8px;
  }

  @media screen and (max-width: 387px) {
    left: 6px;
  }
`;

const Crack = styled.div`
  position: absolute;
  height: 2px;
  transform-origin: left center;
  animation: grow 0.1s ease-out forwards;
  z-index: 9999;
  transition: transform 5s linear;

  @keyframes grow {
    from {
      width: 0;
    }
    to {
      width: 23%;
    }
  }
`;

const CrackContainer = styled.div`
  position: absolute;
  width: 100px;
  height: 100px;
  top: -30px;
  left: -30px;
  pointer-events: none;
  z-index: 9999;
  overflow: hidden;
`;

const RockButton = styled.button`
  display: block;
  background-color: var(--color-gray-f9);
  border: none;
  border-radius: 20px;
  padding: 3px 6px;
  cursor: pointer;
  position: relative;
  z-index: 2;
  -webkit-touch-callout: none;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-callout: none;
  -webkit-highlight: none;
  -webkit-tap-highlight-color: transparent;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: var(--panelBackground);
    }
  }

  @media (prefers-color-scheme: dark) {
    background-color: var(--color-gray-25);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: var(--panelBackgroundDark);
      }
    }
  }

  img {
    width: 34px;
    height: 34px;
    opacity: 1;
    display: block;
    -webkit-touch-callout: none;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-user-drag: none;
    -webkit-tap-highlight-color: transparent;
  }
`;

const RockMenuWrapper = styled.div<{ isOpen: boolean }>`
  position: absolute;
  top: -25px;
  left: -26px;
  padding: 20px;
  pointer-events: ${(props) => (props.isOpen ? "auto" : "none")};

  @media screen and (max-width: 420px) {
    left: -23px;
  }
`;

const RockMenu = styled.div<{ isOpen: boolean; showLeaderboard: boolean }>`
  position: relative;
  background-color: var(--color-white);
  border-radius: 10px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: ${(props) => (props.isOpen ? "0 6px 20px var(--notificationBannerShadow)" : "none")};
  width: ${(props) => (props.showLeaderboard ? "min(300px, 83dvw)" : "230px")};

  transform-origin: top left;
  opacity: ${(props) => (props.isOpen ? 1 : 0)};
  pointer-events: ${(props) => (props.isOpen ? "auto" : "none")};
  z-index: 1;

  @media (prefers-color-scheme: dark) {
    background-color: var(--color-deep-gray);
  }
`;

const MenuTitleText = styled.i`
  margin-top: -2px;
  margin-left: -1px;
  font-weight: 995;
  font-size: 25px;
  color: var(--color-gray-33);
  cursor: default;

  @media (prefers-color-scheme: dark) {
    color: var(--color-gray-f5);
  }
`;

const MenuTitle = styled.div`
  margin: 6px 16px 0 53px;
  text-align: left;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-height: 20px;
`;

const IconLinkButton = styled.a`
  display: flex;
  align-items: center;
  font-size: 0.75rem;
  font-weight: 777;
  justify-content: center;
  height: 32px;
  padding: 0 9px;
  border-radius: 6px;
  background-color: var(--color-gray-f9);
  color: var(--iconLinkButtonText);
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  -webkit-touch-callout: none;
  touch-action: pan-x;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
  -webkit-tap-highlight-color: transparent;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: var(--color-gray-f5);
      color: var(--iconLinkButtonTextHover);
    }
  }

  @media (prefers-color-scheme: dark) {
    background-color: var(--color-gray-25);
    color: var(--iconLinkButtonTextDark);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: var(--color-gray-27);
        color: var(--iconLinkButtonTextHoverDark);
      }
    }
  }

  svg {
    width: 0.77rem;
    height: 0.77rem;
  }

  @media screen and (max-width: 360px) {
    padding: 0 8px;
  }

  @media screen and (max-width: 342px) {
    padding: 0 7px;
  }

  @media screen and (max-width: 330px) {
    padding: 0 6px;
  }
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 8px;
  margin-right: 0px;
  margin-left: 0px;
  margin-bottom: 0px;
  align-items: center;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  white-space: nowrap;
  padding-bottom: 0px;
  width: 100%;
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;

  &::-webkit-scrollbar {
    display: none;
  }

  @media screen and (max-width: 320px) {
    gap: 6px;
  }
`;

const CollectionButton = styled(IconLinkButton)`
  transition: opacity 0.2s ease-out;
  opacity: 0;
  animation: fadeIn 0.2s ease-out forwards;

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

const CloseButton = styled.button`
  display: none;
  align-items: center;
  justify-content: center;
  background: var(--color-gray-fb);
  border: none;
  color: var(--lightDisabledTextColor);
  cursor: pointer;
  font-size: 18px;
  font-weight: 230;
  line-height: 18px;
  position: absolute;
  border-radius: 50%;
  height: 26px;
  width: 26px;
  right: 6px;
  top: 11px;
  padding: 0;
  -webkit-touch-callout: none;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
  -webkit-tap-highlight-color: transparent;

  @media (hover: none) {
    display: flex;
  }

  @media (prefers-color-scheme: dark) {
    color: var(--color-gray-42);
    background: var(--color-gray-23);
  }
`;

const MenuOverlay = styled.div`
  position: absolute;
  top: 45px;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--menuOverlayBackground);
  backdrop-filter: blur(3px);
  border-radius: 0 0 10px 10px;
  z-index: 2;

  @media (prefers-color-scheme: dark) {
    background: var(--color-deep-gray);
  }

  @media screen and (max-height: 453px) {
    top: 42px;
  }
`;

const ExperimentalMenu = styled.div`
  position: absolute;
  top: 45px;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  z-index: 3;
`;

const BuildInfo = styled.div`
  font-size: 13px;
  color: var(--buildInfoTextColor);
  text-align: center;
  margin-top: auto;
  padding-bottom: 12px;
  user-select: none;
  cursor: default;

  @media (prefers-color-scheme: dark) {
    color: var(--buildInfoTextColorDark);
  }
`;

const ExperimentButton = styled.button`
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  background: var(--color-gray-f9);
  color: var(--color-gray-33);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background: var(--color-gray-f5);
    }
  }

  @media (prefers-color-scheme: dark) {
    background: var(--color-gray-25);
    color: var(--color-gray-f5);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background: var(--color-gray-27);
      }
    }
  }
`;

const CopyBoardButton = styled.button`
  background: none;
  border: none;
  color: var(--copyBoardButtonColor);
  cursor: pointer;
  font-size: 13px;
  text-decoration-line: underline;
  text-decoration-style: dashed;
  padding: 5px;

  @media (prefers-color-scheme: dark) {
    color: var(--color-gray-99);
  }
`;

const MusicPopover = styled.div<{ isOpen: boolean }>`
  position: fixed;
  top: 56px;
  right: 9pt;
  font-size: 12px;
  background-color: var(--overlay-light-95);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  border-radius: 7pt;
  padding: 12px;
  width: min(200px, 60dvw);
  box-shadow: none;
  z-index: 8;
  opacity: ${(props) => (props.isOpen ? 1 : 0)};
  pointer-events: ${(props) => (props.isOpen ? "auto" : "none")};
  text-align: center;
  cursor: default;

  @media (prefers-color-scheme: dark) {
    background-color: var(--overlay-dark-95);
    color: var(--color-gray-f5);
  }

  @media screen and (max-height: 500px) {
    top: 53px;
  }

  @media screen and (max-height: 453px) {
    top: 50px;
  }

  @media screen and (max-width: 420px) {
    right: 8px;
  }

  @media screen and (max-width: 387px) {
    right: 6px;
  }
`;

const MusicControlsContainer = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
`;

const MusicControlButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--color-blue-0066cc);
  cursor: pointer;
  font-size: 18px;
  flex: 1;
  -webkit-touch-callout: none;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      color: var(--musicControlButtonColorHover);
    }
  }

  @media (prefers-color-scheme: dark) {
    color: var(--color-blue-66b3ff);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        color: var(--musicControlButtonColorHoverDark);
      }
    }
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

let getIsMenuOpen: () => boolean;
let getIsInfoOpen: () => boolean;
let getIsMusicOpen: () => boolean;
export let toggleInfoVisibility: () => void;
export let toggleMusicVisibility: () => void;
export let closeMenuAndInfoIfAny: () => void;
export let closeMenuAndInfoIfAllowedForEvent: (event: TouchEvent | MouseEvent) => void;
export let setIsMusicPlayingGlobal: (playing: boolean) => void;

export function hasMainMenuPopupsVisible(): boolean {
  return getIsMenuOpen() || getIsInfoOpen() || getIsMusicOpen();
}

const MainMenu: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isMusicOpen, setIsMusicOpen] = useState(false);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [showExperimental, setShowExperimental] = useState(false);
  const [copyButtonText, setCopyButtonText] = useState("copy board snapshot");
  const [isNftSubmenuExpanded, setIsNftSubmenuExpanded] = useState(false);
  const buttonRowRef = useRef<HTMLDivElement>(null);
  const lastClickTime = useRef(0);
  const [cracks, setCracks] = useState<Array<{ angle: number; color: string }>>([]);
  const animationFrameRef = useRef<number | null>(null);
  const activeIndicesRef = useRef<number[]>([]);

  setIsMusicPlayingGlobal = setIsMusicPlaying;

  useEffect(() => {
    const timeoutRefs: NodeJS.Timeout[] = [];

    if (isMenuOpen) {
      const colors = ["var(--crackAnimationColor)"];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      const newCracks = Array.from({ length: 6 }, () => ({
        angle: Math.random() * 140 + 180,
        color: randomColor,
      }));
      setCracks(newCracks);

      const animateCracks = () => {
        let indices: number[] = [];
        while (indices.length < 3) {
          const randomIndex = Math.floor(Math.random() * 6);
          if (!indices.includes(randomIndex)) {
            indices.push(randomIndex);
          }
        }
        activeIndicesRef.current = indices;

        setCracks((prevCracks) => {
          const newCracks = [...prevCracks];
          indices.forEach((index) => {
            newCracks[index] = {
              ...newCracks[index],
              angle: Math.random() * 140 + 180,
            };
          });
          return newCracks;
        });

        animationFrameRef.current = requestAnimationFrame(() => {
          timeoutRefs.push(setTimeout(animateCracks, 5000));
        });
      };

      timeoutRefs.push(setTimeout(animateCracks, 100));
    } else {
      setCracks([]);
      activeIndicesRef.current = [];
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      timeoutRefs.forEach(clearTimeout);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      timeoutRefs.forEach(clearTimeout);
    };
  }, [isMenuOpen]);

  getIsMenuOpen = () => isMenuOpen;
  getIsInfoOpen = () => isInfoOpen;
  getIsMusicOpen = () => isMusicOpen;

  const menuRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);
  const musicRef = useRef<HTMLDivElement>(null);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
    if (!isMenuOpen) {
      if (buttonRowRef.current) {
        buttonRowRef.current.scrollLeft = 0;
      }
      setIsNftSubmenuExpanded(false);
      setShowExperimental(false);
      setIsMusicOpen(false);
    }
  };

  const handleTitleClick = () => {
    const now = Date.now();
    if (now - lastClickTime.current < 500) {
      if (clickCount === 1) {
        showExperimentalFeaturesSelection();
        setClickCount(0);
      } else {
        setClickCount(clickCount + 1);
      }
    } else {
      setClickCount(0);
    }
    lastClickTime.current = now;
  };

  const showExperimentalFeaturesSelection = () => {
    setShowExperimental(true);
  };

  const copyBoardState = () => {
    const currentFen = getCurrentGameFen();
    console.log(currentFen);
    const link = window.location.origin + "/snapshot/" + encodeURIComponent(currentFen);
    navigator.clipboard.writeText(link);
    setCopyButtonText("copied");
    setTimeout(() => {
      setCopyButtonText("copy board snapshot");
    }, 333);
  };

  const handleNftButtonClick = () => {
    setIsNftSubmenuExpanded(true);
    requestAnimationFrame(() => {
      if (buttonRowRef.current) {
        const scrollAmount = buttonRowRef.current.scrollWidth - buttonRowRef.current.clientWidth;
        buttonRowRef.current.scrollTo({
          left: scrollAmount,
          behavior: "smooth",
        });
      }
    });
  };

  const handleMusicPlaybackToggle = () => {
    if (isMusicPlaying) {
      stopPlayingMusic();
      setIsMusicPlaying(false);
    } else {
      startPlayingMusic();
      setIsMusicPlaying(true);
    }
  };

  toggleInfoVisibility = () => {
    if (!isInfoOpen) {
      closeProfilePopupIfAny();
      closeNavigationAndAppearancePopupIfAny();
      setIsMenuOpen(false);
      setIsMusicOpen(false);
    }
    setIsInfoOpen(!isInfoOpen);
  };

  toggleMusicVisibility = () => {
    if (!isMusicOpen) {
      closeProfilePopupIfAny();
      closeNavigationAndAppearancePopupIfAny();
      setIsMenuOpen(false);
      setIsInfoOpen(false);
    }
    setIsMusicOpen(!isMusicOpen);
  };

  closeMenuAndInfoIfAny = () => {
    setIsInfoOpen(false);
    setIsMenuOpen(false);
    setIsMusicOpen(false);
    setIsNftSubmenuExpanded(false);
  };

  closeMenuAndInfoIfAllowedForEvent = (event: TouchEvent | MouseEvent) => {
    if (isMenuOpen && menuRef.current && !menuRef.current.contains(event.target as Node)) {
      closeMenuAndInfoIfAny();
    }
  };

  useEffect(() => {
    const handleTapOutside = (event: any) => {
      const shouldKeepVisibleWhenShinyCardIsBeingDismissed = isMobile ? showsShinyCardSomewhere || !didNotDismissAnythingWithOutsideTapJustNow() : false;
      if (!shouldKeepVisibleWhenShinyCardIsBeingDismissed && isMenuOpen && menuRef.current && !menuRef.current.contains(event.target as Node) && !event.target.closest('[data-shiny-card="true"]')) {
        didDismissSomethingWithOutsideTapJustNow();
        setIsMenuOpen(false);
        setShowExperimental(false);
      }
    };

    document.addEventListener("touchstart", handleTapOutside);
    return () => {
      document.removeEventListener("touchstart", handleTapOutside);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    const handleTapOutside = (event: any) => {
      event.stopPropagation();
      const isInfoButton = event.target.closest(".info-button");
      if (isInfoOpen && infoRef.current && !infoRef.current.contains(event.target as Node) && !isInfoButton) {
        didDismissSomethingWithOutsideTapJustNow();
        setIsInfoOpen(false);
      }
    };

    document.addEventListener(defaultEarlyInputEventName, handleTapOutside);
    return () => {
      document.removeEventListener(defaultEarlyInputEventName, handleTapOutside);
    };
  }, [isInfoOpen]);

  useEffect(() => {
    const handleTapOutside = (event: any) => {
      event.stopPropagation();
      const isMusicButton = event.target.closest(".music-button");
      if (isMusicOpen && musicRef.current && !musicRef.current.contains(event.target as Node) && !isMusicButton) {
        didDismissSomethingWithOutsideTapJustNow();
        setIsMusicOpen(false);
      }
    };

    document.addEventListener(defaultEarlyInputEventName, handleTapOutside);
    return () => {
      document.removeEventListener(defaultEarlyInputEventName, handleTapOutside);
    };
  }, [isMusicOpen]);

  return (
    <>
      <RockButtonContainer ref={menuRef}>
        {isMenuOpen && (
          <CrackContainer>
            {cracks.map((crack, i) => (
              <Crack
                key={i}
                style={{
                  transform: `rotate(${crack.angle}deg)`,
                  background: crack.color,
                  top: "50%",
                  left: "50%",
                }}
              />
            ))}
          </CrackContainer>
        )}
        <RockMenuWrapper
          isOpen={isMenuOpen}
          onMouseLeave={(e) => {
            if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
              const relatedTarget = e.relatedTarget as Element | null;
              if (relatedTarget && relatedTarget.closest && !relatedTarget.closest('[data-shiny-card="true"]')) {
                setIsMenuOpen(false);
                setShowExperimental(false);
              }
            }
          }}>
          <RockMenu isOpen={isMenuOpen} showLeaderboard={true}>
            <MenuTitle onClick={!isMobile ? handleTitleClick : undefined} onTouchStart={isMobile ? handleTitleClick : undefined}>
              <MenuTitleText>MONS.LINK</MenuTitleText>
            </MenuTitle>
            <ButtonRow ref={buttonRowRef}>
              <IconLinkButton href="https://www.supermetalmons.com/collections/all" target="_blank" rel="noopener noreferrer">
                Shop
              </IconLinkButton>
              <IconLinkButton href="https://mons.academy" target="_blank" rel="noopener noreferrer">
                <FaUniversity />
              </IconLinkButton>
              <IconLinkButton href="https://x.com/supermetalx" target="_blank" rel="noopener noreferrer">
                <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" stroke="currentColor" stroke-width="0.2" />
                </svg>
              </IconLinkButton>
              <IconLinkButton href="https://farcaster.xyz/~/channel/mons" target="_blank" rel="noopener noreferrer">
                <svg width="1.2em" height="1.2em" viewBox="0 0 777 777" xmlns="http://www.w3.org/2000/svg" version="1.1" fill="currentColor">
                  <path id="path" d="M145.778 44.556 L630.222 44.556 630.222 733.445 559.111 733.445 559.111 417.889 558.414 417.889 C550.554 330.677 477.258 262.333 388 262.333 298.742 262.333 225.446 330.677 217.586 417.889 L216.889 417.889 216.889 733.445 145.778 733.445 145.778 44.556 Z" />
                  <path id="path-1" d="M16.889 142.333 L45.778 240.111 70.222 240.111 70.222 635.667 C57.949 635.667 48 645.616 48 657.889 L48 684.556 43.556 684.556 C31.283 684.556 21.333 694.505 21.333 706.778 L21.333 733.445 270.222 733.445 270.222 706.778 C270.222 694.505 260.273 684.556 248 684.556 L243.556 684.556 243.556 657.889 C243.556 645.616 233.606 635.667 221.333 635.667 L194.667 635.667 194.667 142.333 16.889 142.333 Z" />
                  <path id="path-2" d="M563.556 635.667 C551.283 635.667 541.333 645.616 541.333 657.889 L541.333 684.556 536.889 684.556 C524.616 684.556 514.667 694.505 514.667 706.778 L514.667 733.445 763.556 733.445 763.556 706.778 C763.556 694.505 753.606 684.556 741.333 684.556 L736.889 684.556 736.889 657.889 C736.889 645.616 726.94 635.667 714.667 635.667 L714.667 240.111 739.111 240.111 768 142.333 590.222 142.333 590.222 635.667 563.556 635.667 Z" />
                </svg>
              </IconLinkButton>
              <IconLinkButton href="https://t.me/supermetalmons" target="_blank" rel="noopener noreferrer">
                <FaTelegramPlane />
              </IconLinkButton>
              <IconLinkButton href="https://github.com/supermetalmons" target="_blank" rel="noopener noreferrer">
                <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </IconLinkButton>
              {!isNftSubmenuExpanded ? (
                <IconLinkButton onClick={handleNftButtonClick}>NFTs</IconLinkButton>
              ) : (
                <>
                  <CollectionButton href="https://opensea.io/collection/theemojipack" target="_blank" rel="noopener noreferrer">
                    EMOJIPACK
                  </CollectionButton>
                  <CollectionButton href="https://opensea.io/collection/supermetalmons" target="_blank" rel="noopener noreferrer">
                    Gen 1
                  </CollectionButton>
                  <CollectionButton href="https://opensea.io/collection/super-metal-mons-gen-2" target="_blank" rel="noopener noreferrer">
                    Gen 2
                  </CollectionButton>
                </>
              )}
            </ButtonRow>
            <CloseButton
              onClick={() => {
                setIsMenuOpen(false);
                setShowExperimental(false);
              }}>
              ×
            </CloseButton>
            {showExperimental && <MenuOverlay />}
            <Leaderboard show={isMenuOpen} />
            {showExperimental && (
              <ExperimentalMenu>
                <ExperimentButton
                  onClick={() => {
                    toggleExperimentalMode(true, false, false, false);
                  }}>
                  default
                </ExperimentButton>
                <ExperimentButton
                  onClick={() => {
                    toggleExperimentalMode(false, true, false, false);
                  }}>
                  animated mons
                </ExperimentButton>
                <ExperimentButton
                  onClick={() => {
                    toggleExperimentalMode(false, false, true, false);
                  }}>
                  pangchiu
                </ExperimentButton>
                <CopyBoardButton onClick={copyBoardState}>{copyButtonText}</CopyBoardButton>
                <BuildInfo>{getBuildInfo()}</BuildInfo>
              </ExperimentalMenu>
            )}
          </RockMenu>
        </RockMenuWrapper>
        <RockButton
          {...(isMobile
            ? {
                onTouchStart: (e) => {
                  if (!isMenuOpen) {
                    closeProfilePopupIfAny();
                    closeNavigationAndAppearancePopupIfAny();
                  }
                  toggleMenu();
                  setIsInfoOpen(false);
                  setIsMusicOpen(false);
                },
              }
            : {
                onClick: (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleMenu();
                },
                onMouseEnter: () => {
                  if (!isMenuOpen) {
                    closeProfilePopupIfAny();
                    closeNavigationAndAppearancePopupIfAny();
                    setIsNftSubmenuExpanded(false);
                    if (buttonRowRef.current) {
                      buttonRowRef.current.scrollLeft = 0;
                    }
                  }
                  setIsMenuOpen(true);
                  setIsInfoOpen(false);
                  setIsMusicOpen(false);
                },
              })}>
          <img src={logoBase64} alt="Rock" />
        </RockButton>
      </RockButtonContainer>

      <InfoPopover ref={infoRef} isOpen={isInfoOpen} />

      <MusicPopover ref={musicRef} isOpen={isMusicOpen}>
        <MusicControlsContainer>
          <MusicControlButton onClick={() => playNextTrack()}>
            <FaBackward />
          </MusicControlButton>
          <MusicControlButton onClick={handleMusicPlaybackToggle}>{isMusicPlaying ? <FaStop /> : <FaPlay />}</MusicControlButton>
          <MusicControlButton onClick={() => playNextTrack()}>
            <FaForward />
          </MusicControlButton>
        </MusicControlsContainer>
      </MusicPopover>
    </>
  );
};

export default MainMenu;
