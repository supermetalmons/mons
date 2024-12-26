import React, { useState, useEffect, useRef } from "react";
import { logoBase64 } from "../content/uiAssets";
import { didDismissSomethingWithOutsideTapJustNow } from "./BottomControls";
import styled from "styled-components";
import { isMobile } from "../utils/misc";
import { Leaderboard } from "./Leaderboard";
import { toggleExperimentalMode } from "../game/board";

const RockButtonContainer = styled.div`
  position: absolute;
  top: 9pt;
  left: 9pt;
  z-index: 10;
`;

const Crack = styled.div`
  position: absolute;
  height: 2px;
  transform-origin: left center;
  animation: grow 0s ease-out forwards;
  z-index: 9999;

  @keyframes grow {
    from {
      width: 0;
    }
    to {
      width: 42%;
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
`;

const RockButton = styled.button`
  display: block;
  background-color: #f9f9f9;
  border: none;
  border-radius: 10px;
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
      background-color: #f8f8f8;
    }
  }

  @media (prefers-color-scheme: dark) {
    background-color: #252525;

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: #262626;
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
`;

const RockMenu = styled.div<{ isOpen: boolean; showLeaderboard: boolean }>`
  position: relative;
  background-color: #fff;
  border-radius: 10px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: ${(props) => (props.isOpen ? "0 6px 20px rgba(0, 0, 0, 0.12)" : "none")};

  width: ${(props) => (props.showLeaderboard ? "min(340px, 81dvw)" : "230px")};
  min-height: ${(props) => (props.showLeaderboard ? "69dvh" : "auto")};

  transform-origin: top left;
  opacity: ${(props) => (props.isOpen ? 1 : 0)};
  pointer-events: ${(props) => (props.isOpen ? "auto" : "none")};
  z-index: 1;

  @media (prefers-color-scheme: dark) {
    background-color: #131313;
  }
`;

const InfoPopover = styled.div<{ isOpen: boolean }>`
  position: fixed;
  top: 63px;
  right: min(14px, 2.3dvw);
  font-size: 12px;
  background-color: #fff;
  border-radius: 10px;
  padding: 20px;
  width: min(360px, 85dvw);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  z-index: 1000;
  opacity: ${(props) => (props.isOpen ? 1 : 0)};
  pointer-events: ${(props) => (props.isOpen ? "auto" : "none")};
  white-space: pre-wrap;
  text-align: left;
  cursor: default;

  @media (prefers-color-scheme: dark) {
    background-color: #131313;
    color: #f5f5f5;
  }
`;

const InfoTitle = styled.h2`
  font-size: 18px;
  font-weight: 700;
  margin: 0 0 15px 0;
  color: #333;
  text-align: left;

  @media (prefers-color-scheme: dark) {
    color: #f5f5f5;
  }
`;

const MenuTitleText = styled.i`
  margin-top: -2px;
  margin-left: -1px;
  font-weight: 995;
  font-size: 25px;
  color: #333;
  cursor: default;

  @media (prefers-color-scheme: dark) {
    color: #f5f5f5;
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

const EasLink = styled.a`
  font-size: 12px;
  font-weight: 700;
  background: #e6f3ff;
  color: #0066cc;
  padding: 2px 8px;
  border-radius: 12px;
  text-decoration: none;
  margin-left: 6px;
  margin-top: 3px;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background: #d9edff;
    }
  }

  @media (prefers-color-scheme: dark) {
    background: #1a3d5c;
    color: #66b3ff;

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background: #234b6e;
      }
    }
  }
`;

const CloseButton = styled.button`
  display: none;
  align-items: center;
  justify-content: center;
  background: #fbfbfb;
  border: none;
  color: #cecece;
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
    color: #424242;
    background: #232323;
  }
`;

const IconRow = styled.div<{ hide: boolean }>`
  display: flex;
  justify-content: space-between;
  gap: 6px;
  margin-top: 9px;

  opacity: ${(props) => (props.hide ? 0 : 1)};
  height: ${(props) => (props.hide ? 0 : "auto")};
  overflow: hidden;
  transition: all 0.3s ease-in-out;

  a {
    color: #000;
    text-decoration: none;
    padding: 32px 16px;
    border-radius: 8px;
    text-align: left;
    width: 75%;

    @media (prefers-color-scheme: dark) {
      color: #f5f5f5;
    }
  }
