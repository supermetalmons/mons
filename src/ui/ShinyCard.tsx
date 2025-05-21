import { sendCardBackgroundUpdate, sendCardStickersUpdate, sendCardSubtitleIdUpdate, sendProfileMonsUpdate } from "../connection/connection";
import { emojipackSize, emojis, getIncrementedEmojiId } from "../content/emojis";
import { asciimojisCount, getAsciimojiAtIndex } from "../utils/asciimoji";
import { isMobile, getStableRandomIdForProfileId } from "../utils/misc";
import { storage } from "../utils/storage";
import { handleEditDisplayName } from "./ProfileSignIn";
import { didClickAndChangePlayerEmoji, didUpdateIdCardMons } from "../game/board";
import { enableCardEditorUndo } from "../index";
import { STICKER_PATHS } from "../utils/stickers";
import { PlayerProfile } from "../connection/connectionModels";
import { MonType, getMonId, mysticTypes, spiritTypes, demonTypes, angelTypes, drainerTypes, getMonsIndexes } from "../utils/namedMons";

const CARD_BACKGROUND_GRADIENT = "linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.1) 100%)";
const IDLE_SHINE_GRADIENT = "linear-gradient(135deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0) 100%)";
const HOVER_SHINE_GRADIENT = (percentX: number, percentY: number) => `radial-gradient(circle at ${percentX}% ${percentY}%, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 60%)`;
const TRANSITION_SHINE_GRADIENT = (lastShineX: number, lastShineY: number, radialOpacity: number, linearOpacity: number) =>
  `radial-gradient(circle at ${lastShineX}% ${lastShineY}%, 
    rgba(255,255,255,${radialOpacity}) 0%, 
    rgba(255,255,255,0) 60%),
  linear-gradient(135deg, 
    rgba(255,255,255,0) 0%, 
    rgba(255,255,255,${linearOpacity}) 50%, 
    rgba(255,255,255,0) 100%)`;

const totalCardBgsCount = 37;
const bubblePlaceholderColor = "white";

const stickersWipChangeOnClick = false; // TODO: dev tmp do not commit true
const stickersWipSendUpdates = false; // TODO: dev tmp do not commit true. prefer false for dev as well

let defaultCardBgIndex = 30;
let defaultSubtitleIndex = 0;
let cardIndex = defaultCardBgIndex;
let asciimojiIndex = defaultSubtitleIndex;

let demonIndex = 0;
let angelIndex = 0;
let drainerIndex = 0;
let spiritIndex = 0;
let mysticIndex = 0;
let currentlySelectedStickers: Record<string, string>;

let undoQueue: Array<[string, any]> = [];

export let showsShinyCardSomewhere = false;
let isEditingMode = false;

let ownEmojiImg: HTMLImageElement | null;
let ownBgImg: HTMLImageElement | null;
let ownBgPlaceholder: HTMLElement | null;
let ownSubtitleElement: HTMLElement | null;
let nameElement: HTMLElement | null;
let ownDemonImg: HTMLImageElement | null;
let ownDrainerImg: HTMLImageElement | null;
let ownAngelImg: HTMLImageElement | null;
let ownSpiritImg: HTMLImageElement | null;
let ownMysticImg: HTMLImageElement | null;
let ownCardContentsLayer: HTMLDivElement | null;

let cardResizeObserver: ResizeObserver | null = null;
let textElements: Array<{ element: HTMLElement; card: HTMLElement }> = [];
let stickerElements: Record<string, HTMLImageElement> = {};
let stickerHitAreas: Record<string, HTMLDivElement> = {};
let dynamicallyRoundedElements: Array<{ element: HTMLElement; radius: number }> = [];
let resizeListener: (() => void) | null = null;
let enterEditingMode: (() => void) | null = null;
let handlePointerLeave: (() => void) | null = null;

const cardStyles = `
@media screen and (max-width: 420px){
  [data-shiny-card="true"]{ right:9px !important; }
}
@media screen and (max-width: 387px){
  [data-shiny-card="true"]{ right:7px !important; }
}`;

