<template>
  <div class="page">
    <nav class="nav">
      <NuxtLink to="/" class="back">← Back</NuxtLink>
      <div style="display:flex;align-items:center;gap:10px">
        <button class="mute-btn" :title="sound.muted.value ? 'Unmute' : 'Mute'" @click="sound.toggleMute()">{{ sound.muted.value ? '🔇' : '🔊' }}</button>
        <span class="progress">
          {{ done ? sessionWords.length : wordIndex + 1 }} / {{ sessionWords.length }}
          <span class="star-score">🌟 {{ score }}</span>
        </span>
      </div>
    </nav>

    <Transition name="slide" mode="out-in">

      <!-- ── Done screen ── -->
      <div v-if="done" key="done" class="card done-card">
        <p class="done-title">🎊 Amazing!</p>
        <p class="done-sub">You spelled all the animals!</p>
        <div class="done-animals">
          <span v-for="w in sessionWords" :key="w.word" class="done-emoji" :title="w.word">{{ w.emoji }}</span>
        </div>
        <button class="play-btn" @click="startSession">Play Again</button>
      </div>

      <!-- ── Game ── -->
      <div v-else :key="`w${wordIndex}`" class="card">
        <div class="animal-display">
          <span class="animal-emoji">{{ currentWord.emoji }}</span>
        </div>

        <!-- Letter slots -->
        <div class="slots">
          <div
            v-for="(slot, i) in slots"
            :key="i"
            class="slot"
            :class="{ filled: slot !== null, current: slot === null && i === nextSlotIndex }"
          >{{ slot ?? '' }}</div>
        </div>

        <!-- Scrambled letter buttons -->
        <div class="letters">
          <button
            v-for="btn in letterBtns"
            :key="btn.id"
            class="letter-btn"
            :class="{ used: btn.used, shaking: shakingId === btn.id }"
            :disabled="btn.used"
            @click="tapLetter(btn)"
          >{{ btn.char }}</button>
        </div>

        <!-- Hint -->
        <div class="hint-row">
          <button v-if="!showHint" class="hint-btn" @click="showHint = true">💡 Hint</button>
          <p v-else class="hint-word">{{ currentWord.word }}</p>
        </div>
      </div>

    </Transition>

    <!-- Celebration overlay -->
    <Transition name="pop">
      <div v-if="showCelebration" class="celebration" @click="advanceWord">
        <div class="cel-box">
          <p class="cel-emoji">{{ currentCelebEmoji }}</p>
          <p class="cel-word">{{ celebWord }}</p>
          <p class="cel-label">You spelled it! 🌟</p>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
interface Word { word: string; emoji: string }
interface LetterBtn { id: number; char: string; used: boolean }

const ALL_WORDS: Word[] = [
  // 3 letters
  { word: 'CAT', emoji: '🐱' },
  { word: 'DOG', emoji: '🐶' },
  { word: 'COW', emoji: '🐮' },
  { word: 'PIG', emoji: '🐷' },
  { word: 'HEN', emoji: '🐔' },
  { word: 'FOX', emoji: '🦊' },
  { word: 'OWL', emoji: '🦉' },
  { word: 'ANT', emoji: '🐜' },
  { word: 'BEE', emoji: '🐝' },
  { word: 'RAT', emoji: '🐀' },
  // 4 letters
  { word: 'BEAR', emoji: '🐻' },
  { word: 'DUCK', emoji: '🦆' },
  { word: 'FROG', emoji: '🐸' },
  { word: 'LION', emoji: '🦁' },
  { word: 'WOLF', emoji: '🐺' },
  { word: 'CRAB', emoji: '🦀' },
  { word: 'DEER', emoji: '🦌' },
  { word: 'GOAT', emoji: '🐐' },
  { word: 'LAMB', emoji: '🐑' },
  { word: 'FISH', emoji: '🐟' },
  { word: 'BIRD', emoji: '🐦' },
  { word: 'WORM', emoji: '🪱' },
  // 5 letters
  { word: 'HORSE', emoji: '🐴' },
  { word: 'SHARK', emoji: '🦈' },
  { word: 'EAGLE', emoji: '🦅' },
  { word: 'TIGER', emoji: '🐯' },
  { word: 'ZEBRA', emoji: '🦓' },
  { word: 'SNAKE', emoji: '🐍' },
  { word: 'CAMEL', emoji: '🐪' },
  { word: 'PANDA', emoji: '🐼' },
  { word: 'KOALA', emoji: '🐨' },
  { word: 'RHINO', emoji: '🦏' },
  { word: 'HIPPO', emoji: '🦛' },
  { word: 'OTTER', emoji: '🦦' },
]

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

