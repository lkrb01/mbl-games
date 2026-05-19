<template>
  <div class="page">
    <nav class="nav">
      <NuxtLink to="/" class="back">← Back</NuxtLink>
      <div style="display:flex;align-items:center;gap:10px">
        <button class="mute-btn" :title="sound.muted.value ? 'Unmute' : 'Mute'" @click="sound.toggleMute()">{{ sound.muted.value ? '🔇' : '🔊' }}</button>
        <span class="score-display">Score: {{ score }}</span>
      </div>
    </nav>

    <div class="game-wrap">
      <canvas ref="canvas" :width="CANVAS_PX" :height="CANVAS_PX" class="canvas" />

      <div v-if="!gameStarted" class="overlay">
        <div class="overlay-box">
          <h2 v-if="gameOver" class="over-title">Game Over</h2>
          <h2 v-else class="over-title">Snake 🐍</h2>
          <p v-if="gameOver" class="over-score">Score: {{ score }}</p>
          <p v-else class="over-hint">Use arrow keys to move</p>
          <button class="btn" @click="startGame">{{ gameOver ? 'Play Again' : 'Start Game' }}</button>
        </div>
      </div>
    </div>

    <div class="dpad">
      <div class="dpad-row">
        <button class="dpad-btn" @click="pressKey('ArrowUp')">▲</button>
      </div>
      <div class="dpad-row">
        <button class="dpad-btn" @click="pressKey('ArrowLeft')">◀</button>
        <button class="dpad-btn ghost" disabled />
        <button class="dpad-btn" @click="pressKey('ArrowRight')">▶</button>
      </div>
      <div class="dpad-row">
        <button class="dpad-btn" @click="pressKey('ArrowDown')">▼</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const GRID = 20
const CELL = 20
const CANVAS_PX = GRID * CELL

type Pt = { x: number; y: number }
type Dir = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'

const canvas = ref<HTMLCanvasElement | null>(null)
const score = ref(0)
const gameOver = ref(false)
const gameStarted = ref(false)
const sound = useSound()
useMusic('snake')

let snake: Pt[] = []
let food: Pt = { x: 5, y: 5 }
let dir: Dir = 'RIGHT'
let nextDir: Dir = 'RIGHT'
let loop: ReturnType<typeof setInterval> | null = null

function ctx() {
  return canvas.value?.getContext('2d') ?? null
}

function randomFood(): Pt {
  let pt: Pt
  do {
    pt = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) }
  } while (snake.some(s => s.x === pt.x && s.y === pt.y))
  return pt
}

function draw() {
  const c = ctx()
  if (!c) return

  c.fillStyle = '#0d0d1a'
  c.fillRect(0, 0, CANVAS_PX, CANVAS_PX)

  // Grid lines (subtle)
  c.strokeStyle = '#1a1a2e'
  c.lineWidth = 0.5
  for (let i = 0; i <= GRID; i++) {
    c.beginPath(); c.moveTo(i * CELL, 0); c.lineTo(i * CELL, CANVAS_PX); c.stroke()
    c.beginPath(); c.moveTo(0, i * CELL); c.lineTo(CANVAS_PX, i * CELL); c.stroke()
  }

  // Food
  c.fillStyle = '#f43f5e'
  c.beginPath()
  c.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL / 2 - 2, 0, Math.PI * 2)
  c.fill()

  // Snake
  snake.forEach((seg, i) => {
    const ratio = 1 - i / snake.length
    c.fillStyle = i === 0
      ? '#34d399'
      : `hsl(160, ${60 + ratio * 20}%, ${25 + ratio * 20}%)`
    const pad = i === 0 ? 1 : 2
    c.beginPath()
    c.roundRect(seg.x * CELL + pad, seg.y * CELL + pad, CELL - pad * 2, CELL - pad * 2, 4)
    c.fill()
  })
}

function step() {
  dir = nextDir
  const head: Pt = { ...(snake[0] as Pt) }
  if (dir === 'UP') head.y--
  else if (dir === 'DOWN') head.y++
  else if (dir === 'LEFT') head.x--
  else head.x++

  if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID || snake.some(s => s.x === head.x && s.y === head.y)) {
    end()
    return
  }

  snake.unshift(head)
  if (head.x === food.x && head.y === food.y) {
    score.value++
    sound.eat()
    food = randomFood()
  } else {
    snake.pop()
  }
  draw()
}

function end() {
  gameOver.value = true
  gameStarted.value = false
  if (loop) clearInterval(loop)
  sound.gameOver()
  draw()
}

function startGame() {
  if (loop) clearInterval(loop)
  snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }]
  dir = 'RIGHT'
  nextDir = 'RIGHT'
  score.value = 0
  gameOver.value = false
  gameStarted.value = true
  food = randomFood()
  draw()
  loop = setInterval(step, 140)
}

const OPPOSITES: Record<Dir, Dir> = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' }
const KEY_MAP: Record<string, Dir> = { ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT' }

function pressKey(key: string) {
  const d = KEY_MAP[key]
  if (!d || d === OPPOSITES[dir]) return
  nextDir = d
  if (!gameStarted.value && !gameOver.value) startGame()
}

function onKeydown(e: KeyboardEvent) {
  if (KEY_MAP[e.key]) e.preventDefault()
  pressKey(e.key)
}

onMounted(() => {
  draw()
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  if (loop) clearInterval(loop)
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
  background: radial-gradient(ellipse at top, #0d1b2a 0%, #0f0f1a 70%);
}

.nav {
  width: 100%;
  max-width: 440px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.back {
  font-size: 0.9rem;
  color: #64748b;
  transition: color 0.15s;
}
.back:hover { color: #94a3b8; }

.score-display {
  font-size: 1rem;
  font-weight: 700;
  color: #34d399;
}

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

.game-wrap {
  position: relative;
  border: 2px solid #1e3a5f;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 0 40px rgba(52, 211, 153, 0.1);
}

.canvas {
  display: block;
}

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 10, 26, 0.85);
  backdrop-filter: blur(4px);
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
  color: #34d399;
  font-weight: 700;
}

.over-hint {
  font-size: 0.9rem;
  color: #64748b;
}

.btn {
  margin-top: 8px;
  padding: 12px 32px;
  background: #34d399;
  color: #0f0f1a;
  font-size: 1rem;
  font-weight: 700;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.15s;
}
.btn:hover { opacity: 0.9; transform: scale(1.03); }

.dpad {
  margin-top: 28px;
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
