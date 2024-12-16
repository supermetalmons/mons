import * as MonsWeb from "mons-web";
import * as SVG from "../utils/svg";
import { isOnlineGame, didClickSquare, didSelectInputModifier, canChangeEmoji, updateEmoji, isWatchOnly, isGameWithBot, isWaitingForRematchResponse } from "./gameController";
import { Highlight, HighlightKind, InputModifier, Location, Sound, Trace, ItemKind } from "../utils/gameModels";
import { colors, currentAssetsSet, AssetsSet, isCustomPictureBoardEnabled, isPangchiuBoard, setCurrentAssetsSet } from "../content/boardStyles";
import { isDesktopSafari, isModernAndPowerful, defaultInputEventName } from "../utils/misc";
import { playSounds } from "../content/sounds";
import { didNotDismissAnythingWithOutsideTapJustNow, hasBottomPopupsVisible } from "../ui/BottomControls";
import { hasMainMenuPopupsVisible } from "../ui/MainMenu";
import { newEmptyPlayerMetadata, resolveEthAddress, getStashedPlayerAddress, openEthAddress, getEnsName, getRating } from "../utils/playerMetadata";
import { preventTouchstartIfNeeded } from "..";

let isExperimentingWithSprites = localStorage.getItem("isExperimentingWithSprites") === "true";

export function toggleExperimentalMode(defaultMode: boolean, animated: boolean, pangchiu: boolean) {
  if (defaultMode) {
    setCurrentAssetsSet(AssetsSet.Pixel);
    isExperimentingWithSprites = false;
  } else if (animated) {
    setCurrentAssetsSet(AssetsSet.Pixel);
    isExperimentingWithSprites = true;
  } else if (pangchiu) {
    setCurrentAssetsSet(AssetsSet.Pangchiu);
    isExperimentingWithSprites = false;
  }
  localStorage.setItem("isExperimentingWithSprites", isExperimentingWithSprites.toString());
  window.location.reload();
}

export let playerSideMetadata = newEmptyPlayerMetadata();
export let opponentSideMetadata = newEmptyPlayerMetadata();

let isFlipped = false;
let traceIndex = 0;
let showsPlayerTimer = false;
let showsOpponentTimer = false;
let showsPlayerEndOfGameSuffix = false;
let showsOpponentEndOfGameSuffix = false;

let countdownInterval: NodeJS.Timeout | null = null;
let monsBoardDisplayAnimationTimeout: NodeJS.Timeout | null = null;

let board: HTMLElement | null;
let highlightsLayer: HTMLElement | null;
let itemsLayer: HTMLElement | null;
let controlsLayer: HTMLElement | null;
let boardBackgroundLayer: HTMLElement | null;

const items: { [key: string]: SVGElement } = {};
const basesPlaceholders: { [key: string]: SVGElement } = {};
const wavesFrames: { [key: string]: SVGElement } = {};
const opponentMoveStatusItems: SVGElement[] = [];
const playerMoveStatusItems: SVGElement[] = [];
const minHorizontalOffset = 0.21;

let itemSelectionOverlay: SVGElement | undefined;
let opponentNameText: SVGElement | undefined;
let playerNameText: SVGElement | undefined;
let opponentScoreText: SVGElement | undefined;
let playerScoreText: SVGElement | undefined;
let opponentTimer: SVGElement | undefined;
let playerTimer: SVGElement | undefined;
let opponentAvatar: SVGElement | undefined;
let playerAvatar: SVGElement | undefined;
let activeTimer: SVGElement | null = null;

let assets: any;
let drainer: SVGElement;
let angel: SVGElement;
let demon: SVGElement;
let spirit: SVGElement;
let mystic: SVGElement;
let mana: SVGElement;
let drainerB: SVGElement;
let angelB: SVGElement;
let demonB: SVGElement;
let spiritB: SVGElement;
let mysticB: SVGElement;
let manaB: SVGElement;
let bombOrPotion: SVGElement;
let bomb: SVGElement;
let supermana: SVGElement;
let supermanaSimple: SVGElement;

const emojis = (await import("../content/emojis")).emojis;

async function initializeAssets(onStart: boolean) {
  assets = (await import(`../content/gameAssets/gameAssets${currentAssetsSet}`)).gameAssets;

  if (isExperimentingWithSprites) {
    const sprites = (await import(`../content/gameAssets/monsSprites`)).gameAssets;
    const allKeys = Object.keys(sprites);
    const getRandomSpriteOfType = (type: string) => {
      const keys = allKeys.filter((k) => k.endsWith(`_${type}`));
      const randomKey = keys[Math.floor(Math.random() * keys.length)] as keyof typeof sprites;
      return sprites[randomKey];
    };

    drainer = loadImage(getRandomSpriteOfType("drainer"), "drainer", true);
    angel = loadImage(getRandomSpriteOfType("angel"), "angel", true);
    demon = loadImage(getRandomSpriteOfType("demon"), "demon", true);
    spirit = loadImage(getRandomSpriteOfType("spirit"), "spirit", true);
    mystic = loadImage(getRandomSpriteOfType("mystic"), "mystic", true);

    drainerB = loadImage(getRandomSpriteOfType("drainer"), "drainerB", true);
    angelB = loadImage(getRandomSpriteOfType("angel"), "angelB", true);
    demonB = loadImage(getRandomSpriteOfType("demon"), "demonB", true);
    spiritB = loadImage(getRandomSpriteOfType("spirit"), "spiritB", true);
    mysticB = loadImage(getRandomSpriteOfType("mystic"), "mysticB", true);
  } else {
    drainer = loadImage(assets.drainer, "drainer");
    angel = loadImage(assets.angel, "angel");
    demon = loadImage(assets.demon, "demon");
    spirit = loadImage(assets.spirit, "spirit");
    mystic = loadImage(assets.mystic, "mystic");

    drainerB = loadImage(assets.drainerB, "drainerB");
    angelB = loadImage(assets.angelB, "angelB");
    demonB = loadImage(assets.demonB, "demonB");
    spiritB = loadImage(assets.spiritB, "spiritB");
    mysticB = loadImage(assets.mysticB, "mysticB");
  }

  mana = loadImage(assets.mana, "mana");
  manaB = loadImage(assets.manaB, "manaB");
  bombOrPotion = loadImage(assets.bombOrPotion, "bombOrPotion");
  bomb = loadImage(assets.bomb, "bomb");
  supermana = loadImage(assets.supermana, "supermana");
  supermanaSimple = loadImage(assets.supermanaSimple, "supermanaSimple");

  if (onStart) {
    Object.values(AssetsSet)
      .filter((set) => set !== currentAssetsSet)
      .forEach((set) => {
        import(`../content/gameAssets/gameAssets${set}`).catch(() => {});
      });
  }
}

await initializeAssets(true);

export async function didToggleItemsStyleSet() {
  await initializeAssets(false);
  const updateExistingItems = (elements: { [key: string]: SVGElement }) => {
    Object.values(elements).forEach((element) => {
      const images = element.tagName === "image" ? [element] : Array.from(element.getElementsByTagName("image"));
      images.forEach((img) => {
        const assetType = img.getAttribute("data-asset-type");
        if (assetType && assets[assetType]) {
          SVG.setImage(img, assets[assetType]);
        }
      });
    });
  };

  updateExistingItems(items);
  updateExistingItems(basesPlaceholders);

  const allPixelOnlyElements = [...(board?.querySelectorAll('[data-assets-pixel-only="true"]') ?? []), ...(itemsLayer?.querySelectorAll('[data-assets-pixel-only="true"]') ?? [])];
  allPixelOnlyElements.forEach((element) => {
    SVG.setHidden(element as SVGElement, currentAssetsSet !== AssetsSet.Pixel);
  });
}

function loadImage(data: string, assetType: string, isSpriteSheet: boolean = false): SVGElement {
  if (assetType !== "avatar" && assetType !== "statusMoveEmoji") {
    return loadBoardAssetImage(data, assetType, isSpriteSheet);
  }
  const image = document.createElementNS(SVG.ns, "image");
  SVG.setImage(image, data);
  SVG.setSize(image, 1, 1);
  image.setAttribute("class", "item");
  image.setAttribute("data-asset-type", assetType);
  return image;
}

function loadBoardAssetImage(data: string, assetType: string, isSpriteSheet: boolean = false): SVGElement {
  const foreignObject = document.createElementNS(SVG.ns, "foreignObject");
  SVG.setSize(foreignObject, 1, 1);
  foreignObject.setAttribute("class", "item");
  foreignObject.setAttribute("data-asset-type", assetType);

  const div = document.createElement("div");
  div.style.width = "100%";
  div.style.height = "100%";
  div.style.backgroundImage = `url(data:image/webp;base64,${data})`;
  div.style.backgroundSize = "100%";
  div.style.backgroundRepeat = "no-repeat";

  if (currentAssetsSet === AssetsSet.Pixel) {
    div.style.imageRendering = "pixelated";
  }

  foreignObject.appendChild(div);

  if (isSpriteSheet) {
    foreignObject.setAttribute("data-is-sprite-sheet", "true");
    foreignObject.setAttribute("data-total-frames", "4");
    foreignObject.setAttribute("data-frame-duration", "169");
    foreignObject.setAttribute("data-frame-width", "1");
    foreignObject.setAttribute("data-frame-height", "1");
    const totalFrames = parseInt(foreignObject.getAttribute("data-total-frames") || "1", 10);
    const frameWidth = parseFloat(foreignObject.getAttribute("data-frame-width") || "1");
    const frameHeight = parseFloat(foreignObject.getAttribute("data-frame-height") || "1");
    SVG.setSize(foreignObject, frameWidth * totalFrames, frameHeight);
  }

  return foreignObject;
}