export const showShinyCard = async (profile: PlayerProfile | null, displayName: string, isOtherPlayer: boolean) => {
  if (showsShinyCardSomewhere) {
    hideShinyCard();
  }

  if (isOtherPlayer && !profile) {
    return;
  }

  cardIndex = storage.getCardBackgroundId(defaultCardBgIndex);
  asciimojiIndex = storage.getCardSubtitleId(defaultSubtitleIndex);
  showsShinyCardSomewhere = true;
  isEditingMode = false;

  if (!cardResizeObserver) {
    cardResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const card = entry.target as HTMLElement;
        const cardHeight = card.clientHeight;
        textElements.forEach((item) => {
          if (item.card === card) {
            item.element.style.fontSize = `${cardHeight * 0.05}px`;
            item.element.parentElement!.style.borderRadius = `${cardHeight * 0.02}px`;
          }
        });
        dynamicallyRoundedElements.forEach((item) => {
          item.element.style.borderRadius = `${cardHeight * item.radius}px`;
        });
      }
    });
  }

  const cardContainer = document.createElement("div");
  cardContainer.style.position = "fixed";
  if (isOtherPlayer) {
    cardContainer.style.top = "42%";
    cardContainer.style.left = "50%";
    cardContainer.style.transform = "translate(-50%, -50%)";
  } else {
    cardContainer.style.top = "56px";
    cardContainer.style.right = "12pt";
  }

  const aspectRatio = 2217 / 1625;
  cardContainer.style.aspectRatio = `${aspectRatio}`;

  const updateCardWidth = () => {
    const calculatedWidth = isOtherPlayer && isMobile ? window.innerWidth * 0.69 : Math.min(window.innerWidth * 0.8, 350);
    cardContainer.style.width = `${calculatedWidth}px`;
    const calculatedHeight = calculatedWidth / aspectRatio;
    const maxHeight = window.innerHeight * 0.42;
    if (calculatedHeight > maxHeight) {
      cardContainer.style.width = `${maxHeight * aspectRatio}px`;
    }
  };
  updateCardWidth();
  resizeListener = updateCardWidth;
  window.addEventListener("resize", updateCardWidth);

  cardContainer.style.perspective = "1000px";
  cardContainer.style.zIndex = "1000";
  cardContainer.setAttribute("data-shiny-card", "true");
  cardContainer.style.userSelect = "none";
  cardContainer.style.touchAction = "none";
  const styleTag = document.createElement("style");
  styleTag.textContent = cardStyles;
  cardContainer.appendChild(styleTag);

  const card = document.createElement("div");
  card.style.position = "relative";
  card.style.width = "100%";
  card.style.height = "100%";
  card.style.transformStyle = "preserve-3d";
  dynamicallyRoundedElements.push({ element: card, radius: 0.05 });
  card.style.boxShadow = "0 10px 30px rgba(0, 0, 0, 0.3)";
  card.style.background = CARD_BACKGROUND_GRADIENT;
  card.style.cursor = "pointer";
  card.style.willChange = "transform";
  card.style.userSelect = "none";
  card.style.overflow = "hidden";
  card.style.backdropFilter = "blur(3px)";
  card.setAttribute("style", card.getAttribute("style") + "-webkit-backdrop-filter: blur(3px);");

  const cardContentsLayer = document.createElement("div");
  cardContentsLayer.style.position = "relative";
  cardContentsLayer.style.width = "100%";
  cardContentsLayer.style.aspectRatio = `${2430 / 1886}`;
  dynamicallyRoundedElements.push({ element: cardContentsLayer, radius: 0.05 });
  cardContentsLayer.style.overflow = "hidden";
  cardContentsLayer.style.transform = "translateY(-2.77%) scale(1.03)";
  cardContentsLayer.style.transformOrigin = "center";

  const img = document.createElement("img");
  img.style.width = "100%";
  img.style.height = "100%";
  img.style.objectFit = "contain";
  img.style.position = "absolute";
  img.style.top = "0";
  img.style.left = "0";
  img.style.right = "0";
  img.style.bottom = "0";
  img.style.margin = "auto";
  img.style.userSelect = "none";
  img.style.pointerEvents = "none";
  img.draggable = false;
  const bgId = isOtherPlayer ? getBgIdForProfile(profile) : cardIndex;
  img.src = `https://assets.mons.link/cards/bg/${bgId}.webp`;
  img.style.visibility = "hidden";
  img.onerror = () => {
    img.style.visibility = "hidden";
  };
  img.onload = () => {
    img.style.visibility = "visible";
    showHiddenWaitingStickers();
  };

  const emojiContainer = document.createElement("div");
  emojiContainer.style.position = "absolute";
  emojiContainer.style.backgroundColor = bubblePlaceholderColor;
  emojiContainer.style.width = "24.9%";
  emojiContainer.style.aspectRatio = "1";
  emojiContainer.style.top = "13.3%";
  emojiContainer.style.left = "7.65%";
  emojiContainer.style.borderRadius = "7%";
  emojiContainer.style.boxShadow = "0 0 2px 2px rgba(0, 0, 0, 0.1)";
  emojiContainer.style.userSelect = "none";
  emojiContainer.style.cursor = "pointer";
  emojiContainer.style.outline = "none";
  emojiContainer.style.setProperty("-webkit-tap-highlight-color", "transparent");
  emojiContainer.style.setProperty("-webkit-touch-callout", "none");
  emojiContainer.style.transition = "transform 0.13s ease-out";

  if (!isMobile) {
    const updateEmojiScale = (event: MouseEvent) => {
      emojiContainer.style.transform = `scale(${event.type === "mouseleave" || !isEditingMode ? 1 : 1.023})`;
    };
    emojiContainer.addEventListener("mouseenter", updateEmojiScale);
    emojiContainer.addEventListener("mouseleave", updateEmojiScale);
    emojiContainer.addEventListener("mousemove", updateEmojiScale);
  }

  const emojiImg = document.createElement("img");
  emojiImg.style.position = "absolute";
  emojiImg.style.width = "100%";
  emojiImg.style.height = "100%";
  emojiImg.style.top = "0";
  emojiImg.style.left = "0";
  emojiImg.style.userSelect = "none";
  emojiImg.style.visibility = "hidden";
  emojiImg.draggable = false;
  emojiImg.src = `https://assets.mons.link/emojipack_hq/${isOtherPlayer ? getEmojiIdForProfile(profile) : storage.getPlayerEmojiId("1")}.webp`;
  emojiImg.onerror = () => {
    emojiImg.style.visibility = "hidden";
  };
  emojiImg.onload = () => {
    emojiImg.style.visibility = "visible";
  };
  emojiContainer.appendChild(emojiImg);
  emojiContainer.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isMobile && handlePointerLeave) {
      handlePointerLeave();
    }
    if (isOtherPlayer) {
      return;
    }

    if (!isEditingMode && enterEditingMode) {
      enterEditingMode();
      return;
    }

    if (isMobile) {
      emojiContainer.style.transform = "scale(0.95)";
      setTimeout(() => {
        emojiContainer.style.transform = "scale(1)";
      }, 130);
    } else {
      emojiContainer.style.transform = "scale(0.95)";
      setTimeout(() => {
        emojiContainer.style.transform = "scale(1.023)";
      }, 130);
    }

    const oldEmojiId = storage.getPlayerEmojiId("1");
    const playerEmojiId = getIncrementedEmojiId(oldEmojiId);
    updateContent("emoji", playerEmojiId, oldEmojiId);
  });
  ownEmojiImg = emojiImg;

  const placeholder = document.createElement("div");
  placeholder.style.position = "absolute";
  placeholder.style.width = "90.5%";
  placeholder.style.height = "83%";
  placeholder.style.backgroundColor = getPlaceholderColorForBgId(bgId);

  dynamicallyRoundedElements.push({ element: placeholder, radius: 0.035 });
  placeholder.style.top = "50.7%";
  placeholder.style.left = "50%";
  placeholder.style.transform = "translate(-50%, -50%)";
  placeholder.style.userSelect = "none";
  placeholder.style.pointerEvents = "none";

  const shinyOverlay = document.createElement("div");
  shinyOverlay.style.position = "absolute";
  shinyOverlay.style.top = "0";
  shinyOverlay.style.left = "0";
  shinyOverlay.style.width = "100%";
  shinyOverlay.style.height = "100%";
  dynamicallyRoundedElements.push({ element: shinyOverlay, radius: 0.05 });
  shinyOverlay.style.background = IDLE_SHINE_GRADIENT;
  shinyOverlay.style.opacity = "0.63";
  shinyOverlay.style.pointerEvents = "none";
  shinyOverlay.style.zIndex = "100";
  shinyOverlay.style.transition = "none";
  shinyOverlay.style.willChange = "background";
  shinyOverlay.style.userSelect = "none";

  cardContainer.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    return false;
  });

  let isMouseOver = false;
  let animationFrameId: number | null = null;
  let time = Math.random() * Math.PI * 2;
  let animationStartDelay = 1500;
  let animationStartTime = Date.now() + animationStartDelay;
  let animationIntensity = 0;

  let lastMouseX = 50;
  let lastMouseY = 50;
  let lastShineX = 50;
  let lastShineY = 50;
  let transitioningFromMouse = false;
  let transitionProgress = 0;
  const standardTransitionDuration = 180;

  let currentRotateX = 0;
  let currentRotateY = 0;
  let targetRotateX = 0;
  let targetRotateY = 0;
  const easeAmount = 0.15;

  enterEditingMode = () => {
    if (isEditingMode || isOtherPlayer) return;

    if (handlePointerLeave) {
      handlePointerLeave();
    }

    isEditingMode = true;
    isMouseOver = false;

    const startX = lastShineX;
    const startY = lastShineY;
    const startTime = Date.now();
    const animationDuration = 500;

    if (cardContainer) {
      cardContainer.style.transition = "transform 0.3s ease-out";
      cardContainer.style.transformOrigin = "top right";
      cardContainer.style.transform = "scale(1.03)";
    }

    cardContentsLayer.style.transition = "transform 0.3s ease-out";
    cardContentsLayer.style.transform = "translateY(-2.81%) scale(1.042)";

    const animateDisperse = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / animationDuration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const dispersedX = 50 + (startX - 50) * (1 - easedProgress);
      const dispersedY = 50 + (startY - 50) * (1 - easedProgress);
      const opacity = 1 - easedProgress;
      shinyOverlay.style.background = TRANSITION_SHINE_GRADIENT(dispersedX, dispersedY, opacity * 0.8, opacity * 0.3);
      if (progress < 1) {
        requestAnimationFrame(animateDisperse);
      } else {
        shinyOverlay.style.background = "none";
      }
    };
    animateDisperse();
    showHitAreasForStickersThatAreNotSet();
  };

  const animateCard = () => {
    const now = Date.now();

    if (now > animationStartTime) {
      animationIntensity = Math.min(1, (now - animationStartTime) / 2000);
    }

    time += 0.01;

    if (isMouseOver) {
      currentRotateX += (targetRotateX - currentRotateX) * easeAmount;
      currentRotateY += (targetRotateY - currentRotateY) * easeAmount;

      card.style.transform = `rotateY(${currentRotateY}deg) rotateX(${currentRotateX}deg)`;

      lastMouseX = currentRotateX;
      lastMouseY = currentRotateY;

      transitioningFromMouse = false;
      transitionProgress = 0;
    } else {
      const naturalRotateX = Math.sin(time) * 3 * animationIntensity;
      const naturalRotateY = Math.cos(time * 0.8) * 3 * animationIntensity;

      if (transitioningFromMouse) {
        const transitionDuration = isEditingMode ? 50 : standardTransitionDuration;
        transitionProgress = Math.min(transitionProgress + 1, transitionDuration);
        const t = transitionProgress / transitionDuration;

        const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
        const easedT = easeOutCubic(t);

        currentRotateX = (1 - easedT) * lastMouseX + easedT * naturalRotateX;
        currentRotateY = (1 - easedT) * lastMouseY + easedT * naturalRotateY;

        card.style.transform = `rotateY(${currentRotateY}deg) rotateX(${currentRotateX}deg)`;

        if (transitionProgress < transitionDuration) {
          const radialOpacity = (1 - easedT) * 0.8;
          const linearOpacity = easedT * 0.3;

          if (!isEditingMode) {
            shinyOverlay.style.background = TRANSITION_SHINE_GRADIENT(lastShineX, lastShineY, radialOpacity, linearOpacity);
          }
        } else {
          if (!isEditingMode) {
            shinyOverlay.style.background = IDLE_SHINE_GRADIENT;
          }
          transitioningFromMouse = false;
        }
      } else if (!isEditingMode) {
        currentRotateX += (naturalRotateX - currentRotateX) * 0.05;
        currentRotateY += (naturalRotateY - currentRotateY) * 0.05;

        card.style.transform = `rotateY(${currentRotateY}deg) rotateX(${currentRotateX}deg)`;

        shinyOverlay.style.background = IDLE_SHINE_GRADIENT;
      }
    }

    animationFrameId = requestAnimationFrame(animateCard);
  };

  currentRotateX = 0;
  currentRotateY = 0;

  animationFrameId = requestAnimationFrame(animateCard);

  let lastMoveTime = 0;
  const moveThreshold = 5;

  const handlePointerMove = (e: MouseEvent | TouchEvent) => {
    if (isEditingMode) return;
    const now = Date.now();
    if (now - lastMoveTime < moveThreshold) return;
    lastMoveTime = now;

    isMouseOver = true;

    const rect = cardContainer.getBoundingClientRect();

    let clientX, clientY;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as MouseEvent).clientX;
      clientY = (e as MouseEvent).clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    targetRotateY = (x - centerX) / 15;
    targetRotateX = (centerY - y) / 15;

    const percentX = (x / rect.width) * 100;
    const percentY = (y / rect.height) * 100;

    lastShineX = percentX;
    lastShineY = percentY;

    shinyOverlay.style.background = HOVER_SHINE_GRADIENT(percentX, percentY);
  };

  handlePointerLeave = () => {
    if (isEditingMode) return;
    isMouseOver = false;
    transitioningFromMouse = true;
    transitionProgress = 0;
  };

  if (isMobile) {
    cardContainer.addEventListener("touchmove", handlePointerMove, { passive: true });
    cardContainer.addEventListener("touchstart", handlePointerMove, { passive: true });
    cardContainer.addEventListener("touchend", handlePointerLeave);
    cardContainer.addEventListener("touchcancel", handlePointerLeave);
  } else {
    cardContainer.addEventListener("mousemove", handlePointerMove);
    cardContainer.addEventListener("mouseleave", handlePointerLeave);
  }

  card.addEventListener("click", () => {
    if (isMobile && handlePointerLeave) {
      handlePointerLeave();
    }
    if (isOtherPlayer) {
      return;
    }
    if (!isEditingMode && enterEditingMode) {
      enterEditingMode();
      return;
    }
    updateContent("bg", (cardIndex + 1) % totalCardBgsCount, cardIndex);
  });
  ownBgImg = img;
  ownBgPlaceholder = placeholder;

  cardContentsLayer.appendChild(placeholder);
  cardContentsLayer.appendChild(img);
  cardContentsLayer.appendChild(emojiContainer);
  cardContentsLayer.appendChild(shinyOverlay);
  card.appendChild(cardContentsLayer);
  ownCardContentsLayer = cardContentsLayer;

  if (cardResizeObserver) {
    cardResizeObserver.observe(cardContentsLayer);
  }

  const textBubbleHeight = "8.6%";
  nameElement = addTextBubble(cardContentsLayer, displayName, "34.3%", "26%", textBubbleHeight, handlePointerLeave, () => {
    if (isOtherPlayer) {
      const eth = profile?.eth;
      const sol = profile?.sol;
      if (eth) {
        window.open(`https://etherscan.io/address/${eth}`, "_blank", "noopener,noreferrer");
      } else if (sol) {
        window.open(`https://explorer.solana.com/address/${sol}`, "_blank", "noopener,noreferrer");
      }
    } else {
      handleEditDisplayName();
    }
  });

  const ratingText = isOtherPlayer ? (profile?.rating ?? 1500).toString() : storage.getPlayerRating(1500).toString();
  addTextBubble(cardContentsLayer, ratingText, "34.3%", "36.6%", textBubbleHeight, handlePointerLeave);

  const subtitleText = getAsciimojiAtIndex(isOtherPlayer ? getSubtitleIdForProfile(profile) : asciimojiIndex);
  ownSubtitleElement = addTextBubble(cardContentsLayer, subtitleText, "7.4%", "47.5%", textBubbleHeight, handlePointerLeave, () => {
    if (isOtherPlayer) {
      return;
    }
    updateContent("subtitle", (asciimojiIndex + 1) % asciimojisCount, asciimojiIndex);
  });

  const gpText = "gp: " + ((isOtherPlayer ? profile?.nonce ?? -1 : storage.getPlayerNonce(-1)) + 1).toString();
  addTextBubble(cardContentsLayer, gpText, "7.4%", "58.7%", textBubbleHeight, handlePointerLeave);

  cardContainer.appendChild(card);
  document.body.appendChild(cardContainer);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "childList") {
        mutation.removedNodes.forEach((node) => {
          if (node === cardContainer && animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
            observer.disconnect();
          }
        });
      }
    });
  });

  observer.observe(document.body, { childList: true });
  showMons(cardContentsLayer, handlePointerLeave, isOtherPlayer, profile);

  const stickersJson = isOtherPlayer ? profile?.cardStickers ?? "" : storage.getCardStickers("");
  displayStickers(cardContentsLayer, stickersJson);
  updateUndoButton();
};

