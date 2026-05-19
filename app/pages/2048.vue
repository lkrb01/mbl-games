<template>
  <div class="page">
    <nav class="nav">
      <NuxtLink to="/" class="back">← Back</NuxtLink>
      <div class="scores">
        <button class="mute-btn" :title="sound.muted.value ? 'Unmute' : 'Mute'" @click="sound.toggleMute()">{{ sound.muted.value ? '🔇' : '🔊' }}</button>
        <div class="score-box">
          <span class="score-label">SCORE</span>
          <span class="score-val">{{ score }}</span>
        </div>
        <div class="score-box">
          <span class="score-label">BEST</span>
          <span class="score-val">{{ best }}</span>
        </div>
      </div>
    </nav>

    <div class="game-wrap">
      <div class="board" @touchstart="onTouchStart" @touchend="onTouchEnd">
        <div v-for="(row, r) in board" :key="r" class="row">
          <div
            v-for="(val, c) in row"
            :key="c"
            class="cell"
            :class="val ? `tile-${Math.min(val, 2048)}` : 'empty'"
          >
            {{ val || '' }}
          </div>
        </div>
      </div>

      <div v-if="status !== 'playing'" class="overlay">
        <div class="overlay-box">
          <h2 class="over-title">{{ status === 'won' ? 'You Win! 🎉' : 'Game Over' }}</h2>
          <p class="over-score">Score: {{ score }}</p>
          <button class="btn" @click="status === 'won' ? keepGoing() : newGame()">
            {{ status === 'won' ? 'Keep Going' : 'Play Again' }}
          </button>
          <button v-if="status === 'won'" class="btn btn-secondary" @click="newGame()">New Game</button>
        </div>
      </div>
    </div>

    <p class="hint">Arrow keys or swipe to move tiles</p>

    <div class="dpad">
      <div class="dpad-row">
        <button class="dpad-btn" @click="move('up')">▲</button>
      </div>
      <div class="dpad-row">
        <button class="dpad-btn" @click="move('left')">◀</button>
        <button class="dpad-btn ghost" disabled />
        <button class="dpad-btn" @click="move('right')">▶</button>
      </div>
      <div class="dpad-row">
        <button class="dpad-btn" @click="move('down')">▼</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
type Direction = 'left' | 'right' | 'up' | 'down'
type Status = 'playing' | 'won' | 'lost'

const board = ref<number[][]>(emptyBoard())
const score = ref(0)
const best = ref(0)
const status = ref<Status>('playing')
const wonAlready = ref(false)
const sound = useSound()
useMusic('2048')

let touchStartX = 0
let touchStartY = 0

function emptyBoard(): number[][] {
  return Array.from({ length: 4 }, () => Array(4).fill(0))
}

function addRandomTile(b: number[][]): void {
  const empty: [number, number][] = []
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (b[r][c] === 0) empty.push([r, c])
  if (!empty.length) return
  const [r, c] = empty[Math.floor(Math.random() * empty.length)]!
  b[r]![c] = Math.random() < 0.9 ? 2 : 4
}

function slideRow(row: number[]): { row: number[]; delta: number } {
  const tiles = row.filter(v => v !== 0)
  let delta = 0
  for (let i = 0; i < tiles.length - 1; i++) {
    if (tiles[i] === tiles[i + 1]) {
      tiles[i]! *= 2
      delta += tiles[i]!
      tiles.splice(i + 1, 1)
    }
  }
  while (tiles.length < 4) tiles.push(0)
  return { row: tiles, delta }
}

function applyMove(b: number[][], dir: Direction): { board: number[][]; delta: number; moved: boolean } {
  const nb = b.map(r => [...r])
  let delta = 0
  let moved = false

  if (dir === 'left' || dir === 'right') {
    for (let r = 0; r < 4; r++) {
      const row = dir === 'right' ? [...nb[r]!].reverse() : nb[r]!
      const result = slideRow(row)
      const newRow = dir === 'right' ? result.row.reverse() : result.row
      if (newRow.some((v, i) => v !== nb[r]![i])) moved = true
      nb[r] = newRow
      delta += result.delta
    }
  } else {
    for (let c = 0; c < 4; c++) {
      const col = nb.map(r => r[c]!)
      const row = dir === 'down' ? [...col].reverse() : col
      const result = slideRow(row)
      const newCol = dir === 'down' ? result.row.reverse() : result.row
      for (let r = 0; r < 4; r++) {
        if (newCol[r] !== nb[r]![c]) moved = true
        nb[r]![c] = newCol[r]!
      }
      delta += result.delta
    }
  }

  return { board: nb, delta, moved }
}

function checkStatus(b: number[][]): Status {
  if (!wonAlready.value && b.some(row => row.some(v => v === 2048))) return 'won'
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (b[r]![c] === 0) return 'playing'
      if (c < 3 && b[r]![c] === b[r]![c + 1]) return 'playing'
      if (r < 3 && b[r]![c] === b[r + 1]![c]) return 'playing'
    }
  }
  return 'lost'
}