function startAnimation(image: SVGElement, keepStatic: boolean = false): void {
  if (image.getAttribute("data-is-sprite-sheet") === "true") {
    const totalFrames = parseInt(image.getAttribute("data-total-frames") || "1", 10);
    const frameDuration = parseInt(image.getAttribute("data-frame-duration") || "169", 10);
    const frameWidth = parseFloat(image.getAttribute("data-frame-width") || "1");
    const frameHeight = parseFloat(image.getAttribute("data-frame-height") || "1");

    const initialX = parseFloat(image.getAttribute("x") || "0");
    const initialY = parseFloat(image.getAttribute("y") || "0");
    const clipPathId = `clip-path-${Math.random().toString(36).slice(2, 11)}`;
    const clipPath = document.createElementNS(SVG.ns, "clipPath");
    clipPath.setAttribute("id", clipPathId);

    const rect = document.createElementNS(SVG.ns, "rect");
    rect.setAttribute("x", initialX.toString());
    rect.setAttribute("y", initialY.toString());
    rect.setAttribute("width", (frameWidth * 100).toString());
    rect.setAttribute("height", (frameHeight * 100).toString());
    clipPath.appendChild(rect);

    const svgRoot = image.ownerSVGElement;
    if (svgRoot) {
      let defs = svgRoot.querySelector("defs");
      if (!defs) {
        defs = document.createElementNS(SVG.ns, "defs");
        svgRoot.insertBefore(defs, svgRoot.firstChild);
      }
      defs.appendChild(clipPath);
    } else {
      console.error("SVG root element not found.");
      return;
    }

    image.setAttribute("clip-path", `url(#${clipPathId})`);
    image.setAttribute("data-clip-path-id", clipPathId);

    if (!keepStatic) {
      let currentFrame = 0;
      let lastUpdateTime = Date.now();
      (image as any).__isAnimating = true;

      function animate() {
        if (!(image as any).__isAnimating) {
          return;
        }

        const now = Date.now();
        if (now - lastUpdateTime >= frameDuration) {
          const x = initialX - currentFrame * frameWidth * 100;
          image.setAttribute("x", x.toString());
          currentFrame = (currentFrame + 1) % totalFrames;
          lastUpdateTime = now;
        }
        requestAnimationFrame(animate);
      }

      animate();
    }
  }
}

function removeItemAndCleanUpAnimation(item: SVGElement): void {
  let spriteSheetItem: SVGElement | null = null;
  if (item.getAttribute("data-is-sprite-sheet") === "true") {
    spriteSheetItem = item;
  } else if (item.tagName === "g") {
    const spriteChild = Array.from(item.children).find((child) => child.getAttribute("data-is-sprite-sheet") === "true");
    if (spriteChild) {
      spriteSheetItem = spriteChild as SVGElement;
    }
  }

  if (spriteSheetItem) {
    (spriteSheetItem as any).__isAnimating = false;

    const clipPathId = spriteSheetItem.getAttribute("data-clip-path-id");
    if (clipPathId) {
      const svgRoot = spriteSheetItem.ownerSVGElement;
      if (svgRoot) {
        const clipPath = svgRoot.querySelector(`#${clipPathId}`);
        if (clipPath && clipPath.parentNode) {
          clipPath.parentNode.removeChild(clipPath);
        }
      }
    }
  }

  if (item.parentNode) {
    item.parentNode.removeChild(item);
  }
}

function initializeBoardElements() {
  board = document.getElementById("monsboard");
  highlightsLayer = document.getElementById("highlightsLayer");
  itemsLayer = document.getElementById("itemsLayer");
  controlsLayer = document.getElementById("controlsLayer");
  boardBackgroundLayer = document.getElementById("boardBackgroundLayer");
}

export function hideBoardPlayersInfo() {
  if (opponentAvatar && playerAvatar) {
    SVG.setHidden(opponentAvatar, true);
    SVG.setHidden(playerAvatar, true);
  }

  if (playerScoreText && opponentScoreText) {
    playerScoreText.textContent = "";
    opponentScoreText.textContent = "";
  }

  if (playerNameText && opponentNameText) {
    playerNameText.textContent = "";
    opponentNameText.textContent = "";
  }
}

export function resetForNewGame() {
  if (isWatchOnly) {
    playerSideMetadata = newEmptyPlayerMetadata();
  }
  opponentSideMetadata = newEmptyPlayerMetadata();
  renderPlayersNamesLabels();

  if (opponentAvatar && playerAvatar) {
    SVG.setHidden(opponentAvatar, false);
    SVG.setHidden(playerAvatar, false);
  }

  removeHighlights();
  for (const key in items) {
    const element = items[key];
    removeItemAndCleanUpAnimation(element);
    delete items[key];
  }

  for (const key in basesPlaceholders) {
    const element = basesPlaceholders[key];
    removeItemAndCleanUpAnimation(element);
    delete basesPlaceholders[key];
  }
}

export function updateEmojiIfNeeded(newEmojiId: string, isOpponentSide: boolean) {
  const currentId = isOpponentSide ? opponentSideMetadata.emojiId : playerSideMetadata.emojiId;
  if (currentId === newEmojiId) {
    return;
  }
  const newEmojiData = emojis.getEmoji(newEmojiId);
  if (!newEmojiData) {
    return;
  }

  if (isOpponentSide) {
    if (!opponentAvatar) return;
    opponentSideMetadata.emojiId = newEmojiId;
    SVG.setImage(opponentAvatar, newEmojiData);
  } else {
    if (!playerAvatar) return;
    playerSideMetadata.emojiId = newEmojiId;
    SVG.setImage(playerAvatar, newEmojiData);
  }
}

export function showOpponentAsBotPlayer() {
  if (!opponentAvatar) return;
  SVG.setImage(opponentAvatar, emojis.pc);
}

export function flipEmojis() {
  const newPlayerEmoji = opponentSideMetadata.emojiId;
  const newOpponentEmoji = playerSideMetadata.emojiId;

  updateEmojiIfNeeded(newPlayerEmoji, false);
  updateEmojiIfNeeded(newOpponentEmoji, true);
}

export function getPlayersEmojiId(): number {
  return parseInt(playerSideMetadata.emojiId !== "" ? playerSideMetadata.emojiId : "1");
}

export function setBoardFlipped(flipped: boolean) {
  isFlipped = flipped;
}

export function runExperimentalMonsBoardAsDisplayAnimation() {
  runMonsBoardAsDisplayWaitingAnimation();
}

export function runMonsBoardAsDisplayWaitingAnimation() {
  if (monsBoardDisplayAnimationTimeout) return;

  let radius = 0;
  const maxRadius = 5;

  function animate() {
    cleanAllPixels();
    drawCircle(radius);
    radius = radius >= maxRadius ? 0 : radius + 0.5;
    monsBoardDisplayAnimationTimeout = setTimeout(animate, 200);
  }

  function drawCircle(radius: number) {
    const minRadius = radius - 0.5;
    const maxRadius = radius + 0.5;
    const minRadiusSquared = minRadius * minRadius;
    const maxRadiusSquared = maxRadius * maxRadius;

    for (let x = 0; x <= 10; x++) {
      for (let y = 0; y <= 10; y++) {
        const dx = x - 5;
        const dy = y - 5;
        const distanceSquared = dx * dx + dy * dy;

        if (distanceSquared >= minRadiusSquared && distanceSquared <= maxRadiusSquared) {
          colorPixel(new Location(x, y), true);
        }
      }
    }
  }

  animate();
}

export function stopMonsBoardAsDisplayAnimations() {
  if (monsBoardDisplayAnimationTimeout) {
    clearTimeout(monsBoardDisplayAnimationTimeout);
    monsBoardDisplayAnimationTimeout = null;
    cleanAllPixels();
  }
}

function colorPixel(location: Location, white: boolean) {
  placeItem(white ? mana : manaB, location, white ? ItemKind.Mana : ItemKind.ManaBlack, false);
}

function cleanAllPixels() {
  for (const key in items) {
    const element = items[key];
    removeItemAndCleanUpAnimation(element);
    delete items[key];
  }

  for (const key in basesPlaceholders) {
    const element = basesPlaceholders[key];
    removeItemAndCleanUpAnimation(element);
    delete basesPlaceholders[key];
  }
}

export function didGetEthAddress(address: string, uid: string) {
  resolveEthAddress(address, uid, () => {
    recalculateDisplayNames();
  });
  recalculateDisplayNames();
}

function renderPlayersNamesLabels() {
  if (!playerNameText || !opponentNameText || isWaitingForRematchResponse || playerScoreText?.textContent === "") return;

  if ((!isOnlineGame || opponentSideMetadata.uid === "") && !isGameWithBot) {
    playerNameText.textContent = "";
    opponentNameText.textContent = "";
  } else {
    const placeholderName = "anon";

    let playerNameString = "";
    let opponentNameString = "";

    if (!isGameWithBot) {
      playerNameString = playerSideMetadata.displayName === undefined ? placeholderName : playerSideMetadata.displayName;
      opponentNameString = opponentSideMetadata.displayName === undefined ? placeholderName : opponentSideMetadata.displayName;

      const ratingPrefix = " • ";
      if (playerSideMetadata.rating !== undefined) {
        playerNameString += ratingPrefix + `${playerSideMetadata.rating}`;
      }
      if (opponentSideMetadata.rating !== undefined) {
        opponentNameString += ratingPrefix + `${opponentSideMetadata.rating}`;
      }
    }

    const currentTime = Date.now();
    const thresholdDelta = 2500;
    const prefix = " ~ ";

    if (playerSideMetadata.voiceReactionDate !== undefined && currentTime - playerSideMetadata.voiceReactionDate < thresholdDelta) {
      playerNameString += prefix + playerSideMetadata.voiceReactionText;
    }

    if (opponentSideMetadata.voiceReactionDate !== undefined && currentTime - opponentSideMetadata.voiceReactionDate < thresholdDelta) {
      opponentNameString += prefix + opponentSideMetadata.voiceReactionText;
    }

    playerNameText.textContent = playerNameString;
    opponentNameText.textContent = opponentNameString;
  }
}

