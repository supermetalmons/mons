import React, { useRef, useEffect, useState } from "react";
import styled from "styled-components";
import { ModalOverlay, ModalPopup, ModalTitle, ButtonsContainer, SaveButton } from "./SharedModalComponents";
import { fetchNftsForStoredAddresses } from "../services/nftService";
import { vvvLogoBase64 } from "../content/uiAssets";
import { setOwnershipVerifiedIdCardEmoji } from "./ShinyCard";
import { AvatarImage } from "./AvatarImage";

const InventoryOverlay = styled(ModalOverlay)`
  user-select: none;
`;

const InventoryPopup = styled(ModalPopup)<{ hasNfts: boolean }>`
  padding: 24px 0;
  user-select: none;
  outline: none;
  aspect-ratio: 1 / 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
`;

const InventoryTitle = styled(ModalTitle)`
  margin: 0;
`;

const OverlayPanel = styled.div`
  position: absolute;
  left: 24px;
  right: 24px;
  background: transparent;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;

  @media (prefers-color-scheme: dark) {
    background: transparent;
  }
`;

const TopOverlay = styled(OverlayPanel)`
  top: 24px;
  left: 0;
  right: 0;
  justify-content: space-between;
  background-color: var(--color-white);
  position: absolute;
  padding: 0 24px;

  &::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: -16px;
    height: 16px;
    background: linear-gradient(to bottom, var(--color-white), transparent);
    pointer-events: none;
  }

  @media (prefers-color-scheme: dark) {
    background-color: var(--color-deep-gray);
    &::after {
      background: linear-gradient(to bottom, var(--color-deep-gray), transparent);
    }
  }
`;

const BottomOverlay = styled(OverlayPanel)`
  bottom: 24px;
  left: 0;
  right: 0;
  justify-content: flex-end;
  background-color: var(--color-white);
  position: absolute;
  padding: 0 24px;

  &::before {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: -16px;
    height: 16px;
    background: linear-gradient(to top, var(--color-white), transparent);
    pointer-events: none;
  }

  @media (prefers-color-scheme: dark) {
    background-color: var(--color-deep-gray);
    &::before {
      background: linear-gradient(to top, var(--color-deep-gray), transparent);
    }
  }
`;

const TopBar = styled.div`
  display: contents;
`;

const VvvLink = styled.a`
  display: inline-flex;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  cursor: pointer;
`;

const VvvLogo = styled.img`
  width: 100%;
  height: 100%;
  display: block;
  border-radius: 4px;
`;

const NFTSection = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

const Content = styled.div`
  color: var(--color-gray-55);
  font-size: 0.95rem;
  user-select: none;
  cursor: default;
  word-break: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  text-align: left;
  flex: 1;
  min-height: 0;

  @media (prefers-color-scheme: dark) {
    color: var(--color-gray-d0);
  }
`;

const LoadingText = styled.div`
  text-align: center;
  font-size: 0.8rem;
  color: var(--color-gray-77);
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;

  @media (prefers-color-scheme: dark) {
    color: var(--leaderboardLoadingTextColorDark);
  }
`;

const NFTGridContainer = styled.div`
  overflow-y: auto;
  overflow-x: visible;
  margin-top: 0;
  flex: 1 1 auto;
  min-height: 140px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;
  width: 100%;
  overscroll-behavior: contain;
  touch-action: pan-y;
  -ms-touch-action: pan-y;
  padding: 48px 24px 56px 24px;
  box-sizing: border-box;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const NFTGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  width: 100%;
  padding-right: 0;
  overflow: visible;
`;

const NFTNameContainer = styled.div`
  width: 100%;
  aspect-ratio: 1/1;
  border-radius: 6px;
  background: var(--color-gray-f5);
  overflow: hidden;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 2px;
  text-align: center;
  box-sizing: border-box;

  @media (prefers-color-scheme: dark) {
    background: var(--inventoryItemBackgroundDark);
  }
`;

