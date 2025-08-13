import React, { useRef, useEffect, useState } from "react";
import styled from "styled-components";
import { ModalOverlay, ModalPopup, ModalTitle, ButtonsContainer, SaveButton } from "./SharedModalComponents";
import { fetchNftsForStoredAddresses } from "../services/nftService";
import { vvvLogoBase64 } from "../content/uiAssets";
import { setOwnershipVerifiedIdCardEmoji } from "./ShinyCard";

const InventoryOverlay = styled(ModalOverlay)`
  user-select: none;
`;

const InventoryPopup = styled(ModalPopup)<{ hasNfts: boolean }>`
  background-color: var(--inventoryModalBackground);
  padding: 24px;
  user-select: none;
  outline: none;
  aspect-ratio: 1 / 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;

  @media (prefers-color-scheme: dark) {
    background-color: var(--inventoryModalBackgroundDark);
  }
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
  justify-content: space-between;
  background-color: var(--inventoryModalBackground);
  position: absolute;

  &::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: -16px;
    height: 16px;
    background: linear-gradient(to bottom, var(--inventoryModalBackground), transparent);
    pointer-events: none;
  }

  @media (prefers-color-scheme: dark) {
    background-color: var(--inventoryModalBackgroundDark);
    &::after {
      background: linear-gradient(to bottom, var(--inventoryModalBackgroundDark), transparent);
    }
  }
`;

const BottomOverlay = styled(OverlayPanel)`
  bottom: 24px;
  justify-content: flex-end;
  background-color: var(--inventoryModalBackground);
  position: absolute;

  &::before {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: -16px;
    height: 16px;
    background: linear-gradient(to top, var(--inventoryModalBackground), transparent);
    pointer-events: none;
  }

  @media (prefers-color-scheme: dark) {
    background-color: var(--inventoryModalBackgroundDark);
    &::before {
      background: linear-gradient(to top, var(--inventoryModalBackgroundDark), transparent);
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
  overflow-x: hidden;
  margin-top: 0;
  flex: 1 1 auto;
  min-height: 140px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;
  width: 100%;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  touch-action: pan-y;
  -ms-touch-action: pan-y;
  padding: 48px 0 56px 0;

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

const AvatarImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 2px;
`;

const AvatarTile = styled(NFTNameContainer)`
  position: relative;
  padding: 0;
  transition: transform 0.13s ease-out;
  will-change: transform;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  user-select: none;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      transform: scale(1.023);
    }
  }

  &:active {
    transform: scale(0.95);
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
              <VvvLogo src={`data:image/webp;base64,${vvvLogoBase64}`} alt="VVV" />
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
                    <AvatarTile
                      key={item.id}
                      onPointerDown={(e) => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.transition = "transform 0.08s ease-out";
                        el.style.transform = "scale(0.94)";
                      }}
                      onPointerUp={(e) => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.transition = "transform 0.13s ease-out";
                        el.style.transform = "";
                      }}
                      onPointerCancel={(e) => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.transition = "transform 0.13s ease-out";
                        el.style.transform = "";
                      }}
                      onPointerLeave={(e) => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.transition = "transform 0.13s ease-out";
                        el.style.transform = "";
                      }}
                      onClick={() => setOwnershipVerifiedIdCardEmoji(item.id + 1000)}>
                      <AvatarImage src={`https://assets.mons.link/swagpack/420/${item.id}.webp`} alt={`Avatar ${item.id}`} loading="lazy" />
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
