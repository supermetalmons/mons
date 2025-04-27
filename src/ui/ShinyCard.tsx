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

  const shinyOverlay = document.createElement("div");
  shinyOverlay.style.position = "absolute";
  shinyOverlay.style.top = "0";
  shinyOverlay.style.left = "0";
  shinyOverlay.style.width = "100%";
  shinyOverlay.style.height = "100%";
  shinyOverlay.style.borderRadius = "15px";
  shinyOverlay.style.background = "linear-gradient(135deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0) 100%)";
  shinyOverlay.style.opacity = "0.63";
  shinyOverlay.style.pointerEvents = "none";

  card.addEventListener("click", () => {
    cardIndex = (cardIndex + 1) % maxCardIndex;
    const newCardName = `${cardIndex}.webp`;
    console.log("New card:", newCardName);
    img.src = `https://assets.mons.link/cards/bg/${newCardName}`;
  });

  cardContainer.addEventListener("mousemove", (e) => {
    const rect = cardContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateY = (x - centerX) / 20;
    const rotateX = (centerY - y) / 20;

    card.style.transform = `rotateY(${rotateY}deg) rotateX(${rotateX}deg)`;

    const percentX = (x / rect.width) * 100;
    const percentY = (y / rect.height) * 100;
    shinyOverlay.style.background = `radial-gradient(circle at ${percentX}% ${percentY}%, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 60%)`;
  });

  cardContainer.addEventListener("mouseleave", () => {
    card.style.transform = "rotateY(0deg) rotateX(0deg)";
    shinyOverlay.style.background = "linear-gradient(135deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0) 100%)";
  });

  card.appendChild(img);
  card.appendChild(shinyOverlay);
  cardContainer.appendChild(card);
  document.body.appendChild(cardContainer);
};

export const hideShinyCard = () => {
  const shinyCard = document.querySelector('[data-shiny-card="true"]');
  if (shinyCard && shinyCard.parentNode) {
    shinyCard.parentNode.removeChild(shinyCard);
  }
};