const AvatarTile = styled(NFTNameContainer)`
  position: relative;
  padding: 0;
  overflow: visible;
  transition: transform 0.13s ease-out, box-shadow 0.13s ease-out;
  will-change: transform;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  user-select: none;
  touch-action: pan-y;
  -ms-touch-action: pan-y;

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background: var(--interactiveActiveBackgroundLight);
    border-radius: inherit;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.12s ease-out;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      transform: scale(1.023);
    }
    &:active {
      transform: scale(0.95);
    }
  }

  @media (hover: none) and (pointer: coarse) {
    &:active {
      transform: scale(0.96);
    }
    &:active::after {
      opacity: 0.12;
    }
  }
`;

const CountIndicator = styled.div<{ count: number }>`
  position: absolute;
  bottom: -4px;
  right: -4px;
  background: var(--color-gray-e0-70);
  color: var(--color-black);
  font-size: 0.63rem;
  font-weight: 500;
  padding: 2px 4px;
  border-radius: 6px;
  min-width: 12px;
  height: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  backdrop-filter: blur(2px);

  @media (prefers-color-scheme: dark) {
    background: var(--color-gray-44-70);
    color: var(--color-white);
  }
`;

interface SwagAvatarItem {
  id: number;
  count: number;
}

export interface InventoryModalProps {
  onCancel: () => void;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({ onCancel }) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const [avatars, setAvatars] = useState<SwagAvatarItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [dataOk, setDataOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (popupRef.current) {
      popupRef.current.focus();
    }

    const fetchTokens = async () => {
      setIsLoading(true);
      try {
        const data = await fetchNftsForStoredAddresses();
        const ok = data?.ok === true;
        setDataOk(ok);
        if (data?.swagpack_avatars && Array.isArray(data.swagpack_avatars) && data.swagpack_avatars.length > 0) {
          setAvatars(data.swagpack_avatars);
        } else {
          setAvatars([]);
        }
      } catch {
        setAvatars([]);
        setDataOk(false);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTokens();
  }, []);

  const cleanUpAndClose = () => {
    onCancel();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.stopPropagation();
      cleanUpAndClose();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      cleanUpAndClose();
    }
  };

  return (
    <InventoryOverlay onClick={cleanUpAndClose}>
      <InventoryPopup ref={popupRef} onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown} tabIndex={0} autoFocus hasNfts={avatars.length > 0}>
        <TopOverlay>
          <TopBar>
            <InventoryTitle>Swag Pack</InventoryTitle>
            <VvvLink href="https://vvv.so/swag-pack" target="_blank" rel="noopener noreferrer" aria-label="Open vvv.so">
              <VvvLogo src={`data:image/webp;base64,${vvvLogoBase64}`} alt="" />
            </VvvLink>
          </TopBar>
        </TopOverlay>

        <NFTSection>
          <Content>
            {isLoading ? (
              <LoadingText>LOADING...</LoadingText>
            ) : avatars.length === 0 ? (
              <LoadingText>{dataOk ? "Mint on VVV" : "Failed to load."}</LoadingText>
            ) : (
              <NFTGridContainer>
                <NFTGrid>
                  {avatars.map((item) => (
                    <AvatarTile key={item.id} onClick={() => setOwnershipVerifiedIdCardEmoji(item.id + 1000, item.count >= 3 ? "rainbow" : "")}>
                      <AvatarImage src={`https://assets.mons.link/swagpack/420/${item.id}.webp`} alt="" rainbowAura={item.count >= 3} loading="lazy" />
                      {item.count > 1 && <CountIndicator count={item.count}>{item.count}</CountIndicator>}
                    </AvatarTile>
                  ))}
                </NFTGrid>
              </NFTGridContainer>
            )}
          </Content>
        </NFTSection>

        <BottomOverlay>
          <ButtonsContainer style={{ margin: 0 }}>
            <SaveButton onClick={cleanUpAndClose} disabled={false}>
              OK
            </SaveButton>
          </ButtonsContainer>
        </BottomOverlay>
      </InventoryPopup>
    </InventoryOverlay>
  );
};

export default InventoryModal;
