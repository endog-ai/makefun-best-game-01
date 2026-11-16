// LUMEN — the rules and state, with no drawing and no browser in it.
// step() advances one fixed step and returns what happened as bit flags, so
// the caller can react (sound, screens) without the world knowing about them.
// Nothing here allocates after createWorld returns: shadows come from a fixed
// pool and are swap-removed from the live list; fireflies are a fixed array.

import {
  FIELD,
  KEEPER,
  LIGHT,
  FIREFLY,
  DASH,
  COMBO,
  NIGHTS,
  NIGHTS_TUNING,
  NIGHT_SECONDS,
} from './config.js';

export const EVENT_HIT = 1;
export const EVENT_NIGHT = 2;
export const EVENT_WIN = 4;
export const EVENT_LOSE = 8;
export const EVENT_CATCH = 16;
export const EVENT_GOLD = 32;

// The gloom wall (nights 4-5): how wide it is, how fast it sweeps, and how
// fast it drains the light of a Keeper caught inside it.
const GLOOM_WIDTH = 170;
const GLOOM_SPEED = 95;
const GLOOM_DRAIN = 6;

// Shadow pool: the most shadows that can exist at once.
const MAX_SHADOWS = 20;

// A caught firefly comes back after a short breather, somewhere new.
const RESPAWN_MIN = 0.7;
const RESPAWN_JITTER = 0.5;

// New fireflies and shadows never appear right on top of the Keeper — and
// never inside the catch reach either: 260 is the glow at full light, so a
// firefly only ever gets caught because the Keeper moved to it (or it
// drifted in), never because it spawned inside the lantern's light.
const SAFE_DIST = 260;

/** The Keeper's glow radius at a given light level: light is vision. */
export function glowRadius(light) {
  const t = Math.max(0, Math.min(1, light / LIGHT.max));
  return LIGHT.glowMin + (LIGHT.glowMax - LIGHT.glowMin) * t;
}

