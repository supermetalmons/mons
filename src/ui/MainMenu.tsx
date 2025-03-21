import React, { useState, useEffect, useRef } from "react";
import { logoBase64 } from "../content/uiAssets";
import { didDismissSomethingWithOutsideTapJustNow } from "./BottomControls";
import styled from "styled-components";
import { isMobile } from "../utils/misc";
import { Leaderboard } from "./Leaderboard";
import { toggleExperimentalMode } from "../game/board";
import { closeProfilePopupIfAny } from "./ProfileSignIn";
import { getCurrentGameFen } from "../game/gameController";

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

  width: ${(props) => (props.showLeaderboard ? "min(300px, 83dvw)" : "230px")};
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
  font-size: 1rem;
  font-weight: 888;
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

const IconLinkButton = styled.a`
  display: flex;
  align-items: center;
  font-size: 0.75rem;
  font-weight: 777;
  justify-content: center;
  height: 30px;
  padding: 0 7px;
  border-radius: 6px;
  background-color: #f9f9f9;
  color: #767787c9;
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
      background-color: #f5f5f5;
      color: #767787ef;
    }
  }

  @media (prefers-color-scheme: dark) {
    background-color: #252525;
    color: #767787a9;

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: #272727;
        color: #767787f0;
      }
    }
  }

  svg {
    width: 0.77rem;
    height: 0.77rem;
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

  &::-webkit-scrollbar {
    display: none;
  }
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

const AcademyButton = styled.a`
  display: block;
  margin-top: 20px;
  padding: 10px 15px;
  text-align: center;
  font-size: 0.85rem;
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

const CopyBoardButton = styled.button`
  background: none;
  border: none;
  color: #888888;
  cursor: pointer;
  font-size: 13px;
  text-decoration-line: underline;
  text-decoration-style: dashed;
  padding: 5px;

  @media (prefers-color-scheme: dark) {
    color: #999999;
  }
`;

let getIsMenuOpen: () => boolean;
export let toggleInfoVisibility: () => void;
export let closeMenuAndInfoIfAny: () => void;

export function hasMainMenuPopupsVisible(): boolean {
  return getIsMenuOpen();
}