export function setupLoggedInPlayerEthAddress(address: string, uid: string) {
  if (!isWatchOnly) {
    setupPlayerId(uid, false);
    didGetEthAddress(address, uid);
  }
}

function recalculateDisplayNames() {
  if (getStashedPlayerAddress(playerSideMetadata.uid) && playerSideMetadata.displayName === undefined) {
    const address = getStashedPlayerAddress(playerSideMetadata.uid);
    const cropped = address.slice(0, 4) + "..." + address.slice(-4);
    playerSideMetadata.displayName = cropped;
    playerSideMetadata.ethAddress = address;
  }

  if (getStashedPlayerAddress(opponentSideMetadata.uid) && opponentSideMetadata.displayName === undefined) {
    const address = getStashedPlayerAddress(opponentSideMetadata.uid);
    const cropped = address.slice(0, 4) + "..." + address.slice(-4);
    opponentSideMetadata.displayName = cropped;
    opponentSideMetadata.ethAddress = address;
  }

  if (playerSideMetadata.ens === undefined && playerSideMetadata.ethAddress) {
    const ens = getEnsName(playerSideMetadata.ethAddress);
    if (ens !== undefined) {
      playerSideMetadata.ens = ens;
      playerSideMetadata.displayName = ens;
    }
  }

  if (opponentSideMetadata.ens === undefined && opponentSideMetadata.ethAddress) {
    const ens = getEnsName(opponentSideMetadata.ethAddress);
    if (ens !== undefined) {
      opponentSideMetadata.ens = ens;
      opponentSideMetadata.displayName = ens;
    }
  }

  if (playerSideMetadata.rating === undefined && playerSideMetadata.ethAddress) {
    const rating = getRating(playerSideMetadata.ethAddress);
    if (rating !== undefined) {
      playerSideMetadata.rating = rating;
    }
  }

  if (opponentSideMetadata.rating === undefined && opponentSideMetadata.ethAddress) {
    const rating = getRating(opponentSideMetadata.ethAddress);
    if (rating !== undefined) {
      opponentSideMetadata.rating = rating;
    }
  }

  renderPlayersNamesLabels();
}

export function showVoiceReactionText(reactionText: string, opponents: boolean) {
  const currentTime = Date.now();

  if (opponents) {
    opponentSideMetadata.voiceReactionText = reactionText;
    opponentSideMetadata.voiceReactionDate = currentTime;
  } else {
    playerSideMetadata.voiceReactionText = reactionText;
    playerSideMetadata.voiceReactionDate = currentTime;
  }

  renderPlayersNamesLabels();
  setTimeout(() => {
    renderPlayersNamesLabels();
  }, 3000);
}

export function setupPlayerId(uid: string, opponent: boolean) {
  if (opponent) {
    opponentSideMetadata.uid = uid;
  } else {
    playerSideMetadata.uid = uid;
  }
  recalculateDisplayNames();
}

function canRedirectToEthAddress(opponent: boolean) {
  let address = opponent ? opponentSideMetadata.ethAddress : playerSideMetadata.ethAddress;
  return address !== undefined;
}

function redirectToEthAddress(opponent: boolean) {
  let address = opponent ? opponentSideMetadata.ethAddress : playerSideMetadata.ethAddress;
  if (address !== undefined) {
    openEthAddress(address);
  }
}

export function removeItemsNotPresentIn(locations: Location[]) {
  const locationSet = new Set(locations.map((location) => inBoardCoordinates(location).toString()));

  for (const key in items) {
    if (!locationSet.has(key)) {
      const element = items[key];
      removeItemAndCleanUpAnimation(element);
      delete items[key];
    }
  }

  for (const key in basesPlaceholders) {
    if (!locationSet.has(key)) {
      const element = basesPlaceholders[key];
      removeItemAndCleanUpAnimation(element);
      delete basesPlaceholders[key];
    }
  }
}

export function hideAllMoveStatuses() {
  const allMoveStatusItems = [...opponentMoveStatusItems, ...playerMoveStatusItems];
  allMoveStatusItems.forEach((item) => SVG.setHidden(item, true));
}

export function updateMoveStatuses(color: MonsWeb.Color, moveKinds: Int32Array, otherPlayerStatuses: Int32Array) {
  const playerSideActive = isFlipped ? color === MonsWeb.Color.White : color === MonsWeb.Color.Black;
  const otherItemsToSetup = playerSideActive ? playerMoveStatusItems : opponentMoveStatusItems;
  const itemsToSetup = playerSideActive ? opponentMoveStatusItems : playerMoveStatusItems;
  updateStatusElements(itemsToSetup, moveKinds);
  updateStatusElements(otherItemsToSetup, otherPlayerStatuses);
}

function updateStatusElements(itemsToSetup: SVGElement[], moveKinds: Int32Array) {
  const monMoves = moveKinds[0];
  let manaMoves = moveKinds[1];
  let actions = moveKinds[2];
  let potions = moveKinds[3];
  const total = monMoves + manaMoves + actions + potions;
  for (const [index, item] of itemsToSetup.entries()) {
    if (index < total) {
      SVG.setHidden(item, false);
      if (manaMoves > 0) {
        SVG.setImage(item, emojis.statusMana);
        manaMoves -= 1;
      } else if (potions > 0) {
        SVG.setImage(item, emojis.statusPotion);
        potions -= 1;
      } else if (actions > 0) {
        SVG.setImage(item, emojis.statusAction);
        actions -= 1;
      } else {
        SVG.setImage(item, emojis.statusMove);
      }
    } else {
      SVG.setHidden(item, true);
    }
  }
}

export function removeItem(location: Location) {
  location = inBoardCoordinates(location);
  const locationKey = location.toString();
  const toRemove = items[locationKey];
  if (toRemove !== undefined) {
    removeItemAndCleanUpAnimation(toRemove);
    delete items[locationKey];
  }
}

export function showTimer(color: string, remainingSeconds: number) {
  const playerSideTimer = isFlipped ? color === "white" : color === "black";
  const timerElement = playerSideTimer ? playerTimer : opponentTimer;
  if (!timerElement) return;

  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  if (activeTimer && activeTimer !== timerElement) {
    SVG.setHidden(activeTimer, true);
    if (playerSideTimer) {
      showsOpponentTimer = false;
    } else {
      showsPlayerTimer = false;
    }
  }

  activeTimer = timerElement;
  updateTimerDisplay(timerElement, remainingSeconds);
  SVG.setHidden(timerElement, false);

  if (playerSideTimer) {
    showsPlayerTimer = true;
  } else {
    showsOpponentTimer = true;
  }

  const endTime = Date.now() + remainingSeconds * 1000;

  countdownInterval = setInterval(() => {
    const currentTime = Date.now();
    remainingSeconds = Math.max(0, Math.round((endTime - currentTime) / 1000));
    if (remainingSeconds <= 0) {
      clearInterval(countdownInterval!);
      countdownInterval = null;
    }
    updateTimerDisplay(timerElement, remainingSeconds);
  }, 1000);

  updateNamesX();
}

function updateTimerDisplay(timerElement: SVGElement, seconds: number) {
  const displayValue = Math.max(0, seconds);
  if (displayValue <= 10) {
    SVG.setFill(timerElement, "red");
  } else if (displayValue <= 30) {
    SVG.setFill(timerElement, "orange");
  } else {
    SVG.setFill(timerElement, "green");
  }
  timerElement.textContent = `${displayValue}s`;
}

export function hideTimerCountdownDigits() {
  showsPlayerTimer = false;
  showsOpponentTimer = false;

  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  if (playerTimer && opponentTimer) {
    SVG.setHidden(playerTimer, true);
    SVG.setHidden(opponentTimer, true);
  }
  activeTimer = null;
  updateNamesX();
}

export function updateScore(white: number, black: number, winnerColor?: MonsWeb.Color, resignedColor?: MonsWeb.Color, winByTimerColor?: MonsWeb.Color) {
  const victorySuffix = " 🏅";
  const surrenderSuffix = " 🏳️";

  let whiteSuffix = "";
  let blackSuffix = "";

  if (resignedColor !== null && resignedColor !== undefined) {
    if (resignedColor === MonsWeb.Color.Black) {
      blackSuffix = surrenderSuffix;
    } else {
      whiteSuffix = surrenderSuffix;
    }
  } else if (winnerColor !== null && winnerColor !== undefined) {
    if (winnerColor === MonsWeb.Color.Black) {
      blackSuffix = victorySuffix;
    } else {
      whiteSuffix = victorySuffix;
    }
  } else if (winByTimerColor !== null && winByTimerColor !== undefined) {
    if (winByTimerColor === MonsWeb.Color.Black) {
      blackSuffix = victorySuffix;
    } else {
      whiteSuffix = victorySuffix;
    }
  }

  const playerScore = isFlipped ? black : white;
  const opponentScore = isFlipped ? white : black;

  const playerSuffix = isFlipped ? blackSuffix : whiteSuffix;
  const opponentSuffix = isFlipped ? whiteSuffix : blackSuffix;

  if (playerScoreText && opponentScoreText) {
    playerScoreText.textContent = playerScore.toString() + playerSuffix;
    opponentScoreText.textContent = opponentScore.toString() + opponentSuffix;
  }

  showsPlayerEndOfGameSuffix = playerSuffix !== "";
  showsOpponentEndOfGameSuffix = opponentSuffix !== "";
  updateNamesX();
  renderPlayersNamesLabels();
}

