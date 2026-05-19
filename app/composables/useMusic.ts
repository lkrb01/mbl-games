import { readonly, watch, onMounted, onUnmounted } from 'vue'
import { getCtx, audioMuted } from './_audioState'

// ── Types ─────────────────────────────────────────────────────────────────────
type Note  = [beat: number, dur: number, midi: number]
interface Voice { type: OscillatorType; vol: number; notes: Note[] }
interface Track { bpm: number; loop: number; voices: Voice[] }

// ── MIDI → Hz ─────────────────────────────────────────────────────────────────
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12)

// ── Track data ────────────────────────────────────────────────────────────────
// Each note: [startBeat (8th-note ticks), durationBeats, midiNote]
// BPM is quarter-note BPM; 1 tick = 1 eighth note = 60/bpm/2 seconds

const TRACKS: Record<string, Track> = {

  // ── Snake: tense 8-bit groove, C minor, 136 BPM ──────────────────────────
  snake: {
    bpm: 136, loop: 16,
    voices: [
      { type: 'square', vol: 0.13, notes: [
        [0,1,48],[2,1,55],[4,1,51],[6,1,58],
        [8,1,48],[10,1,55],[12,1,53],[14,1,55],
      ]},
      { type: 'square', vol: 0.08, notes: [
        [0,1,72],[1,1,70],[2,1,67],[3,1,65],[4,1,63],[5,1,65],[6,1,67],[7,1,70],
        [8,1,72],[9,1,70],[10,2,75],[12,2,72],[14,1,70],[15,1,67],
      ]},
    ],
  },

  // ── Memory: gentle arpeggio, C major, 78 BPM ─────────────────────────────
  memory: {
    bpm: 78, loop: 32,
    voices: [
      { type: 'triangle', vol: 0.11, notes: [
        [0,2,60],[2,2,64],[4,2,67],[6,2,64],   // C maj
        [8,2,57],[10,2,60],[12,2,64],[14,2,60], // A min
        [16,2,53],[18,2,57],[20,2,60],[22,2,57],// F maj
        [24,2,55],[26,2,59],[28,2,62],[30,2,59],// G maj
      ]},
      { type: 'square', vol: 0.06, notes: [
        [0,4,72],[4,2,71],[6,2,69],
        [8,4,69],[12,2,67],[14,2,65],
        [16,4,65],[20,2,64],[22,2,62],
        [24,4,62],[28,2,64],[30,2,67],
      ]},
    ],
  },

  // ── Quiz: upbeat game-show, F major, 140 BPM ─────────────────────────────
  quiz: {
    bpm: 140, loop: 16,
    voices: [
      { type: 'square', vol: 0.11, notes: [
        [0,1,53],[2,1,53],[4,1,53],[6,1,53],
        [8,1,53],[10,1,53],[12,2,60],[14,2,58],
      ]},
      { type: 'square', vol: 0.08, notes: [
        [0,1,77],[1,1,74],[2,1,72],[3,1,70],
        [4,2,72],[6,1,74],[7,1,72],
        [8,2,69],[10,1,65],[11,1,67],
        [12,2,70],[14,2,72],
      ]},
    ],
  },

  // ── 2048: music-box arpeggio, G major, 96 BPM ────────────────────────────
  '2048': {
    bpm: 96, loop: 16,
    voices: [
      { type: 'triangle', vol: 0.10, notes: [
        [0,1,67],[1,1,71],[2,1,74],[3,1,71],   // G maj
        [4,1,64],[5,1,67],[6,1,71],[7,1,67],   // E min
        [8,1,60],[9,1,64],[10,1,67],[11,1,64], // C maj
        [12,1,62],[13,1,66],[14,1,69],[15,1,66], // D maj
      ]},
      { type: 'square', vol: 0.06, notes: [
        [0,2,79],[2,1,78],[3,1,76],[4,2,74],[6,2,76],
        [8,2,74],[10,1,72],[11,1,71],[12,2,72],[14,2,74],
      ]},
    ],
  },

  // ── Space Invaders: march, C minor, 120 BPM ──────────────────────────────
  'space-invaders': {
    bpm: 120, loop: 8,
    voices: [
      { type: 'square', vol: 0.12, notes: [
        [0,1,48],[2,1,55],[4,1,48],[6,1,51],
      ]},
      { type: 'square', vol: 0.07, notes: [
        [0,1,60],[2,1,63],[4,1,67],[6,1,65],
      ]},
    ],
  },

  // ── Animal Count: happy C major, 116 BPM ─────────────────────────────────
  'animal-count': {
    bpm: 116, loop: 16,
    voices: [
      { type: 'square', vol: 0.10, notes: [
        [0,2,48],[4,2,53],[8,2,55],[12,2,48],
      ]},
      { type: 'square', vol: 0.08, notes: [
        [0,1,60],[1,1,62],[2,1,64],[3,1,65],
        [4,2,67],[6,1,65],[7,1,64],
        [8,1,67],[9,1,65],[10,2,64],
        [12,1,62],[14,2,60],
      ]},
    ],
  },

  // ── Spell the Animal: playful G major, 100 BPM ───────────────────────────
  'spell-the-animal': {
    bpm: 100, loop: 24,
    voices: [
      { type: 'triangle', vol: 0.10, notes: [
        [0,2,55],[3,2,60],[6,2,55],
        [8,2,59],[12,2,55],[16,2,59],[20,2,55],
      ]},
      { type: 'square', vol: 0.07, notes: [
        [0,1,67],[1,1,69],[2,1,71],[3,2,72],[5,1,71],[6,1,69],
        [8,2,67],[10,1,64],[11,1,62],[12,2,64],[14,1,67],[15,1,69],
        [16,2,71],[18,1,69],[19,1,67],[20,2,64],[22,2,67],
      ]},
    ],
  },

  // ── Platformer: adventure C major, 150 BPM ───────────────────────────────
  platformer: {
    bpm: 150, loop: 32,
    voices: [
      { type: 'square', vol: 0.11, notes: [
        [0,2,48],[4,2,53],[8,2,55],[12,2,53],
        [16,2,52],[20,2,55],[24,2,48],[28,2,55],
      ]},
      { type: 'square', vol: 0.07, notes: [
        [0,1,72],[1,1,74],[2,2,76],[4,1,77],[5,1,76],[6,1,74],[7,1,72],
        [8,2,79],[10,1,77],[11,1,76],[12,2,74],[14,2,72],
        [16,1,69],[17,1,71],[18,2,72],[20,1,74],[21,1,72],[22,1,71],[23,1,69],
        [24,2,72],[26,1,74],[27,1,76],[28,2,77],[30,2,76],
      ]},
    ],
  },

  // ── Rally-X: driving D minor, 164 BPM ────────────────────────────────────
  'rally-x': {
    bpm: 164, loop: 16,
    voices: [
      { type: 'sawtooth', vol: 0.09, notes: [
        [0,1,50],[1,1,50],[2,1,57],[3,1,50],
        [4,1,50],[5,1,55],[6,1,50],[7,1,53],
        [8,1,50],[9,1,50],[10,1,55],[11,1,50],
        [12,1,57],[13,1,50],[14,2,53],
      ]},
      { type: 'square', vol: 0.07, notes: [
        [0,1,74],[1,1,72],[2,2,69],[4,1,67],[5,1,65],[6,2,67],
        [8,1,72],[9,1,74],[10,2,76],[12,1,74],[13,1,72],[14,2,69],
      ]},
    ],
  },
}

