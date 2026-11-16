// LUMEN — keyboard + mouse input.
// Held keys steer the Keeper; one-shot presses are queued as edge-triggered
// action flags and taken once by the main loop, so a press between two frames
// is never lost and never counted twice. Moving the mouse steers the Keeper
// toward the cursor; held keys always win over the mouse.

import { FIELD } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_DASH = 4;
export const ACTION_MUTE = 8;

// How long after the last mouse move the cursor still steers the Keeper.
const MOUSE_STEER_MS = 3000;
// The Keeper stops steering once it is this close (logical px) to the cursor.
const MOUSE_DEAD_ZONE = 10;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const DASH_KEYS = new Set(['Space', 'ShiftLeft', 'ShiftRight']);
const CONFIRM_KEYS = new Set(['Space', 'Enter', 'KeyR']);
const PAUSE_KEYS = new Set(['KeyP', 'Escape']);
const MUTE_KEYS = new Set(['KeyM']);

// Keys whose browser default (scrolling, mostly) must never fire in-game.
const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyP', 'KeyM', 'KeyR', 'Enter', 'Escape',
]);

export function createInput(canvas) {
  const state = {
    keys: new Set(),
    locked: false,
    // Keeper position, refreshed by main every frame so the mouse can steer
    // toward the cursor relative to where the Keeper actually is.
    keeper: { x: FIELD.width / 2, y: FIELD.height / 2 },
    mouse: { x: FIELD.width / 2, y: FIELD.height / 2, active: false, at: 0 },
  };

  let actions = 0;
  // The dash edge lives on its own latch: takeActions() reports it without
  // consuming it, and dashPressed() consumes it. Either call pattern works,
  // and the world's cooldown + charge limit make a repeated report harmless.
  let dashLatch = false;

  function queueDash() {
    dashLatch = true;
    actions |= ACTION_DASH;
  }

  function toLogical(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * FIELD.width,
      y: ((clientY - rect.top) / rect.height) * FIELD.height,
    };
  }

  function onKeyDown(event) {
    if (!GAME_KEYS.has(event.code)) return;
    event.preventDefault();
    if (event.repeat) {
      state.keys.add(event.code);
      return;
    }
    state.keys.add(event.code);
    if (DASH_KEYS.has(event.code)) queueDash();
    if (CONFIRM_KEYS.has(event.code)) actions |= ACTION_CONFIRM;
    if (PAUSE_KEYS.has(event.code)) actions |= ACTION_PAUSE;
    if (MUTE_KEYS.has(event.code)) actions |= ACTION_MUTE;
  }

  function onKeyUp(event) {
    state.keys.delete(event.code);
  }

  function onBlur() {
    // A key released while the tab is hidden never sends keyup: let go of
    // everything so the Keeper cannot keep walking on its own.
    state.keys.clear();
    state.mouse.active = false;
  }

  function onMouseMove(event) {
    const point = toLogical(event.clientX, event.clientY);
    if (!point) return;
    state.mouse.x = point.x;
    state.mouse.y = point.y;
    state.mouse.active = true;
    state.mouse.at = performance.now();
  }

  function onPointerDown(event) {
    const point = toLogical(event.clientX, event.clientY);
    if (point) {
      state.mouse.x = point.x;
      state.mouse.y = point.y;
      state.mouse.active = true;
      state.mouse.at = performance.now();
    }
    actions |= ACTION_CONFIRM;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('pointerdown', onPointerDown);

  function keyboardDirection() {
    let dx = 0;
    let dy = 0;
    for (const code of state.keys) {
      if (LEFT.has(code)) dx -= 1;
      else if (RIGHT.has(code)) dx += 1;
      else if (UP.has(code)) dy -= 1;
      else if (DOWN.has(code)) dy += 1;
    }
    return { dx, dy };
  }

  return {
    state,

    /** One-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions &= ACTION_DASH;
      return taken;
    },

    /** Steering direction, normalized to length 1 at most. */
    direction() {
      const key = keyboardDirection();
      if (key.dx !== 0 || key.dy !== 0) {
        const len = Math.hypot(key.dx, key.dy);
        return { dx: key.dx / len, dy: key.dy / len };
      }
      if (state.mouse.active && performance.now() - state.mouse.at < MOUSE_STEER_MS) {
        const dx = state.mouse.x - state.keeper.x;
        const dy = state.mouse.y - state.keeper.y;
        const len = Math.hypot(dx, dy);
        if (len > MOUSE_DEAD_ZONE) return { dx: dx / len, dy: dy / len };
      }
      return { dx: 0, dy: 0 };
    },

    /** True once per dash press; consumes the dash edge. */
    dashPressed() {
      const pressed = dashLatch;
      dashLatch = false;
      actions &= ~ACTION_DASH;
      return pressed;
    },
  };
}
