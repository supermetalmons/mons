import { sendCardBackgroundUpdate, sendCardSubtitleIdUpdate, sendProfileMonsUpdate } from "../connection/connection";
import { emojipackSize, emojis, getIncrementedEmojiId } from "../content/emojis";
import { asciimojisCount, getAsciimojiAtIndex } from "../utils/asciimoji";
import { isMobile, getStableRandomIdForOwnProfile, getStableRandomIdForProfileId } from "../utils/misc";
import { storage } from "../utils/storage";
import { handleEditDisplayName } from "./ProfileSignIn";
import { didClickAndChangePlayerEmoji, didUpdateIdCardMons } from "../game/board";
import { enableCardEditorUndo } from "../index";
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

let cardIndex = getStableRandomIdForOwnProfile(totalCardBgsCount);
let asciimojiIndex = getStableRandomIdForOwnProfile(asciimojisCount);

let demonIndex = 0;
let angelIndex = 0;
let drainerIndex = 0;
let spiritIndex = 0;
let mysticIndex = 0;

let undoQueue: Array<[string, any]> = [];

const showStickers = false;
export let showsShinyCardSomewhere = false;

let ownEmojiImg: HTMLImageElement | null;
let ownBgImg: HTMLImageElement | null;
let ownSubtitleElement: HTMLElement | null;
let ownDemonImg: HTMLImageElement | null;
let ownDrainerImg: HTMLImageElement | null;
let ownAngelImg: HTMLImageElement | null;
let ownSpiritImg: HTMLImageElement | null;
let ownMysticImg: HTMLImageElement | null;

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

  cardIndex = storage.getCardBackgroundId(getStableRandomIdForOwnProfile(totalCardBgsCount));
  asciimojiIndex = storage.getCardSubtitleId(getStableRandomIdForOwnProfile(asciimojisCount));
  showsShinyCardSomewhere = true;

  const cardContainer = document.createElement("div");
  cardContainer.style.position = "fixed";
  if (isOtherPlayer) {
    cardContainer.style.top = "56px";
    cardContainer.style.left = "50%";
    cardContainer.style.transform = "translateX(-50%)";
  } else {
    cardContainer.style.top = "56px";
    cardContainer.style.right = "12pt";
  }

  const aspectRatio = 2430 / 1886;
  const maxWidth = Math.min(window.innerWidth * 0.8, 350);
  const width = maxWidth;
  cardContainer.style.aspectRatio = `${aspectRatio}`;
  cardContainer.style.width = `${width}px`;
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
  card.style.transition = "transform 0.1s ease-out";
  card.style.borderRadius = "15px";
  card.style.boxShadow = "0 10px 30px rgba(0, 0, 0, 0.3)";
  card.style.background = CARD_BACKGROUND_GRADIENT;
  card.style.cursor = "pointer";
  card.style.willChange = "transform";
  card.style.userSelect = "none";

  const img = document.createElement("img");
  img.style.width = "100%";
  img.style.height = "100%";
  img.style.objectFit = "contain";
  img.style.borderRadius = "15px";
  img.style.position = "absolute";
  img.style.top = "0";
  img.style.left = "0";
  img.style.right = "0";
  img.style.bottom = "0";
  img.style.margin = "auto";
  img.style.userSelect = "none";
  img.style.pointerEvents = "none";
  img.draggable = false;
  img.src = `https://assets.mons.link/cards/bg/${isOtherPlayer ? getBgIdForProfile(profile) : cardIndex}.webp`;
  img.onerror = () => {
    img.style.visibility = "hidden";
  };
  img.onload = () => {
    img.style.visibility = "visible";
  };

  const emojiImg = document.createElement("img");
  emojiImg.style.position = "absolute";
  emojiImg.style.width = "24%";
  emojiImg.style.top = "13.5%";
  emojiImg.style.left = "8%";
  emojiImg.style.userSelect = "none";
  emojiImg.draggable = false;
  emojiImg.src = `https://assets.mons.link/emojipack_hq/${isOtherPlayer ? getEmojiIdForProfile(profile) : storage.getPlayerEmojiId("1")}.webp`;
  emojiImg.onerror = () => {
    emojiImg.style.visibility = "hidden";
  };
  emojiImg.onload = () => {
    emojiImg.style.visibility = "visible";
  };

  emojiImg.style.cursor = "pointer";
  emojiImg.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isMobile) {
      handlePointerLeave();
    }
    if (isOtherPlayer) {
      return;
    }
    const oldEmojiId = storage.getPlayerEmojiId("1");
    const playerEmojiId = getIncrementedEmojiId(oldEmojiId);
    updateContent("emoji", playerEmojiId, oldEmojiId);
  });
  ownEmojiImg = emojiImg;

  const placeholder = document.createElement("div");
  placeholder.style.position = "absolute";
  placeholder.style.width = "90%";
  placeholder.style.height = "81%";
  placeholder.style.backgroundColor = "var(--card-color)";

  placeholder.style.borderRadius = "10px";
  placeholder.style.top = "50%";
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
  shinyOverlay.style.borderRadius = "15px";
  shinyOverlay.style.background = IDLE_SHINE_GRADIENT;
  shinyOverlay.style.opacity = "0.63";
  shinyOverlay.style.pointerEvents = "none";
  shinyOverlay.style.zIndex = "1";
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
  const transitionDuration = 180;

  let currentRotateX = 0;
  let currentRotateY = 0;
  let targetRotateX = 0;
  let targetRotateY = 0;
  const easeAmount = 0.15;

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

          shinyOverlay.style.background = TRANSITION_SHINE_GRADIENT(lastShineX, lastShineY, radialOpacity, linearOpacity);
        } else {
          shinyOverlay.style.background = IDLE_SHINE_GRADIENT;
          transitioningFromMouse = false;
        }
      } else {
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

  const handlePointerLeave = () => {
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
    if (isMobile) {
      handlePointerLeave();
    }
    if (isOtherPlayer) {
      return;
    }
    updateContent("bg", (cardIndex + 1) % totalCardBgsCount, cardIndex);
  });
  ownBgImg = img;

  card.appendChild(placeholder);
  card.appendChild(img);

  const bubblesOverlay = createOverlayImage("https://assets.mons.link/cards/bubbles.webp");
  card.appendChild(bubblesOverlay);

  card.appendChild(emojiImg);
  card.appendChild(shinyOverlay);

  const displayNameElement = addTextToCard(card, displayName, "36.3%", "30%");
  displayNameElement.setAttribute("data-shiny-card-display-name", "true");
  addTextToCard(card, isOtherPlayer ? (profile?.rating ?? 1500).toString() : storage.getPlayerRating(1500).toString(), "36.3%", "41%");
  ownSubtitleElement = addTextToCard(card, getAsciimojiAtIndex(isOtherPlayer ? getSubtitleIdForProfile(profile) : asciimojiIndex), "10%", "52%");
  const gpText = "gp: " + ((isOtherPlayer ? profile?.nonce ?? -1 : storage.getPlayerNonce(-1)) + 1).toString();
  addTextToCard(card, gpText, "9%", "62.7%", "10px");
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
  showMons(card, handlePointerLeave, isOtherPlayer, profile);
  if (showStickers) {
    showRandomStickers(card);
  }

  addPlaceholderBubble(card, "34.3%", "25.6%", "30%", "9%", handlePointerLeave, () => {
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
  addPlaceholderBubble(card, "34.3%", "36.3%", "15.5%", "9%", handlePointerLeave);

  addPlaceholderBubble(card, "7.4%", "47.3%", "37.5%", "9%", handlePointerLeave, () => {
    if (isOtherPlayer) {
      return;
    }
    updateContent("subtitle", (asciimojiIndex + 1) % asciimojisCount, asciimojiIndex);
  });

  addPlaceholderBubble(card, "7.4%", "58.3%", "13.5%", "9%", handlePointerLeave);
  updateUndoButton();
};

export const updateShinyCardDisplayName = (displayName: string) => {
  if (!showsShinyCardSomewhere) {
    return;
  }
  const displayNameElement = document.querySelector('[data-shiny-card-display-name="true"]');
  if (displayNameElement) {
    displayNameElement.textContent = displayName;
  }
};

async function showRandomStickers(card: HTMLElement) {
  const stickerOptions = ["zemred", "super-mana-piece-3", "speklmic", "omom-4", "omom-3", "omom-2", "omom", "omen-statue", "melmut", "lord-idgecreist", "king-snowbie", "hatchat", "gummy-deino", "gerp", "estalibur", "crystal-owg", "crystal-gummy-deino", "crystal-cloud-gabber", "armored-gummoskullj", "applecreme"];

  const randomSticker = stickerOptions[Math.floor(Math.random() * stickerOptions.length)];
  const stickerUrl = `https://assets.mons.link/cards/stickers/big-mon-top-right/${randomSticker}.webp`;

  const stickers = createOverlayImage(stickerUrl);
  card.appendChild(stickers);
}

const addTextToCard = (card: HTMLElement, text: string, leftPosition: string, topPosition: string, fontSize: string = "14px"): HTMLElement => {
  const textElement = document.createElement("div");
  textElement.textContent = text;
  textElement.style.position = "absolute";
  textElement.style.left = leftPosition;
  textElement.style.top = topPosition;
  textElement.style.color = "#CACACA";
  textElement.style.fontFamily = "Arial, sans-serif";
  textElement.style.fontSize = fontSize;
  textElement.style.fontWeight = "555";
  textElement.style.transform = "translate(0, -50%)";
  textElement.style.pointerEvents = "none";
  textElement.style.userSelect = "none";

  card.appendChild(textElement);
  return textElement;
};

const addImageToCard = (card: HTMLElement, leftPosition: string, topPosition: string, imageData: string, alpha: number, monType: string = "", handlePointerLeave: any, isOtherPlayer: boolean): HTMLElement => {
  const imageContainer = document.createElement("div");
  imageContainer.style.position = "absolute";
  imageContainer.style.left = leftPosition;
  imageContainer.style.top = topPosition;
  imageContainer.style.width = "10%";
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
        if (!isOtherPlayer) {
          didClickMonImage(monType);
        }
        if (isMobile) {
          handlePointerLeave();
        }
      });

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

  card.appendChild(imageContainer);
  return imageContainer;
};