// ── State ──
const sound = useSound()
useMusic('spell-the-animal')
const sessionWords = ref<Word[]>([])
const wordIndex = ref(0)
const slots = ref<(string | null)[]>([])
const letterBtns = ref<LetterBtn[]>([])
const shakingId = ref<number | null>(null)
const showCelebration = ref(false)
const showHint = ref(false)
const done = ref(false)
const score = ref(0)
const celebWord = ref('')
const currentCelebEmoji = ref('')

definePageMeta({ ssr: false })

const currentWord = computed(() => sessionWords.value[wordIndex.value] ?? { word: '', emoji: '' })
const nextSlotIndex = computed(() => slots.value.findIndex(s => s === null))
const expectedChar = computed(() => {
  const i = nextSlotIndex.value
  return i >= 0 ? currentWord.value?.word[i] ?? null : null
})

let shakeTimer: ReturnType<typeof setTimeout> | null = null
let celebTimer: ReturnType<typeof setTimeout> | null = null

function startSession() {
  const easy   = shuffle(ALL_WORDS.filter(w => w.word.length === 3)).slice(0, 4)
  const medium = shuffle(ALL_WORDS.filter(w => w.word.length === 4)).slice(0, 4)
  const hard   = shuffle(ALL_WORDS.filter(w => w.word.length === 5)).slice(0, 2)
  sessionWords.value = [...easy, ...medium, ...hard]
  wordIndex.value = 0
  score.value = 0
  done.value = false
  loadWord()
}

function loadWord() {
  const w = sessionWords.value[wordIndex.value]
  if (!w) { done.value = true; return }
  slots.value = Array(w.word.length).fill(null)
  letterBtns.value = shuffle(w.word.split('')).map((char, id) => ({ id, char, used: false }))
  showCelebration.value = false
  showHint.value = false
}

function tapLetter(btn: LetterBtn) {
  if (btn.used || showCelebration.value) return

  if (btn.char !== expectedChar.value) {
    if (shakeTimer) clearTimeout(shakeTimer)
    shakingId.value = btn.id
    shakeTimer = setTimeout(() => { shakingId.value = null }, 420)
    sound.wrong()
    return
  }

  sound.tick()
  const idx = nextSlotIndex.value
  btn.used = true
  slots.value[idx] = btn.char

  if (slots.value.every(s => s !== null)) {
    score.value++
    celebWord.value = currentWord.value.word
    currentCelebEmoji.value = currentWord.value.emoji
    showCelebration.value = true
    sound.celebrate()
    celebTimer = setTimeout(advanceWord, 2000)
  }
}

function advanceWord() {
  if (celebTimer) { clearTimeout(celebTimer); celebTimer = null }
  wordIndex.value++
  if (wordIndex.value >= sessionWords.value.length) {
    done.value = true
    showCelebration.value = false
    sound.win()
  } else {
    loadWord()
  }
}