const MainMenu: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [showExperimental, setShowExperimental] = useState(false);
  const [copyButtonText, setCopyButtonText] = useState("copy board snapshot");
  const lastClickTime = useRef(0);
  const [cracks, setCracks] = useState<Array<{ angle: number; color: string }>>([]);
  const animationFrameRef = useRef<number>();
  const activeIndicesRef = useRef<number[]>([]);

  useEffect(() => {
    const timeoutRefs: NodeJS.Timeout[] = [];

    if (isMenuOpen) {
      const colors = ["#FFD93D"];
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

  const menuRef = useRef<HTMLDivElement>(null);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
    if (!isMenuOpen) {
      setShowExperimental(false);
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

  toggleInfoVisibility = () => {
    if (!isInfoOpen) {
      closeProfilePopupIfAny();
    }
    setIsInfoOpen(!isInfoOpen);
  };

  closeMenuAndInfoIfAny = () => {
    setIsInfoOpen(false);
    setIsMenuOpen(false);
  };

  useEffect(() => {
    const handleTapOutside = (event: any) => {
      if (isMenuOpen && menuRef.current && !menuRef.current.contains(event.target as Node)) {
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
              setShowExperimental(false);
            }
          }}>
          <RockMenu isOpen={isMenuOpen} showLeaderboard={true}>
            <MenuTitle onClick={!isMobile ? handleTitleClick : undefined} onTouchStart={isMobile ? handleTitleClick : undefined}>
              <MenuTitleText>MONS.LINK</MenuTitleText>
              {false && (
                <EasLink href="https://base.easscan.org/schema/view/0x5c6e798cbb817442fa075e01b65d5d65d3ac35c2b05c1306e8771a1c8a3adb32" target="_blank" rel="noopener noreferrer">
                  ✓ EAS
                </EasLink>
              )}
            </MenuTitle>
            <ButtonRow>
              <IconLinkButton href="https://www.supermetalmons.com/collections/all" target="_blank" rel="noopener noreferrer">
                Shop
              </IconLinkButton>
              <IconLinkButton href="https://ultrametal.neocities.org/academy" target="_blank" rel="noopener noreferrer">
                Academy
              </IconLinkButton>
              <IconLinkButton href="https://x.com/supermetalx" target="_blank" rel="noopener noreferrer">
                <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" stroke="currentColor" stroke-width="0.2" />
                </svg>
              </IconLinkButton>
              <IconLinkButton href="https://t.me/supermetalmons" target="_blank" rel="noopener noreferrer">
                <svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M1.946 9.315c-.522-.174-.527-.455.01-.634l19.087-6.362c.529-.176.832.12.684.638l-5.454 19.086c-.15.529-.455.547-.679.045L12 14l6-8-8 6-8.054-2.685z" />
                </svg>
              </IconLinkButton>
              <IconLinkButton href="https://warpcast.com/~/channel/mons" target="_blank" rel="noopener noreferrer">
                <svg width="1.2em" height="1.2em" viewBox="0 0 777 777" xmlns="http://www.w3.org/2000/svg" version="1.1" fill="currentColor">
                  <path id="path" d="M145.778 44.556 L630.222 44.556 630.222 733.445 559.111 733.445 559.111 417.889 558.414 417.889 C550.554 330.677 477.258 262.333 388 262.333 298.742 262.333 225.446 330.677 217.586 417.889 L216.889 417.889 216.889 733.445 145.778 733.445 145.778 44.556 Z" />
                  <path id="path-1" d="M16.889 142.333 L45.778 240.111 70.222 240.111 70.222 635.667 C57.949 635.667 48 645.616 48 657.889 L48 684.556 43.556 684.556 C31.283 684.556 21.333 694.505 21.333 706.778 L21.333 733.445 270.222 733.445 270.222 706.778 C270.222 694.505 260.273 684.556 248 684.556 L243.556 684.556 243.556 657.889 C243.556 645.616 233.606 635.667 221.333 635.667 L194.667 635.667 194.667 142.333 16.889 142.333 Z" />
                  <path id="path-2" d="M563.556 635.667 C551.283 635.667 541.333 645.616 541.333 657.889 L541.333 684.556 536.889 684.556 C524.616 684.556 514.667 694.505 514.667 706.778 L514.667 733.445 763.556 733.445 763.556 706.778 C763.556 694.505 753.606 684.556 741.333 684.556 L736.889 684.556 736.889 657.889 C736.889 645.616 726.94 635.667 714.667 635.667 L714.667 240.111 739.111 240.111 768 142.333 590.222 142.333 590.222 635.667 563.556 635.667 Z" />
                </svg>
              </IconLinkButton>
              <IconLinkButton href="https://github.com/supermetalmons" target="_blank" rel="noopener noreferrer">
                <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </IconLinkButton>
              <IconLinkButton href="https://opensea.io/collection/supermetalmons" target="_blank" rel="noopener noreferrer">
                Gen 1
              </IconLinkButton>
              <IconLinkButton href="https://opensea.io/collection/super-metal-mons-gen-2" target="_blank" rel="noopener noreferrer">
                Gen 2
              </IconLinkButton>
              <IconLinkButton href="https://opensea.io/collection/theemojipack" target="_blank" rel="noopener noreferrer">
                EMOJIPACK
              </IconLinkButton>
            </ButtonRow>
            <CloseButton
              onClick={() => {
                setIsMenuOpen(false);
                setShowExperimental(false);
              }}>
              ×
            </CloseButton>
            {showExperimental && <MenuOverlay />}
            <Leaderboard show={true} />
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
                <CopyBoardButton onClick={copyBoardState}>{copyButtonText}</CopyBoardButton>
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
                  if (!isMenuOpen) {
                    closeProfilePopupIfAny();
                  }
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
                onMouseEnter: () => {
                  if (!isMenuOpen) {
                    closeProfilePopupIfAny();
                  }
                  setIsMenuOpen(true);
                },
              })}>
          <img src={logoBase64} alt="Rock" />
        </RockButton>
      </RockButtonContainer>

      <InfoPopover isOpen={isInfoOpen}>
        <CloseButton onClick={() => setIsInfoOpen(false)} style={{ display: "flex", fontWeight: 699, fontSize: "1rem" }}>
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
        <AcademyButton href="https://ultrametal.neocities.org/academy" target="_blank" rel="noopener noreferrer">
          Learn more in Mons Academy
        </AcademyButton>
      </InfoPopover>
    </>
  );
};

export default MainMenu;