export const updateShinyCardDisplayName = (displayName: string) => {
  if (!showsShinyCardSomewhere) {
    return;
  }

  if (nameElement) {
    nameElement.textContent = displayName;
  }
};

function showHiddenWaitingStickers() {
  Object.values(stickerElements).forEach((sticker) => {
    sticker.style.visibility = "visible";
  });
}

export function didUpdateSticker(stickerType: string, nextSticker: string | undefined) {
  if (nextSticker) {
    const element = stickerElements[stickerType];
    if (element) {
      const stickerUrl = `https://assets.mons.link/cards/stickers/${stickerType}/${nextSticker}.webp`;
      element.src = stickerUrl;
      const hitArea = stickerHitAreas[stickerType];
      if (hitArea) {
        applyStickerFrame(hitArea, stickerType, nextSticker);
      }
    } else if (ownCardContentsLayer) {
      appendStickerLayer(ownCardContentsLayer, stickerType, nextSticker);
    }
  } else {
    const element = stickerElements[stickerType];
    if (element) {
      element.remove();
      delete stickerElements[stickerType];
    }

    showHitAreaForStickerType(stickerType);
  }
}

function cleanUpVisibleHitAreaWhenStickerIsSet(hitArea: HTMLElement) {
  hitArea.style.background = "none";
  // TODO: implement
}

