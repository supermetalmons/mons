import React, { useRef, useEffect, useState } from "react";
import styled from "styled-components";
import { ButtonsContainer, SaveButton } from "./NameEditModal";
import { storage } from "../utils/storage";

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
  padding: 20px;
  border-radius: 16px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
  width: 85%;
  max-width: 320px;
  max-height: 42vh;
  display: flex;
  flex-direction: column;
  user-select: none;
  outline: none;
  overflow: hidden;

  @media (prefers-color-scheme: dark) {
    background-color: #1a1a1afa;
  }
`;

const Title = styled.h3`
  margin-top: 0;
  margin-bottom: 16px;
  font-size: 1.1rem;
  color: #333;
  user-select: none;
  cursor: default;

  @media (prefers-color-scheme: dark) {
    color: #f0f0f0;
  }
`;

const Content = styled.div`
  color: #555;
  font-size: 0.9rem;
  margin-bottom: 16px;
  user-select: none;
  cursor: default;
  word-break: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  @media (prefers-color-scheme: dark) {
    color: #d0d0d0;
  }
`;

const NFTGridContainer = styled.div`
  overflow-y: auto;
  overflow-x: hidden;
  margin-top: 16px;
  flex: 1;
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

interface NFT {
  id: string;
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

    const apiKey = "";
    const storedSolAddress = "DfgKdiMKvqWC2RHFuWZr6Mfkqor7KgouK5Pohy6AsYPe"; // storage.getSolAddress(""); // TODO: dev tmp

    if (storedSolAddress) {
      const fetchTokens = async () => {
        try {
          const response = await fetch("https://mainnet.helius-rpc.com/?api-key=" + apiKey, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: "my-id",
              method: "searchAssets",
              params: {
                ownerAddress: storedSolAddress,
                grouping: ["collection", "CjL5WpAmf4cMEEGwZGTfTDKWok9a92ykq9aLZrEK2D5H"],
                page: 1,
                limit: 50,
              },
            }),
          });

          const data = await response.json();
          if (data?.result?.items) {
            setNfts(data.result.items);
          }
        } catch {}
      };

      fetchTokens();
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

  const openNFTOnTensor = (nftId: string) => {
    window.open(`https://www.tensor.trade/item/${nftId}`, "_blank");
  };

  return (
    <InventoryOverlay onClick={onCancel}>
      <InventoryPopup ref={popupRef} onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown} tabIndex={0} autoFocus>
        <Title>swagpack</Title>
        <Content>
          soon
          {nfts.length > 0 && (
            <NFTGridContainer>
              <NFTGrid>
                {nfts.map((nft) => (
                  <NFTNameContainer key={nft.id} onClick={() => openNFTOnTensor(nft.id)}>
                    <NFTName>{nft.content.metadata?.name || "Unnamed"}</NFTName>
                  </NFTNameContainer>
                ))}
              </NFTGrid>
            </NFTGridContainer>
          )}
        </Content>
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