onMounted(startSession)
onUnmounted(() => {
  if (shakeTimer) clearTimeout(shakeTimer)
  if (celebTimer) clearTimeout(celebTimer)
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 16px 40px;
  background: radial-gradient(ellipse at top, #0a2a1a 0%, #0f0f1a 70%);
}

.nav {
  width: 100%;
  max-width: 460px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.back { font-size: 0.9rem; color: #64748b; transition: color 0.15s; }
.back:hover { color: #94a3b8; }

.mute-btn {
  background: none;
  border: none;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 2px 4px;
  opacity: 0.5;
  transition: opacity 0.15s;
  line-height: 1;
}
.mute-btn:hover { opacity: 1; }

.progress { font-size: 0.9rem; color: #64748b; display: flex; align-items: center; gap: 12px; }

.star-score { font-size: 1.1rem; font-weight: 800; color: #fbbf24; }

.card {
  width: 100%;
  max-width: 460px;
  background: #1e1e2e;
  border: 2px solid #34d399;
  border-radius: 24px;
  padding: 28px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  box-shadow: 0 0 40px rgba(52, 211, 153, 0.12);
}

/* ── Animal display ── */
.animal-display {
  display: flex;
  align-items: center;
  justify-content: center;
}

.animal-emoji {
  font-size: clamp(4rem, 18vw, 6rem);
  line-height: 1;
  animation: bounce-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes bounce-in {
  from { transform: scale(0); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}

/* ── Letter slots ── */
.slots {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.slot {
  width: 54px;
  height: 54px;
  border: 2px solid #2d2d44;
  border-radius: 12px;
  background: #252538;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.6rem;
  font-weight: 900;
  color: #f1f5f9;
  transition: border-color 0.2s, background 0.2s;
}

.slot.filled {
  border-color: #34d399;
  background: #064e3b;
  color: #6ee7b7;
  animation: slot-fill 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.slot.current {
  border-color: #c084fc;
  animation: slot-pulse 1.4s ease-in-out infinite;
}

@keyframes slot-fill {
  from { transform: scale(0.7); }
  to   { transform: scale(1); }
}

@keyframes slot-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(192, 132, 252, 0.5); }
  50%       { box-shadow: 0 0 0 6px rgba(192, 132, 252, 0); }
}

/* ── Letter buttons ── */
.letters {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
}

.letter-btn {
  width: 60px;
  height: 60px;
  font-size: 1.5rem;
  font-weight: 900;
  background: #2d2a50;
  border: 2px solid #4d4a80;
  border-radius: 14px;
  color: #f1f5f9;
  cursor: pointer;
  transition: transform 0.1s, background 0.15s, opacity 0.2s;
  touch-action: manipulation;
  user-select: none;
}

.letter-btn:hover:not(.used):not(:disabled) {
  background: #3d3a70;
  border-color: #34d399;
  transform: scale(1.1);
}

.letter-btn:active:not(.used) { transform: scale(0.92); }

.letter-btn.used {
  opacity: 0.2;
  cursor: default;
}

.letter-btn.shaking {
  animation: shake 0.42s ease;
  border-color: #f87171;
  background: #3f0f0f;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%       { transform: translateX(-7px); }
  40%       { transform: translateX(7px); }
  60%       { transform: translateX(-5px); }
  80%       { transform: translateX(5px); }
}

/* ── Hint ── */
.hint-row { min-height: 36px; display: flex; align-items: center; }

.hint-btn {
  padding: 8px 20px;
  background: transparent;
  border: 1px solid #2d2d44;
  border-radius: 8px;
  color: #64748b;
  font-size: 0.875rem;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.hint-btn:hover { border-color: #fbbf24; color: #fbbf24; }

.hint-word {
  font-size: 1.4rem;
  font-weight: 800;
  color: #fbbf24;
  letter-spacing: 0.15em;
}

/* ── Done card ── */
.done-card { text-align: center; gap: 20px; padding: 40px 24px; }

.done-title { font-size: 2.5rem; font-weight: 900; color: #f1f5f9; }

.done-sub { font-size: 1.1rem; color: #94a3b8; margin-top: -8px; }

.done-animals {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  font-size: 2.5rem;
}

.done-emoji { animation: pop-in 0.4s ease both; }

@keyframes pop-in {
  from { transform: scale(0); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}

.play-btn {
  padding: 14px 40px;
  background: #34d399;
  color: #0f0f1a;
  font-size: 1rem;
  font-weight: 700;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.15s;
  margin-top: 8px;
}
.play-btn:hover { opacity: 0.9; transform: scale(1.03); }

/* ── Celebration overlay ── */
.celebration {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 20, 12, 0.9);
  backdrop-filter: blur(10px);
  z-index: 50;
  cursor: pointer;
}

.cel-box { text-align: center; }

.cel-emoji {
  font-size: 5rem;
  line-height: 1;
  animation: bounce-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.cel-word {
  font-size: 3rem;
  font-weight: 900;
  color: #f1f5f9;
  letter-spacing: 0.1em;
  margin-top: 16px;
  animation: bounce-in 0.4s 0.1s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.cel-label {
  font-size: 1.3rem;
  font-weight: 700;
  color: #34d399;
  margin-top: 8px;
  animation: bounce-in 0.4s 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

/* ── Transitions ── */
.slide-enter-active, .slide-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.slide-enter-from { opacity: 0; transform: translateX(30px); }
.slide-leave-to   { opacity: 0; transform: translateX(-30px); }

.pop-enter-active, .pop-leave-active { transition: opacity 0.2s ease; }
.pop-enter-from, .pop-leave-to { opacity: 0; }
</style>
