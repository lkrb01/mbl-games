import { readonly } from 'vue'
import { getCtx, audioMuted as _muted } from './_audioState'

// ── Primitive builders ────────────────────────────────────────────────────────
function tone(
  ctx: AudioContext,
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType = 'sine',
  vol = 0.25,
) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  gain.gain.setValueAtTime(vol, start)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.start(start)
  osc.stop(start + duration + 0.01)
}

function noise(ctx: AudioContext, start: number, duration: number, vol = 0.35) {
  const n = Math.floor(ctx.sampleRate * duration)
  const buf = ctx.createBuffer(1, n, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.5)
  const src = ctx.createBufferSource()
  src.buffer = buf
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(vol, start)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  src.connect(gain)
  gain.connect(ctx.destination)
  src.start(start)
}

// ── Composable ───────────────────────────────────────────────────────────────
export function useSound() {
  function play(fn: (ctx: AudioContext, t: number) => void) {
    if (_muted.value) return
    const ctx = getCtx()
    if (!ctx) return
    try { fn(ctx, ctx.currentTime) } catch { /* ignore audio errors */ }
  }

  return {
    muted: readonly(_muted),
    toggleMute() { _muted.value = !_muted.value },

    // Snake
    eat:      () => play((ctx, t) => tone(ctx, 660, t, 0.08, 'square', 0.18)),

    // Memory
    flip:     () => play((ctx, t) => tone(ctx, 320, t, 0.07, 'triangle', 0.14)),
    match:    () => play((ctx, t) => { tone(ctx, 523, t, 0.1); tone(ctx, 784, t + 0.1, 0.15) }),

    // Quiz / general correct-wrong
    correct:  () => play((ctx, t) => {
      tone(ctx, 523, t, 0.09)
      tone(ctx, 659, t + 0.09, 0.09)
      tone(ctx, 784, t + 0.18, 0.18)
    }),
    wrong:    () => play((ctx, t) => tone(ctx, 160, t, 0.22, 'sawtooth', 0.14)),

    // Space Invaders
    shoot:    () => play((ctx, t) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(880, t)
      osc.frequency.exponentialRampToValueAtTime(110, t + 0.11)
      gain.gain.setValueAtTime(0.18, t)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11)
      osc.start(t); osc.stop(t + 0.12)
    }),
    explode:   () => play((ctx, t) => noise(ctx, t, 0.18, 0.4)),
    playerHit: () => play((ctx, t) => {
      tone(ctx, 220, t, 0.1, 'sawtooth', 0.2)
      tone(ctx, 160, t + 0.1, 0.15, 'sawtooth', 0.14)
    }),

    // 2048
    slide:    () => play((ctx, t) => tone(ctx, 200, t, 0.05, 'sine', 0.07)),
    merge:    () => play((ctx, t) => { tone(ctx, 440, t, 0.07); tone(ctx, 660, t + 0.06, 0.1) }),

    // Platformer
    jump: () => play((ctx, t) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'square'
      osc.frequency.setValueAtTime(220, t)
      osc.frequency.exponentialRampToValueAtTime(520, t + 0.1)
      gain.gain.setValueAtTime(0.13, t)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
      osc.start(t); osc.stop(t + 0.13)
    }),
    stomp: () => play((ctx, t) => {
      noise(ctx, t, 0.08, 0.3)
      tone(ctx, 180, t, 0.07, 'sine', 0.15)
    }),
    land: () => play((ctx, t) => tone(ctx, 120, t, 0.04, 'sine', 0.1)),

    // Children games
    tick:      () => play((ctx, t) => tone(ctx, 480, t, 0.05, 'square', 0.12)),
    celebrate: () => play((ctx, t) => {
      ;[523, 659, 784, 880, 1047].forEach((f, i) => tone(ctx, f, t + i * 0.09, 0.14))
    }),

    // End states
    win: () => play((ctx, t) => {
      ;[523, 659, 784, 1047].forEach((f, i) => tone(ctx, f, t + i * 0.12, 0.22))
    }),
    gameOver: () => play((ctx, t) => {
      ;[392, 330, 294, 220].forEach((f, i) => tone(ctx, f, t + i * 0.14, 0.18, 'sawtooth', 0.14))
    }),
  }
}