const addPlaceholderBubble = (card: HTMLElement, left: string, top: string, width: string, height: string, handlePointerLeave: any, onClick?: () => void): HTMLElement => {
  const imageContainer = document.createElement("div");
  imageContainer.style.position = "absolute";
  imageContainer.style.left = left;
  imageContainer.style.top = top;
  imageContainer.style.borderRadius = "6px";
  imageContainer.style.width = width;
  imageContainer.style.height = height;
  imageContainer.style.overflow = "hidden";
  imageContainer.style.backgroundColor = "transparent";
  imageContainer.style.opacity = "0";
  imageContainer.style.border = "1px solid #D0D0D050";
  imageContainer.style.boxSizing = "border-box";
  imageContainer.style.display = "flex";
  imageContainer.style.justifyContent = "center";
  imageContainer.style.alignItems = "center";
  imageContainer.style.userSelect = "none";
  imageContainer.style.pointerEvents = "auto";
  imageContainer.setAttribute("style", imageContainer.getAttribute("style") + "-webkit-tap-highlight-color: transparent; outline: none; -webkit-touch-callout: none;");

  imageContainer.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (isMobile) {
      handlePointerLeave();
    }

    if (onClick) {
      onClick();
    }
  });

  card.appendChild(imageContainer);
  return imageContainer;
};