`;

const IconLink = styled.a`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background-color: #f9f9f9;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: #f5f5f5;
    }
  }

  @media (prefers-color-scheme: dark) {
    background-color: #252525;

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: #272727;
      }
    }
  }

  img {
    width: 24px;
    height: 24px;
  }
`;

const LinkRow = styled.div<{ hide: boolean }>`
  display: flex;
  justify-content: space-between;
  gap: 6px;
  align-items: center;
  opacity: ${(props) => (props.hide ? 0 : 1)};
  height: ${(props) => (props.hide ? 0 : "auto")};
  overflow: hidden;
  transition: all 0.3s ease-in-out;
`;

const LinkButton = styled.a`
  flex: 1;
  padding: 27px 0px;
  text-align: center;
  font-size: 0.81rem;
  font-weight: 600;
  border-radius: 8px;
  background-color: #f9f9f9;
  color: #333;
  text-decoration: none;
  cursor: pointer;
  -webkit-touch-callout: none;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
  -webkit-tap-highlight-color: transparent;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: #f5f5f5;
    }
  }

  @media (prefers-color-scheme: dark) {
    background-color: #252525;
    color: #f5f5f5;

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: #272727;
      }
    }
  }
`;

const MenuOverlay = styled.div`
  position: absolute;
  top: 45px;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.93);
  backdrop-filter: blur(3px);
  border-radius: 0 0 10px 10px;
  z-index: 2;

  @media (prefers-color-scheme: dark) {
    background: #131313;
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
  color: #9999a8cc;
  text-align: center;
  margin-top: auto;
  padding-bottom: 12px;
  user-select: none;
  cursor: default;

  @media (prefers-color-scheme: dark) {
    color: #9999a8af;
  }
`;

const ExperimentButton = styled.button`
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  background: #f9f9f9;
  color: #333;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background: #f5f5f5;
    }
  }

  @media (prefers-color-scheme: dark) {
    background: #252525;
    color: #f5f5f5;

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background: #272727;
      }
    }
  }
