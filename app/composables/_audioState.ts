import { ref, watch } from 'vue'

// Shared singleton AudioContext used by both useSound and useMusic
let _ctx: AudioContext | null = null

export function getCtx(): AudioContext | null {
  if (!import.meta.client) return null
  if (!_ctx) _ctx = new AudioContext()
  if (_ctx.state === 'suspended') _ctx.resume()
  return _ctx
}

// Shared mute state persisted to localStorage
export const audioMuted = ref(false)

if (import.meta.client) {
  audioMuted.value = localStorage.getItem('mbl-muted') === '1'
  watch(audioMuted, v => localStorage.setItem('mbl-muted', v ? '1' : '0'))
}
