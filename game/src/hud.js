// LUMEN — heads-up display and full-screen overlays. Pure drawing only: no
// input, no audio, no state changes. Every colour comes from PALETTE and
// every string is set in FONT, on the fixed 1280x720 logical field.

import { PALETTE, FONT, FIELD, LIGHT, DASH, NIGHTS, COMBO } from './config.js';

const MARGIN = 24;
const BAR_WIDTH = 260;
const BAR_HEIGHT = 18;

function text(ctx, str, x, y, size, colour, align, weight) {
  ctx.save();
  ctx.font = `${weight || 400} ${size}px ${FONT}`;
  ctx.fillStyle = colour;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
  ctx.restore();
}

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

function panel(ctx, x, y, w, h) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, 10);
  ctx.fillStyle = PALETTE.night;
  ctx.globalAlpha = 0.72;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = PALETTE.ground;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function lightBar(ctx, x, y, light, width) {
  const frac = Math.max(0, Math.min(1, light / LIGHT.max));
  const low = light < 25;
  ctx.save();
  roundRectPath(ctx, x, y, width, BAR_HEIGHT, 9);
  ctx.fillStyle = PALETTE.deep;
  ctx.fill();
  if (frac > 0) {
    roundRectPath(ctx, x, y, Math.max(BAR_HEIGHT, width * frac), BAR_HEIGHT, 9);
    ctx.fillStyle = low ? PALETTE.danger : PALETTE.glow;
    ctx.fill();
  }
  ctx.strokeStyle = low ? PALETTE.danger : PALETTE.lantern;
  ctx.lineWidth = 1.5;
  roundRectPath(ctx, x, y, width, BAR_HEIGHT, 9);
  ctx.stroke();
  ctx.restore();
  text(ctx, `${Math.ceil(Math.max(0, light))}`, x + width + 10, y + BAR_HEIGHT / 2, 16, low ? PALETTE.danger : PALETTE.ink, 'left', 700);
}

function dashPips(ctx, x, y, charges) {
  for (let i = 0; i < DASH.charges; i++) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + i * 26 + 9, y + 9, 8, 0, Math.PI * 2);
    ctx.fillStyle = i < charges ? PALETTE.lantern : PALETTE.deep;
    ctx.fill();
    ctx.strokeStyle = PALETTE.glow;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
  text(ctx, 'DASH', x - 8, y + 9, 13, PALETTE.muted, 'right', 700);
}

function scoreBlock(ctx, x, y, score, best, align) {
  text(ctx, `SCORE ${score}`, x, y, 22, PALETTE.ink, align, 700);
  text(ctx, `BEST ${Math.max(best || 0, score)}`, x, y + 24, 14, PALETTE.muted, align, 400);
}

function dim(ctx, alpha) {
  ctx.save();
  ctx.fillStyle = PALETTE.night;
  ctx.globalAlpha = alpha;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.restore();
}

function centreTitle(ctx, title, titleColour) {
  text(ctx, title, FIELD.width / 2, FIELD.height / 2 - 130, 64, titleColour, 'center', 800);
}

function restartHint(ctx, y) {
  text(ctx, 'Press R, Space, or click to play again', FIELD.width / 2, y, 18, PALETTE.muted, 'center', 400);
}

/** In-game HUD: light meter, night, score, combo, dash charges, fireflies. */
export function drawHUD(ctx, state, screen, best) {
  const playing = screen === 'play';
  const top = MARGIN;
  if (playing) {
    text(ctx, 'LIGHT', MARGIN, top + 9, 13, PALETTE.muted, 'left', 700);
    lightBar(ctx, MARGIN + 62, top, state.light, BAR_WIDTH);
    text(ctx, `NIGHT ${state.night} / ${NIGHTS}`, MARGIN, top + 44, 18, PALETTE.ink, 'left', 700);
    text(ctx, `FIREFLIES ${state.caught}`, MARGIN, top + 70, 15, PALETTE.firefly, 'left', 400);
    scoreBlock(ctx, FIELD.width - MARGIN, top + 10, state.score, best, 'right');
    if (state.combo > 1) {
      // The multiplier the world actually pays on the next catch:
      // min(max(combo, 1), maxMul) — the same formula as world's scoring.
      const mul = Math.min(Math.max(state.combo, 1), COMBO.maxMul);
      text(ctx, `COMBO x${mul}  (${state.combo})`, FIELD.width - MARGIN, top + 62, 18, PALETTE.gold, 'right', 700);
    }
    dashPips(ctx, FIELD.width - MARGIN - (DASH.charges - 1) * 26 - 18, FIELD.height - MARGIN - 18, state.keeper.dashLeft);
    text(ctx, 'SPACE dash', FIELD.width - MARGIN, FIELD.height - MARGIN - 44, 13, PALETTE.muted, 'right', 400);
  } else {
    lightBar(ctx, MARGIN, top, state.light, 170);
    text(ctx, `SCORE ${state.score}`, FIELD.width - MARGIN, top + 9, 16, PALETTE.ink, 'right', 700);
  }
}

