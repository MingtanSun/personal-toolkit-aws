/**
 * WeatherFx — Apple-style Canvas weather animation for the weather card.
 * Renders rain / snow / storm particles clipped inside the card.
 * Public API: WeatherFx.init / start / stop / setTheme
 */
(function () {
  "use strict";

  const MAX_DPR = 2;
  const RAIN_CAP = 120;
  const SNOW_CAP = 60;

  const state = {
    container: null,
    canvas: null,
    ctx: null,
    width: 0,
    height: 0,
    dpr: 1,
    rafId: 0,
    type: "none",
    intensity: 1,
    theme: "light",
    particles: [],
    lightning: { until: 0, next: 0 },
    lastTs: 0,
    resizeObserver: null,
    reduceMotion: false,
    inited: false
  };

  function prefersReducedMotion() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function resizeCanvas() {
    if (!state.container || !state.canvas || !state.ctx) return;
    const rect = state.container.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    if (w === state.width && h === state.height && dpr === state.dpr) return;
    state.width = w;
    state.height = h;
    state.dpr = dpr;
    state.canvas.width = Math.round(w * dpr);
    state.canvas.height = Math.round(h * dpr);
    state.canvas.style.width = w + "px";
    state.canvas.style.height = h + "px";
    state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (state.type !== "none") spawnParticles();
  }

  function rainColor(alpha) {
    return state.theme === "dark"
      ? `rgba(147, 197, 253, ${alpha})`
      : `rgba(59, 130, 246, ${alpha})`;
  }

  function snowColor(alpha) {
    return state.theme === "dark"
      ? `rgba(226, 232, 240, ${alpha})`
      : `rgba(148, 163, 184, ${alpha})`;
  }

  function makeRainDrop(seedTop) {
    const speed = rand(7.5, 13) * (0.7 + state.intensity * 0.5);
    return {
      x: rand(0, state.width),
      y: seedTop ? rand(-state.height, 0) : rand(0, state.height),
      len: rand(8, 18),
      speed,
      width: rand(0.8, 1.5),
      opacity: rand(0.15, 0.45)
    };
  }

  function makeSnowFlake(seedTop) {
    return {
      x: rand(0, state.width),
      y: seedTop ? rand(-state.height, 0) : rand(0, state.height),
      radius: rand(1, 2.5),
      speedY: rand(0.6, 1.6) * (0.8 + state.intensity * 0.3),
      drift: rand(0.3, 0.9),
      phase: rand(0, Math.PI * 2),
      opacity: rand(0.3, 0.7)
    };
  }

  function spawnParticles() {
    const area = state.width * state.height;
    state.particles = [];
    if (state.type === "rain" || state.type === "storm") {
      const count = Math.min(
        RAIN_CAP,
        Math.floor(area * 0.00008 * state.intensity)
      );
      for (let i = 0; i < count; i++) state.particles.push(makeRainDrop(true));
    } else if (state.type === "snow") {
      const count = Math.min(
        SNOW_CAP,
        Math.floor(area * 0.00004 * state.intensity)
      );
      for (let i = 0; i < count; i++) state.particles.push(makeSnowFlake(true));
    }
  }

  function drawRain() {
    const ctx = state.ctx;
    const tilt = 0.18;
    for (const p of state.particles) {
      p.y += p.speed;
      p.x += p.speed * tilt;
      if (p.y > state.height + p.len || p.x > state.width + 20) {
        const np = makeRainDrop(false);
        np.y = -np.len;
        np.x = rand(-20, state.width);
        Object.assign(p, np);
        continue;
      }
      ctx.beginPath();
      ctx.strokeStyle = rainColor(p.opacity);
      ctx.lineWidth = p.width;
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.len * tilt, p.y - p.len);
      ctx.stroke();
    }
  }

  function drawSnow(ts) {
    const ctx = state.ctx;
    const t = ts * 0.001;
    for (const p of state.particles) {
      p.y += p.speedY;
      p.x += Math.sin(t + p.phase) * p.drift * 0.5;
      if (p.y > state.height + p.radius) {
        const np = makeSnowFlake(false);
        np.y = -np.radius;
        Object.assign(p, np);
        continue;
      }
      ctx.beginPath();
      ctx.fillStyle = snowColor(p.opacity);
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawLightning(ts) {
    const l = state.lightning;
    if (ts >= l.next) {
      l.until = ts + rand(80, 160);
      l.next = ts + rand(4000, 9000);
    }
    if (ts < l.until) {
      state.ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
      state.ctx.fillRect(0, 0, state.width, state.height);
    }
  }

  function loop(ts) {
    if (state.type === "none") return;
    state.ctx.clearRect(0, 0, state.width, state.height);
    if (state.type === "rain" || state.type === "storm") drawRain();
    else if (state.type === "snow") drawSnow(ts);
    if (state.type === "storm") drawLightning(ts);
    state.rafId = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = requestAnimationFrame(loop);
  }

  const WeatherFx = {
    init(containerEl, canvasEl) {
      if (!containerEl || !canvasEl || !canvasEl.getContext) return;
      state.container = containerEl;
      state.canvas = canvasEl;
      state.ctx = canvasEl.getContext("2d");
      state.reduceMotion = prefersReducedMotion();
      state.theme =
        document.documentElement.getAttribute("data-theme") === "dark"
          ? "dark"
          : "light";
      state.inited = true;

      resizeCanvas();

      if (typeof ResizeObserver !== "undefined") {
        state.resizeObserver = new ResizeObserver(() => resizeCanvas());
        state.resizeObserver.observe(containerEl);
      } else {
        window.addEventListener("resize", resizeCanvas, { passive: true });
      }

      document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
          if (state.rafId) {
            cancelAnimationFrame(state.rafId);
            state.rafId = 0;
          }
        } else if (state.type !== "none" && !state.rafId) {
          startLoop();
        }
      });
    },

    start(type, intensity) {
      if (!state.inited) return;
      if (state.reduceMotion || type === "none" || type === "clear" || type == null) {
        this.stop();
        return;
      }
      state.type = type;
      state.intensity = intensity != null ? intensity : 1;
      resizeCanvas();
      spawnParticles();
      startLoop();
    },

    stop() {
      state.type = "none";
      state.particles = [];
      if (state.rafId) {
        cancelAnimationFrame(state.rafId);
        state.rafId = 0;
      }
      if (state.ctx) state.ctx.clearRect(0, 0, state.width, state.height);
    },

    setTheme(theme) {
      state.theme = theme === "dark" ? "dark" : "light";
    }
  };

  window.WeatherFx = WeatherFx;
})();
