// The night sky behind the advancement window: a slowly drifting nebula, three layers of twinkling stars that lean
// with the mouse, and now and then a falling star. Purely decorative; it stops when the window closes.

const TAU = Math.PI * 2;
const STAR_TINTS = ["#ffffff", "#dbe8ff", "#bcd4ff", "#fff1d6", "#cfe0ff"];

function nebula(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const g = canvas.getContext("2d");
  const base = g.createLinearGradient(0, 0, 0, height);
  base.addColorStop(0, "#050a1c"); base.addColorStop(0.55, "#0a1430"); base.addColorStop(1, "#04060f");
  g.fillStyle = base; g.fillRect(0, 0, width, height);
  // Clouds of colour: blue, teal and a touch of violet, as in a cold northern night.
  const clouds = [[0.22, 0.3, 0.55, "rgba(46,92,190,.42)"], [0.72, 0.62, 0.6, "rgba(28,120,150,.32)"], [0.58, 0.18, 0.45, "rgba(110,70,190,.26)"],
    [0.12, 0.82, 0.5, "rgba(30,60,140,.3)"], [0.9, 0.2, 0.35, "rgba(70,140,220,.22)"], [0.45, 0.55, 0.7, "rgba(20,40,90,.35)"]];
  g.globalCompositeOperation = "screen";
  for (const [x, y, r, color] of clouds) {
    const radius = Math.max(width, height) * r, cloud = g.createRadialGradient(x * width, y * height, 0, x * width, y * height, radius);
    cloud.addColorStop(0, color); cloud.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = cloud; g.fillRect(0, 0, width, height);
  }
  // A faint band of the galaxy across the sky.
  g.save(); g.translate(width / 2, height / 2); g.rotate(-0.42);
  const band = g.createLinearGradient(0, -height * 0.18, 0, height * 0.18);
  band.addColorStop(0, "rgba(0,0,0,0)"); band.addColorStop(0.5, "rgba(150,180,255,.12)"); band.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = band; g.fillRect(-width, -height * 0.18, width * 2, height * 0.36);
  g.restore();
  g.globalCompositeOperation = "source-over";
  return canvas;
}

/** Mount the sky into `host` (positioned); returns controls to flare it and to take it down. */
export function mountStarfield(host) {
  const canvas = document.createElement("canvas");
  canvas.className = "witcher-starfield";
  canvas.setAttribute("aria-hidden", "true");
  host.prepend(canvas);
  const g = canvas.getContext("2d"), still = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let width = 0, height = 0, ratio = 1, cloud = null, stars = [], meteors = [], flare = 0, frame = 0, last = performance.now(), nextMeteor = 4000;
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

  const resize = () => {
    const box = host.getBoundingClientRect();
    ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    width = Math.max(1, box.width); height = Math.max(1, box.height);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    cloud = nebula(Math.round(width), Math.round(height));
    const count = Math.round(width * height / 2600);
    stars = Array.from({ length: count }, () => {
      const depth = Math.random() ** 2;
      return { x: Math.random(), y: Math.random(), depth, size: 0.4 + depth * 1.6 + (Math.random() < 0.04 ? 1.2 : 0),
        phase: Math.random() * TAU, speed: 0.6 + Math.random() * 2.2, tint: STAR_TINTS[Math.floor(Math.random() * STAR_TINTS.length)] };
    });
    if (still) draw(0);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const move = event => {
    const box = host.getBoundingClientRect();
    mouse.tx = (event.clientX - box.left) / box.width - 0.5; mouse.ty = (event.clientY - box.top) / box.height - 0.5;
  };
  host.addEventListener("pointermove", move);

  function meteor() {
    const fromLeft = Math.random() < 0.5;
    meteors.push({ x: fromLeft ? Math.random() * width * 0.5 : width * (0.5 + Math.random() * 0.5), y: Math.random() * height * 0.35,
      vx: (fromLeft ? 1 : -1) * (520 + Math.random() * 320), vy: 200 + Math.random() * 160, life: 0, span: 0.9 + Math.random() * 0.5 });
  }

  function draw(dt) {
    const time = performance.now() / 1000;
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    mouse.x += (mouse.tx - mouse.x) * Math.min(1, dt * 3); mouse.y += (mouse.ty - mouse.y) * Math.min(1, dt * 3);
    // The nebula drifts a little, slower than the stars in front of it.
    const drift = Math.sin(time / 40) * 12;
    g.drawImage(cloud, -20 + drift - mouse.x * 14, -20 - mouse.y * 10, width + 40, height + 40);
    for (const star of stars) {
      const px = star.x * width - mouse.x * (6 + star.depth * 34), py = star.y * height - mouse.y * (4 + star.depth * 24);
      const twinkle = still ? 0.8 : 0.55 + 0.45 * Math.sin(time * star.speed + star.phase);
      const alpha = Math.min(1, (0.35 + star.depth * 0.65) * twinkle * (1 + flare * 0.8));
      g.globalAlpha = alpha; g.fillStyle = star.tint;
      g.beginPath(); g.arc(px, py, star.size * (1 + flare * 0.4), 0, TAU); g.fill();
      if (star.size > 1.5) {
        // Bright stars get a soft halo and a faint cross of light.
        g.globalAlpha = alpha * 0.18;
        g.beginPath(); g.arc(px, py, star.size * 4, 0, TAU); g.fill();
        g.globalAlpha = alpha * 0.35; g.fillRect(px - star.size * 5, py - 0.4, star.size * 10, 0.8); g.fillRect(px - 0.4, py - star.size * 5, 0.8, star.size * 10);
      }
    }
    g.globalAlpha = 1;
    for (const m of meteors) {
      m.life += dt; m.x += m.vx * dt; m.y += m.vy * dt;
      const k = m.life / m.span, length = 140, nx = m.vx / Math.hypot(m.vx, m.vy), ny = m.vy / Math.hypot(m.vx, m.vy);
      const trail = g.createLinearGradient(m.x, m.y, m.x - nx * length, m.y - ny * length);
      trail.addColorStop(0, `rgba(235,245,255,${0.9 * (1 - k)})`); trail.addColorStop(1, "rgba(235,245,255,0)");
      g.strokeStyle = trail; g.lineWidth = 1.6; g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(m.x - nx * length, m.y - ny * length); g.stroke();
    }
    meteors = meteors.filter(m => m.life < m.span);
    flare = Math.max(0, flare - dt * 0.8);
  }

  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!still && host.isConnected) {
      nextMeteor -= dt * 1000;
      if (nextMeteor <= 0) { meteor(); nextMeteor = 6000 + Math.random() * 9000; }
      draw(dt);
    }
    frame = requestAnimationFrame(tick);
  }
  resize();
  frame = requestAnimationFrame(tick);

  return {
    /** The whole sky brightens and a star falls: a purchase went through. */
    celebrate() { flare = 1; if (!still) { meteor(); setTimeout(meteor, 260); } },
    destroy() { cancelAnimationFrame(frame); observer.disconnect(); host.removeEventListener("pointermove", move); canvas.remove(); }
  };
}