export function hideItemSelection() {
  if (itemSelectionOverlay) {
    itemSelectionOverlay.remove();
  }
}

export function showItemSelection(): void {
  const overlay = document.createElementNS(SVG.ns, "g");
  itemSelectionOverlay = overlay;

  const background = document.createElementNS(SVG.ns, "rect");
  if (isPangchiuBoard) {
    SVG.setOrigin(background, -0.83, -0.84);
    background.style.transform = `scale(${1 / 0.85892388})`;
    SVG.setSizeStr(background, "100%", "1163.5");
  } else {
    SVG.setOrigin(background, 0, 0);
    SVG.setSizeStr(background, "100%", "1100");
  }

  SVG.setFill(background, colors.itemSelectionBackground);
  background.style.backdropFilter = "blur(3px)";
  overlay.appendChild(background);

  function createItemButton(x: number, y: number, asset: string, modifier: InputModifier): void {
    const button = document.createElementNS(SVG.ns, "foreignObject");
    button.setAttribute("x", x.toString());
    button.setAttribute("y", y.toString());
    button.setAttribute("width", "315");
    button.setAttribute("height", "315");
    button.setAttribute("class", "item");
    button.style.overflow = "visible";

    const div = document.createElementNS("http://www.w3.org/1999/xhtml", "div") as HTMLDivElement;
    div.style.width = "100%";
    div.style.height = "100%";
    div.style.display = "block";
    div.style.margin = "0";
    div.style.padding = "0";
    div.style.backgroundImage = `url(data:image/webp;base64,${asset})`;
    div.style.backgroundSize = "contain";
    div.style.backgroundPosition = "center";
    div.style.backgroundRepeat = "no-repeat";
    if (currentAssetsSet === AssetsSet.Pixel) {
      div.style.imageRendering = "pixelated";
    }
    button.appendChild(div);
    overlay.appendChild(button);

    const touchTarget = document.createElementNS(SVG.ns, "rect");
    touchTarget.setAttribute("x", x.toString());
    touchTarget.setAttribute("y", y.toString());
    touchTarget.setAttribute("width", "315");
    touchTarget.setAttribute("height", "315");
    SVG.setFill(touchTarget, "transparent");
    touchTarget.addEventListener(defaultInputEventName, (event) => {
      preventTouchstartIfNeeded(event);
      event.stopPropagation();
      didSelectInputModifier(modifier);
      overlay.remove();
    });
    overlay.appendChild(touchTarget);
  }

  createItemButton(220, 365, assets.bomb, InputModifier.Bomb);

  createItemButton(565, 365, assets.potion, InputModifier.Potion);

  background.addEventListener(defaultInputEventName, (event) => {
    preventTouchstartIfNeeded(event);
    event.stopPropagation();
    didSelectInputModifier(InputModifier.Cancel);
    overlay.remove();
  });

  itemsLayer?.appendChild(overlay);
}

export function addElementToItemsLayer(element: SVGElement, depth: number) {
  if (!itemsLayer) return;

  if (isPangchiuBoard) {
    const children = Array.from(itemsLayer.children);
    const insertionIndex = children.findIndex((child) => {
      const childDepth = Number(child.getAttribute("data-depth") || 0);
      return childDepth > depth;
    });

    element.setAttribute("data-depth", depth.toString());

    if (insertionIndex === -1) {
      itemsLayer.appendChild(element);
    } else {
      itemsLayer.insertBefore(element, children[insertionIndex]);
    }
  } else {
    itemsLayer.appendChild(element);
  }
}

export function putItem(item: MonsWeb.ItemModel, location: Location) {
  switch (item.kind) {
    case MonsWeb.ItemModelKind.Mon:
      const isBlack = item.mon?.color === MonsWeb.Color.Black;
      const isFainted = item.mon?.is_fainted();
      switch (item.mon?.kind) {
        case MonsWeb.MonKind.Demon:
          placeItem(isBlack ? demonB : demon, location, isBlack ? ItemKind.DemonBlack : ItemKind.Demon, isFainted);
          break;
        case MonsWeb.MonKind.Drainer:
          placeItem(isBlack ? drainerB : drainer, location, isBlack ? ItemKind.DrainerBlack : ItemKind.Drainer, isFainted);
          break;
        case MonsWeb.MonKind.Angel:
          placeItem(isBlack ? angelB : angel, location, isBlack ? ItemKind.AngelBlack : ItemKind.Angel, isFainted);
          break;
        case MonsWeb.MonKind.Spirit:
          placeItem(isBlack ? spiritB : spirit, location, isBlack ? ItemKind.SpiritBlack : ItemKind.Spirit, isFainted);
          break;
        case MonsWeb.MonKind.Mystic:
          placeItem(isBlack ? mysticB : mystic, location, isBlack ? ItemKind.MysticBlack : ItemKind.Mystic, isFainted);
          break;
      }
      break;
    case MonsWeb.ItemModelKind.Mana:
      switch (item.mana?.kind) {
        case MonsWeb.ManaKind.Regular:
          const isBlack = item.mana.color === MonsWeb.Color.Black;
          placeItem(isBlack ? manaB : mana, location, isBlack ? ItemKind.ManaBlack : ItemKind.Mana);
          break;
        case MonsWeb.ManaKind.Supermana:
          placeItem(supermana, location, ItemKind.Supermana);
          break;
      }
      break;
    case MonsWeb.ItemModelKind.MonWithMana:
      const isBlackDrainer = item.mon?.color === MonsWeb.Color.Black;
      const isSupermana = item.mana?.kind === MonsWeb.ManaKind.Supermana;
      if (isSupermana) {
        placeMonWithSupermana(isBlackDrainer ? drainerB : drainer, location, isBlackDrainer ? ItemKind.DrainerBlack : ItemKind.Drainer);
      } else {
        const isBlackMana = item.mana?.color === MonsWeb.Color.Black;
        placeMonWithMana(isBlackDrainer ? drainerB : drainer, isBlackMana ? manaB : mana, location, isBlackDrainer ? ItemKind.DrainerBlack : ItemKind.Drainer);
      }
      break;
    case MonsWeb.ItemModelKind.MonWithConsumable:
      const isBlackWithConsumable = item.mon?.color === MonsWeb.Color.Black;
      switch (item.mon?.kind) {
        case MonsWeb.MonKind.Demon:
          placeMonWithBomb(isBlackWithConsumable ? demonB : demon, location, isBlackWithConsumable ? ItemKind.DemonBlack : ItemKind.Demon);
          break;
        case MonsWeb.MonKind.Drainer:
          placeMonWithBomb(isBlackWithConsumable ? drainerB : drainer, location, isBlackWithConsumable ? ItemKind.DrainerBlack : ItemKind.Drainer);
          break;
        case MonsWeb.MonKind.Angel:
          placeMonWithBomb(isBlackWithConsumable ? angelB : angel, location, isBlackWithConsumable ? ItemKind.AngelBlack : ItemKind.Angel);
          break;
        case MonsWeb.MonKind.Spirit:
          placeMonWithBomb(isBlackWithConsumable ? spiritB : spirit, location, isBlackWithConsumable ? ItemKind.SpiritBlack : ItemKind.Spirit);
          break;
        case MonsWeb.MonKind.Mystic:
          placeMonWithBomb(isBlackWithConsumable ? mysticB : mystic, location, isBlackWithConsumable ? ItemKind.MysticBlack : ItemKind.Mystic);
          break;
      }
      break;
    case MonsWeb.ItemModelKind.Consumable:
      placeItem(bombOrPotion, location, ItemKind.Consumable, false, true);
      break;
  }
}

export function setupSquare(square: MonsWeb.SquareModel, location: Location) {
  if (square.kind === MonsWeb.SquareModelKind.MonBase) {
    const isBlack = square.color === MonsWeb.Color.Black;
    switch (square.mon_kind) {
      case MonsWeb.MonKind.Demon:
        setBase(isBlack ? demonB : demon, location);
        break;
      case MonsWeb.MonKind.Drainer:
        setBase(isBlack ? drainerB : drainer, location);
        break;
      case MonsWeb.MonKind.Angel:
        setBase(isBlack ? angelB : angel, location);
        break;
      case MonsWeb.MonKind.Spirit:
        setBase(isBlack ? spiritB : spirit, location);
        break;
      case MonsWeb.MonKind.Mystic:
        setBase(isBlack ? mysticB : mystic, location);
        break;
    }
  }
}

function seeIfShouldOffsetFromBorders(): boolean {
  return window.innerWidth / window.innerHeight < 0.72;
}

function getOuterElementsMultiplicator(): number {
  return Math.min(420 / boardBackgroundLayer!.getBoundingClientRect().width, 1);
}

function getAvatarSize(): number {
  return 0.777 * getOuterElementsMultiplicator();
}

function updateNamesX() {
  if (playerNameText === undefined || opponentNameText === undefined) {
    return;
  }

  const multiplicator = getOuterElementsMultiplicator();

  const offsetX = seeIfShouldOffsetFromBorders() ? minHorizontalOffset : 0;

  let initialX = offsetX + 1.45 * multiplicator + 0.1;
  const timerDelta = 0.95 * multiplicator;
  const statusDelta = 0.67 * multiplicator;

  const playerDelta = (showsPlayerEndOfGameSuffix ? statusDelta : 0) + (showsPlayerTimer ? timerDelta : 0);
  const opponentDelta = (showsOpponentEndOfGameSuffix ? statusDelta : 0) + (showsOpponentTimer ? timerDelta : 0);

  SVG.setX(playerNameText, initialX + playerDelta);
  SVG.setX(opponentNameText, initialX + opponentDelta);
}

