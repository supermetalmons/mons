import { defaultInputEventName } from "../utils/misc";
import { storage } from "../utils/storage";

const maxCardIndex = 36;
let cardIndex = Math.floor(Math.random() * maxCardIndex);
const colorMonsOnly = true;

const cardStyles = `
@media screen and (max-width: 420px){
  [data-shiny-card="true"]{ right:9px !important; }
}
@media screen and (max-width: 387px){
  [data-shiny-card="true"]{ right:7px !important; }
}`;

export const showShinyCard = async () => {
  const cardContainer = document.createElement("div");
  cardContainer.style.position = "fixed";
  cardContainer.style.top = "56px";
  cardContainer.style.right = "12pt";

  const aspectRatio = 2430 / 1886;
  const maxWidth = Math.min(window.innerWidth * 0.8, 350);
  const width = maxWidth;
  const height = width / aspectRatio;

  cardContainer.style.width = `${width}px`;
  cardContainer.style.height = `${height}px`;
  cardContainer.style.perspective = "1000px";
  cardContainer.style.zIndex = "1000";
  cardContainer.setAttribute("data-shiny-card", "true");
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
  card.style.background = "linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.1) 100%)";
  card.style.cursor = "pointer";
  card.style.willChange = "transform"; // Optimize for animations

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
  img.src = `https://assets.mons.link/cards/bg/${cardIndex}.webp`;

  const emojiImg = document.createElement("img");
  emojiImg.style.position = "absolute";
  emojiImg.style.width = "24%";
  emojiImg.style.top = "13.5%";
  emojiImg.style.left = "8%";
  emojiImg.src = `https://assets.mons.link/emojipack_hq/${storage.getPlayerEmojiId("1")}.webp`;

  const placeholder = document.createElement("div");
  placeholder.style.position = "absolute";
  placeholder.style.width = "90%";
  placeholder.style.height = "81%";
  placeholder.style.backgroundColor = "rgba(255, 255, 255, 0.77)";
  placeholder.style.borderRadius = "10px";
  placeholder.style.top = "50%";
  placeholder.style.left = "50%";
  placeholder.style.transform = "translate(-50%, -50%)";

  const shinyOverlay = document.createElement("div");
  shinyOverlay.style.position = "absolute";
  shinyOverlay.style.top = "0";
  shinyOverlay.style.left = "0";
  shinyOverlay.style.width = "100%";
  shinyOverlay.style.height = "100%";
  shinyOverlay.style.borderRadius = "15px";
  // Use linear gradient for idle state that looks better
  shinyOverlay.style.background = "linear-gradient(135deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0) 100%)";
  shinyOverlay.style.opacity = "0.63";
  shinyOverlay.style.pointerEvents = "none";
  shinyOverlay.style.zIndex = "1";
  // Remove transition property to prevent any abrupt changes
  shinyOverlay.style.transition = "none";
  shinyOverlay.style.willChange = "background"; // Optimize for animations

  card.addEventListener(defaultInputEventName, () => {
    cardIndex = (cardIndex + 1) % maxCardIndex;
    const newCardName = `${cardIndex}.webp`;
    img.src = `https://assets.mons.link/cards/bg/${newCardName}`;
  });

  let isMouseOver = false;
  let animationFrameId: number | null = null;
  let time = 0;

  // Store the last mouse position to smoothly transition back to animation
  let lastMouseX = 50;
  let lastMouseY = 50;
  let lastShineX = 50;
  let lastShineY = 50;
  let transitioningFromMouse = false;
  let transitionProgress = 0;
  const transitionDuration = 180; // Keep original transition duration

  // For smoother mouse tracking
  let currentRotateX = 0;
  let currentRotateY = 0;
  let targetRotateX = 0;
  let targetRotateY = 0;
  const easeAmount = 0.15; // Higher value = faster response (0-1)

  // Natural floating animation when mouse is not over the card
  const animateCard = () => {
    time += 0.01;

    if (isMouseOver) {
      // When mouse is over, smoothly interpolate to target rotation
      currentRotateX += (targetRotateX - currentRotateX) * easeAmount;
      currentRotateY += (targetRotateY - currentRotateY) * easeAmount;

      card.style.transform = `rotateY(${currentRotateY}deg) rotateX(${currentRotateX}deg)`;

      // Store these values for smooth transition later
      lastMouseX = currentRotateX;
      lastMouseY = currentRotateY;

      transitioningFromMouse = false;
      transitionProgress = 0;
    } else {
      // Natural animation values for card rotation only
      const naturalRotateX = Math.sin(time) * 3;
      const naturalRotateY = Math.cos(time * 0.8) * 3;

      if (transitioningFromMouse) {
        // Increment transition progress
        transitionProgress = Math.min(transitionProgress + 1, transitionDuration);
        const t = transitionProgress / transitionDuration; // 0 to 1

        // Smooth easing function
        const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
        const easedT = easeOutCubic(t);

        // Interpolate between last mouse position and natural animation for card rotation
        currentRotateX = (1 - easedT) * lastMouseX + easedT * naturalRotateX;
        currentRotateY = (1 - easedT) * lastMouseY + easedT * naturalRotateY;

        card.style.transform = `rotateY(${currentRotateY}deg) rotateX(${currentRotateX}deg)`;

        // Smoothly transition from radial gradient to linear gradient
        if (transitionProgress < transitionDuration) {
          // During transition, blend between radial and linear gradients
          const radialOpacity = (1 - easedT) * 0.8;
          const linearOpacity = easedT * 0.3;

          // Create a combined background with both gradients
          // As the transition progresses, the radial gradient fades out while the linear gradient fades in
          shinyOverlay.style.background = `
            radial-gradient(circle at ${lastShineX}% ${lastShineY}%, 
              rgba(255,255,255,${radialOpacity}) 0%, 
              rgba(255,255,255,0) 60%),
            linear-gradient(135deg, 
              rgba(255,255,255,0) 0%, 
              rgba(255,255,255,${linearOpacity}) 50%, 
              rgba(255,255,255,0) 100%)
          `;
        } else {
          // When fully transitioned, use only the linear gradient
          shinyOverlay.style.background = "linear-gradient(135deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0) 100%)";
          transitioningFromMouse = false;
        }
      } else {
        // Normal animation when not transitioning - smoothly animate card rotation
        currentRotateX += (naturalRotateX - currentRotateX) * 0.05;
        currentRotateY += (naturalRotateY - currentRotateY) * 0.05;

        card.style.transform = `rotateY(${currentRotateY}deg) rotateX(${currentRotateX}deg)`;

        // Use linear gradient for idle state
        shinyOverlay.style.background = "linear-gradient(135deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0) 100%)";
      }
    }

    animationFrameId = requestAnimationFrame(animateCard);
  };

  // Initialize current rotation to match natural animation
  currentRotateX = Math.sin(time) * 3;
  currentRotateY = Math.cos(time * 0.8) * 3;

  animationFrameId = requestAnimationFrame(animateCard);

  // Use a throttled version of mousemove for better performance
  let lastMoveTime = 0;
  const moveThreshold = 5; // ms between move events

  cardContainer.addEventListener("mousemove", (e) => {
    const now = Date.now();
    if (now - lastMoveTime < moveThreshold) return;
    lastMoveTime = now;

    isMouseOver = true;

    const rect = cardContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Calculate rotation with increased sensitivity for more dramatic effect
    targetRotateY = (x - centerX) / 15; // Increased sensitivity (was /20)
    targetRotateX = (centerY - y) / 15; // Increased sensitivity (was /20)

    const percentX = (x / rect.width) * 100;
    const percentY = (y / rect.height) * 100;

    // Store shine position for smooth transition
    lastShineX = percentX;
    lastShineY = percentY;

    // Apply shine effect immediately for responsive feel
    shinyOverlay.style.background = `radial-gradient(circle at ${percentX}% ${percentY}%, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 60%)`;
  });

  cardContainer.addEventListener("mouseleave", () => {
    isMouseOver = false;
    transitioningFromMouse = true;
    transitionProgress = 0;
  });

  card.appendChild(placeholder);
  card.appendChild(img);
  card.appendChild(createOverlayImage("https://assets.mons.link/cards/bubbles.webp"));
  card.appendChild(emojiImg);
  card.appendChild(shinyOverlay);

  addTextToCard(card, "player id", "36.3%", "30%");
  addTextToCard(card, "9000", "36.3%", "41%");
  addTextToCard(card, "／人◕ __ ◕人＼", "10%", "52%");
  addTextToCard(card, "wip", "10%", "63%");

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
  showMons(card);
};