export function createWorld(random) {
  const keeper = {
    x: FIELD.width / 2,
    y: FIELD.height / 2,
    vx: 0,
    vy: 0,
    dashLeft: DASH.charges,
    dashCd: 0,
    facing: -Math.PI / 2,
  };

  // Fixed firefly flock: slots are reused, never re-allocated.
  const fireflies = [];
  for (let i = 0; i < FIREFLY.count; i += 1) {
    fireflies.push({
      x: 0, y: 0, vx: 0, vy: 0,
      gold: false, phase: 0, caught: false, respawn: 0,
      driftX: 0, driftY: 0,
    });
  }

  // Shadow pool (closure) + the live list the renderer reads (state).
  const shadowPool = [];
  for (let i = 0; i < MAX_SHADOWS; i += 1) {
    shadowPool.push({ x: 0, y: 0, vx: 0, vy: 0, kind: 'drifter', r: 18 });
  }
  const shadows = [];

  const gloom = { active: false, x: -GLOOM_WIDTH, dir: 1 };

  const state = {
    keeper,
    light: LIGHT.start,
    score: 0,
    combo: 0,
    comboTimer: 0,
    bestCombo: 0,
    night: 1,
    nightTime: 0,
    fireflies,
    shadows,
    gloom: null,
    caught: 0,
    hits: 0,
  };

  // Timers the renderer never needs: dash burst, invulnerability, spawns.
  let invuln = 0;
  let dashTime = 0;
  let dashDirX = 0;
  let dashDirY = -1;
  let spawnTimer = NIGHTS_TUNING[0].spawnInterval;
  let gloomTimer = 5;

  function tuning() {
    return NIGHTS_TUNING[state.night - 1];
  }

  // A random point inside the field, kept away from the Keeper.
  function scatter(x, y) {
    for (let tries = 0; tries < 8; tries += 1) {
      const px = 40 + random.next() * (FIELD.width - 80);
      const py = 40 + random.next() * (FIELD.height - 80);
      const dx = px - keeper.x;
      const dy = py - keeper.y;
      if (dx * dx + dy * dy > SAFE_DIST * SAFE_DIST) return { x: px, y: py };
    }
    return { x: 40 + random.next() * (FIELD.width - 80), y: 40 + random.next() * (FIELD.height - 80) };
  }

  function placeFirefly(f) {
    const p = scatter();
    f.x = p.x;
    f.y = p.y;
    f.vx = (random.next() - 0.5) * FIREFLY.speed;
    f.vy = (random.next() - 0.5) * FIREFLY.speed;
    f.gold = random.next() < FIREFLY.goldChance;
    f.phase = random.next() * Math.PI * 2;
    // A slow, fixed drift direction: each firefly ambles its own way instead
    // of all of them bunching up in the middle of the field.
    const driftAngle = random.next() * Math.PI * 2;
    f.driftX = Math.cos(driftAngle) * 10;
    f.driftY = Math.sin(driftAngle) * 10;
    f.caught = false;
    f.respawn = 0;
  }

  function countKind(kind) {
    let n = 0;
    for (let i = 0; i < shadows.length; i += 1) {
      if (shadows[i].kind === kind) n += 1;
    }
    return n;
  }

  function spawnShadow() {
    if (shadows.length >= MAX_SHADOWS || shadowPool.length === 0) return;
    const t = tuning();
    let kind = 'drifter';
    const roll = random.next();
    if (countKind('eater') < t.eaters && roll < 0.25) kind = 'eater';
    else if (countKind('lurker') < t.lurkers && roll < 0.55) kind = 'lurker';

    const s = shadowPool.pop();
    const edge = random.int(0, 3);
    if (edge === 0) { s.x = 24; s.y = random.next() * FIELD.height; }
    else if (edge === 1) { s.x = FIELD.width - 24; s.y = random.next() * FIELD.height; }
    else if (edge === 2) { s.x = random.next() * FIELD.width; s.y = 24; }
    else { s.x = random.next() * FIELD.width; s.y = FIELD.height - 24; }
    s.vx = 0;
    s.vy = 0;
    s.kind = kind;
    s.r = kind === 'eater' ? 20 + random.next() * 6
      : kind === 'lurker' ? 16 + random.next() * 6
      : 18 + random.next() * 8;
    shadows.push(s);
  }

  function killShadow(i) {
    // Swap-remove from the live list; the object goes back to the pool.
    const last = shadows.length - 1;
    const dead = shadows[i];
    shadows[i] = shadows[last];
    shadows.pop();
    shadowPool.push(dead);
  }

  function clearShadows() {
    while (shadows.length > 0) killShadow(shadows.length - 1);
  }

  function insideGloom(x) {
    return state.gloom !== null && state.gloom.active
      && Math.abs(x - state.gloom.x) < GLOOM_WIDTH / 2;
  }

  function moveKeeper(dt, input) {
    let dx = input.dx || 0;
    let dy = input.dy || 0;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }

    if (dashTime > 0) {
      // Mid-dash: locked onto the burst direction at dash speed.
      dashTime -= dt;
      keeper.vx = dashDirX * DASH.speed;
      keeper.vy = dashDirY * DASH.speed;
    } else if (len > 0.01) {
      keeper.vx += dx * KEEPER.accel * dt;
      keeper.vy += dy * KEEPER.accel * dt;
      keeper.facing = Math.atan2(dy, dx);
      const speed = Math.hypot(keeper.vx, keeper.vy);
      if (speed > KEEPER.speed) {
        keeper.vx = (keeper.vx / speed) * KEEPER.speed;
        keeper.vy = (keeper.vy / speed) * KEEPER.speed;
      }
    } else {
      // No input: friction bleeds the velocity away.
      const damp = Math.max(0, 1 - KEEPER.friction * dt);
      keeper.vx *= damp;
      keeper.vy *= damp;
    }

    keeper.x += keeper.vx * dt;
    keeper.y += keeper.vy * dt;
    keeper.x = Math.max(KEEPER.radius, Math.min(FIELD.width - KEEPER.radius, keeper.x));
    keeper.y = Math.max(KEEPER.radius, Math.min(FIELD.height - KEEPER.radius, keeper.y));
    if (keeper.x === KEEPER.radius || keeper.x === FIELD.width - KEEPER.radius) keeper.vx = 0;
    if (keeper.y === KEEPER.radius || keeper.y === FIELD.height - KEEPER.radius) keeper.vy = 0;
  }

  function tryDash(input) {
    if (!input.dash || keeper.dashLeft <= 0 || keeper.dashCd > 0) return;
    let dx = input.dx || 0;
    let dy = input.dy || 0;
    if (Math.hypot(dx, dy) < 0.01) {
      dx = Math.cos(keeper.facing);
      dy = Math.sin(keeper.facing);
    } else {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
    }
    dashDirX = dx;
    dashDirY = dy;
    dashTime = DASH.time;
    invuln = Math.max(invuln, 0.35);
    keeper.dashLeft -= 1;
    keeper.dashCd = DASH.cooldown;
  }

  function updateFireflies(dt) {
    let events = 0;
    const glow = glowRadius(state.light);
    for (let i = 0; i < fireflies.length; i += 1) {
      const f = fireflies[i];
      f.phase += dt * 2;
      if (f.caught) {
        f.respawn -= dt;
        if (f.respawn <= 0) placeFirefly(f);
        continue;
      }
      // Random walk plus the firefly's own slow drift; no pull toward the
      // Keeper, so the flock stays spread across the whole field.
      f.vx += (random.next() - 0.5) * FIREFLY.wander * 160 * dt;
      f.vy += (random.next() - 0.5) * FIREFLY.wander * 160 * dt;
      f.x += f.driftX * dt;
      f.y += f.driftY * dt;
      const speed = Math.hypot(f.vx, f.vy);
      if (speed > FIREFLY.speed) {
        f.vx = (f.vx / speed) * FIREFLY.speed;
        f.vy = (f.vy / speed) * FIREFLY.speed;
      }
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.x < 12) { f.x = 12; f.vx = Math.abs(f.vx); f.driftX = Math.abs(f.driftX); }
      if (f.x > FIELD.width - 12) { f.x = FIELD.width - 12; f.vx = -Math.abs(f.vx); f.driftX = -Math.abs(f.driftX); }
      if (f.y < 12) { f.y = 12; f.vy = Math.abs(f.vy); f.driftY = Math.abs(f.driftY); }
      if (f.y > FIELD.height - 12) { f.y = FIELD.height - 12; f.vy = -Math.abs(f.vy); f.driftY = -Math.abs(f.driftY); }

      // Catch: inside the glow, and not hidden behind the gloom wall.
      if (insideGloom(f.x)) continue;
      const fr = f.gold ? FIREFLY.goldRadius : FIREFLY.radius;
      const dx = f.x - keeper.x;
      const dy = f.y - keeper.y;
      const reach = glow + fr;
      if (dx * dx + dy * dy > reach * reach) continue;

      const mul = Math.min(Math.max(state.combo, 1), COMBO.maxMul);
      state.score += (f.gold ? FIREFLY.goldPoints : FIREFLY.points) * mul;
      state.light = Math.min(
        LIGHT.max,
        state.light + (f.gold ? LIGHT.goldGain : LIGHT.catchGain),
      );
      state.combo += 1;
      state.comboTimer = COMBO.window;
      if (state.combo > state.bestCombo) state.bestCombo = state.combo;
      state.caught += 1;
      events |= EVENT_CATCH;
      if (f.gold) events |= EVENT_GOLD;
      f.caught = true;
      f.respawn = RESPAWN_MIN + random.next() * RESPAWN_JITTER;
    }
    return events;
  }

  function nearestFirefly(x, y) {
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < fireflies.length; i += 1) {
      const f = fireflies[i];
      if (f.caught) continue;
      const dx = f.x - x;
      const dy = f.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = f; }
    }
    return best;
  }

  function updateShadows(dt) {
    let events = 0;
    const t = tuning();
    const glow = glowRadius(state.light);

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnShadow();
      spawnTimer = t.spawnInterval * (0.85 + random.next() * 0.3);
    }

    for (let i = shadows.length - 1; i >= 0; i -= 1) {
      const s = shadows[i];
      // Pick a target: eaters hunt fireflies, the rest hunt the Keeper.
      let tx = keeper.x;
      let ty = keeper.y;
      let speed = t.shadowSpeed;
      if (s.kind === 'eater') {
        const prey = nearestFirefly(s.x, s.y);
        if (prey !== null) { tx = prey.x; ty = prey.y; speed = t.shadowSpeed * 0.9; }
      } else if (s.kind === 'drifter') {
        speed = t.shadowSpeed * 0.55;
      }
      const dx = tx - s.x;
      const dy = ty - s.y;
      const dist = Math.hypot(dx, dy) || 1;
      s.vx = (dx / dist) * speed;
      s.vy = (dy / dist) * speed;
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      // Eaters swallow the firefly they touch; it comes back elsewhere.
      if (s.kind === 'eater') {
        for (let j = 0; j < fireflies.length; j += 1) {
          const f = fireflies[j];
          if (f.caught) continue;
          const fx = f.x - s.x;
          const fy = f.y - s.y;
          const fr = f.gold ? FIREFLY.goldRadius : FIREFLY.radius;
          const reach = s.r + fr;
          if (fx * fx + fy * fy < reach * reach) {
            f.caught = true;
            f.respawn = RESPAWN_MIN + random.next() * RESPAWN_JITTER;
            break;
          }
        }
      }

      // A shadow that touches the glow drains the light and bursts.
      const kx = keeper.x - s.x;
      const ky = keeper.y - s.y;
      const hitReach = glow + s.r;
      if (invuln <= 0 && kx * kx + ky * ky < hitReach * hitReach) {
        state.light -= LIGHT.hitLoss;
        state.hits += 1;
        state.combo = 0;
        state.comboTimer = 0;
        invuln = 1.0;
        events |= EVENT_HIT;
        killShadow(i);
      }
    }
    return events;
  }

  function updateGloom(dt) {
    if (!tuning().gloom) {
      state.gloom = null;
      return;
    }
    if (state.gloom === null) {
      state.gloom = gloom;
      gloom.active = false;
      gloom.x = -GLOOM_WIDTH;
      gloom.dir = 1;
      gloomTimer = 5;
    }
    if (!gloom.active) {
      gloomTimer -= dt;
      if (gloomTimer <= 0) {
        gloom.active = true;
        gloom.x = gloom.dir > 0 ? -GLOOM_WIDTH / 2 : FIELD.width + GLOOM_WIDTH / 2;
      }
      return;
    }
    gloom.x += gloom.dir * GLOOM_SPEED * dt;
    const past = gloom.dir > 0
      ? gloom.x - GLOOM_WIDTH / 2 > FIELD.width
      : gloom.x + GLOOM_WIDTH / 2 < 0;
    if (past) {
      gloom.active = false;
      gloom.dir = -gloom.dir;
      gloomTimer = 7 + random.next() * 3;
    }
    if (insideGloom(keeper.x)) state.light -= GLOOM_DRAIN * dt;
  }

  function endNight() {
    if (state.night >= NIGHTS) return EVENT_WIN;
    state.night += 1;
    state.nightTime = 0;
    keeper.dashLeft = DASH.charges;
    state.light = Math.min(LIGHT.max, state.light + 15);
    clearShadows();
    for (let i = 0; i < fireflies.length; i += 1) placeFirefly(fireflies[i]);
    spawnTimer = tuning().spawnInterval;
    if (!tuning().gloom) state.gloom = null;
    return EVENT_NIGHT;
  }

  function reset() {
    keeper.x = FIELD.width / 2;
    keeper.y = FIELD.height / 2;
    keeper.vx = 0;
    keeper.vy = 0;
    keeper.dashLeft = DASH.charges;
    keeper.dashCd = 0;
    keeper.facing = -Math.PI / 2;
    state.light = LIGHT.start;
    state.score = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.bestCombo = 0;
    state.night = 1;
    state.nightTime = 0;
    state.caught = 0;
    state.hits = 0;
    state.gloom = null;
    clearShadows();
    for (let i = 0; i < fireflies.length; i += 1) placeFirefly(fireflies[i]);
    invuln = 0;
    dashTime = 0;
    dashDirX = 0;
    dashDirY = -1;
    spawnTimer = NIGHTS_TUNING[0].spawnInterval;
    gloomTimer = 5;
  }

  function step(dt, input, paused) {
    if (paused) return 0;
    let events = 0;
    const safeInput = input || { dx: 0, dy: 0, dash: false };

    if (keeper.dashCd > 0) keeper.dashCd -= dt;
    if (invuln > 0) invuln = Math.max(0, invuln - dt);
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }

    tryDash(safeInput);
    moveKeeper(dt, safeInput);
    events |= updateFireflies(dt);
    events |= updateShadows(dt);
    updateGloom(dt);

    // The light always burns down, faster as the nights wear on.
    state.light -= (LIGHT.drainPerSec + state.night * LIGHT.drainPerNight) * dt;
    if (state.light <= 0) {
      state.light = 0;
      return events | EVENT_LOSE;
    }

    state.nightTime += dt;
    if (state.nightTime >= NIGHT_SECONDS) {
      events |= endNight();
    }
    return events;
  }

  reset();
  return { state, reset, step };
}
