// A small seeded random source (mulberry32): the same seed always gives the
// same sequence, which is what makes scripted scenes and replays repeatable.
// Every draw goes through next(), which returns a float in [0, 1) — 1 is
// never returned, so range/int/pick never step past their upper bound.

export function createRandom(seed) {
  // Force the seed into a 32-bit integer; any number (or 0) is a valid seed.
  let state = seed | 0;

  function next() {
    state = (state + 0x6d2b79f5) | 0;
    let mix = state;
    mix = Math.imul(mix ^ (mix >>> 15), 1 | mix);
    mix = (mix + Math.imul(mix ^ (mix >>> 7), 61 | mix)) ^ mix;
    return ((mix ^ (mix >>> 14)) >>> 0) / 4294967296;
  }

  function range(a, b) {
    return a + next() * (b - a);
  }

  function int(a, b) {
    // Whole number in [a, b]: both ends are reachable.
    return a + Math.floor(next() * (b - a + 1));
  }

  function pick(arr) {
    return arr[Math.floor(next() * arr.length)];
  }

  return { next, range, int, pick };
}
