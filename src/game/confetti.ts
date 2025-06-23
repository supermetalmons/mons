type ConfettiParticle = {
  x: number;
  y: number;
  radius: number;
  color: string;
  rotation: number;
  speed: number;
  angle: number;
  drift: number;
  angularSpeed: number;
  gravity: number;
};

export function launchConfetti(count: number = 300, duration: number = 2300): void {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.style.position = "fixed";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "9999";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });

  const colors = ["#FFC700", "#FF0000", "#2E3192", "#41BBC7", "#FF66CC", "#33CC33"];
  const particles: ConfettiParticle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      radius: Math.random() * 6 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      speed: Math.random() * 6 + 4,
      angle: Math.random() * Math.PI * 2,
      drift: Math.random() * 2 - 1,
      angularSpeed: Math.random() * 10 - 5,
      gravity: 0.5 + Math.random() * 0.5,
    });
  }

  let lastTime = performance.now();
  let elapsedTime = 0;

  function animate(now: number) {
    if (!ctx) {
      return;
    }
    const dt = now - lastTime;
    lastTime = now;
    elapsedTime += dt;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += Math.cos(p.angle) * p.speed * (dt / 16) + p.drift * (dt / 16);
      p.y += Math.sin(p.angle) * p.speed * (dt / 16) + p.gravity * (dt / 16);
      p.rotation += p.angularSpeed * (dt / 16);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.radius / 2, -p.radius / 2, p.radius, p.radius);
      ctx.restore();
      if (p.y > canvas.height + p.radius || p.x < -p.radius || p.x > canvas.width + p.radius) {
        particles.splice(i, 1);
      }
    }
    if (elapsedTime < duration || particles.length) {
      requestAnimationFrame(animate);
    } else {
      document.body.removeChild(canvas);
    }
  }
  requestAnimationFrame(animate);
}
