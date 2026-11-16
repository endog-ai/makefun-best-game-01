// LUMEN — boot, screens, and the fixed-step loop.
//
// The game owns one world and one screen at a time:
//   title -> play <-> paused, play -> night banner -> play, play -> dawn / dark.
// The loop steps the world at a fixed 1/60 s so the rules play the same on
// every machine; rendering draws whatever state the world holds.
// A `?shot=name&seed=N` URL stages a frozen scene for screenshots instead.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EVENT_HIT,
  EVENT_NIGHT,
  EVENT_WIN,
  EVENT_LOSE,
  EVENT_CATCH,
  EVENT_GOLD,
} from './world.js';
import {
  ACTION_CONFIRM,
  ACTION_PAUSE,
  ACTION_MUTE,
  createInput,
} from './input.js';
import { createAudio } from './audio.js';
import {
  createRenderer,
  SCREEN_TITLE,
  SCREEN_PLAY,
  SCREEN_PAUSED,
  SCREEN_NIGHT,
  SCREEN_WIN,
  SCREEN_LOSE,
} from './render.js';
import { stageShot } from './shots.js';

// How long the "NIGHT n" banner holds between nights.
const NIGHT_BANNER_SECONDS = 1.6;
// A tab left hidden for minutes must not step a huge backlog when it returns.
const MAX_FRAME_SECONDS = 0.25;
// The loop never runs more than this many fixed steps in one frame.
const MAX_STEPS_PER_FRAME = 12;

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const shotSeed = Number(params.get('seed') || '7');

const canvas = document.getElementById('game');
const statusLine = document.getElementById('status');
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();

let best = 0;
try {
  best = Number(localStorage.getItem(BEST_KEY) || '0') || 0;
} catch (err) {
  best = 0;
}

function saveBest() {
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch (err) {
    // Storage may be unavailable (private mode, blocked); the score still
    // shows for this visit.
  }
}

function announce(message) {
  if (statusLine) statusLine.textContent = message;
}

/** A fresh world on a seed: the shot seed for screenshots, a random one for play. */
function newWorld(seed) {
  return createWorld(createRandom(seed));
}

function playSeed() {
  return (Math.random() * 2147483647) | 0;
}

let world = newWorld(shotSeed);
let screen = SCREEN_TITLE;
let nightTimer = 0;

// Read-only probe for automated play-testing (plus a TEST poke the play-test
// uses to fast-forward timers; the game itself never reads it).
window.__lumen = {
  world: () => world,
  screen: () => screen,
  best: () => best,
};

function startGame() {
  world = newWorld(playSeed());
  screen = SCREEN_PLAY;
  accumulator = 0;
  // Swallow the dash edge from the Space press that started the game, so
  // the Keeper does not dash on the very first step.
  input.dashPressed();
  announce('Night 1 — catch fireflies, keep the light alive until dawn.');
}

function finish(win) {
  screen = win ? SCREEN_WIN : SCREEN_LOSE;
  if (world.state.score > best) {
    best = world.state.score;
    saveBest();
  }
  if (win) {
    announce(`Dawn breaks! You kept the light alive. Score ${world.state.score}.`);
  } else {
    announce(`The dark takes you on night ${world.state.night}. Score ${world.state.score}, best ${best}. Press Space to play again.`);
  }
}

/** React to one step's events with sound and screen changes. */
function applyEvents(events) {
  if (events & EVENT_CATCH) audio.catch(world.state.combo);
  if (events & EVENT_GOLD) audio.gold();
  if (events & EVENT_HIT) audio.hit();
  if (events & EVENT_NIGHT) {
    audio.night();
    screen = SCREEN_NIGHT;
    nightTimer = NIGHT_BANNER_SECONDS;
    announce(`Night ${world.state.night} — the dark grows deeper.`);
  }
  if (events & EVENT_WIN) {
    audio.win();
    finish(true);
  }
  if (events & EVENT_LOSE) {
    audio.lose();
    finish(false);
  }
}

let accumulator = 0;

/** The title screen's living backdrop: fireflies drift, shadows prowl, but
 *  the lantern never goes out and no night ever ends the scene. */
function stepAmbient(dt) {
  accumulator += dt;
  let guard = 0;
  while (accumulator >= STEP && guard < MAX_STEPS_PER_FRAME) {
    const events = world.step(STEP, { dx: 0, dy: 0, dash: false }, false);
    accumulator -= STEP;
    guard += 1;
    if (events & EVENT_LOSE || events & EVENT_WIN) {
      world = newWorld(shotSeed);
      accumulator = 0;
      return;
    }
    if (world.state.light < 50) world.state.light = 70;
  }
  if (guard >= MAX_STEPS_PER_FRAME) accumulator = 0;
}

/** One frame of play: fixed steps, dash taken once per frame. */
function stepPlay(dt) {
  accumulator += dt;
  let dash = input.dashPressed();
  let guard = 0;
  while (accumulator >= STEP && guard < MAX_STEPS_PER_FRAME) {
    const dir = input.direction();
    const events = world.step(STEP, { dx: dir.dx, dy: dir.dy, dash }, false);
    dash = false;
    accumulator -= STEP;
    guard += 1;
    applyEvents(events);
    if (screen !== SCREEN_PLAY) {
      accumulator = 0;
      return;
    }
  }
  if (guard >= MAX_STEPS_PER_FRAME) accumulator = 0;
}

let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > MAX_FRAME_SECONDS) dt = MAX_FRAME_SECONDS;

  const actions = input.takeActions();
  if (actions & ACTION_MUTE) audio.setMuted(!audio.muted);

  if (screen === SCREEN_TITLE) {
    if (actions & ACTION_CONFIRM) {
      audio.resume();
      audio.click();
      startGame();
    } else {
      stepAmbient(dt);
    }
  } else if (screen === SCREEN_PLAY) {
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      announce('Paused. Press P or Esc to resume.');
    } else {
      stepPlay(dt);
    }
  } else if (screen === SCREEN_PAUSED) {
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PLAY;
      announce('Resumed.');
    } else if (actions & ACTION_CONFIRM) {
      input.dashPressed();
      screen = SCREEN_PLAY;
      announce('Resumed.');
    }
  } else if (screen === SCREEN_NIGHT) {
    nightTimer -= dt;
    if (nightTimer <= 0 || (actions & ACTION_CONFIRM)) screen = SCREEN_PLAY;
  } else if (screen === SCREEN_WIN || screen === SCREEN_LOSE) {
    if (actions & ACTION_CONFIRM) {
      audio.resume();
      audio.click();
      startGame();
    }
  }

  input.state.keeper.x = world.state.keeper.x;
  input.state.keeper.y = world.state.keeper.y;
  audio.update(world.state.light);
  renderer.draw(world.state, screen, best);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === SCREEN_PLAY) {
    screen = SCREEN_PAUSED;
    announce('Paused. Press P or Esc to resume.');
  }
});

if (shotName) {
  // Screenshot mode: stage the named scene, paint it twice so every layer
  // settles, then signal the harness that the frame is ready.
  const staged = stageShot(shotName, world);
  screen = staged.screen;
  if (staged.best > best) best = staged.best;
  renderer.draw(world.state, screen, best);
  renderer.draw(world.state, screen, best);
  window.__shotReady = true;
} else {
  announce('LUMEN — Keeper of the Last Light. Press Space or click to start.');
  requestAnimationFrame(frame);
}