export async function setupGameInfoElements(allHiddenInitially: boolean) {
  const statusMove = loadImage(emojis.statusMove, "statusMoveEmoji");

  const updateLayout = () => {
    const multiplicator = getOuterElementsMultiplicator();

    let shouldOffsetFromBorders = seeIfShouldOffsetFromBorders();
    const offsetX = shouldOffsetFromBorders ? minHorizontalOffset : 0;

    for (const isOpponent of [true, false]) {
      const avatarSize = getAvatarSize();
      const numberText = isOpponent ? opponentScoreText! : playerScoreText!;
      const timerText = isOpponent ? opponentTimer! : playerTimer!;
      const nameText = isOpponent ? opponentNameText! : playerNameText!;

      const y = isOpponent ? 1 - avatarSize * 1.203 : isPangchiuBoard ? 12.75 : 12.16;

      SVG.setOrigin(numberText, offsetX + avatarSize * 1.21, y + avatarSize * 0.73);
      SVG.setOrigin(timerText, offsetX + avatarSize * 1.85, y + avatarSize * 0.73);
      SVG.setOrigin(nameText, 0, y + avatarSize * 0.65);

      numberText.setAttribute("font-size", (50 * multiplicator).toString());
      timerText.setAttribute("font-size", (50 * multiplicator).toString());
      nameText.setAttribute("font-size", (32 * multiplicator).toString());

      const statusItemsOffsetX = shouldOffsetFromBorders ? 0.15 * multiplicator : 0;
      const statusItemsY = y + avatarSize * (isOpponent ? 0.23 : 0.1);
      const statusItemSize = 0.5 * multiplicator;

      for (let x = 0; x < 9; x++) {
        const img = isOpponent ? opponentMoveStatusItems[x] : playerMoveStatusItems[x];
        SVG.setFrame(img, 11 - (1.15 * x + 1) * statusItemSize - statusItemsOffsetX, statusItemsY, statusItemSize, statusItemSize);
      }

      const avatar = isOpponent ? opponentAvatar! : playerAvatar!;
      SVG.setFrame(avatar, offsetX, y, avatarSize, avatarSize);
    }

    updateNamesX();
  };

  window.addEventListener("resize", updateLayout);

  const [playerEmojiId, playerEmoji] = emojis.getRandomEmoji();
  const [opponentEmojiId, opponentEmoji] = emojis.getRandomEmojiOtherThan(playerEmojiId);

  playerSideMetadata.emojiId = playerEmojiId;
  opponentSideMetadata.emojiId = opponentEmojiId;

  for (const isOpponent of [true, false]) {
    const numberText = document.createElementNS(SVG.ns, "text");
    SVG.setFill(numberText, colors.scoreText);
    SVG.setOpacity(numberText, 0.69);
    numberText.setAttribute("font-weight", "600");
    numberText.textContent = allHiddenInitially ? "" : "0";
    controlsLayer?.append(numberText);
    if (isOpponent) {
      opponentScoreText = numberText;
    } else {
      playerScoreText = numberText;
    }

    const timerText = document.createElementNS(SVG.ns, "text");
    SVG.setFill(timerText, "green");
    SVG.setOpacity(timerText, 0.69);
    timerText.setAttribute("font-weight", "600");
    timerText.textContent = "";
    controlsLayer?.append(timerText);
    if (isOpponent) {
      opponentTimer = timerText;
    } else {
      playerTimer = timerText;
    }

    const nameText = document.createElementNS(SVG.ns, "text");
    SVG.setFill(nameText, colors.scoreText);
    SVG.setOpacity(nameText, 0.69);
    nameText.setAttribute("font-weight", "270");
    nameText.setAttribute("font-style", "italic");
    nameText.style.cursor = "pointer";
    controlsLayer?.append(nameText);

    nameText.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!isOpponent && !isWatchOnly) {
        return;
      }

      if (canRedirectToEthAddress(isOpponent) && didNotDismissAnythingWithOutsideTapJustNow()) {
        redirectToEthAddress(isOpponent);
        SVG.setFill(nameText, colors.scoreText);
      }
    });

    nameText.addEventListener("mouseenter", () => {
      if (!isOpponent && !isWatchOnly) {
        return;
      }

      if (canRedirectToEthAddress(isOpponent)) {
        SVG.setFill(nameText, "#0071F9");
      }
    });

    nameText.addEventListener("mouseleave", () => {
      SVG.setFill(nameText, colors.scoreText);
    });

    nameText.addEventListener("touchend", () => {
      setTimeout(() => {
        SVG.setFill(nameText, colors.scoreText);
      }, 100);
    });

    if (isOpponent) {
      opponentNameText = nameText;
    } else {
      playerNameText = nameText;
    }

    for (let x = 0; x < 9; x++) {
      const img = statusMove.cloneNode() as SVGElement;
      controlsLayer?.appendChild(img);

      if (isOpponent) {
        opponentMoveStatusItems.push(img);
      } else {
        playerMoveStatusItems.push(img);
      }

      const isActiveSide = isFlipped ? isOpponent : !isOpponent;
      if (isActiveSide) {
        if (allHiddenInitially || x > 4) {
          SVG.setHidden(img, true);
        }
      } else {
        SVG.setHidden(img, true);
      }
    }

    const avatar = loadImage(isOpponent ? opponentEmoji : playerEmoji, "avatar");
    avatar.style.pointerEvents = "auto";
    controlsLayer?.append(avatar);
    if (isOpponent) {
      opponentAvatar = avatar;
    } else {
      playerAvatar = avatar;
    }

    if (allHiddenInitially) {
      SVG.setHidden(avatar, true);
    }

    avatar.addEventListener(defaultInputEventName, (event) => {
      event.stopPropagation();
      preventTouchstartIfNeeded(event);

      const shouldChangeEmoji = canChangeEmoji(isOpponent);

      if (isOpponent) {
        if (shouldChangeEmoji) {
          pickAndDisplayDifferentEmoji(avatar, isOpponent);
          playSounds([Sound.Click]);
        }

        popOpponentsEmoji();
      } else {
        if (shouldChangeEmoji) {
          pickAndDisplayDifferentEmoji(avatar, isOpponent);
          playSounds([Sound.Click]);
        }

        if (!isModernAndPowerful) {
          return;
        }

        if (isDesktopSafari) {
          const scale = 1.8;
          const sizeString = (getAvatarSize() * 100).toString();
          const newSizeString = (getAvatarSize() * 100 * scale).toString();

          avatar.animate(
            [
              {
                width: sizeString,
                height: sizeString,
                transform: "translate(0, 0)",
                easing: "ease-out",
              },
              {
                width: newSizeString,
                height: newSizeString,
                transform: `translate(0px, -${getAvatarSize() * 100}pt)`,
                easing: "ease-in-out",
              },
              {
                width: sizeString,
                height: sizeString,
                transform: "translate(0, 0)",
                easing: "ease-in",
              },
            ],
            {
              duration: 420,
              fill: "forwards",
            }
          );
        } else {
          avatar.style.transformOrigin = `0px ${isPangchiuBoard ? 1369 : 1300}px`;
          avatar.style.transform = "scale(1.8)";
          avatar.style.transition = "transform 0.3s";
          setTimeout(() => {
            avatar.style.transform = "scale(1)";
          }, 300);
        }
      }
    });
  }

  updateLayout();

  if (!allHiddenInitially) {
    renderPlayersNamesLabels();
  }
}

function pickAndDisplayDifferentEmoji(avatar: SVGElement, isOpponent: boolean) {
  if (isOpponent) {
    const [newId, newEmoji] = emojis.getRandomEmojiOtherThan(opponentSideMetadata.emojiId);
    updateEmoji(parseInt(newId));
    opponentSideMetadata.emojiId = newId;
    SVG.setImage(avatar, newEmoji);
  } else {
    const [newId, newEmoji] = emojis.getRandomEmojiOtherThan(playerSideMetadata.emojiId);
    updateEmoji(parseInt(newId));
    playerSideMetadata.emojiId = newId;
    SVG.setImage(avatar, newEmoji);
  }
}

export function setupBoard() {
  initializeBoardElements();

  document.addEventListener(defaultInputEventName, function (event) {
    if (!didNotDismissAnythingWithOutsideTapJustNow() || hasMainMenuPopupsVisible() || hasBottomPopupsVisible()) {
      return;
    }

    const target = event.target as SVGElement;
    if (target && target.nodeName === "rect" && target.classList.contains("board-rect")) {
      const rawX = parseInt(target.getAttribute("x") || "-100") / 100;
      const rawY = parseInt(target.getAttribute("y") || "-100") / 100;

      const x = isFlipped ? 10 - rawX : rawX;
      const y = isFlipped ? 10 - rawY : rawY;

      didClickSquare(new Location(y, x));
      event.preventDefault();
      event.stopPropagation();
    } else if (!target.closest("a, button, select")) {
      if (itemSelectionOverlay) {
        itemSelectionOverlay.remove();
      }
      didClickSquare(new Location(-1, -1));
      event.preventDefault();
      event.stopPropagation();
    }
  });

  for (let y = 0; y < 11; y++) {
    for (let x = 0; x < 11; x++) {
      const rect = document.createElementNS(SVG.ns, "rect");
      SVG.setFrame(rect, x, y, 1, 1);
      SVG.setFill(rect, "transparent");
      rect.classList.add("board-rect");
      itemsLayer?.appendChild(rect);
    }
  }

  for (const location of [new Location(0, 0), new Location(10, 0), new Location(0, 10), new Location(10, 10)]) {
    addWaves(location);
  }
}

