<template>
  <div class="page">
    <nav class="nav">
      <NuxtLink to="/" class="back">← Back</NuxtLink>
      <div class="hud">
        <button class="mute-btn" :title="sound.muted.value ? 'Unmute' : 'Mute'" @click="sound.toggleMute()">{{ sound.muted.value ? '🔇' : '🔊' }}</button>
        <span class="score-text">{{ score }}</span>
        <span class="lives-text">
          <span v-for="i in 3" :key="i" class="heart" :class="{ dim: i > lives }">♥</span>
        </span>
      </div>
    </nav>

    <div class="game-wrap">
      <canvas ref="canvasEl" :width="W" :height="H" class="canvas" />
      <div v-if="phase !== 'playing'" class="overlay">
        <div class="overlay-box">
          <h2 class="over-title">{{ phaseTitle }}</h2>
          <p v-if="phase !== 'idle'" class="over-score">Score: {{ score }}</p>
          <button class="btn" @click="startGame">
            {{ phase === 'idle' ? 'Start Game' : 'Play Again' }}
          </button>
        </div>
      </div>
    </div>

    <p class="hint">← → to move · Space to shoot</p>

    <div class="mobile-ctrl">
      <button
        class="ctrl-btn"
        @touchstart.prevent="keys.left = true"
        @touchend.prevent="keys.left = false"
        @mousedown="keys.left = true"
        @mouseup="keys.left = false"
        @mouseleave="keys.left = false"
      >◀</button>
      <button class="ctrl-btn fire-btn" @click="tryFire" @touchstart.prevent.stop="tryFire">FIRE</button>
      <button
        class="ctrl-btn"
        @touchstart.prevent="keys.right = true"
        @touchend.prevent="keys.right = false"
        @mousedown="keys.right = true"
        @mouseup="keys.right = false"
        @mouseleave="keys.right = false"
      >▶</button>
    </div>
  </div>
</template>

<script setup lang="ts">
// ——— Constants ———
const W = 440
const H = 520
const ROWS = 5
const COLS = 11
const CELL_W = 36
const CELL_H = 32
const INV_W = 22
const INV_H = 16
const GRID_X = (W - COLS * CELL_W) / 2   // 22
const GRID_Y = 55
const PLAYER_W = 36
const PLAYER_H = 18
const PLAYER_Y = H - 52
const PLAYER_SPEED = 220   // px/s
const PBULLET_SPEED = 400  // px/s
const IBULLET_SPEED = 130  // px/s
const STEP = 6             // px per horizontal invader move
const DROP = 20            // px per downward step

// ——— Reactive state ———
const canvasEl = ref<HTMLCanvasElement | null>(null)
const score = ref(0)
const lives = ref(3)
const phase = ref<'idle' | 'playing' | 'won' | 'lost'>('idle')
const sound = useSound()
useMusic('space-invaders')
const phaseTitle = computed(() => ({ idle: 'Space Invaders 👾', won: 'You Win! 🎉', lost: 'Game Over' }[phase.value]))
const keys = reactive({ left: false, right: false })

// ——— Game objects (mutated directly in the RAF loop) ———
interface Invader { row: number; col: number; alive: boolean }
interface Bullet { x: number; y: number }

let invaders: Invader[] = []
let gridOX = 0
let gridOY = 0
let invDir = 1
let playerX = W / 2
let pBullet = { x: 0, y: 0, active: false }
let iBullets: Bullet[] = []
let animFrame = 0
let invMoveTimer = 0
let shootAccum = 0
let nextShootIn = 1500
let rafId = 0
let lastTs = 0

// ——— Static stars ———
const stars = Array.from({ length: 70 }, () => ({
  x: Math.random() * W,
  y: Math.random() * H,
  s: Math.random() > 0.7 ? 1.5 : 1,
}))

// ——— Drawing ———
function ctx() { return canvasEl.value?.getContext('2d') }