let demon = "";
let angel = "";
let drainer = "";
let spirit = "";
let mystic = "";

async function showMons(card: HTMLElement) {
  const alpha = colorMonsOnly ? 1 : 0.77;

  if (!drainer) {
    if (colorMonsOnly) {
      const getRandomSpriteOfType = (await import(`../assets/monsSprites`)).getRandomSpriteOfType;
      demon = getRandomSpriteOfType("demon");
      angel = getRandomSpriteOfType("angel");
      drainer = getRandomSpriteOfType("drainer");
      spirit = getRandomSpriteOfType("spirit");
      mystic = getRandomSpriteOfType("mystic");
    } else {
      const assets = (await import(`../assets/gameAssetsPixel`)).gameAssets;
      demon = assets.demon;
      angel = assets.angel;
      drainer = assets.drainer;
      spirit = assets.spirit;
      mystic = assets.mystic;
    }
  }

  addImageToCard(card, "32.5%", "75%", demon, alpha);
  addImageToCard(card, "44.7%", "75%", angel, alpha);
  addImageToCard(card, "57.3%", "75%", drainer, alpha);
  addImageToCard(card, "69.5%", "75%", spirit, alpha);
  addImageToCard(card, "82%", "75%", mystic, alpha);
}

const addTextToCard = (card: HTMLElement, text: string, leftPosition: string, topPosition: string): HTMLElement => {
  const textElement = document.createElement("div");
  textElement.textContent = text;
  textElement.style.position = "absolute";
  textElement.style.left = leftPosition;
  textElement.style.top = topPosition;
  textElement.style.color = "#D0D0D0";
  textElement.style.fontFamily = "Arial, sans-serif";
  textElement.style.fontSize = "15px";
  textElement.style.transform = "translate(0, -50%)";
  textElement.style.textShadow = "0px 0px 2px rgba(255, 255, 255, 0.8)";
  textElement.style.pointerEvents = "none";

  card.appendChild(textElement);
  return textElement;
};

