import React, { useRef, useEffect, useState } from "react";
import styled from "styled-components";
import { ButtonsContainer, SaveButton } from "./NameEditModal";
import { storage } from "../utils/storage";
import { getNfts } from "../connection/connection";

const doNotFetchNftsForNow = true;

const InventoryOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.3);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1023;
  user-select: none;

  @media (prefers-color-scheme: dark) {
    background-color: rgba(0, 0, 0, 0.5);
  }
`;

const InventoryPopup = styled.div`
  background-color: #fffffffa;
  padding: 24px;
  border-radius: 16px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
  width: 85%;
  max-width: 320px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  user-select: none;
  outline: none;
  overflow: hidden;
  position: relative;

  @media (prefers-color-scheme: dark) {
    background-color: #1a1a1afa;
  }
`;

const SectionTitle = styled.h3`
  margin-top: 0;
  margin-bottom: 20px;
  font-size: 1.25rem;
  font-weight: 600;
  color: #333;
  user-select: none;
  cursor: default;
  text-align: left;
  padding-bottom: 2px;

  @media (prefers-color-scheme: dark) {
    color: #f0f0f0;
  }
`;

const SectionContainer = styled.div`
  margin-bottom: 32px;

  &:last-of-type {
    margin-bottom: 20px;
  }
`;

const Content = styled.div`
  color: #555;
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

  @media (prefers-color-scheme: dark) {
    color: #d0d0d0;
  }
`;

const NFTGridContainer = styled.div`
  overflow-y: auto;
  overflow-x: hidden;
  margin-top: 16px;
  max-height: 140px;
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
  background: #f5f5f5;
  overflow: hidden;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 4px;
  text-align: center;
  box-sizing: border-box;

  @media (prefers-color-scheme: dark) {
    background: #2a2a2a;
  }
`;

const NFTName = styled.span`
  font-size: 0.7rem;
  overflow-wrap: break-word;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-height: 100%;
`;

const StickerButtonsContainer = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 8px;
  margin-bottom: 4px;
`;

const StickerButton = styled.button`
  padding: 6px 16px;
  border-radius: 8px;
  border: 1px solid #ddd;
  background: #f8f8f8;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  flex: 1;

  &:hover {
    background: #f0f0f0;
  }

  @media (prefers-color-scheme: dark) {
    background: #333;
    border-color: #444;
    color: #ddd;

    &:hover {
      background: #3a3a3a;
    }
  }
`;

interface NFT {
  id: string;
  direct_link: string;
  content: {
    json_uri: string;
    links?: {
      image: string;
    };
    metadata: {
      name: string;
      image?: string;
    };
  };
  ownership: {
    owner: string;
  };
}

export interface InventoryModalProps {
  onCancel: () => void;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({ onCancel }) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const [nfts, setNfts] = useState<NFT[]>([]);

  useEffect(() => {
    if (popupRef.current) {
      popupRef.current.focus();
    }

    const storedSolAddress = storage.getSolAddress("");
    const storedEthAddress = storage.getEthAddress("");

    if (storedSolAddress || storedEthAddress) {
      const fetchTokens = async () => {
        const data = await getNfts(storedSolAddress, storedEthAddress);
        if (data?.nfts) {
          setNfts(data.nfts);
        }
      };

      if (!doNotFetchNftsForNow) {
        fetchTokens();
      }
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.stopPropagation();
      onCancel();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    }
  };

  const openNftOnWeb = (direct: string) => {
    window.open(direct, "_blank");
  };

  const handleReroll = () => {
    // TODO: implement
  };

  const handleCleanup = () => {
    // TODO: implement
  };

  return (
    <InventoryOverlay onClick={onCancel}>
      <InventoryPopup ref={popupRef} onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown} tabIndex={0} autoFocus>
        <SectionContainer>
          <SectionTitle>Stickers</SectionTitle>
          <Content>
            <StickerButtonsContainer>
              <StickerButton onClick={handleReroll}>reroll</StickerButton>
              <StickerButton onClick={handleCleanup}>clean up</StickerButton>
            </StickerButtonsContainer>
          </Content>
        </SectionContainer>

        <SectionContainer>
          <SectionTitle>Swag Pack</SectionTitle>
          <Content>
            <span style={{ fontStyle: "italic", opacity: 0.8 }}>coming soon</span>
            {nfts.length > 0 && (
              <NFTGridContainer>
                <NFTGrid>
                  {nfts.map((nft) => (
                    <NFTNameContainer key={nft.id} onClick={() => openNftOnWeb(nft.direct_link)}>
                      <NFTName>{nft.content.metadata?.name || "Unnamed"}</NFTName>
                    </NFTNameContainer>
                  ))}
                </NFTGrid>
              </NFTGridContainer>
            )}
          </Content>
        </SectionContainer>

        <ButtonsContainer>
          <SaveButton onClick={onCancel} disabled={false}>
            OK
          </SaveButton>
        </ButtonsContainer>
      </InventoryPopup>
    </InventoryOverlay>
  );
};

export default InventoryModal;
