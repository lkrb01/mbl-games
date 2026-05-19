<template>
  <div class="page">
    <nav class="nav">
      <NuxtLink to="/" class="back">← Back</NuxtLink>
      <div style="display:flex;align-items:center;gap:10px">
        <button class="mute-btn" :title="sound.muted.value ? 'Unmute' : 'Mute'" @click="sound.toggleMute()">{{ sound.muted.value ? '🔇' : '🔊' }}</button>
        <span class="score">⭐ {{ correct }}</span>
      </div>
    </nav>

    <Transition name="zoom" mode="out-in">
      <div :key="round" class="card">
        <p class="question">
          How many <span class="q-animal">{{ animal }}</span>?
        </p>

        <div class="animal-grid" :style="{ '--cols': gridCols }">
          <span
            v-for="n in count"
            :key="n"
            class="a-emoji"
            :style="{ animationDelay: `${(n - 1) * 60}ms` }"
          >{{ animal }}</span>
        </div>

        <div class="choices">
          <button
            v-for="c in choices"
            :key="c"
            class="choice-btn"
            :class="choiceClass(c)"
            :disabled="answered"
            @click="pick(c)"
          >{{ c }}</button>
        </div>
      </div>
    </Transition>

    <Transition name="pop">
      <div v-if="showCelebration" class="celebration" @click="nextRound">
        <div class="cel-box">
          <p class="cel-emoji">🎉</p>
          <p class="cel-count">{{ count }} {{ animal }}</p>
          <p class="cel-label">Well done!</p>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
const ANIMALS = [
  '🐶','🐱','🐰','🐸','🐨','🐼','🦊','🦁',
  '🐮','🐷','🐔','🦆','🦉','🐢','🦋','🐝',
  '🦄','🐘','🦒','🐬',
]

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

const correct = ref(0)
const round = ref(0)
const answered = ref(false)
const wrongChoice = ref<number | null>(null)
const showCelebration = ref(false)
const animal = ref('')
const count = ref(0)
const choices = ref<number[]>([])
const sound = useSound()
useMusic('animal-count')

const gridCols = computed(() => {
  const n = count.value
  if (n === 1) return 1
  if (n <= 4) return 2
  if (n <= 6) return 3
  return 4
})

let timer: ReturnType<typeof setTimeout> | null = null
function clearTimer() { if (timer) { clearTimeout(timer); timer = null } }

function nextRound() {
  clearTimer()
  answered.value = false
  wrongChoice.value = null
  showCelebration.value = false
  animal.value = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]!
  count.value = Math.floor(Math.random() * 10) + 1
  const pool = new Set([count.value])
  while (pool.size < 4) pool.add(Math.floor(Math.random() * 10) + 1)
  choices.value = shuffle([...pool])
  round.value++
}

function pick(c: number) {
  if (answered.value) return
  answered.value = true
  if (c === count.value) {
    correct.value++
    showCelebration.value = true
    sound.celebrate()
    timer = setTimeout(nextRound, 1800)
  } else {
    wrongChoice.value = c
    sound.wrong()
    timer = setTimeout(nextRound, 1500)
  }
}

function choiceClass(c: number) {
  if (!answered.value) return ''
  if (c === count.value) return 'correct'
  if (c === wrongChoice.value) return 'wrong'
  return 'dim'
}

onMounted(nextRound)
onUnmounted(clearTimer)
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 16px 40px;
  background: radial-gradient(ellipse at top, #1a0a3a 0%, #0f0f1a 70%);
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

.score { font-size: 1.4rem; font-weight: 800; color: #fbbf24; }

.card {
  width: 100%;
  max-width: 460px;
  background: #1e1e2e;
  border: 2px solid #c084fc;
  border-radius: 24px;
  padding: 28px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  box-shadow: 0 0 40px rgba(192, 132, 252, 0.15);
}

.question {
  font-size: 1.5rem;
  font-weight: 800;
  color: #f1f5f9;
  text-align: center;
}

.q-animal { font-size: 2rem; }

.animal-grid {
  display: grid;
  grid-template-columns: repeat(var(--cols), 1fr);
  gap: 6px;
  width: 100%;
  justify-items: center;
  min-height: 80px;
}

.a-emoji {
  font-size: clamp(2rem, 10vw, 3.5rem);
  line-height: 1;
  padding: 4px;
  animation: pop-in 0.35s ease both;
}

@keyframes pop-in {
  from { transform: scale(0) rotate(-15deg); opacity: 0; }
  70%  { transform: scale(1.2) rotate(5deg); }
  to   { transform: scale(1) rotate(0deg); opacity: 1; }
}

.choices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  width: 100%;
}

.choice-btn {
  padding: 18px 8px;
  font-size: 2.2rem;
  font-weight: 900;
  background: #252540;
  border: 2px solid #3d3a60;
  border-radius: 16px;
  color: #f1f5f9;
  cursor: pointer;
  transition: transform 0.1s, background 0.15s, border-color 0.15s;
  touch-action: manipulation;
  user-select: none;
}
.choice-btn:hover:not(:disabled) { background: #302d55; border-color: #c084fc; transform: scale(1.05); }
.choice-btn:active:not(:disabled) { transform: scale(0.96); }

.choice-btn.correct { background: #14532d; border-color: #4ade80; color: #bbf7d0; }
.choice-btn.wrong   { background: #450a0a; border-color: #f87171; color: #fecaca; }
.choice-btn.dim     { opacity: 0.35; }

/* ── Celebration ── */
.celebration {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 5, 30, 0.88);
  backdrop-filter: blur(8px);
  z-index: 50;
  cursor: pointer;
}

.cel-box { text-align: center; }

.cel-emoji {
  font-size: 5rem;
  line-height: 1;
  animation: pop-in 0.4s ease;
}

.cel-count {
  font-size: 3.5rem;
  font-weight: 900;
  color: #f1f5f9;
  margin-top: 12px;
  animation: pop-in 0.4s 0.1s ease both;
}

.cel-label {
  font-size: 1.5rem;
  font-weight: 700;
  color: #c084fc;
  margin-top: 8px;
  animation: pop-in 0.4s 0.2s ease both;
}

/* ── Transitions ── */
.zoom-enter-active, .zoom-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.zoom-enter-from { opacity: 0; transform: scale(0.94); }
.zoom-leave-to  { opacity: 0; transform: scale(1.04); }

.pop-enter-active { transition: opacity 0.2s ease; }
.pop-leave-active { transition: opacity 0.2s ease; }
.pop-enter-from, .pop-leave-to { opacity: 0; }
</style>