const addImageToCard = (card: HTMLElement, leftPosition: string, topPosition: string, imageData: string, alpha: number): HTMLElement => {
  const imageContainer = document.createElement("div");
  imageContainer.style.position = "absolute";
  imageContainer.style.left = leftPosition;
  imageContainer.style.top = topPosition;
  imageContainer.style.width = "10%";
  imageContainer.style.aspectRatio = "1";
  imageContainer.style.overflow = "hidden";

  if (imageData) {
    const img = document.createElement("img");
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    img.style.objectPosition = "0% 50%";
    img.style.imageRendering = "pixelated";
    img.style.opacity = alpha.toString();
    img.src = `data:image/webp;base64,${imageData}`;
    imageContainer.appendChild(img);
  }

  card.appendChild(imageContainer);
  return imageContainer;
};

const addPlaceholderBubbles = (card: HTMLElement): HTMLElement => {
  const imageContainer = document.createElement("div");
  imageContainer.style.position = "absolute";
  imageContainer.style.left = "34.3%";
  imageContainer.style.top = "25.6%";
  imageContainer.style.borderRadius = "6px";
  imageContainer.style.width = "45%";
  imageContainer.style.height = "9%";
  imageContainer.style.overflow = "hidden";
  imageContainer.style.backgroundColor = "white";
  imageContainer.style.border = "1px solid #D0D0D050";
  imageContainer.style.boxSizing = "border-box";
  imageContainer.style.display = "flex";
  imageContainer.style.justifyContent = "center";
  imageContainer.style.alignItems = "center";
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
  overlayImg.src = url;
  return overlayImg;
};

export const hideShinyCard = () => {
  const shinyCard = document.querySelector('[data-shiny-card="true"]');
  if (shinyCard && shinyCard.parentNode) {
    shinyCard.parentNode.removeChild(shinyCard);
  }
};
