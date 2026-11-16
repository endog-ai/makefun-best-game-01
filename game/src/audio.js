// LUMEN — synthesized sound. No audio files, no network: every effect is an
// oscillator (or a short burst of filtered noise) through a gain envelope.
// The AudioContext is created lazily on the first user gesture (resume()), so
// autoplay rules never block it, and every method is a no-op — never a throw
// — when audio is unavailable. A low drone fades in while light is low.

export function createAudio() {
  let ctx = null;
  let master = null;
  let droneGain = null;
  let isMuted = false;

  function ensureContext() {
    if (ctx) return ctx;
    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      ctx = new AudioContextClass();
      master = ctx.createGain();
      master.gain.value = isMuted ? 0 : 0.9;
      master.connect(ctx.destination);
      startDrone();
    } catch (err) {
      ctx = null;
      master = null;
    }
    return ctx;
  }

  // Two detuned low sines with a slow tremolo, silent until light runs low.
  function startDrone() {
    try {
      droneGain = ctx.createGain();
      droneGain.gain.value = 0;
      droneGain.connect(master);
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.4;
      lfoGain.gain.value = 0.05;
      lfo.connect(lfoGain);
      lfoGain.connect(droneGain.gain);
      lfo.start();
      for (const freq of [55, 82.5]) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.connect(droneGain);
        osc.start();
      }
    } catch (err) {
      droneGain = null;
    }
  }

  function tone(freq, duration, type, volume, delay, slideTo) {
    if (!ctx || !master) return;
    try {
      const now = ctx.currentTime + (delay || 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + duration + 0.05);
    } catch (err) {
      // A failed note must never break the game loop.
    }
  }

  // Short burst of white noise through a sweeping band-pass filter.
  function whoosh(duration, volume, fromFreq, toFreq) {
    if (!ctx || !master) return;
    try {
      const now = ctx.currentTime;
      const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 1.1;
      filter.frequency.setValueAtTime(fromFreq, now);
      filter.frequency.exponentialRampToValueAtTime(toFreq, now + duration);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start(now);
      source.stop(now + duration + 0.05);
    } catch (err) {
      // Silence is better than a crash.
    }
  }

  const audio = {
    /** Create / resume the context. Call from a user gesture. */
    resume() {
      const context = ensureContext();
      if (!context) return;
      try {
        if (context.state === 'suspended') context.resume();
      } catch (err) {
        // Playing without sound is fine; the game goes on.
      }
    },

    /** Bright chime; the pitch climbs a semitone per combo step. */
    catch(combo) {
      if (!ensureContext()) return;
      const steps = Math.min(Math.max(combo || 0, 0), 12);
      const base = 540 * Math.pow(2, steps / 12);
      tone(base, 0.22, 'sine', 0.22, 0);
      tone(base * 2, 0.14, 'sine', 0.08, 0);
    },

    /** Two-note chime for a gold firefly. */
    gold() {
      if (!ensureContext()) return;
      tone(659.25, 0.2, 'sine', 0.22, 0);
      tone(987.77, 0.3, 'sine', 0.22, 0.09);
      tone(1318.5, 0.22, 'sine', 0.08, 0.09);
    },

    /** Low thud when a shadow touches the glow. */
    hit() {
      if (!ensureContext()) return;
      tone(120, 0.28, 'sine', 0.4, 0, 48);
      tone(70, 0.2, 'triangle', 0.25, 0, 40);
    },

    /** Airy whoosh for a dash. */
    dash() {
      if (!ensureContext()) return;
      whoosh(0.22, 0.28, 500, 2600);
    },

    /** Soft major arpeggio when a new night begins. */
    night() {
      if (!ensureContext()) return;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => tone(freq, 0.34, 'sine', 0.16, i * 0.1));
    },

    /** Rising arpeggio for the dawn win. */
    win() {
      if (!ensureContext()) return;
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
      notes.forEach((freq, i) => tone(freq, 0.42, 'sine', 0.18, i * 0.12));
    },

    /** Descending minor tones for the dark lose. */
    lose() {
      if (!ensureContext()) return;
      const notes = [392, 311.13, 233.08];
      notes.forEach((freq, i) => tone(freq, 0.5, 'triangle', 0.2, i * 0.18));
    },

    /** Tiny blip for menu confirms. */
    click() {
      if (!ensureContext()) return;
      tone(880, 0.06, 'sine', 0.14, 0);
    },

    /** Mute or unmute the master gain. */
    setMuted(m) {
      isMuted = !!m;
      if (master && ctx) {
        try {
          master.gain.setTargetAtTime(isMuted ? 0 : 0.9, ctx.currentTime, 0.02);
        } catch (err) {
          // Muting must never throw.
        }
      }
    },

    get muted() {
      return isMuted;
    },

    /** Per-frame hook: fade the low drone in while light is below 25. */
    update(light) {
      if (!ctx || !droneGain) return;
      try {
        const level = typeof light === 'number' ? light : 100;
        const target = level < 25 ? ((25 - level) / 25) * 0.14 : 0;
        droneGain.gain.setTargetAtTime(target, ctx.currentTime, 0.4);
      } catch (err) {
        // The drone is ambience, never a failure mode.
      }
    },
  };

  return audio;
}