function showHitAreasForStickersThatAreNotSet() {
  // TODO: implement
}

function showHitAreaForStickerType(stickerType: string) {
  // TODO: setup appropriate size

  // TODO: create hit area when it's not in stickerHitAreas yet

  const hitArea = stickerHitAreas[stickerType];
  if (hitArea) {
    if (stickersWipChangeOnClick) {
      hitArea.style.background = "green";
      // TODO: style it properly for no sticker state
    }
  }
}

function displayStickers(cardContentsLayer: HTMLElement, stickersJson: string) {
  let selectedStickers: Record<string, string>;
  currentlySelectedStickers = {};
  try {
    selectedStickers = JSON.parse(stickersJson);
  } catch {
    return;
  }

  if (!selectedStickers || typeof selectedStickers !== "object") {
    return;
  }
  currentlySelectedStickers = selectedStickers;
  for (const [path, sticker] of Object.entries(selectedStickers)) {
    if (typeof path !== "string" || typeof sticker !== "string") {
      continue;
    }
    appendStickerLayer(cardContentsLayer, path, sticker);
  }
}

function handleStickerClick(type: string) {
  if (!stickersWipChangeOnClick) {
    return;
  }

  const stickersForType = STICKER_PATHS[type];
  const currentSticker = currentlySelectedStickers[type];

  let nextSticker: string | undefined;

  if (!currentSticker) {
    nextSticker = stickersForType[0]?.name;
  } else {
    const currentIndex = stickersForType.findIndex((s) => s.name === currentSticker);
    if (currentIndex === stickersForType.length - 1 || currentIndex === -1) {
      nextSticker = undefined;
    } else {
      nextSticker = stickersForType[currentIndex + 1]?.name;
    }
  }

  const updatedStickers = { ...currentlySelectedStickers };

  if (nextSticker) {
    updatedStickers[type] = nextSticker;
  } else {
    delete updatedStickers[type];
  }

  currentlySelectedStickers = updatedStickers;
  didUpdateSticker(type, nextSticker);

  if (stickersWipSendUpdates) {
    const currentJson = JSON.stringify(currentlySelectedStickers);
    storage.setCardStickers(currentJson);
    sendCardStickersUpdate(currentJson);
  }
}

