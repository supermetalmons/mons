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
  padding: 20px;
  user-select: none;
  outline: none;
  max-height: 70vh;
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
  margin-bottom: 0;
`;

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
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
  margin-bottom: 24px;
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
  padding-left: 4px;
  flex: 1;
  min-height: 0;

  @media (prefers-color-scheme: dark) {
    color: var(--color-gray-d0);
  }
`;

const NFTGridContainer = styled.div`
  overflow-y: auto;
  overflow-x: hidden;
  margin-top: 16px;
  flex: 1 1 auto;
  min-height: 140px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;
  width: 100%;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const NFTGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
  gap: 8px;
  width: 100%;
  padding-right: 4px;
`;

const NFTNameContainer = styled.div`
  width: 100%;
  aspect-ratio: 1/1;
  border-radius: 4px;
  background: var(--color-gray-f5);
  overflow: hidden;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 4px;
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

  useEffect(() => {
    if (popupRef.current) {
      popupRef.current.focus();
    }

    const fetchTokens = async () => {
      const data = await fetchNftsForStoredAddresses();
      if (data?.swagpack_avatars) {
        setAvatars(data.swagpack_avatars);
      } else {
        setAvatars([]);
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
        <TopBar>
          <InventoryTitle>Swag Pack</InventoryTitle>
          <VvvLink href="https://vvv.so" target="_blank" rel="noopener noreferrer" aria-label="Open vvv.so">
            <VvvLogo src={`data:image/webp;base64,${vvvLogoBase64}`} alt="VVV" />
          </VvvLink>
        </TopBar>
        <NFTSection>
          <Content>
            <NFTGridContainer>
              <NFTGrid>
                {avatars.map((item) => (
                  <AvatarTile key={item.id} onClick={() => setOwnershipVerifiedIdCardEmoji(item.id + 1000)}>
                    <AvatarImage src={`https://assets.mons.link/swagpack/420/${item.id}.webp`} alt={`Avatar ${item.id}`} loading="lazy" />
                  </AvatarTile>
                ))}
              </NFTGrid>
            </NFTGridContainer>
          </Content>
        </NFTSection>

        <ButtonsContainer>
          <SaveButton onClick={cleanUpAndClose} disabled={false}>
            OK
          </SaveButton>
        </ButtonsContainer>
      </InventoryPopup>
    </InventoryOverlay>
  );
};

export default InventoryModal;