function move(dir: Direction) {
  if (status.value !== 'playing') return
  const result = applyMove(board.value, dir)
  if (!result.moved) return
  if (result.delta > 0) sound.merge(); else sound.slide()
  score.value += result.delta
  if (score.value > best.value) best.value = score.value
  addRandomTile(result.board)
  board.value = result.board
  status.value = checkStatus(board.value)
  if (status.value === 'won') sound.win()
  else if (status.value === 'lost') sound.gameOver()
}

function keepGoing() {
  wonAlready.value = true
  status.value = 'playing'
}

function newGame() {
  wonAlready.value = false
  const b = emptyBoard()
  addRandomTile(b)
  addRandomTile(b)
  board.value = b
  score.value = 0
  status.value = 'playing'
}

function onTouchStart(e: TouchEvent) {
  touchStartX = e.touches[0]!.clientX
  touchStartY = e.touches[0]!.clientY
}

function onTouchEnd(e: TouchEvent) {
  const dx = e.changedTouches[0]!.clientX - touchStartX
  const dy = e.changedTouches[0]!.clientY - touchStartY
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
  if (Math.abs(dx) > Math.abs(dy)) {
    move(dx > 0 ? 'right' : 'left')
  } else {
    move(dy > 0 ? 'down' : 'up')
  }
}

function onKeydown(e: KeyboardEvent) {
  const map: Record<string, Direction> = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  }
  if (map[e.key]) {
    e.preventDefault()
    move(map[e.key]!)
  }
}

onMounted(() => {
  newGame()
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 16px 40px;
  background: radial-gradient(ellipse at top, #1e1b4b 0%, #0f0f1a 70%);
}

.nav {
  width: 100%;
  max-width: 360px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.back {
  font-size: 0.9rem;
  color: #64748b;
  transition: color 0.15s;
}
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

.scores {
  display: flex;
  gap: 10px;
}

.score-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #1e1e2e;
  border: 1px solid #2d2d44;
  border-radius: 8px;
  padding: 6px 16px;
  min-width: 72px;
}

.score-label {
  font-size: 0.65rem;
  font-weight: 700;
  color: #64748b;
  letter-spacing: 0.08em;
}

.score-val {
  font-size: 1.1rem;
  font-weight: 800;
  color: #f1f5f9;
}

.game-wrap {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
}

.board {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  background: #1a1230;
  border-radius: 12px;
  border: 2px solid #2d2d44;
  box-shadow: 0 0 40px rgba(129, 140, 248, 0.1);
  touch-action: none;
  user-select: none;
}

.row {
  display: flex;
  gap: 8px;
}

.cell {
  width: 76px;
  height: 76px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 1.6rem;
  transition: background 0.08s ease;
}

.empty {
  background: #2a2040;
}

/* Tile colors — classic 2048 warm palette */
.tile-2    { background: #eee4da; color: #776e65; }
.tile-4    { background: #ede0c8; color: #776e65; }
.tile-8    { background: #f2b179; color: #f9f6f2; font-size: 1.5rem; }
.tile-16   { background: #f59563; color: #f9f6f2; font-size: 1.5rem; }
.tile-32   { background: #f67c5f; color: #f9f6f2; font-size: 1.5rem; }
.tile-64   { background: #f65e3b; color: #f9f6f2; font-size: 1.5rem; }
.tile-128  { background: #edcf72; color: #f9f6f2; font-size: 1.3rem; }
.tile-256  { background: #edcc61; color: #f9f6f2; font-size: 1.3rem; }
.tile-512  { background: #edc850; color: #f9f6f2; font-size: 1.3rem; }
.tile-1024 { background: #edc53f; color: #f9f6f2; font-size: 1.1rem; }
.tile-2048 { background: #edc22e; color: #f9f6f2; font-size: 1.1rem; box-shadow: 0 0 24px rgba(237, 194, 46, 0.6); }

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 10, 26, 0.85);
  backdrop-filter: blur(4px);
  border-radius: 10px;
}

.overlay-box {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
}

.over-title {
  font-size: 2rem;
  font-weight: 900;
  color: #f1f5f9;
}

.over-score {
  font-size: 1.25rem;
  color: #818cf8;
  font-weight: 700;
}

.btn {
  padding: 12px 32px;
  background: #818cf8;
  color: #0f0f1a;
  font-size: 1rem;
  font-weight: 700;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.15s;
}
.btn:hover { opacity: 0.9; transform: scale(1.03); }

.btn-secondary {
  background: transparent;
  color: #818cf8;
  border: 1px solid #818cf8;
  padding: 10px 28px;
  font-size: 0.9rem;
}

.hint {
  margin-top: 16px;
  font-size: 0.8rem;
  color: #4a5568;
}

.dpad {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.dpad-row {
  display: flex;
  gap: 4px;
}

.dpad-btn {
  width: 52px;
  height: 52px;
  background: #1e1e2e;
  border: 1px solid #2d2d44;
  border-radius: 10px;
  color: #e2e8f0;
  font-size: 1.1rem;
  cursor: pointer;
  transition: background 0.1s;
  touch-action: manipulation;
}
.dpad-btn:hover { background: #2d2d44; }
.dpad-btn:active { background: #3d3d5c; }
.dpad-btn.ghost { visibility: hidden; }
</style>