function appendStickerLayer(to: HTMLElement, type: string, name: string) {
  const stickers = createOverlayStickersImage(type, name);
  to.appendChild(stickers);

  const hitArea = stickerHitAreas[type];
  if (hitArea) {
    applyStickerFrame(hitArea, type, name);
    cleanUpVisibleHitAreaWhenStickerIsSet(hitArea);
  } else {
    const rect = document.createElement("div");
    rect.style.position = "absolute";
    rect.style.userSelect = "none";
    rect.style.outline = "none";
    rect.style.setProperty("-webkit-tap-highlight-color", "transparent");
    rect.style.setProperty("-webkit-touch-callout", "none");
    rect.style.pointerEvents = "auto";
    rect.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isMobile && handlePointerLeave) {
        handlePointerLeave();
      }
      if (!isEditingMode && enterEditingMode) {
        enterEditingMode();
        return;
      }
      handleStickerClick(type);
    };
    applyStickerFrame(rect, type, name);
    to.appendChild(rect);
    stickerHitAreas[type] = rect;
  }

  stickerElements[type] = stickers;
}

function applyStickerFrame(rect: HTMLElement, type: string, name: string) {
  const stickerPath = STICKER_PATHS[type]?.find((sticker) => sticker.name === name);
  if (!stickerPath) return;
  const { x, y, w, h } = stickerPath;
  rect.style.left = `${x * 100}%`;
  rect.style.top = `${y * 100}%`;
  rect.style.width = `${w * 100}%`;
  rect.style.height = `${h * 100}%`;
}