`;

let getIsMenuOpen: () => boolean;
export let toggleInfoVisibility: () => void;
const cracksEnabled = true;

export function hasMainMenuPopupsVisible(): boolean {
  return getIsMenuOpen();
}

const MainMenu: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [showExperimental, setShowExperimental] = useState(false);
  const lastClickTime = useRef(0);
  const [cracks, setCracks] = useState<Array<{ angle: number; color: string }>>([]);

  useEffect(() => {
    if (cracksEnabled && isMenuOpen) {
      const colors = ["#FF6B6B", "#FF8C42", "#E84855", "#9B4DCA", "#FFB347", "#FFD93D"];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      const newCracks = Array.from({ length: 6 }, () => ({
        angle: Math.random() * 140 + 180,
        color: randomColor,
      }));
      setCracks(newCracks);
    } else {
      setCracks([]);
    }
  }, [isMenuOpen]);

  getIsMenuOpen = () => isMenuOpen;

  const menuRef = useRef<HTMLDivElement>(null);

  const toggleMenu = () => {
    if (showLeaderboard) {
      setShowLeaderboard(false);
    } else {
      setIsMenuOpen(!isMenuOpen);
      if (!isMenuOpen) {
        setShowExperimental(false);
        setShowLeaderboard(false);
      }
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

  toggleInfoVisibility = () => {
    setIsInfoOpen(!isInfoOpen);
  };

  useEffect(() => {
    const handleTapOutside = (event: any) => {
      if (isMenuOpen && menuRef.current && !menuRef.current.contains(event.target as Node)) {
        didDismissSomethingWithOutsideTapJustNow();
        setIsMenuOpen(false);
        setShowLeaderboard(false);
        setShowExperimental(false);
      }
    };

    document.addEventListener("touchstart", handleTapOutside);
    return () => {
      document.removeEventListener("touchstart", handleTapOutside);
    };
  }, [isMenuOpen]);

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
          onMouseLeave={() => {
            if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
              setIsMenuOpen(false);
              setShowLeaderboard(false);
              setShowExperimental(false);
            }
          }}>
          <RockMenu isOpen={isMenuOpen} showLeaderboard={showLeaderboard}>
            <MenuTitle onClick={!isMobile ? handleTitleClick : undefined} onTouchStart={isMobile ? handleTitleClick : undefined}>
              <MenuTitleText>MONS.LINK</MenuTitleText>
              {showLeaderboard && (
                <EasLink href="https://base.easscan.org/schema/view/0x5c6e798cbb817442fa075e01b65d5d65d3ac35c2b05c1306e8771a1c8a3adb32" target="_blank" rel="noopener noreferrer">
                  ✓ EAS
                </EasLink>
              )}
            </MenuTitle>
            <CloseButton
              onClick={() => {
                setIsMenuOpen(false);
                setShowExperimental(false);
                setShowLeaderboard(false);
              }}>
              ×
            </CloseButton>
            {showExperimental && <MenuOverlay />}
            <IconRow hide={showLeaderboard}>
              <IconLink href="https://x.com/supermetalx" target="_blank" rel="noopener noreferrer">
                <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" stroke="currentColor" stroke-width="0.2" />
                </svg>
              </IconLink>
              <IconLink href="https://github.com/supermetalmons" target="_blank" rel="noopener noreferrer">
                <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </IconLink>
            </IconRow>
            <LinkRow hide={showLeaderboard}>
              <LinkButton href="https://opensea.io/collection/supermetalmons" target="_blank" rel="noopener noreferrer">
                Gen 1
              </LinkButton>
              <LinkButton href="https://opensea.io/collection/super-metal-mons-gen-2" target="_blank" rel="noopener noreferrer">
                Gen 2
              </LinkButton>
              <LinkButton href="https://www.supermetalmons.com/collections/all" target="_blank" rel="noopener noreferrer">
                IRL
              </LinkButton>
            </LinkRow>
            <LinkRow hide={showLeaderboard}>
              <LinkButton onClick={() => setShowLeaderboard(true)}>Onchain Ratings</LinkButton>
            </LinkRow>
            <Leaderboard show={showLeaderboard} />
            {showExperimental && (
              <ExperimentalMenu>
                <ExperimentButton
                  onClick={() => {
                    toggleExperimentalMode(true, false, false);
                  }}>
                  default
                </ExperimentButton>
                <ExperimentButton
                  onClick={() => {
                    toggleExperimentalMode(false, true, false);
                  }}>
                  animated mons
                </ExperimentButton>
                <ExperimentButton
                  onClick={() => {
                    toggleExperimentalMode(false, false, true);
                  }}>
                  pangchiu wip
                </ExperimentButton>
                <BuildInfo>
                  {process.env.REACT_APP_BUILD_DATETIME
                    ? (() => {
                        const date = new Date(Number(process.env.REACT_APP_BUILD_DATETIME) * 1000);
                        const year = date.getUTCFullYear().toString().slice(-2);
                        const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
                        const day = date.getUTCDate().toString().padStart(2, "0");
                        const hours = date.getUTCHours().toString().padStart(2, "0");
                        const minutes = date.getUTCMinutes().toString().padStart(2, "0");
                        return `build ${year}.${month}.${day} (${hours}.${minutes})`;
                      })()
                    : "local dev"}
                </BuildInfo>
              </ExperimentalMenu>
            )}
          </RockMenu>
        </RockMenuWrapper>
        <RockButton
          {...(isMobile
            ? {
                onTouchStart: (e) => {
                  toggleMenu();
                  setIsInfoOpen(false);
                },
              }
            : {
                onClick: (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleMenu();
                },
                onMouseEnter: () => setIsMenuOpen(true),
              })}>
          <img src={logoBase64} alt="Rock" />
        </RockButton>
      </RockButtonContainer>

      <InfoPopover isOpen={isInfoOpen}>
        <CloseButton onClick={() => setIsInfoOpen(false)} style={{ display: "flex" }}>
          ×
        </CloseButton>
        <InfoTitle>HOW TO PLAY MONS</InfoTitle>
        💦 Bring mana to the corners (pools).
        <br />
        🎯 Score 5 points to win.
        <br />
        <br />
        🔄 On your turn, except the first one:
        <br />
        <br />
        👟 Move your mons up to a total of 5 spaces.
        <br />
        🌟 Use one action: 😈 demon, or 👻 spirit, or 🧙‍♀️ mystic.
        <br />
        💧 Move one of your mana by 1 space to end your turn.
        <br />
        <br />
        ☝️ You can <u>carry mana with the central mon</u> (he's a drainer). You can also see an angel, a potion, a bomb, and a supermana.
      </InfoPopover>
    </>
  );
};

export default MainMenu;
