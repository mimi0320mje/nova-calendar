/* Nova Calendar — animated drifting-dots background.
 *
 * A full-screen fixed <canvas> painted behind everything (z-index below content).
 * ~42 dots drift slowly and gently DODGE the mouse: when the cursor gets close,
 * each nearby dot is pushed away, then eases back to its lazy drift.
 *
 * Lightweight on purpose: no libraries, one requestAnimationFrame loop, capped
 * dot count, and the loop pauses while the tab is hidden to save battery.
 */
(function () {
  const BASE_BG = "#1c2233"; // page backdrop
  const DOT = "#7c9cff"; // dot colour
  const COUNT = 42; // roughly this many dots
  const SPEED = 1; // animation speed multiplier (1x)
  const DODGE_RADIUS = 120; // how close the mouse must be to push a dot (px)
  const DODGE_FORCE = 0.9; // how hard the push is

  const canvas = document.createElement("canvas");
  canvas.id = "bg-canvas";
  // Fixed, full-screen, behind all content, never intercepts clicks.
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    zIndex: "-1",
    display: "block",
    background: BASE_BG,
    pointerEvents: "none",
  });
  document.body.prepend(canvas);

  const ctx = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let dpr = 1;
  const dots = [];
  const mouse = { x: -9999, y: -9999 };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function makeDots() {
    dots.length = 0;
    for (let i = 0; i < COUNT; i++) {
      dots.push({
        x: rand(0, width),
        y: rand(0, height),
        vx: rand(-0.25, 0.25) * SPEED, // slow drift
        vy: rand(-0.25, 0.25) * SPEED,
        r: rand(1.5, 3.5),
        a: rand(0.35, 0.9), // opacity — subtle depth
      });
    }
  }

  function step() {
    ctx.clearRect(0, 0, width, height);

    for (const d of dots) {
      // Dodge the mouse: push away when the cursor is within DODGE_RADIUS.
      const dx = d.x - mouse.x;
      const dy = d.y - mouse.y;
      const dist = Math.hypot(dx, dy);
      if (dist < DODGE_RADIUS && dist > 0.01) {
        const push = ((DODGE_RADIUS - dist) / DODGE_RADIUS) * DODGE_FORCE;
        d.vx += (dx / dist) * push;
        d.vy += (dy / dist) * push;
      }

      // Ease velocity back toward the lazy drift (friction) so dots settle.
      d.vx *= 0.96;
      d.vy *= 0.96;

      d.x += d.vx * SPEED;
      d.y += d.vy * SPEED;

      // Wrap around the edges for an endless field.
      if (d.x < -10) d.x = width + 10;
      if (d.x > width + 10) d.x = -10;
      if (d.y < -10) d.y = height + 10;
      if (d.y > height + 10) d.y = -10;

      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = DOT;
      ctx.globalAlpha = d.a;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  let raf = null;
  function loop() {
    step();
    raf = requestAnimationFrame(loop);
  }
  function start() {
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function stop() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = null;
    }
  }

  window.addEventListener("resize", () => {
    resize();
    makeDots();
  });
  window.addEventListener("pointermove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  window.addEventListener("pointerleave", () => {
    mouse.x = -9999;
    mouse.y = -9999;
  });
  // Pause when the tab is hidden; resume when it comes back.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  resize();
  makeDots();
  start();
})();