const addImageToCard = (cardContentsLayer: HTMLElement, leftPosition: string, topPosition: string, imageData: string, alpha: number, monType: string = "", handlePointerLeave: any, isOtherPlayer: boolean): HTMLElement => {
  const imageContainer = document.createElement("div");
  imageContainer.style.position = "absolute";
  imageContainer.style.left = leftPosition;
  imageContainer.style.top = topPosition;
  imageContainer.style.backgroundColor = bubblePlaceholderColor;
  imageContainer.style.width = "10.7%";
  imageContainer.style.borderRadius = "10%";
  imageContainer.style.boxShadow = "0 0 1px 1px rgba(0, 0, 0, 0.1)";
  imageContainer.style.aspectRatio = "1";
  imageContainer.style.overflow = "hidden";
  imageContainer.style.userSelect = "none";
  imageContainer.style.pointerEvents = monType ? "auto" : "none";
  imageContainer.setAttribute("style", imageContainer.getAttribute("style") + "-webkit-tap-highlight-color: transparent; outline: none; -webkit-touch-callout: none;");

  if (imageData) {
    const img = document.createElement("img");
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    img.style.objectPosition = "0% 50%";
    img.style.display = "block";
    img.style.imageRendering = "pixelated";
    img.style.opacity = alpha.toString();
    img.style.userSelect = "none";
    img.style.pointerEvents = "none";
    img.setAttribute("style", img.getAttribute("style") + "-webkit-tap-highlight-color: transparent;");
    img.draggable = false;
    img.src = `data:image/webp;base64,${imageData}`;
    img.onerror = () => {
      img.style.visibility = "hidden";
    };
    img.onload = () => {
      img.style.visibility = "visible";
    };

    if (monType) {
      imageContainer.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (isMobile) {
          handlePointerLeave();
        }

        if (!isOtherPlayer) {
          if (!isEditingMode && enterEditingMode) {
            enterEditingMode();
            return;
          }

          if (isMobile) {
            imageContainer.style.transform = "scale(0.95)";
            setTimeout(() => {
              imageContainer.style.transform = "scale(1)";
            }, 130);
          } else {
            imageContainer.style.transform = "scale(0.95)";
            setTimeout(() => {
              imageContainer.style.transform = "scale(1.023)";
            }, 130);
          }

          didClickMonImage(monType);
        }
      });

      imageContainer.style.transition = "transform 0.13s ease-out";

      const updateMonScale = (event: MouseEvent) => {
        if (!isMobile) {
          imageContainer.style.transform = `scale(${event.type === "mouseleave" || !isEditingMode ? 1 : 1.05})`;
        }
      };
      imageContainer.addEventListener("mouseenter", updateMonScale);
      imageContainer.addEventListener("mouseleave", updateMonScale);
      imageContainer.addEventListener("mousemove", updateMonScale);

      switch (monType) {
        case "demon":
          ownDemonImg = img;
          break;
        case "angel":
          ownAngelImg = img;
          break;
        case "drainer":
          ownDrainerImg = img;
          break;
        case "spirit":
          ownSpiritImg = img;
          break;
        case "mystic":
          ownMysticImg = img;
          break;
      }
    }

    imageContainer.appendChild(img);
  }

  cardContentsLayer.appendChild(imageContainer);
  return imageContainer;
};