export function removeHighlights() {
  while (highlightsLayer?.firstChild) {
    highlightsLayer.removeChild(highlightsLayer.firstChild);
  }
}

export function applyHighlights(highlights: Highlight[]) {
  highlights.forEach((highlight) => {
    switch (highlight.kind) {
      case HighlightKind.Selected:
        highlightSelectedItem(highlight.location, highlight.color);
        break;
      case HighlightKind.EmptySquare:
        highlightEmptyDestination(highlight.location, highlight.color);
        break;
      case HighlightKind.TargetSuggestion:
        highlightDestinationItem(highlight.location, highlight.color);
        break;
      case HighlightKind.StartFromSuggestion:
        highlightStartFromSuggestion(highlight.location, highlight.color);
        break;
    }
  });
}

export function popOpponentsEmoji() {
  if (!isModernAndPowerful || !opponentAvatar) {
    return;
  }

  opponentAvatar.style.transition = "transform 0.3s";
  opponentAvatar.style.transform = "scale(1.8)";
  setTimeout(() => {
    if (!opponentAvatar) return;
    opponentAvatar.style.transform = "scale(1)";
  }, 300);
}

export function drawTrace(trace: Trace) {
  const from = inBoardCoordinates(trace.from);
  const to = inBoardCoordinates(trace.to);

  const gradient = document.createElementNS(SVG.ns, "linearGradient");
  gradient.setAttribute("id", `trace-gradient-${from.toString()}-${to.toString()}`);
  const colors = getTraceColors();

  const stop1 = document.createElementNS(SVG.ns, "stop");
  stop1.setAttribute("offset", "0%");
  stop1.setAttribute("stop-color", colors[1]);
  gradient.appendChild(stop1);

  const stop2 = document.createElementNS(SVG.ns, "stop");
  stop2.setAttribute("offset", "100%");
  stop2.setAttribute("stop-color", colors[0]);
  gradient.appendChild(stop2);
  board?.appendChild(gradient);

  const rect = document.createElementNS(SVG.ns, "rect");
  const fromCenter = { x: from.j + 0.5, y: from.i + 0.5 };
  const toCenter = { x: to.j + 0.5, y: to.i + 0.5 };
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const transform = `translate(${fromCenter.x * 100},${fromCenter.y * 100}) rotate(${angle})`;

  SVG.setFrame(rect, 0, -0.1, length, isPangchiuBoard ? 0.23 : 0.2);
  rect.setAttribute("transform", transform);

  SVG.setFill(rect, `url(#trace-gradient-${from.toString()}-${to.toString()})`);
  board?.append(rect);

  const fadeOut = rect.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: 2000,
    easing: isPangchiuBoard ? "ease-in" : "ease-out",
  });

  fadeOut.onfinish = () => {
    rect.remove();
    gradient.remove();
  };
}

export function hasBasePlaceholder(location: Location): boolean {
  location = inBoardCoordinates(location);
  const key = location.toString();
  return basesPlaceholders.hasOwnProperty(key);
}

function placeMonWithBomb(item: SVGElement, location: Location, baseItemKind: ItemKind) {
  location = inBoardCoordinates(location);
  const img = item.cloneNode(true) as SVGElement;
  SVG.setOrigin(img, location.j, location.i);

  const carriedBomb = bomb.cloneNode(true) as SVGElement;
  SVG.setFrame(carriedBomb, location.j + 0.54, location.i + 0.52, 0.5, 0.5);

  const container = document.createElementNS(SVG.ns, "g");
  container.appendChild(img);
  container.appendChild(carriedBomb);

  addElementToItemsLayer(container, location.i);
  items[location.toString()] = container;
  startAnimation(img);

  if (isPangchiuBoard) {
    setCenterTranformOrigin(img, location);
    applyDefaultPangchiuBoardTransform(img);
    applySpecificItemKindPangchiuBoardTransform(img, location, baseItemKind);
    SVG.setFrame(carriedBomb, location.j + 0.54, location.i + 0.52, 0.75, 0.75);
  }
}

function placeMonWithSupermana(item: SVGElement, location: Location, baseItemKind: ItemKind) {
  location = inBoardCoordinates(location);
  const img = item.cloneNode(true) as SVGElement;
  SVG.setOrigin(img, location.j, location.i);

  const carriedMana = supermanaSimple.cloneNode(true) as SVGElement;
  if (item.getAttribute("data-is-sprite-sheet") === "true") {
    SVG.setFrame(carriedMana, location.j + 0.13, location.i - 0.11, 0.74, 0.74);
  } else {
    SVG.setFrame(carriedMana, location.j + 0.14, location.i - 0.11, 0.72, 0.72);
  }

  const container = document.createElementNS(SVG.ns, "g");
  container.appendChild(img);
  container.appendChild(carriedMana);

  addElementToItemsLayer(container, location.i);
  items[location.toString()] = container;
  startAnimation(img);

  if (isPangchiuBoard) {
    setCenterTranformOrigin(img, location);
    applyDefaultPangchiuBoardTransform(img);
    applySpecificItemKindPangchiuBoardTransform(img, location, baseItemKind);
    const xDelta = baseItemKind === ItemKind.Drainer ? 0.03 : -0.03;
    const yDelta = baseItemKind === ItemKind.Drainer ? 0.55 : 0.63;
    SVG.setFrame(carriedMana, location.j - xDelta, location.i - yDelta, 1, 1);
  }
}

function placeMonWithMana(item: SVGElement, mana: SVGElement, location: Location, baseItemKind: ItemKind) {
  location = inBoardCoordinates(location);
  const img = item.cloneNode(true) as SVGElement;
  SVG.setOrigin(img, location.j, location.i);

  const carriedMana = mana.cloneNode(true) as SVGElement;
  SVG.setFrame(carriedMana, location.j + 0.35, location.i + 0.27, 0.93, 0.93);

  const container = document.createElementNS(SVG.ns, "g");
  container.appendChild(img);
  container.appendChild(carriedMana);

  addElementToItemsLayer(container, location.i);
  items[location.toString()] = container;
  startAnimation(img);

  if (isPangchiuBoard) {
    setCenterTranformOrigin(img, location);
    applyDefaultPangchiuBoardTransform(img);
    applySpecificItemKindPangchiuBoardTransform(img, location, baseItemKind);
    SVG.setFrame(carriedMana, location.j + 0.23, location.i + 0.15, 1.34, 1.34);
  }
}

function setCenterTranformOrigin(item: SVGElement, location: Location) {
  const centerX = location.j * 100 + 50;
  const centerY = location.i * 100 + 50;
  item.style.transformOrigin = `${centerX}px ${centerY}px`;
}

function applyDefaultPangchiuBoardTransform(item: SVGElement) {
  item.style.transform = "scale(1.39)";
}

function applySpecificItemKindPangchiuBoardTransform(item: SVGElement, location: Location, kind: ItemKind) {
  switch (kind) {
    case ItemKind.Mana:
    case ItemKind.ManaBlack:
      if (location.i === 0) {
        break;
      } else if (location.i === 7 && location.j === 4) {
        item.style.transform += ` translate(-3px, -3px)`;
      } else if (location.i < 5) {
        item.style.transform += ` translate(0px, -10px)`;
      } else {
        item.style.transform += ` translate(2px, -5px)`;
      }
      break;
    case ItemKind.Supermana:
      item.style.transform += ` translate(0px, -8px)`;
      break;
    case ItemKind.Demon:
      item.style.transform += ` translate(0px, -6px)`;
      break;
    case ItemKind.DemonBlack:
      item.style.transform += ` translate(7px, -13px)`;
      break;
    case ItemKind.Drainer:
      item.style.transform += ` translate(0px, -6px)`;
      break;
    case ItemKind.DrainerBlack:
      item.style.transform += ` translate(2px, -10px)`;
      break;
    case ItemKind.Angel:
      item.style.transform += ` translate(0px, 0px)`;
      break;
    case ItemKind.AngelBlack:
      item.style.transform += ` translate(2px, -5px)`;
      break;
    case ItemKind.Spirit:
      item.style.transform += ` translate(0px, -7px)`;
      break;
    case ItemKind.SpiritBlack:
      item.style.transform += ` translate(-4px, -11px)`;
      break;
    case ItemKind.Mystic:
      item.style.transform += ` translate(-6px, -11px)`;
      break;
    case ItemKind.MysticBlack:
      item.style.transform += ` translate(-6px, -17px)`;
      break;
    case ItemKind.Consumable:
      item.style.transform += ` translate(${location.j < 5 ? -14 : 12}px, -8px)`;
      break;
  }
}

function placeItem(item: SVGElement, location: Location, kind: ItemKind, fainted = false, sparkles = false) {
  const logicalLocation = location;
  location = inBoardCoordinates(location);
  const key = location.toString();
  if (hasBasePlaceholder(logicalLocation)) {
    SVG.setHidden(basesPlaceholders[key], true);
  }
  const img = item.cloneNode(true) as SVGElement;
  setCenterTranformOrigin(img, location);

  if (isPangchiuBoard) {
    applyDefaultPangchiuBoardTransform(img);
    applySpecificItemKindPangchiuBoardTransform(img, location, kind);
  }
  if (fainted) {
    SVG.setOrigin(img, location.j, location.i);
    img.style.transform = "rotate(90deg)";
    addElementToItemsLayer(img, location.i);
    items[key] = img;
  } else if (sparkles) {
    const container = document.createElementNS(SVG.ns, "g");
    const sparkles = createSparklingContainer(location);
    SVG.setOrigin(img, location.j, location.i);
    container.appendChild(sparkles);
    container.appendChild(img);
    addElementToItemsLayer(container, location.i);
    items[key] = container;
  } else {
    SVG.setOrigin(img, location.j, location.i);
    addElementToItemsLayer(img, location.i);
    items[key] = img;
  }
  startAnimation(img, fainted);
}

