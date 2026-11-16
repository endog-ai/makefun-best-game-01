// Screenshot scenes behind ?shot=start|play|win|lose. Each scene plays the real
// rules forward from a fresh world with a scripted autopilot — steer toward the
// nearest firefly, dash once — so the frame is what a short game really looks
// like. Deterministic: the only randomness is world.random, and the autopilot
// reads only world.state, so the same seed always gives the same pixels.
import { STEP } from './config.js';
import { SCREEN_TITLE, SCREEN_PLAY, SCREEN_WIN, SCREEN_LOSE } from './render.js';

const DASH_AT_SECONDS = 6;
const STAGED_BEST = 1250;
const WIN_SCORE = 2450;
const LOSE_SCORE = 1180;
const LOSE_NIGHT = 3;

// Steer toward the nearest living firefly; stand still when there is none.
function autopilot(state) {
  let nearest = null;
  let nearestDist = Infinity;
  const flies = state.fireflies;
  for (let i = 0; i < flies.length; i += 1) {
    const fly = flies[i];
    if (fly.caught) continue;
    const dx = fly.x - state.keeper.x;
    const dy = fly.y - state.keeper.y;
    const dist = dx * dx + dy * dy;
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = fly;
    }
  }
  if (nearest === null) return { dx: 0, dy: 0, dash: false };
  const dx = nearest.x - state.keeper.x;
  const dy = nearest.y - state.keeper.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return { dx: 0, dy: 0, dash: false };
  return { dx: dx / len, dy: dy / len, dash: false };
}

// Run the autopilot forward. Play into night 3 — by then lurkers and eaters
// are in the field and the night system is visible in the HUD — then weave
// (short moves with pauses) so the shadows chasing the Keeper close in and
// show in the frame, and hold still for a breath at the end.
function playForward(world) {
  const maxSteps = Math.round(80 / STEP);
  const dashStep = Math.round(DASH_AT_SECONDS / STEP);
  const weaveSteps = Math.round(8 / STEP);
  const stillSteps = Math.round(2.5 / STEP);
  let step = 0;
  while (step < maxSteps) {
    const input = autopilot(world.state);
    if (step === dashStep) input.dash = true;
    world.step(STEP, input, false);
    step += 1;
    if (world.state.light <= 0) break;
    if (world.state.night >= 3 && world.state.nightTime > 4
      && world.state.score > 0 && world.state.combo > 1) break;
  }
  for (let i = 0; i < weaveSteps; i += 1) {
    const moving = Math.floor(i / 30) % 2 === 0;
    const input = moving ? autopilot(world.state) : { dx: 0, dy: 0, dash: false };
    world.step(STEP, input, false);
    if (world.state.light <= 0) break;
  }
  for (let i = 0; i < stillSteps; i += 1) {
    world.step(STEP, { dx: 0, dy: 0, dash: false }, false);
    if (world.state.light <= 0) break;
  }
}

// Set `world` to the named scene and return the screen to draw over it and the
// best score to show. Any unknown name stages the title, like 'start' does.
export function stageShot(name, world) {
  world.reset();
  if (name === 'play') {
    playForward(world);
    const best = world.state.score > STAGED_BEST ? world.state.score : STAGED_BEST;
    return { screen: SCREEN_PLAY, best };
  }
  if (name === 'win') {
    world.state.score = WIN_SCORE;
    world.state.light = 80;
    world.state.night = 5;
    world.state.caught = 41;
    return { screen: SCREEN_WIN, best: WIN_SCORE };
  }
  if (name === 'lose') {
    world.state.light = 0;
    world.state.night = LOSE_NIGHT;
    world.state.score = LOSE_SCORE;
    world.state.combo = 0;
    world.state.comboTimer = 0;
    return { screen: SCREEN_LOSE, best: STAGED_BEST };
  }
  return { screen: SCREEN_TITLE, best: STAGED_BEST };
}