const addTextBubble = (cardContentsLayer: HTMLElement, text: string, left: string, top: string, height: string, handlePointerLeave: any, onClick?: () => void): HTMLElement => {
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = left;
  container.style.top = top;
  container.style.height = height;
  container.style.maxWidth = "57.5%";
  container.style.padding = "0 2.6% 0 2.3%";
  container.style.boxSizing = "border-box";
  container.style.backgroundColor = bubblePlaceholderColor;
  container.style.opacity = "1";
  container.style.overflow = "hidden";
  container.style.display = "inline-flex";
  container.style.justifyContent = "center";
  container.style.alignItems = "center";
  container.style.userSelect = "none";
  container.style.pointerEvents = "auto";
  container.style.boxShadow = "0 0 1px 1px rgba(0, 0, 0, 0.1)";
  container.setAttribute("style", container.getAttribute("style") + "-webkit-tap-highlight-color: transparent; outline: none; -webkit-touch-callout: none;");

  if (onClick) {
    container.style.transition = "transform 0.13s ease-out";
    const updateTextContainerScale = (event: MouseEvent) => {
      if (!isMobile) {
        container.style.transform = `scale(${event.type === "mouseleave" || !isEditingMode ? 1 : 1.035})`;
      }
    };
    container.addEventListener("mouseenter", updateTextContainerScale);
    container.addEventListener("mouseleave", updateTextContainerScale);
    container.addEventListener("mousemove", updateTextContainerScale);
  }

  const textElement = document.createElement("span");
  textElement.textContent = text;
  textElement.style.whiteSpace = "nowrap";
  textElement.style.color = "#C1C1C1";
  textElement.style.fontFamily = "Arial, sans-serif";
  textElement.style.fontSize = "0.75em";
  textElement.style.fontWeight = "630";
  textElement.style.pointerEvents = "none";
  textElement.style.userSelect = "none";
  container.appendChild(textElement);

  textElements.push({ element: textElement, card: cardContentsLayer });
  const cardHeight = cardContentsLayer.clientHeight;
  if (cardHeight > 0) {
    textElement.style.fontSize = `${cardHeight * 0.05}px`;
    container.style.borderRadius = `${cardHeight * 0.02}px`;
  }

  container.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (isMobile) {
      handlePointerLeave();
    }

    if (!isEditingMode && enterEditingMode) {
      enterEditingMode();
      return;
    }

    if (onClick) {
      if (isMobile) {
        container.style.transform = "scale(0.95)";
        setTimeout(() => {
          container.style.transform = "scale(1)";
        }, 130);
      } else {
        container.style.transform = "scale(0.95)";
        setTimeout(() => {
          container.style.transform = "scale(1.023)";
        }, 130);
      }

      onClick();
    }
  });

  cardContentsLayer.appendChild(container);
  return textElement;
};

const createOverlayStickersImage = (type: string, name: string): HTMLImageElement => {
  const url = `https://assets.mons.link/cards/stickers/${type}/${name}.webp`;
  const overlayImg = document.createElement("img");
  overlayImg.style.width = "100%";
  overlayImg.style.height = "100%";
  overlayImg.style.objectFit = "contain";
  overlayImg.style.position = "absolute";
  overlayImg.style.top = "0";
  overlayImg.style.zIndex = "10";
  overlayImg.style.left = "0";
  overlayImg.style.right = "0";
  overlayImg.style.bottom = "0";
  overlayImg.style.margin = "auto";
  overlayImg.style.userSelect = "none";
  overlayImg.style.pointerEvents = "none";
  overlayImg.draggable = false;
  overlayImg.src = url;
  overlayImg.style.visibility = "hidden";
  overlayImg.onerror = () => {
    overlayImg.style.visibility = "hidden";
  };
  overlayImg.onload = () => {
    overlayImg.style.visibility = ownBgImg?.style.visibility ?? "hidden";
  };
  return overlayImg;
};

export const hideShinyCard = () => {
  showsShinyCardSomewhere = false;
  const shinyCard = document.querySelector('[data-shiny-card="true"]');
  if (shinyCard && shinyCard.parentNode) {
    shinyCard.parentNode.removeChild(shinyCard);
  }

  if (resizeListener) {
    window.removeEventListener("resize", resizeListener);
    resizeListener = null;
  }

  if (cardResizeObserver) {
    cardResizeObserver.disconnect();
    textElements = [];
    stickerElements = {};
    stickerHitAreas = {};
    dynamicallyRoundedElements = [];
  }
};

function getBgIdForProfile(profile: PlayerProfile | null): number {
  return profile?.cardBackgroundId ?? defaultCardBgIndex;
}

function getEmojiIdForProfile(profile: PlayerProfile | null): number {
  return profile?.emoji ?? getStableRandomIdForProfileId(profile?.id ?? "", emojipackSize);
}

function getSubtitleIdForProfile(profile: PlayerProfile | null): number {
  return profile?.cardSubtitleId ?? defaultSubtitleIndex;
}

async function showMons(cardContentsLayer: HTMLElement, handlePointerLeave: any, isOtherPlayer: boolean, profile: PlayerProfile | null) {
  const alpha = 1;
  [demonIndex, angelIndex, drainerIndex, spiritIndex, mysticIndex] = getMonsIndexes(isOtherPlayer, profile);
  const getSpriteByKey = (await import(`../assets/monsSprites`)).getSpriteByKey;
  const y = "74.37%";
  addImageToCard(cardContentsLayer, "32.13%", y, getSpriteByKey(getMonId(MonType.DEMON, demonIndex)), alpha, "demon", handlePointerLeave, isOtherPlayer);
  addImageToCard(cardContentsLayer, "44.35%", y, getSpriteByKey(getMonId(MonType.ANGEL, angelIndex)), alpha, "angel", handlePointerLeave, isOtherPlayer);
  addImageToCard(cardContentsLayer, "32.13%", y, getSpriteByKey(getMonId(MonType.DEMON, demonIndex)), alpha, "demon", handlePointerLeave, isOtherPlayer);
  addImageToCard(cardContentsLayer, "44.35%", y, getSpriteByKey(getMonId(MonType.ANGEL, angelIndex)), alpha, "angel", handlePointerLeave, isOtherPlayer);
  addImageToCard(cardContentsLayer, "56.85%", y, getSpriteByKey(getMonId(MonType.DRAINER, drainerIndex)), alpha, "drainer", handlePointerLeave, isOtherPlayer);
  addImageToCard(cardContentsLayer, "69.2%", y, getSpriteByKey(getMonId(MonType.SPIRIT, spiritIndex)), alpha, "spirit", handlePointerLeave, isOtherPlayer);
  addImageToCard(cardContentsLayer, "81.5%", y, getSpriteByKey(getMonId(MonType.MYSTIC, mysticIndex)), alpha, "mystic", handlePointerLeave, isOtherPlayer);
}