// ── Sequencer state (module-level singleton) ──────────────────────────────────
const LOOKAHEAD  = 0.15   // seconds ahead to schedule
const SCHED_MS   = 40     // scheduler poll interval
const MASTER_VOL = 0.38

let _trackId: string | null = null
let _nextBeat   = 0
let _nextTime   = 0
let _timer: ReturnType<typeof setTimeout> | null = null
let _masterGain: GainNode | null = null

function getMasterGain(ctx: AudioContext): GainNode {
  if (!_masterGain) {
    _masterGain = ctx.createGain()
    _masterGain.gain.value = audioMuted.value ? 0 : MASTER_VOL
    _masterGain.connect(ctx.destination)
  }
  return _masterGain
}

function scheduleNote(
  ctx: AudioContext, dest: GainNode,
  type: OscillatorType, freq: number,
  start: number, dur: number, vol: number,
) {
  const osc  = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(dest)
  osc.type = type
  osc.frequency.value = freq
  const atk = Math.min(0.018, dur * 0.12)
  const rel = Math.min(0.045, dur * 0.28)
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(vol, start + atk)
  gain.gain.setValueAtTime(vol, start + dur - rel)
  gain.gain.linearRampToValueAtTime(0, start + dur)
  osc.start(start)
  osc.stop(start + dur + 0.01)
}

function scheduler() {
  if (!_trackId) return
  const ctx = getCtx()
  if (!ctx) { _timer = setTimeout(scheduler, SCHED_MS); return }

  const track = TRACKS[_trackId]
  if (!track) return

  // If clock has drifted behind (e.g. context just resumed), resync
  if (_nextTime < ctx.currentTime) {
    _nextTime = ctx.currentTime + 0.02
    _nextBeat = 0
  }

  const dest     = getMasterGain(ctx)
  const beatDur  = 60 / track.bpm / 2  // 8th-note duration in seconds

  while (_nextTime < ctx.currentTime + LOOKAHEAD) {
    const beat = _nextBeat % track.loop
    if (!audioMuted.value) {
      for (const voice of track.voices) {
        for (const [nb, nd, nm] of voice.notes) {
          if (nb === beat) {
            scheduleNote(ctx, dest, voice.type, hz(nm), _nextTime, nd * beatDur, voice.vol)
          }
        }
      }
    }
    _nextBeat++
    _nextTime += beatDur
  }

  _timer = setTimeout(scheduler, SCHED_MS)
}

function play(name: string) {
  if (_timer) clearTimeout(_timer)
  _trackId   = name
  _nextBeat  = 0
  const ctx  = getCtx()
  _nextTime  = ctx ? ctx.currentTime + 0.05 : 0
  // Restore master gain if it was faded out
  if (ctx && _masterGain) {
    _masterGain.gain.cancelScheduledValues(ctx.currentTime)
    _masterGain.gain.setTargetAtTime(audioMuted.value ? 0 : MASTER_VOL, ctx.currentTime, 0.06)
  }
  scheduler()
}

function stop() {
  _trackId = null
  if (_timer) { clearTimeout(_timer); _timer = null }
  const ctx = getCtx()
  if (ctx && _masterGain) {
    _masterGain.gain.setTargetAtTime(0, ctx.currentTime, 0.06)
  }
}

// Keep master gain in sync with mute toggle
if (import.meta.client) {
  watch(audioMuted, muted => {
    const ctx = getCtx()
    if (ctx && _masterGain) {
      _masterGain.gain.setTargetAtTime(muted ? 0 : MASTER_VOL, ctx.currentTime, 0.05)
    }
  })
}

// ── Composable ────────────────────────────────────────────────────────────────
export function useMusic(trackName?: string) {
  if (trackName) {
    onMounted(() => play(trackName))
    onUnmounted(stop)
  }
  return {
    play,
    stop,
    muted: readonly(audioMuted),
    toggleMute: () => { audioMuted.value = !audioMuted.value },
  }
}