function drawBg(c: CanvasRenderingContext2D) {
  c.fillStyle = '#0d0d1a'
  c.fillRect(0, 0, W, H)
  c.fillStyle = 'rgba(255,255,255,0.7)'
  for (const s of stars) c.fillRect(s.x, s.y, s.s, s.s)
  // Ground line
  c.fillStyle = '#2a2a4a'
  c.fillRect(0, H - 22, W, 2)
}

function drawInvaderShape(c: CanvasRenderingContext2D, inv: Invader) {
  const bx = GRID_X + gridOX + inv.col * CELL_W + (CELL_W - INV_W) / 2
  const by = GRID_Y + gridOY + inv.row * CELL_H + (CELL_H - INV_H) / 2
  const f = animFrame
  const type = inv.row === 0 ? 0 : inv.row <= 2 ? 1 : 2

  c.fillStyle = (['#34d399', '#22d3ee', '#c084fc'] as const)[type]

  if (type === 0) {
    // Crab (top row — green)
    c.fillRect(bx + 5, by, 2, 3)
    c.fillRect(bx + 15, by, 2, 3)
    c.fillRect(bx + 3, by + 3, 16, 8)
    c.fillRect(bx, by + 5, 3, 3)
    c.fillRect(bx + 19, by + 5, 3, 3)
    if (f === 0) {
      c.fillRect(bx + 2, by + 11, 4, 4)
      c.fillRect(bx + 16, by + 11, 4, 4)
    } else {
      c.fillRect(bx + 4, by + 11, 4, 4)
      c.fillRect(bx + 14, by + 11, 4, 4)
    }
    c.fillStyle = '#0d0d1a'
    c.fillRect(bx + 7, by + 5, 3, 3)
    c.fillRect(bx + 12, by + 5, 3, 3)

  } else if (type === 1) {
    // Octopus (middle rows — cyan)
    c.fillRect(bx + 6, by, 10, 3)
    c.fillRect(bx + 2, by + 3, 18, 8)
    c.fillRect(bx, by + 5, 2, 4)
    c.fillRect(bx + 20, by + 5, 2, 4)
    if (f === 0) {
      c.fillRect(bx, by + 11, 5, 4)
      c.fillRect(bx + 8, by + 11, 6, 3)
      c.fillRect(bx + 17, by + 11, 5, 4)
    } else {
      c.fillRect(bx + 1, by + 11, 5, 5)
      c.fillRect(bx + 8, by + 11, 6, 3)
      c.fillRect(bx + 16, by + 11, 5, 5)
    }
    c.fillStyle = '#0d0d1a'
    c.fillRect(bx + 6, by + 5, 3, 3)
    c.fillRect(bx + 13, by + 5, 3, 3)

  } else {
    // Squid (bottom rows — purple)
    c.fillRect(bx + 5, by, 12, 2)
    c.fillRect(bx + 1, by + 2, 20, 8)
    c.fillRect(bx, by + 6, 2, 4)
    c.fillRect(bx + 20, by + 6, 2, 4)
    if (f === 0) {
      c.fillRect(bx + 1, by + 10, 5, 5)
      c.fillRect(bx + 8, by + 10, 6, 4)
      c.fillRect(bx + 16, by + 10, 5, 5)
    } else {
      c.fillRect(bx + 2, by + 10, 5, 4)
      c.fillRect(bx + 8, by + 10, 6, 5)
      c.fillRect(bx + 15, by + 10, 5, 4)
    }
    c.fillStyle = '#0d0d1a'
    c.fillRect(bx + 6, by + 4, 3, 3)
    c.fillRect(bx + 13, by + 4, 3, 3)
  }
}

function drawPlayer(c: CanvasRenderingContext2D) {
  const x = Math.round(playerX - PLAYER_W / 2)
  c.fillStyle = '#818cf8'
  c.fillRect(x + 16, PLAYER_Y, 4, 5)
  c.fillRect(x + 6, PLAYER_Y + 5, 24, 8)
  c.fillRect(x, PLAYER_Y + 13, PLAYER_W, 5)
  c.fillStyle = '#c084fc'
  c.fillRect(x + 8, PLAYER_Y + 13, 4, 3)
  c.fillRect(x + 24, PLAYER_Y + 13, 4, 3)
}

