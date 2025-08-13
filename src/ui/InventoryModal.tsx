import React, { useRef, useEffect, useState } from "react";
import styled from "styled-components";
import { ModalOverlay, ModalPopup, ModalTitle, ButtonsContainer, SaveButton, Subtitle } from "./SharedModalComponents";
import { storage } from "../utils/storage";
import { connection } from "../connection/connection";

const doNotFetchNftsForNow = true;

const InventoryOverlay = styled(ModalOverlay)`
  user-select: none;
`;

const InventoryPopup = styled(ModalPopup)<{ hasNfts: boolean }>`
  background-color: var(--inventoryModalBackground);
  padding: 20px;
  user-select: none;
  outline: none;
  ${(props) =>
    props.hasNfts &&
    `
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
  `}

  @media (prefers-color-scheme: dark) {
    background-color: var(--inventoryModalBackgroundDark);
  }
`;

const InventoryTitle = styled(ModalTitle)`
  margin-bottom: 24px;
`;

const NFTSection = styled.div`
  margin-bottom: 24px;
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

  @media (prefers-color-scheme: dark) {
    color: var(--color-gray-d0);
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
        const data = await connection.getNfts(storedSolAddress, storedEthAddress);
        if (data?.nfts) {
          setNfts(data.nfts);
        }
      };

      if (!doNotFetchNftsForNow) {
        fetchTokens();
      }
    }
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

  const openNftOnWeb = (direct: string) => {
    window.open(direct, "_blank");
  };

  return (
    <InventoryOverlay onClick={cleanUpAndClose}>
      <InventoryPopup ref={popupRef} onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown} tabIndex={0} autoFocus hasNfts={nfts.length > 0}>
        <InventoryTitle>Swag Pack</InventoryTitle>
        <Subtitle>items will be here soon</Subtitle>
        {nfts.length > 0 && (
          <NFTSection>
            <Content>
              <NFTGridContainer>
                <NFTGrid>
                  {nfts.map((nft) => (
                    <NFTNameContainer key={nft.id} onClick={() => openNftOnWeb(nft.direct_link)}>
                      <NFTName>{nft.content.metadata?.name || "Unnamed"}</NFTName>
                    </NFTNameContainer>
                  ))}
                </NFTGrid>
              </NFTGridContainer>
            </Content>
          </NFTSection>
        )}

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