function createSparklingContainer(location: Location): SVGElement {
  const container = document.createElementNS(SVG.ns, "g");
  container.setAttribute("class", "item");
  container.setAttribute("data-assets-pixel-only", "true");
  SVG.setHidden(container, currentAssetsSet !== AssetsSet.Pixel);

  const mask = document.createElementNS(SVG.ns, "mask");
  mask.setAttribute("id", `mask-square-${location.toString()}`);

  const rect = document.createElementNS(SVG.ns, "rect");
  SVG.setFrame(rect, location.j, location.i, 1, 1);
  SVG.setFill(rect);

  mask.appendChild(rect);
  container.appendChild(mask);
  container.setAttribute("mask", `url(#mask-square-${location.toString()})`);

  if (!isModernAndPowerful) {
    for (let i = 0; i < 19; i++) {
      createSparkleParticle(location, container, false);
    }
  } else {
    const intervalId = setInterval(() => {
      if (!container.parentNode?.parentNode) {
        clearInterval(intervalId);
        return;
      }
      createSparkleParticle(location, container);
    }, 230);
  }

  return container;
}

function createSparkleParticle(location: Location, container: SVGElement, animating: boolean = true) {
  const particle = sparkle.cloneNode(true) as SVGElement;
  const y = location.i + Math.random();
  const size = Math.random() * 0.05 + 0.075;
  const opacity = 0.3 + 0.42 * Math.random();
  SVG.setFrame(particle, location.j + Math.random(), y, size, size);
  SVG.setOpacity(particle, opacity);
  container.appendChild(particle);

  if (!animating) {
    return;
  }

  const velocity = (4 + 2 * Math.random()) * 0.01;
  const duration = Math.random() * 1000 + 2500;
  let startTime: number | null = null;

  function animateParticle(time: number) {
    if (!startTime) {
      startTime = time;
    }

    let timeDelta = time - startTime;
    let progress = timeDelta / duration;
    if (progress > 1) {
      container.removeChild(particle);
      return;
    }

    particle.setAttribute("y", ((y - (velocity * timeDelta) / 1000) * 100).toString());
    SVG.setOpacity(particle, Math.max(0, opacity - (0.15 * timeDelta) / 1000));
    requestAnimationFrame(animateParticle);
  }

  requestAnimationFrame(animateParticle);
}

function setBase(item: SVGElement, location: Location) {
  const logicalLocation = location;
  location = inBoardCoordinates(location);
  const key = location.toString();
  if (hasBasePlaceholder(logicalLocation)) {
    SVG.setHidden(basesPlaceholders[key], false);
  } else {
    let img: SVGElement;
    const isSpriteSheet = item.getAttribute("data-is-sprite-sheet") === "true";
    if (!isCustomPictureBoardEnabled) {
      img = item.cloneNode(true) as SVGElement;
      const firstChild = img.children[0] as HTMLElement;
      firstChild.style.backgroundBlendMode = "saturation";
      firstChild.style.backgroundColor = ((location.i + location.j) % 2 === 0 ? colors.lightSquare : colors.darkSquare) + "85";
    } else {
      img = document.createElementNS(SVG.ns, "image");
      SVG.setOpacity(img, 0.5);
      if (currentAssetsSet === AssetsSet.Pixel || isSpriteSheet) {
        img.style.imageRendering = "pixelated";
      }
      const firstChild = item.children[0] as HTMLElement;
      img.setAttribute("href", firstChild.style.backgroundImage.slice(5, -2));

      if (isSpriteSheet) {
        img.setAttribute("data-is-sprite-sheet", "true");
        img.setAttribute("data-total-frames", item.getAttribute("data-total-frames") || "4");
        img.setAttribute("data-frame-duration", item.getAttribute("data-frame-duration") || "169");
      }
    }

    if (isSpriteSheet) {
      img.setAttribute("data-frame-width", "0.6");
      img.setAttribute("data-frame-height", "0.6");
      SVG.setFrame(img, location.j + 0.2, location.i + 0.2, 0.6 * 4, 0.6);
    } else {
      SVG.setFrame(img, location.j + 0.2, location.i + 0.2, 0.6, 0.6);
    }

    board?.appendChild(img);
    basesPlaceholders[key] = img;

    if (isSpriteSheet) {
      startAnimation(img, true);
    }
  }
}

function highlightEmptyDestination(location: Location, color: string) {
  location = inBoardCoordinates(location);
  let highlight: SVGElement;

  if (isPangchiuBoard) {
    highlight = document.createElementNS(SVG.ns, "rect");
    const side = 0.27;
    const originOffset = (1 - side) * 0.5;
    SVG.setFrame(highlight, location.j + originOffset, location.i + originOffset, side, side);
    highlight.setAttribute("rx", "7");
    highlight.setAttribute("ry", "7");
    highlight.style.mixBlendMode = "color";
  } else {
    highlight = SVG.circle(location.j + 0.5, location.i + 0.5, 0.15);
  }

  highlight.style.pointerEvents = "none";
  SVG.setFill(highlight, color);
  highlightsLayer?.append(highlight);
}

function highlightSelectedItem(location: Location, color: string) {
  location = inBoardCoordinates(location);

  if (isPangchiuBoard) {
    const highlight = document.createElementNS(SVG.ns, "rect");
    highlight.style.pointerEvents = "none";
    SVG.setFill(highlight, color);
    SVG.setFrame(highlight, location.j, location.i, 1, 1);
    highlight.setAttribute("rx", "10");
    highlight.setAttribute("ry", "10");
    highlight.style.mixBlendMode = "color";
    highlightsLayer?.append(highlight);
  } else {
    const highlight = document.createElementNS(SVG.ns, "g");
    highlight.style.pointerEvents = "none";

    const circle = SVG.circle(location.j + 0.5, location.i + 0.5, 0.56);
    SVG.setFill(circle, color);

    const mask = document.createElementNS(SVG.ns, "mask");
    mask.setAttribute("id", `highlight-mask-${location.toString()}`);
    const maskRect = document.createElementNS(SVG.ns, "rect");
    SVG.setFrame(maskRect, location.j, location.i, 1, 1);
    SVG.setFill(maskRect);
    mask.appendChild(maskRect);
    highlight.appendChild(mask);

    circle.setAttribute("mask", `url(#highlight-mask-${location.toString()})`);
    highlight.appendChild(circle);
    highlightsLayer?.append(highlight);
  }
}

function highlightStartFromSuggestion(location: Location, color: string) {
  location = inBoardCoordinates(location);
  let highlight: SVGElement;

  if (isPangchiuBoard) {
    highlight = document.createElementNS(SVG.ns, "rect");
    highlight.style.pointerEvents = "none";
    SVG.setFill(highlight, color);
    SVG.setFrame(highlight, location.j, location.i, 1, 1);
    highlight.setAttribute("rx", "10");
    highlight.setAttribute("ry", "10");
    highlight.setAttribute("stroke", color);
    highlight.setAttribute("stroke-width", "1");
    highlight.style.mixBlendMode = "color";
  } else {
    highlight = document.createElementNS(SVG.ns, "g");
    highlight.style.pointerEvents = "none";

    const circle = SVG.circle(location.j + 0.5, location.i + 0.5, 0.56);
    SVG.setFill(circle, color);

    circle.setAttribute("stroke", colors.startFromStroke);
    circle.setAttribute("stroke-width", "0.023");

    const mask = document.createElementNS(SVG.ns, "mask");
    mask.setAttribute("id", `highlight-mask-${location.toString()}`);
    const maskRect = document.createElementNS(SVG.ns, "rect");
    SVG.setFrame(maskRect, location.j, location.i, 1, 1);
    SVG.setFill(maskRect);
    mask.appendChild(maskRect);
    highlight.appendChild(mask);

    circle.setAttribute("mask", `url(#highlight-mask-${location.toString()})`);
    SVG.setOpacity(highlight, 0.69);
    highlight.appendChild(circle);
  }

  highlightsLayer?.append(highlight);

  setTimeout(() => {
    highlight.remove();
  }, 100);
}