function draw() {
  const c = ctx()
  if (!c) return
  drawBg(c)
  for (const inv of invaders) {
    if (inv.alive) drawInvaderShape(c, inv)
  }
  if (phase.value === 'playing' || phase.value === 'lost') drawPlayer(c)
  if (pBullet.active) {
    c.fillStyle = '#fbbf24'
    c.fillRect(pBullet.x - 1.5, pBullet.y, 3, 10)
  }
  c.fillStyle = '#f87171'
  for (const b of iBullets) c.fillRect(b.x - 1.5, b.y, 3, 10)
}

// ——— Game logic ———
function alive() { return invaders.filter(i => i.alive) }

function moveInterval(count: number) {
  // 850ms at full grid → 80ms at 1 invader
  return 80 + (count / (ROWS * COLS)) * 770
}

function updateInvaders(dt: number) {
  const a = alive()
  if (!a.length) return
  invMoveTimer += dt
  if (invMoveTimer < moveInterval(a.length)) return
  invMoveTimer = 0
  animFrame ^= 1

  const minCol = Math.min(...a.map(i => i.col))
  const maxCol = Math.max(...a.map(i => i.col))
  const leftEdge = GRID_X + gridOX + minCol * CELL_W
  const rightEdge = GRID_X + gridOX + (maxCol + 1) * CELL_W

  if (invDir === 1 && rightEdge + STEP > W) {
    gridOY += DROP
    invDir = -1
  } else if (invDir === -1 && leftEdge - STEP < 0) {
    gridOY += DROP
    invDir = 1
  } else {
    gridOX += STEP * invDir
  }
}

function updateShooting(dt: number) {
  shootAccum += dt
  if (shootAccum < nextShootIn) return
  shootAccum = 0
  nextShootIn = 700 + Math.random() * 1300

  // Only bottom-most alive invader per column can shoot
  const byCol = new Map<number, Invader>()
  for (const inv of alive()) {
    const cur = byCol.get(inv.col)
    if (!cur || inv.row > cur.row) byCol.set(inv.col, inv)
  }
  const shooters = [...byCol.values()]
  if (!shooters.length) return
  const s = shooters[Math.floor(Math.random() * shooters.length)]!
  iBullets.push({
    x: GRID_X + gridOX + s.col * CELL_W + CELL_W / 2,
    y: GRID_Y + gridOY + s.row * CELL_H + INV_H,
  })
}

function tryFire() {
  if (phase.value !== 'playing' || pBullet.active) return
  pBullet = { x: playerX, y: PLAYER_Y, active: true }
  sound.shoot()
}

function updateBullets(dt: number) {
  if (pBullet.active) {
    pBullet.y -= PBULLET_SPEED * dt / 1000
    if (pBullet.y < 0) pBullet.active = false
  }
  const spd = IBULLET_SPEED * dt / 1000
  iBullets = iBullets.filter(b => { b.y += spd; return b.y < H })
}

function updatePlayer(dt: number) {
  const spd = PLAYER_SPEED * dt / 1000
  if (keys.left) playerX = Math.max(PLAYER_W / 2, playerX - spd)
  if (keys.right) playerX = Math.min(W - PLAYER_W / 2, playerX + spd)
}

