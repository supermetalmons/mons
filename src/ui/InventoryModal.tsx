import React, { useRef, useEffect, useState } from "react";
import styled from "styled-components";
import {
  ModalOverlay,
  ModalPopup,
  ModalTitle,
  ButtonsContainer,
  SaveButton,
  handleModalKeyDown,
} from "./SharedModalComponents";
import {
  fetchNftsForIdentity,
  getNftIdentityKey,
} from "../services/nftService";
import {
  setOwnershipVerifiedIdCardEmoji,
  setOwnershipVerifiedSpecialItem,
} from "./ShinyCard";
import { AvatarImage } from "./AvatarImage";
import { storage } from "../utils/storage";
import type { AuthState } from "../connection/authentication";

const InventoryOverlay = styled(ModalOverlay)`
  user-select: none;
`;

const InventoryPopup = styled(ModalPopup)<{ hasNfts: boolean }>`
  padding: 20px;
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
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;

  @media (prefers-color-scheme: dark) {
    background: transparent;
  }
`;

const TopOverlay = styled(OverlayPanel)`
  top: 0;
  left: 0;
  right: 0;
  justify-content: space-between;
  background-color: var(--color-white);
  position: absolute;
  padding: 24px 20px 0 20px;
  pointer-events: auto;
  touch-action: pan-y;
  -ms-touch-action: pan-y;

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
      background: linear-gradient(
        to bottom,
        var(--color-deep-gray),
        transparent
      );
    }
  }
`;

const BottomOverlay = styled(OverlayPanel)`
  bottom: 0;
  left: 0;
  right: 0;
  justify-content: flex-end;
  background-color: var(--color-white);
  position: absolute;
  padding: 0 20px 24px 20px;
  pointer-events: auto;
  touch-action: pan-y;
  -ms-touch-action: pan-y;

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
  display: block;
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  overflow-y: auto;
  overflow-x: hidden;
  text-align: left;
  padding-top: 65px;
  padding-bottom: 72px;
  padding-left: 20px;
  padding-right: 20px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  @media (prefers-color-scheme: dark) {
    color: var(--color-gray-d0);
  }
`;

const LoadingText = styled.div`
  text-align: center;
  font-size: 0.8rem;
  color: var(--color-gray-77);
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  transform: translateY(-50%);

  @media (prefers-color-scheme: dark) {
    color: var(--leaderboardLoadingTextColorDark);
  }
`;

const ShinyPurpleLink = styled.a`
  display: inline-block;
  position: relative;
  background: linear-gradient(90deg, #a855f7, #c084fc, #a855f7);
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  font-weight: 700;
  text-decoration: none;
  animation: shine 2.8s linear infinite;

  &::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: -2px;
    height: 2px;
    background: linear-gradient(90deg, #a855f7, #c084fc, #a855f7);
    background-size: 200% 100%;
    border-radius: 2px;
    animation: shine 2.8s linear infinite;
  }

  @keyframes shine {
    0% {
      background-position: 0% 50%;
    }
    100% {
      background-position: 200% 50%;
    }
  }
`;

const NFTGridContainer = styled.div`
  overflow: visible;
  margin-top: 0;
  flex: 1 1 auto;
  min-height: 140px;
  width: 100%;
  box-sizing: border-box;
  padding-bottom: 8px;
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
  transition:
    transform 0.13s ease-out,
    box-shadow 0.13s ease-out;
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

const SpecialImage = styled.img`
  width: 92%;
  height: 92%;
  object-fit: cover;
  display: block;
  border-radius: 6px;
  pointer-events: none;
  -webkit-user-drag: none;
  user-drag: none;
  z-index: 2;
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

