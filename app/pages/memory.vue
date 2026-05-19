<template>
  <div class="page">
    <nav class="nav">
      <NuxtLink to="/" class="back">← Back</NuxtLink>
      <div class="stats">
        <button class="mute-btn" :title="sound.muted.value ? 'Unmute' : 'Mute'" @click="sound.toggleMute()">{{ sound.muted.value ? '🔇' : '🔊' }}</button>
        <span>Moves: <strong>{{ moves }}</strong></span>
        <span>Pairs: <strong>{{ matched }}/{{ PAIRS }}</strong></span>
      </div>
    </nav>

    <h1 class="title">Memory 🃏</h1>

    <div class="grid">
      <button
        v-for="card in cards"
        :key="card.id"
        class="card"
        :class="{ flipped: card.flipped || card.matched, matched: card.matched }"
        :disabled="card.matched || checking"
        @click="flip(card)"
      >
        <div class="card-inner">
          <div class="card-back">?</div>
          <div class="card-front">{{ card.emoji }}</div>
        </div>
      </button>
    </div>

    <Transition name="win">
      <div v-if="won" class="win-overlay">
        <div class="win-box">
          <div class="win-icon">🎉</div>
          <h2>You Won!</h2>
          <p>Completed in <strong>{{ moves }}</strong> moves</p>
          <button class="btn" @click="init">Play Again</button>
        </div>
      </div>
    </Transition>

    <button v-if="!won" class="reset-btn" @click="init">New Game</button>
  </div>
</template>

<script setup lang="ts">
const EMOJIS = ['🍎', '🍊', '🍋', '🍇', '🍓', '🍒', '🍑', '🥝', '🍉', '🥭']
const PAIRS = EMOJIS.length

interface Card {
  id: number
  emoji: string
  flipped: boolean
  matched: boolean
}

const cards = ref<Card[]>([])
const flipped = ref<number[]>([])
const moves = ref(0)
const matched = ref(0)
const won = ref(false)
const checking = ref(false)
const sound = useSound()
useMusic('memory')

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

function init() {
  const deck = shuffle([...EMOJIS, ...EMOJIS])
  cards.value = deck.map((emoji, i) => ({ id: i, emoji, flipped: false, matched: false }))
  flipped.value = []
  moves.value = 0
  matched.value = 0
  won.value = false
  checking.value = false
}

function flip(card: Card) {
  if (checking.value || card.flipped || card.matched || flipped.value.length >= 2) return
  card.flipped = true
  sound.flip()
  flipped.value.push(card.id)

  if (flipped.value.length === 2) {
    moves.value++
    checking.value = true
    const [a, b] = flipped.value.map(id => cards.value[id]!) as [Card, Card]
    if (a.emoji === b.emoji) {
      a.matched = b.matched = true
      matched.value++
      flipped.value = []
      checking.value = false
      sound.match()
      if (matched.value === PAIRS) { won.value = true; sound.win() }
    } else {
      sound.wrong()
      setTimeout(() => {
        a.flipped = b.flipped = false
        flipped.value = []
        checking.value = false
      }, 900)
    }
  }
}

onMounted(init)
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 16px 40px;
  background: radial-gradient(ellipse at top, #1a0a2e 0%, #0f0f1a 70%);
  position: relative;
}

.nav {
  width: 100%;
  max-width: 520px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.back {
  font-size: 0.9rem;
  color: #64748b;
  transition: color 0.15s;
}
.back:hover { color: #94a3b8; }

.stats {
  display: flex;
  gap: 20px;
  font-size: 0.9rem;
  color: #94a3b8;
}
.stats strong { color: #c084fc; }

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

.title {
  font-size: 1.75rem;
  font-weight: 900;
  color: #f1f5f9;
  margin-bottom: 28px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(5, 80px);
  gap: 10px;
}

@media (max-width: 480px) {
  .grid {
    grid-template-columns: repeat(4, 70px);
  }
}

.card {
  width: 80px;
  height: 80px;
  perspective: 600px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}
@media (max-width: 480px) { .card { width: 70px; height: 70px; } }

.card-inner {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.4s ease;
  border-radius: 10px;
}

.card.flipped .card-inner {
  transform: rotateY(180deg);
}

.card-back,
.card-front {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.card-back {
  background: #1e1e2e;
  border: 1px solid #2d2d44;
  font-size: 1.4rem;
  color: #4b5563;
  font-weight: 700;
  transition: background 0.15s;
}
.card:hover:not(:disabled) .card-back {
  background: #252538;
  border-color: #c084fc;
}

.card-front {
  background: #2d1b4e;
  border: 1px solid #6b21a8;
  font-size: 2rem;
  transform: rotateY(180deg);
}

.card.matched .card-front {
  background: #1e3a1e;
  border-color: #4ade80;
}

.win-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 10, 26, 0.88);
  backdrop-filter: blur(6px);
  z-index: 10;
}

.win-box {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  background: #1e1e2e;
  border: 1px solid #6b21a8;
  border-radius: 20px;
  padding: 40px 48px;
  box-shadow: 0 0 60px rgba(192, 132, 252, 0.2);
}

.win-icon { font-size: 3rem; }

.win-box h2 {
  font-size: 2rem;
  font-weight: 900;
  color: #f1f5f9;
}

.win-box p {
  color: #94a3b8;
}
.win-box strong { color: #c084fc; }

.btn {
  margin-top: 8px;
  padding: 12px 32px;
  background: #c084fc;
  color: #0f0f1a;
  font-size: 1rem;
  font-weight: 700;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.15s;
}
.btn:hover { opacity: 0.9; transform: scale(1.03); }

.reset-btn {
  margin-top: 28px;
  padding: 10px 28px;
  background: transparent;
  border: 1px solid #2d2d44;
  color: #64748b;
  font-size: 0.875rem;
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.reset-btn:hover { border-color: #c084fc; color: #c084fc; }

.win-enter-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.win-enter-from { opacity: 0; transform: scale(0.95); }
</style>