function checkCollisions() {
  // Player bullet hits invader
  if (pBullet.active) {
    for (const inv of invaders) {
      if (!inv.alive) continue
      const ix = GRID_X + gridOX + inv.col * CELL_W + (CELL_W - INV_W) / 2
      const iy = GRID_Y + gridOY + inv.row * CELL_H + (CELL_H - INV_H) / 2
      if (pBullet.x >= ix && pBullet.x <= ix + INV_W && pBullet.y >= iy && pBullet.y <= iy + INV_H) {
        inv.alive = false
        pBullet.active = false
        score.value += inv.row === 0 ? 30 : inv.row <= 2 ? 20 : 10
        sound.explode()
        break
      }
    }
  }

  // Invader bullets hit player
  const px = playerX - PLAYER_W / 2
  iBullets = iBullets.filter(b => {
    if (b.x >= px && b.x <= px + PLAYER_W && b.y >= PLAYER_Y && b.y <= PLAYER_Y + PLAYER_H) {
      lives.value--
      sound.playerHit()
      if (lives.value <= 0) { phase.value = 'lost'; sound.gameOver() }
      return false
    }
    return true
  })

  // Invaders reach the player
  for (const inv of alive()) {
    if (GRID_Y + gridOY + inv.row * CELL_H + INV_H >= PLAYER_Y + 8) {
      phase.value = 'lost'
      sound.gameOver()
      return
    }
  }
}

function gameLoop(ts: number) {
  const dt = Math.min(ts - lastTs, 50)
  lastTs = ts

  updatePlayer(dt)
  updateBullets(dt)
  updateInvaders(dt)
  updateShooting(dt)
  checkCollisions()
  if (alive().length === 0 && phase.value === 'playing') { phase.value = 'won'; sound.win() }

  draw()
  if (phase.value === 'playing') rafId = requestAnimationFrame(gameLoop)
}

function startGame() {
  cancelAnimationFrame(rafId)

  invaders = []
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      invaders.push({ row: r, col: c, alive: true })

  gridOX = 0
  gridOY = 0
  invDir = 1
  playerX = W / 2
  pBullet = { x: 0, y: 0, active: false }
  iBullets = []
  animFrame = 0
  invMoveTimer = 0
  shootAccum = 0
  nextShootIn = 1500
  score.value = 0
  lives.value = 3
  phase.value = 'playing'
  lastTs = performance.now()
  rafId = requestAnimationFrame(gameLoop)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft') { e.preventDefault(); keys.left = true }
  if (e.key === 'ArrowRight') { e.preventDefault(); keys.right = true }
  if (e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); tryFire() }
}

function onKeyup(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft') keys.left = false
  if (e.key === 'ArrowRight') keys.right = false
}

onMounted(() => {
  draw()
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('keyup', onKeyup)
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('keyup', onKeyup)
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
  max-width: 460px;
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

.hud {
  display: flex;
  align-items: center;
  gap: 20px;
}

.score-text {
  font-size: 1.2rem;
  font-weight: 800;
  color: #fbbf24;
  min-width: 60px;
  text-align: right;
}

.heart {
  font-size: 1.2rem;
  color: #f43f5e;
  transition: color 0.2s;
}
.heart.dim { color: #2a2a44; }

.game-wrap {
  position: relative;
  border: 2px solid #1e3a5f;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 0 40px rgba(129, 140, 248, 0.1);
}

.canvas {
  display: block;
  width: 100%;
  max-width: 440px;
  height: auto;
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
  color: #fbbf24;
  font-weight: 700;
}

.btn {
  margin-top: 4px;
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

.hint {
  margin-top: 14px;
  font-size: 0.8rem;
  color: #4a5568;
}

.mobile-ctrl {
  margin-top: 24px;
  display: flex;
  gap: 12px;
  align-items: center;
}

.ctrl-btn {
  width: 64px;
  height: 52px;
  background: #1e1e2e;
  border: 1px solid #2d2d44;
  border-radius: 10px;
  color: #e2e8f0;
  font-size: 1.1rem;
  cursor: pointer;
  transition: background 0.1s;
  touch-action: manipulation;
  user-select: none;
}
.ctrl-btn:hover { background: #2d2d44; }
.ctrl-btn:active { background: #3d3d5c; }

.fire-btn {
  width: 80px;
  color: #fbbf24;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  border-color: #fbbf24;
}
</style>