async function didClickMonImage(monType: string) {
  switch (monType) {
    case "demon":
      updateContent(monType, (demonIndex + 1) % demonTypes.length, demonIndex);
      break;
    case "angel":
      updateContent(monType, (angelIndex + 1) % angelTypes.length, angelIndex);
      break;
    case "drainer":
      updateContent(monType, (drainerIndex + 1) % drainerTypes.length, drainerIndex);
      break;
    case "spirit":
      updateContent(monType, (spiritIndex + 1) % spiritTypes.length, spiritIndex);
      break;
    case "mystic":
      updateContent(monType, (mysticIndex + 1) % mysticTypes.length, mysticIndex);
      break;
  }
  didUpdateIdCardMons();
}

async function updateContent(contentType: string, newId: any, oldId: any | null) {
  switch (contentType) {
    case "emoji":
      const newSmallEmojiUrl = emojis.getEmojiUrl(newId);
      didClickAndChangePlayerEmoji(newId, newSmallEmojiUrl);
      ownEmojiImg!.src = `https://assets.mons.link/emojipack_hq/${newId}.webp`;
      break;
    case "bg":
      const newCardName = `${newId}.webp`;
      storage.setCardBackgroundId(newId);
      cardIndex = newId;
      sendCardBackgroundUpdate(newId);
      ownBgPlaceholder!.style.backgroundColor = getPlaceholderColorForBgId(newId);
      ownBgImg!.style.visibility = "hidden";
      ownBgImg!.src = `https://assets.mons.link/cards/bg/${newCardName}`;
      break;
    case "subtitle":
      asciimojiIndex = newId;
      ownSubtitleElement!.textContent = getAsciimojiAtIndex(newId);
      storage.setCardSubtitleId(newId);
      sendCardSubtitleIdUpdate(newId);
      break;
    case "demon":
    case "angel":
    case "drainer":
    case "spirit":
    case "mystic":
      let newImageData = "";
      let img: HTMLImageElement | null;
      const getSpriteByKey = (await import(`../assets/monsSprites`)).getSpriteByKey;
      switch (contentType) {
        case "demon":
          demonIndex = newId;
          newImageData = getSpriteByKey(getMonId(MonType.DEMON, newId));
          img = ownDemonImg;
          break;
        case "angel":
          angelIndex = newId;
          newImageData = getSpriteByKey(getMonId(MonType.ANGEL, newId));
          img = ownAngelImg;
          break;
        case "drainer":
          drainerIndex = newId;
          newImageData = getSpriteByKey(getMonId(MonType.DRAINER, newId));
          img = ownDrainerImg;
          break;
        case "spirit":
          spiritIndex = newId;
          newImageData = getSpriteByKey(getMonId(MonType.SPIRIT, newId));
          img = ownSpiritImg;
          break;
        case "mystic":
          mysticIndex = newId;
          newImageData = getSpriteByKey(getMonId(MonType.MYSTIC, newId));
          img = ownMysticImg;
          break;
      }
      img!.src = `data:image/webp;base64,${newImageData}`;
      const monsIndexesString = `${demonIndex},${angelIndex},${drainerIndex},${spiritIndex},${mysticIndex}`;
      storage.setProfileMons(monsIndexesString);
      sendProfileMonsUpdate(monsIndexesString);
      break;
  }

  if (oldId !== null) {
    undoQueue.push([contentType, oldId]);
  }

  updateUndoButton();
}

async function updateUndoButton() {
  enableCardEditorUndo(undoQueue && undoQueue.length > 0);
}

export async function didClickIdCardEditUndoButton() {
  if (undoQueue.length > 0) {
    const [contentType, oldId] = undoQueue.pop()!;
    updateContent(contentType, oldId, null);
  }
}

function getPlaceholderColorForBgId(id: number): string {
  const placeholderColors: Record<number, string> = {
    0: "#F9F9F0",
    1: "#F9F5EF",
    2: "#EAEBF5",
    3: "#F5F6F7",
    4: "#FBFBFC",
    5: "#FAFAFA",
    6: "#FBFBF2",
    7: "#FBFBFB",
    8: "#E8E8E8",
    9: "#FBFBFB",
    10: "#FAFAF3",
    11: "#FBFBFA",
    12: "#F9F9F9",
    13: "#FBFBFB",
    14: "#F6F6F2",
    15: "#F8F8F8",
    16: "#F8F6F9",
    17: "#FBFBFC",
    18: "#FAFAFA",
    19: "#FAFAF9",
    20: "#F6F6F6",
    21: "#FBFAF4",
    22: "#F1F1F1",
    23: "#FBFBFB",
    24: "#EAEAF1",
    25: "#F8F7F8",
    26: "#F8F7E8",
    27: "#F9FAF7",
    28: "#F2F6F5",
    29: "#F2F3F5",
    30: "#F7F8F8",
    31: "#F7F9F8",
    32: "#F5F5F5",
    33: "#F8F9F6",
    34: "#F3F2F4",
    35: "#FAF9F8",
    36: "#F7F3F8",
  };
  return placeholderColors[id] ?? "var(--card-color)";
}