interface InventoryModalProps {
  onCancel: () => void;
  authState: AuthState;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({
  onCancel,
  authState,
}) => {
  const isAuthenticated = authState.authStatus === "authenticated";
  const popupRef = useRef<HTMLDivElement>(null);
  const [avatars, setAvatars] = useState<SwagAvatarItem[]>([]);
  const [specials, setSpecials] = useState<SwagAvatarItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [dataOk, setDataOk] = useState<boolean | null>(null);
  const [loadedInventory, setLoadedInventory] = useState<{
    ownerKey: string;
    expiresAtMs: number;
  } | null>(null);
  const [inventoryRefreshVersion, setInventoryRefreshVersion] = useState(0);
  const ownerKey = isAuthenticated ? getNftIdentityKey(authState) : null;

  useEffect(() => {
    if (popupRef.current) {
      popupRef.current.focus();
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const fetchCurrentInventory = () => fetchNftsForIdentity(authState);
    const fetchTokens = async () => {
      setIsLoading(true);
      setAvatars([]);
      setSpecials([]);
      setDataOk(null);
      setLoadedInventory(null);
      try {
        let snapshot = await fetchCurrentInventory();
        if (isCancelled) {
          return;
        }
        let isSnapshotFresh = snapshot.expiresAtMs > Date.now();
        if (
          snapshot.data?.ok === true &&
          snapshot.expiresAtMs > 0 &&
          !isSnapshotFresh
        ) {
          snapshot = await fetchCurrentInventory();
          if (isCancelled) {
            return;
          }
          isSnapshotFresh = snapshot.expiresAtMs > Date.now();
        }
        const data = isSnapshotFresh ? snapshot.data : { ok: false };
        const ok = data?.ok === true;
        setDataOk(ok);
        setLoadedInventory(
          ok && ownerKey
            ? { ownerKey, expiresAtMs: snapshot.expiresAtMs }
            : null,
        );
        setAvatars(
          Array.isArray(data?.swagpack_avatars) ? data.swagpack_avatars : [],
        );
        setSpecials(Array.isArray(data?.specials) ? data.specials : []);
      } catch {
        if (isCancelled) {
          return;
        }
        setAvatars([]);
        setSpecials([]);
        setDataOk(false);
        setLoadedInventory(null);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };
    fetchTokens();
    return () => {
      isCancelled = true;
    };
  }, [authState, inventoryRefreshVersion, ownerKey]);

  const canApplyInventoryItem = () => {
    if (
      !isAuthenticated ||
      !ownerKey ||
      loadedInventory?.ownerKey !== ownerKey
    ) {
      return false;
    }
    const hasCurrentStoredOwner =
      getNftIdentityKey(storage.getAuthIdentity()) === ownerKey;
    if (!hasCurrentStoredOwner) {
      return false;
    }
    if (loadedInventory.expiresAtMs <= Date.now()) {
      setInventoryRefreshVersion((current) => current + 1);
      return false;
    }
    return true;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    handleModalKeyDown(e, popupRef.current, onCancel);
    if (
      !e.defaultPrevented &&
      e.key === "Enter" &&
      e.target === e.currentTarget
    ) {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <InventoryOverlay onClick={onCancel}>
      <InventoryPopup
        ref={popupRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        autoFocus
        hasNfts={avatars.length > 0 || specials.length > 0}
        role="dialog"
        aria-modal="true"
        aria-labelledby="collectibles-dialog-title"
      >
        <TopOverlay>
          <TopBar>
            <InventoryTitle id="collectibles-dialog-title">
              Collectibles
            </InventoryTitle>
          </TopBar>
        </TopOverlay>

        <NFTSection>
          <Content>
            {isLoading ? (
              <LoadingText>LOADING...</LoadingText>
            ) : avatars.length === 0 && specials.length === 0 ? (
              <LoadingText>
                {dataOk ? (
                  <ShinyPurpleLink
                    href="https://www.tensor.trade/trade/swag_pack"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Get Swag Pack
                  </ShinyPurpleLink>
                ) : (
                  "Failed to load."
                )}
              </LoadingText>
            ) : (
              <NFTGridContainer>
                <NFTGrid>
                  {specials.map((item) => (
                    <AvatarTile
                      key={`special-${item.id}`}
                      onClick={() => {
                        if (canApplyInventoryItem()) {
                          setOwnershipVerifiedSpecialItem(item.id);
                        }
                      }}
                    >
                      <SpecialImage
                        src={`https://cdn.lil.org/mons/id_cards/misc/bd4/${item.id}.webp`}
                        alt=""
                        loading="lazy"
                      />
                      {item.count > 1 && (
                        <CountIndicator count={item.count}>
                          {item.count}
                        </CountIndicator>
                      )}
                    </AvatarTile>
                  ))}
                  {avatars.map((item) => (
                    <AvatarTile
                      key={item.id}
                      onClick={() => {
                        if (canApplyInventoryItem()) {
                          setOwnershipVerifiedIdCardEmoji(
                            item.id + 1000,
                            item.count >= 3 ? "rainbow" : "",
                          );
                        }
                      }}
                    >
                      <AvatarImage
                        src={`https://cdn.lil.org/mons/emojipack/swagpack/420/${item.id}.webp`}
                        alt=""
                        rainbowAura={item.count >= 3}
                        loading="lazy"
                      />
                      {item.count > 1 && (
                        <CountIndicator count={item.count}>
                          {item.count}
                        </CountIndicator>
                      )}
                    </AvatarTile>
                  ))}
                </NFTGrid>
              </NFTGridContainer>
            )}
          </Content>
        </NFTSection>

        <BottomOverlay>
          <ButtonsContainer style={{ margin: 0 }}>
            <SaveButton onClick={onCancel} disabled={false}>
              OK
            </SaveButton>
          </ButtonsContainer>
        </BottomOverlay>
      </InventoryPopup>
    </InventoryOverlay>
  );
};
