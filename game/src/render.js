// Look only: world state and screen in, pixels out. The 1280x720 field is scaled
// to fit the window and centred, letterboxed on the night backdrop colour. The
// signature is the darkness mask: a warm pool of lantern light in the middle of
// a forest that is otherwise almost black, with firefly cores and shadow eyes
// glinting through the dark. draw() is pure: it reads state, mutates nothing,
// and never touches input or audio.
import { PALETTE, FONT, FIELD, LIGHT } from './config.js';
import { drawHUD, drawTitle, drawPaused, drawNight, drawDawn, drawDark } from './hud.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_NIGHT = 'night';
export const SCREEN_WIN = 'win';
export const SCREEN_LOSE = 'lose';

const TWO_PI = Math.PI * 2;
const STAR_COUNT = 90;
const TREE_COUNT = 26;
const MIST_COUNT = 7;

// Small fixed-seed generator used once, at renderer creation, so the stars and
// the distant treeline are identical on every frame and every load.
function seededValue(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function glowRadius(light) {
  const clamped = light < 0 ? 0 : light > LIGHT.max ? LIGHT.max : light;
  return LIGHT.glowMin + (clamped / LIGHT.max) * (LIGHT.glowMax - LIGHT.glowMin);
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  const starRand = seededValue(20261116);
  const stars = [];
  for (let i = 0; i < STAR_COUNT; i += 1) {
    stars.push({
      x: starRand() * FIELD.width,
      y: starRand() * FIELD.height * 0.52,
      r: 0.6 + starRand() * 1.5,
      twinkle: starRand() * TWO_PI,
      speed: 0.6 + starRand() * 1.4,
    });
  }
  const treeRand = seededValue(7713);
  const trees = [];
  for (let i = 0; i < TREE_COUNT; i += 1) {
    trees.push({
      x: (i + 0.5) * (FIELD.width / TREE_COUNT) + (treeRand() - 0.5) * 36,
      w: 34 + treeRand() * 46,
      h: 90 + treeRand() * 130,
      shade: treeRand(),
    });
  }
  const mistRand = seededValue(441);
  const mists = [];
  for (let i = 0; i < MIST_COUNT; i += 1) {
    mists.push({
      x: mistRand() * FIELD.width,
      y: FIELD.height - 150 + mistRand() * 130,
      rx: 120 + mistRand() * 160,
      ry: 18 + mistRand() * 22,
      drift: 6 + mistRand() * 14,
    });
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function drawBackdrop(time) {
    const sky = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    sky.addColorStop(0, PALETTE.night);
    sky.addColorStop(0.55, PALETTE.deep);
    sky.addColorStop(1, PALETTE.ground);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);

    for (let i = 0; i < stars.length; i += 1) {
      const star = stars[i];
      const alpha = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(time * star.speed + star.twinkle));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = PALETTE.ink;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, TWO_PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Distant pine silhouettes along the horizon, two depths for parallax feel.
    for (let i = 0; i < trees.length; i += 1) {
      const tree = trees[i];
      const base = FIELD.height - 8;
      ctx.fillStyle = tree.shade < 0.5 ? PALETTE.night : PALETTE.deep;
      ctx.beginPath();
      ctx.moveTo(tree.x - tree.w / 2, base);
      ctx.lineTo(tree.x, base - tree.h);
      ctx.lineTo(tree.x + tree.w / 2, base);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(tree.x - 3, base - 26, 6, 26);
    }

    // Ground band, darker toward the bottom edge.
    const ground = ctx.createLinearGradient(0, FIELD.height - 190, 0, FIELD.height);
    ground.addColorStop(0, PALETTE.ground);
    ground.addColorStop(1, PALETTE.night);
    ctx.fillStyle = ground;
    ctx.fillRect(0, FIELD.height - 190, FIELD.width, 190);
  }

  function drawMist(time) {
    ctx.fillStyle = PALETTE.muted;
    for (let i = 0; i < mists.length; i += 1) {
      const mist = mists[i];
      const x = mist.x + Math.sin(time * 0.12 + i * 1.7) * mist.drift;
      ctx.globalAlpha = 0.05;
      ctx.beginPath();
      ctx.ellipse(x, mist.y, mist.rx, mist.ry, 0, 0, TWO_PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFireflies(state) {
    const flies = state.fireflies;
    for (let i = 0; i < flies.length; i += 1) {
      const fly = flies[i];
      if (fly.caught) continue;
      const colour = fly.gold ? PALETTE.gold : PALETTE.firefly;
      const pulse = 0.75 + 0.25 * Math.sin(state.nightTime * 3 + fly.phase);
      const halo = ctx.createRadialGradient(fly.x, fly.y, 0, fly.x, fly.y, 26);
      halo.addColorStop(0, colour);
      halo.addColorStop(1, 'rgba(13, 16, 38, 0)');
      ctx.globalAlpha = 0.55 * pulse;
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(fly.x, fly.y, 26, 0, TWO_PI);
      ctx.fill();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(fly.x, fly.y, fly.gold ? 5 : 3.5, 0, TWO_PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFireflyCores(state) {
    // After the darkness mask, only the bright cores shine through the dark.
    const flies = state.fireflies;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < flies.length; i += 1) {
      const fly = flies[i];
      if (fly.caught) continue;
      ctx.fillStyle = fly.gold ? PALETTE.gold : PALETTE.firefly;
      ctx.beginPath();
      ctx.arc(fly.x, fly.y, 2.5, 0, TWO_PI);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawShadows(state, time) {
    const shadows = state.shadows;
    for (let i = 0; i < shadows.length; i += 1) {
      const shadow = shadows[i];
      const wobble = 1 + 0.08 * Math.sin(time * 2.4 + shadow.x * 0.05 + shadow.y * 0.03);
      const r = shadow.r * wobble;
      const body = ctx.createRadialGradient(
        shadow.x - r * 0.25, shadow.y - r * 0.3, r * 0.1,
        shadow.x, shadow.y, r,
      );
      body.addColorStop(0, PALETTE.shadow);
      body.addColorStop(1, 'rgba(22, 26, 51, 0)');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(shadow.x, shadow.y, r, 0, TWO_PI);
      ctx.fill();
      // Horns for lurkers, a wider maw for eaters; drifters stay round.
      if (shadow.kind === 'lurker') {
        ctx.fillStyle = PALETTE.shadow;
        ctx.beginPath();
        ctx.moveTo(shadow.x - r * 0.55, shadow.y - r * 0.55);
        ctx.lineTo(shadow.x - r * 0.2, shadow.y - r * 1.05);
        ctx.lineTo(shadow.x - r * 0.05, shadow.y - r * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(shadow.x + r * 0.55, shadow.y - r * 0.55);
        ctx.lineTo(shadow.x + r * 0.2, shadow.y - r * 1.05);
        ctx.lineTo(shadow.x + r * 0.05, shadow.y - r * 0.5);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawShadowEyes(state) {
    // Eyes glint through the darkness mask, so shadows stay readable in the dark.
    const shadows = state.shadows;
    ctx.fillStyle = PALETTE.glow;
    for (let i = 0; i < shadows.length; i += 1) {
      const shadow = shadows[i];
      const gap = shadow.r * 0.32;
      const eyeY = shadow.y - shadow.r * 0.12;
      ctx.beginPath();
      ctx.arc(shadow.x - gap, eyeY, 2.2, 0, TWO_PI);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(shadow.x + gap, eyeY, 2.2, 0, TWO_PI);
      ctx.fill();
    }
  }

  function drawGloom(state) {
    const gloom = state.gloom;
    if (gloom === null || !gloom.active) return;
    const wall = ctx.createLinearGradient(gloom.x - 110, 0, gloom.x + 110, 0);
    wall.addColorStop(0, 'rgba(107, 79, 161, 0)');
    wall.addColorStop(0.5, 'rgba(107, 79, 161, 0.55)');
    wall.addColorStop(1, 'rgba(107, 79, 161, 0)');
    ctx.fillStyle = wall;
    ctx.fillRect(gloom.x - 110, 0, 220, FIELD.height);
  }

  function drawKeeper(state, time) {
    const keeper = state.keeper;
    const radius = glowRadius(state.light);
    const flicker = 1 + 0.03 * Math.sin(time * 7.3) + 0.02 * Math.sin(time * 13.7);
    const glowR = radius * flicker;

    // Layered warm glow: wide faint halo, then a tighter bright pool.
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(keeper.x, keeper.y, 0, keeper.x, keeper.y, glowR * 1.5);
    halo.addColorStop(0, 'rgba(255, 207, 110, 0.28)');
    halo.addColorStop(0.6, 'rgba(245, 166, 35, 0.10)');
    halo.addColorStop(1, 'rgba(245, 166, 35, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(keeper.x, keeper.y, glowR * 1.5, 0, TWO_PI);
    ctx.fill();
    const pool = ctx.createRadialGradient(keeper.x, keeper.y, 0, keeper.x, keeper.y, glowR);
    pool.addColorStop(0, 'rgba(255, 207, 110, 0.5)');
    pool.addColorStop(0.7, 'rgba(245, 166, 35, 0.16)');
    pool.addColorStop(1, 'rgba(245, 166, 35, 0)');
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(keeper.x, keeper.y, glowR, 0, TWO_PI);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // Brass lantern: cap, glowing glass, base, and a small handle arc.
    const lanternR = 16;
    ctx.fillStyle = PALETTE.lantern;
    ctx.beginPath();
    ctx.arc(keeper.x, keeper.y, lanternR, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = PALETTE.glow;
    ctx.beginPath();
    ctx.arc(keeper.x, keeper.y, lanternR - 5, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = PALETTE.night;
    ctx.fillRect(keeper.x - 7, keeper.y - lanternR - 4, 14, 5);
    ctx.fillRect(keeper.x - 7, keeper.y + lanternR - 1, 14, 5);
    ctx.strokeStyle = PALETTE.lantern;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(keeper.x, keeper.y - 6, 9, Math.PI, TWO_PI);
    ctx.stroke();
    // Facing tick: a small notch on the side the keeper is moving toward,
    // derived from velocity so it never depends on how facing is stored.
    const speed = Math.sqrt(keeper.vx * keeper.vx + keeper.vy * keeper.vy);
    if (speed > 20) {
      ctx.fillStyle = PALETTE.ink;
      ctx.beginPath();
      ctx.arc(
        keeper.x + (keeper.vx / speed) * 10,
        keeper.y + (keeper.vy / speed) * 10,
        2.5, 0, TWO_PI,
      );
      ctx.fill();
    }
  }

  function drawDarkness(state, time) {
    // The signature look: a dark overlay with a radial hole at the keeper, so
    // everything outside the glow is dimmed and the visible world shrinks as
    // the light drains. Soft edge, subtle flicker, layered falloff.
    const keeper = state.keeper;
    const radius = glowRadius(state.light);
    const flicker = 1 + 0.02 * Math.sin(time * 7.3) + 0.015 * Math.sin(time * 11.1);
    const hole = Math.max(30, radius * flicker);
    const mask = ctx.createRadialGradient(keeper.x, keeper.y, hole * 0.45, keeper.x, keeper.y, hole * 1.7);
    mask.addColorStop(0, 'rgba(13, 16, 38, 0)');
    mask.addColorStop(0.45, 'rgba(13, 16, 38, 0.28)');
    mask.addColorStop(0.75, 'rgba(13, 16, 38, 0.82)');
    mask.addColorStop(1, 'rgba(10, 12, 30, 0.94)');
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    if (state.light < 25) {
      ctx.fillStyle = PALETTE.danger;
      ctx.globalAlpha = 0.05 + 0.03 * Math.sin(time * 4);
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      ctx.globalAlpha = 1;
    }
  }

  function draw(state, screen, best) {
    if (state === null || state === undefined) return;
    const time = state.nightTime || 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.night;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, FIELD.width, FIELD.height);
    ctx.clip();

    drawBackdrop(time);
    drawMist(time);
    drawGloom(state);
    drawFireflies(state);
    drawShadows(state, time);
    // The lantern rests on the end screens: on the lose screen it has gone
    // out, on the win screen dawn has broken — drawing it at the centre
    // would smudge through the score panel. The darkness mask still centres
    // on it, so the backdrop keeps its shape.
    if (screen !== SCREEN_WIN && screen !== SCREEN_LOSE) drawKeeper(state, time);
    drawDarkness(state, time);
    drawFireflyCores(state);
    drawShadowEyes(state);

    ctx.restore();

    if (screen === SCREEN_TITLE) {
      drawTitle(ctx, state, best);
    } else if (screen === SCREEN_PAUSED) {
      drawHUD(ctx, state, screen, best);
      drawPaused(ctx);
    } else if (screen === SCREEN_NIGHT) {
      drawHUD(ctx, state, screen, best);
      drawNight(ctx, state.night);
    } else if (screen === SCREEN_WIN) {
      drawDawn(ctx, state, best);
    } else if (screen === SCREEN_LOSE) {
      drawDark(ctx, state, best);
    } else {
      drawHUD(ctx, state, screen, best);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
