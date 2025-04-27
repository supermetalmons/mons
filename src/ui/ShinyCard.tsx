const maxCardIndex = 36;
let cardIndex = Math.floor(Math.random() * maxCardIndex);

export const showShinyCard = () => {
  const cardContainer = document.createElement("div");
  cardContainer.style.position = "fixed";
  cardContainer.style.top = "56px";
  cardContainer.style.right = "20px";

  const aspectRatio = 2430 / 1886;
  const maxWidth = Math.min(window.innerWidth * 0.8, 350);
  const width = maxWidth;
  const height = width / aspectRatio;

  cardContainer.style.width = `${width}px`;
  cardContainer.style.height = `${height}px`;
  cardContainer.style.perspective = "1000px";
  cardContainer.style.zIndex = "1000";
  cardContainer.setAttribute("data-shiny-card", "true");

  const card = document.createElement("div");
  card.style.position = "relative";
  card.style.width = "100%";
  card.style.height = "100%";
  card.style.transformStyle = "preserve-3d";
  card.style.transition = "transform 0.5s ease";
  card.style.borderRadius = "15px";
  card.style.boxShadow = "0 10px 30px rgba(0, 0, 0, 0.3)";
  card.style.background = "linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.1) 100%)";
  card.style.cursor = "pointer";

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

  const placeholder = document.createElement("div");
  placeholder.style.position = "absolute";
  placeholder.style.width = "90%";
  placeholder.style.height = "81%";
  placeholder.style.backgroundColor = "rgba(255, 255, 255, 0.42)";
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
  // Remove transition property to prevent any abrupt changes
  shinyOverlay.style.transition = "none";

  card.addEventListener("click", () => {
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
  const transitionDuration = 180; // Increased for even smoother transition (about 3 seconds at 60fps)

  // Natural floating animation when mouse is not over the card
  const animateCard = () => {
    time += 0.01;

    if (isMouseOver) {
      // When mouse is over, we just store the current position
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
        const rotateX = (1 - easedT) * lastMouseX + easedT * naturalRotateX;
        const rotateY = (1 - easedT) * lastMouseY + easedT * naturalRotateY;

        card.style.transform = `rotateY(${rotateY}deg) rotateX(${rotateX}deg)`;

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
        // Normal animation when not transitioning - only animate card rotation
        card.style.transform = `rotateY(${naturalRotateY}deg) rotateX(${naturalRotateX}deg)`;

        // Use linear gradient for idle state
        shinyOverlay.style.background = "linear-gradient(135deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0) 100%)";
      }
    }

    animationFrameId = requestAnimationFrame(animateCard);
  };

  // Start the animation immediately
  animationFrameId = requestAnimationFrame(animateCard);

  cardContainer.addEventListener("mousemove", (e) => {
    isMouseOver = true;

    const rect = cardContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateY = (x - centerX) / 20;
    const rotateX = (centerY - y) / 20;

    // Store these values for smooth transition later
    lastMouseX = rotateX;
    lastMouseY = rotateY;

    card.style.transform = `rotateY(${rotateY}deg) rotateX(${rotateX}deg)`;

    const percentX = (x / rect.width) * 100;
    const percentY = (y / rect.height) * 100;

    // Store shine position for smooth transition
    lastShineX = percentX;
    lastShineY = percentY;

    shinyOverlay.style.background = `radial-gradient(circle at ${percentX}% ${percentY}%, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 60%)`;
  });

  cardContainer.addEventListener("mouseleave", () => {
    isMouseOver = false;
    transitioningFromMouse = true;
    transitionProgress = 0;
  });

  card.appendChild(placeholder);
  card.appendChild(img);
  card.appendChild(shinyOverlay);
  cardContainer.appendChild(card);
  document.body.appendChild(cardContainer);

  // Clean up animation when card is removed
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
};

export const hideShinyCard = () => {
  const shinyCard = document.querySelector('[data-shiny-card="true"]');
  if (shinyCard && shinyCard.parentNode) {
    shinyCard.parentNode.removeChild(shinyCard);
  }
};