/** Title screen: name, tagline, instructions, best score, start prompt. */
export function drawTitle(ctx, state, best) {
  dim(ctx, 0.45);
  text(ctx, 'LUMEN', FIELD.width / 2, 150, 84, PALETTE.glow, 'center', 800);
  text(ctx, 'Keeper of the Last Light', FIELD.width / 2, 212, 28, PALETTE.lantern, 'center', 400);
  text(ctx, 'The lantern is the last light in a darkening forest.', FIELD.width / 2, 268, 18, PALETTE.ink, 'center', 400);
  const lines = [
    'Move  WASD / arrows / mouse  —  steer the lantern',
    'Space / Shift  —  dash (3 charges, refilled each night)',
    'Catch fireflies to feed the light  —  gold ones are worth more',
    'Shadows drain your light on touch  —  survive all 5 nights to dawn',
    'P / Esc  —  pause      M  —  mute',
  ];
  lines.forEach((line, i) => {
    text(ctx, line, FIELD.width / 2, 330 + i * 30, 17, PALETTE.muted, 'center', 400);
  });
  if (best > 0) text(ctx, `BEST SCORE  ${best}`, FIELD.width / 2, 512, 20, PALETTE.gold, 'center', 700);
  text(ctx, 'Press Space or click to start', FIELD.width / 2, 566, 24, PALETTE.ink, 'center', 700);
}

/** Pause overlay. */
export function drawPaused(ctx) {
  dim(ctx, 0.68);
  text(ctx, 'PAUSED', FIELD.width / 2, FIELD.height / 2 - 20, 52, PALETTE.ink, 'center', 800);
  text(ctx, 'Press P or Esc to resume', FIELD.width / 2, FIELD.height / 2 + 40, 18, PALETTE.muted, 'center', 400);
  text(ctx, 'M — mute', FIELD.width / 2, FIELD.height / 2 + 72, 15, PALETTE.muted, 'center', 400);
}

/** Night-complete interstitial banner. */
export function drawNight(ctx, night) {
  ctx.save();
  ctx.fillStyle = PALETTE.night;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(0, FIELD.height / 2 - 78, FIELD.width, 156);
  ctx.globalAlpha = 1;
  ctx.restore();
  text(ctx, `NIGHT ${night}`, FIELD.width / 2, FIELD.height / 2 - 22, 56, PALETTE.glow, 'center', 800);
  text(ctx, night >= NIGHTS ? 'The last night — hold the light until dawn' : 'The dark grows deeper', FIELD.width / 2, FIELD.height / 2 + 34, 18, PALETTE.ink, 'center', 400);
}

/** Win screen: dawn breaks. */
export function drawDawn(ctx, state, best) {
  dim(ctx, 0.55);
  centreTitle(ctx, 'DAWN BREAKS', PALETTE.glow);
  text(ctx, 'You kept the light alive through all five nights.', FIELD.width / 2, FIELD.height / 2 - 78, 20, PALETTE.ink, 'center', 400);
  panel(ctx, FIELD.width / 2 - 190, FIELD.height / 2 - 40, 380, 128);
  text(ctx, `SCORE  ${state.score}`, FIELD.width / 2, FIELD.height / 2 + 4, 26, PALETTE.ink, 'center', 700);
  const isBest = state.score > 0 && state.score >= (best || 0);
  text(ctx, isBest ? 'NEW BEST!' : `BEST  ${Math.max(best || 0, state.score)}`, FIELD.width / 2, FIELD.height / 2 + 44, 18, isBest ? PALETTE.gold : PALETTE.muted, 'center', 700);
  text(ctx, `FIREFLIES CAUGHT  ${state.caught}`, FIELD.width / 2, FIELD.height / 2 + 122, 16, PALETTE.firefly, 'center', 400);
  restartHint(ctx, FIELD.height / 2 + 172);
}

/** Lose screen: the dark takes the Keeper. */
export function drawDark(ctx, state, best) {
  dim(ctx, 0.78);
  centreTitle(ctx, 'THE DARK TAKES YOU', PALETTE.danger);
  text(ctx, 'The lantern has gone out.', FIELD.width / 2, FIELD.height / 2 - 78, 20, PALETTE.ink, 'center', 400);
  panel(ctx, FIELD.width / 2 - 190, FIELD.height / 2 - 40, 380, 128);
  text(ctx, `SCORE  ${state.score}`, FIELD.width / 2, FIELD.height / 2 + 4, 26, PALETTE.ink, 'center', 700);
  text(ctx, `BEST  ${Math.max(best || 0, state.score)}`, FIELD.width / 2, FIELD.height / 2 + 44, 18, PALETTE.muted, 'center', 700);
  text(ctx, `YOU REACHED NIGHT ${state.night} OF ${NIGHTS}`, FIELD.width / 2, FIELD.height / 2 + 122, 16, PALETTE.shadow, 'center', 700);
  restartHint(ctx, FIELD.height / 2 + 172);
}
