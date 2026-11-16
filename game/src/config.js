// LUMEN — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to
// the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'lumen.best';

/** The only colours used anywhere in the game or its page. */
export const PALETTE = {
  night: '#0d1026',
  deep: '#161a33',
  ground: '#1e2440',
  lantern: '#f5a623',
  glow: '#ffcf6e',
  firefly: '#7ef0c1',
  gold: '#ffd166',
  shadow: '#6b4fa1',
  ink: '#f2ead8',
  muted: '#8f96b8',
  danger: '#e5534b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** The Keeper: a lantern carried through the dark. */
export const KEEPER = { radius: 16, speed: 340, accel: 2600, friction: 6 };

/** Light is both health and vision: it drains, and the glow shrinks with it.
 *  The per-second drain is drainPerSec + night * drainPerNight, so later
 *  nights burn the lantern down faster and catches matter more. */
export const LIGHT = {
  max: 100,
  start: 70,
  drainPerSec: 0.9,
  drainPerNight: 0.25,
  catchGain: 6,
  goldGain: 12,
  hitLoss: 14,
  glowMin: 90,
  glowMax: 260,
};

/** Fireflies: the fuel. Gold ones are worth more but drift near shadows. */
export const FIREFLY = {
  radius: 7,
  goldRadius: 9,
  speed: 40,
  count: 14,
  goldChance: 0.18,
  points: 10,
  goldPoints: 30,
  wander: 1.2,
};

/** Dash: a short burst with brief invulnerability; refilled each night. */
export const DASH = { charges: 3, speed: 900, time: 0.16, cooldown: 0.9 };

/** Consecutive catches without a hit multiply the score. */
export const COMBO = { window: 4.0, maxMul: 5 };

/** Survive all five nights and dawn breaks. */
export const NIGHTS = 5;

/**
 * NIGHTS_TUNING[night - 1]: how each night plays.
 * Night 1: drifters only. Night 2 adds lurkers. Night 3 adds eaters.
 * Nights 4-5 add the sweeping gloom wall; night 5 is the fastest of all.
 */
export const NIGHTS_TUNING = [
  { shadowSpeed: 55, spawnInterval: 2.6, lurkers: 0, eaters: 0, gloom: false },
  { shadowSpeed: 70, spawnInterval: 2.2, lurkers: 2, eaters: 0, gloom: false },
  { shadowSpeed: 85, spawnInterval: 1.9, lurkers: 3, eaters: 1, gloom: false },
  { shadowSpeed: 100, spawnInterval: 1.6, lurkers: 4, eaters: 2, gloom: true },
  { shadowSpeed: 118, spawnInterval: 1.35, lurkers: 5, eaters: 3, gloom: true },
];

/** Seconds of play in each night. */
export const NIGHT_SECONDS = 30;