const createOverlayImage = (url: string): HTMLImageElement => {
  const overlayImg = document.createElement("img");
  overlayImg.style.width = "100%";
  overlayImg.style.height = "100%";
  overlayImg.style.objectFit = "contain";
  overlayImg.style.position = "absolute";
  overlayImg.style.top = "0";
  overlayImg.style.left = "0";
  overlayImg.style.right = "0";
  overlayImg.style.bottom = "0";
  overlayImg.style.margin = "auto";
  overlayImg.style.userSelect = "none";
  overlayImg.style.pointerEvents = "none";
  overlayImg.draggable = false;
  overlayImg.src = url;
  overlayImg.onerror = () => {
    overlayImg.style.visibility = "hidden";
  };
  overlayImg.onload = () => {
    overlayImg.style.visibility = "visible";
  };
  return overlayImg;
};

export const hideShinyCard = () => {
  showsShinyCardSomewhere = false;
  const shinyCard = document.querySelector('[data-shiny-card="true"]');
  if (shinyCard && shinyCard.parentNode) {
    shinyCard.parentNode.removeChild(shinyCard);
  }
};

function getBgIdForProfile(profile: PlayerProfile | null): number {
  return profile?.cardBackgroundId ?? getStableRandomIdForProfileId(profile?.id ?? "", totalCardBgsCount);
}

function getEmojiIdForProfile(profile: PlayerProfile | null): number {
  return profile?.emoji ?? getStableRandomIdForProfileId(profile?.id ?? "", emojipackSize);
}

function getSubtitleIdForProfile(profile: PlayerProfile | null): number {
  return profile?.cardSubtitleId ?? getStableRandomIdForProfileId(profile?.id ?? "", asciimojisCount);
}

async function showMons(card: HTMLElement, handlePointerLeave: any, isOtherPlayer: boolean, profile: PlayerProfile | null) {
  const alpha = 1;
  [demonIndex, angelIndex, drainerIndex, spiritIndex, mysticIndex] = getMonsIndexes(isOtherPlayer, profile);
  const getSpriteByKey = (await import(`../assets/monsSprites`)).getSpriteByKey;
  addImageToCard(card, "32.5%", "75%", getSpriteByKey(getMonId(MonType.DEMON, demonIndex)), alpha, "demon", handlePointerLeave, isOtherPlayer);
  addImageToCard(card, "44.7%", "75%", getSpriteByKey(getMonId(MonType.ANGEL, angelIndex)), alpha, "angel", handlePointerLeave, isOtherPlayer);
  addImageToCard(card, "57.3%", "75%", getSpriteByKey(getMonId(MonType.DRAINER, drainerIndex)), alpha, "drainer", handlePointerLeave, isOtherPlayer);
  addImageToCard(card, "69.5%", "75%", getSpriteByKey(getMonId(MonType.SPIRIT, spiritIndex)), alpha, "spirit", handlePointerLeave, isOtherPlayer);
  addImageToCard(card, "82%", "75%", getSpriteByKey(getMonId(MonType.MYSTIC, mysticIndex)), alpha, "mystic", handlePointerLeave, isOtherPlayer);
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