function highlightDestinationItem(location: Location, color: string) {
  location = inBoardCoordinates(location);

  if (isPangchiuBoard) {
    const highlight = document.createElementNS(SVG.ns, "g");
    highlight.style.pointerEvents = "none";

    const rect = document.createElementNS(SVG.ns, "rect");
    SVG.setFrame(rect, location.j, location.i, 1, 1);
    rect.setAttribute("rx", "10");
    rect.setAttribute("ry", "10");
    rect.setAttribute("stroke", color);
    rect.setAttribute("stroke-width", "13");
    rect.style.mixBlendMode = "color";
    SVG.setFill(rect, "transparent");

    const mask = document.createElementNS(SVG.ns, "mask");
    mask.setAttribute("id", `highlight-mask-${location.toString()}`);

    const maskBg = document.createElementNS(SVG.ns, "rect");
    SVG.setFrame(maskBg, location.j, location.i, 1, 1);
    SVG.setFill(maskBg, "white");
    maskBg.setAttribute("stroke", "white");
    maskBg.setAttribute("stroke-width", "13");
    mask.appendChild(maskBg);

    const cutTop = document.createElementNS(SVG.ns, "rect");
    SVG.setFrame(cutTop, location.j + 0.3, location.i - 0.1, 0.4, 0.2);
    SVG.setFill(cutTop, "black");
    mask.appendChild(cutTop);

    const cutRight = document.createElementNS(SVG.ns, "rect");
    SVG.setFrame(cutRight, location.j + 0.9, location.i + 0.3, 0.2, 0.4);
    SVG.setFill(cutRight, "black");
    mask.appendChild(cutRight);

    const cutBottom = document.createElementNS(SVG.ns, "rect");
    SVG.setFrame(cutBottom, location.j + 0.3, location.i + 0.9, 0.4, 0.2);
    SVG.setFill(cutBottom, "black");
    mask.appendChild(cutBottom);

    const cutLeft = document.createElementNS(SVG.ns, "rect");
    SVG.setFrame(cutLeft, location.j - 0.1, location.i + 0.3, 0.2, 0.4);
    SVG.setFill(cutLeft, "black");
    mask.appendChild(cutLeft);

    highlight.appendChild(mask);
    highlight.appendChild(rect);
    rect.setAttribute("mask", `url(#highlight-mask-${location.toString()})`);

    highlightsLayer?.append(highlight);
  } else {
    const highlight = document.createElementNS(SVG.ns, "g");
    highlight.style.pointerEvents = "none";

    const rect = document.createElementNS(SVG.ns, "rect");
    SVG.setFrame(rect, location.j, location.i, 1, 1);
    SVG.setFill(rect, color);

    const mask = document.createElementNS(SVG.ns, "mask");
    mask.setAttribute("id", `highlight-mask-${location.toString()}`);

    const maskRect = document.createElementNS(SVG.ns, "rect");
    SVG.setFrame(maskRect, location.j, location.i, 1, 1);
    SVG.setFill(maskRect);
    mask.appendChild(maskRect);

    const maskCircle = SVG.circle(location.j + 0.5, location.i + 0.5, 0.56);
    SVG.setFill(maskCircle, "black");
    mask.appendChild(maskCircle);

    highlight.appendChild(mask);
    highlight.appendChild(rect);

    rect.setAttribute("mask", `url(#highlight-mask-${location.toString()})`);

    highlightsLayer?.append(highlight);
  }
}

function getTraceColors(): string[] {
  const isGradient = !isPangchiuBoard;

  if (traceIndex === (isGradient ? 6 : 7)) {
    traceIndex = 0;
  }

  traceIndex += 1;

  const a = colors.getRainbow(traceIndex.toString());
  const b = colors.getRainbow((traceIndex + (isGradient ? 1 : 0)).toString());

  return [a, b];
}

function addWaves(location: Location) {
  location = inBoardCoordinates(location);
  const wavesSquareElement = document.createElementNS(SVG.ns, "g");
  wavesSquareElement.setAttribute("data-assets-pixel-only", "true");
  SVG.setHidden(wavesSquareElement, currentAssetsSet !== AssetsSet.Pixel);
  wavesSquareElement.setAttribute("transform", `translate(${location.j * 100}, ${location.i * 100})`);
  SVG.setOpacity(wavesSquareElement, 0.5);
  board?.appendChild(wavesSquareElement);

  let frameIndex = 0;
  wavesSquareElement.appendChild(getWavesFrame(location, frameIndex));
  if (!isModernAndPowerful) {
    return;
  }
  setInterval(() => {
    frameIndex = (frameIndex + 1) % 9;
    wavesSquareElement.innerHTML = "";
    wavesSquareElement.appendChild(getWavesFrame(location, frameIndex));
  }, 200);
}

function getWavesFrame(location: Location, frameIndex: number) {
  const pixel = 1 / 32;
  const key = location.toString() + frameIndex.toString();
  if (!wavesFrames[key]) {
    if (frameIndex === 0) {
      const frame = document.createElementNS(SVG.ns, "g");
      for (let i = 0; i < 10; i++) {
        const width = (Math.floor(Math.random() * 4) + 3) * pixel;
        const x = Math.random() * (1 - width);
        const y = pixel * (2 + i * 3);
        const baseColor = i % 2 === 0 ? colors.wave1 : colors.wave2;

        const baseBottomRect = document.createElementNS(SVG.ns, "rect");
        SVG.setFrame(baseBottomRect, x, y, width, pixel);
        SVG.setFill(baseBottomRect, baseColor);
        baseBottomRect.setAttribute("class", `wave-bottom ${i % 2 === 0 ? "wave1" : "wave2"}`);

        const slidingBottomRect = document.createElementNS(SVG.ns, "rect");
        SVG.setFrame(slidingBottomRect, x + width, y, 0, pixel);
        SVG.setFill(slidingBottomRect, colors.manaPool);
        slidingBottomRect.setAttribute("class", "wave-bottom poolBackground");

        const slidingTopRect = document.createElementNS(SVG.ns, "rect");
        SVG.setFrame(slidingTopRect, x + width, y - pixel, 0, pixel);
        SVG.setFill(slidingTopRect, baseColor);
        slidingTopRect.setAttribute("class", `wave-top ${i % 2 === 0 ? "wave1" : "wave2"}`);

        frame.appendChild(baseBottomRect);
        frame.appendChild(slidingTopRect);
        frame.appendChild(slidingBottomRect);
      }
      wavesFrames[key] = frame;
    } else {
      const prevKey = location.toString() + (frameIndex - 1).toString();
      const frame = wavesFrames[prevKey].cloneNode(true) as SVGElement;

      const baseBottomRects = frame.querySelectorAll(".wave-bottom:not(.poolBackground)");
      const slidingBottomRects = frame.querySelectorAll(".wave-bottom.poolBackground");
      const slidingTopRects = frame.querySelectorAll(".wave-top");

      for (let i = 0; i < baseBottomRects.length; i++) {
        const baseBottomRect = baseBottomRects[i];
        const slidingBottomRect = slidingBottomRects[i];
        const slidingTopRect = slidingTopRects[i];
        const baseX = parseFloat(baseBottomRect.getAttribute("x") ?? "0") / 100;
        const baseWidth = parseFloat(baseBottomRect.getAttribute("width") ?? "0") / 100;
        let sliderX = baseX + baseWidth - pixel * frameIndex;
        const attemptedWidth = Math.min(frameIndex, 3) * pixel;
        const visibleWidth = (() => {
          if (sliderX < baseX) {
            if (sliderX + attemptedWidth <= baseX) {
              return 0;
            } else {
              const visible = attemptedWidth - baseX + sliderX;
              if (visible < pixel / 2) {
                return 0;
              } else {
                sliderX = baseX;
                return visible;
              }
            }
          } else {
            return attemptedWidth;
          }
        })();
        slidingBottomRect.setAttribute("x", (sliderX * 100).toString());
        slidingTopRect.setAttribute("x", (sliderX * 100).toString());
        slidingBottomRect.setAttribute("width", (visibleWidth * 100).toString());
        slidingTopRect.setAttribute("width", (visibleWidth * 100).toString());
      }
      wavesFrames[key] = frame;
    }
  }
  return wavesFrames[key];
}

export function didToggleBoardColors() {
  const wave1Color = colors.wave1;
  const wave2Color = colors.wave2;
  const manaColor = colors.manaPool;

  Object.values(wavesFrames).forEach((frame) => {
    const wave1Elements = frame.querySelectorAll(".wave1");
    const wave2Elements = frame.querySelectorAll(".wave2");
    const poolElements = frame.querySelectorAll(".poolBackground");

    wave1Elements.forEach((element) => {
      if (element instanceof SVGElement) {
        SVG.setFill(element, wave1Color);
      }
    });

    wave2Elements.forEach((element) => {
      if (element instanceof SVGElement) {
        SVG.setFill(element, wave2Color);
      }
    });

    poolElements.forEach((element) => {
      if (element instanceof SVGElement) {
        SVG.setFill(element, manaColor);
      }
    });
  });

  if (!isCustomPictureBoardEnabled) {
    Object.entries(basesPlaceholders).forEach(([key, element]) => {
      const [i, j] = key.split("-").map(Number);
      const squareColor = ((i + j) % 2 === 0 ? colors.lightSquare : colors.darkSquare) + "85";
      const firstChild = element.children[0] as HTMLElement;
      firstChild.style.backgroundColor = squareColor;
    });
  }
}

function inBoardCoordinates(location: Location): Location {
  if (isFlipped) {
    return new Location(10 - location.i, 10 - location.j);
  } else {
    return new Location(location.i, location.j);
  }
}

const sparkle = (() => {
  const svg = document.createElementNS(SVG.ns, "svg");
  SVG.setSizeStr(svg, "3", "3");
  svg.setAttribute("viewBox", "0 0 3 3");
  SVG.setFill(svg, "transparent");

  const rect1 = document.createElementNS(SVG.ns, "rect");
  SVG.setFrameStr(rect1, "0", "1", "3", "1");
  SVG.setFill(rect1, colors.sparkleLight);
  svg.appendChild(rect1);

  const rect2 = document.createElementNS(SVG.ns, "rect");
  SVG.setFrameStr(rect2, "1", "0", "1", "3");
  SVG.setFill(rect2, colors.sparkleLight);
  svg.appendChild(rect2);

  const rect3 = document.createElementNS(SVG.ns, "rect");
  SVG.setFrameStr(rect3, "1", "1", "1", "1");
  SVG.setFill(rect3, colors.sparkleDark);
  svg.appendChild(rect3);

  return svg;
})();
