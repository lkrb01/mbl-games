<template>
  <div class="page">
    <nav class="nav">
      <NuxtLink to="/games" class="back">← Back</NuxtLink>
      <div class="hud">
        <button class="mute-btn" :title="sound.muted.value ? 'Unmute' : 'Mute'" @click="sound.toggleMute()">{{ sound.muted.value ? '🔇' : '🔊' }}</button>
        <span class="wave-text">W{{ wave }}</span>
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
const COLS = 9
const CELL_W = 40
const CELL_H = 32
const ENEMY_W = 22
const ENEMY_H = 18
const GRID_X0 = (W - COLS * CELL_W) / 2   // 40
const GRID_Y0 = 60
const PLAYER_W = 36
const PLAYER_H = 18
const PLAYER_Y = H - 52
const PLAYER_SPEED = 220
const PBULLET_SPEED = 420
const EBULLET_SPEED = 150
const BASE_DIVE_SPEED = 190
const RETURN_SPEED = 150
const SWAY_AMP = 28
const SWAY_FREQ = 0.35
const MAX_WAVES = 5

// ——— Reactive state ———
const canvasEl = ref<HTMLCanvasElement | null>(null)
const score = ref(0)
const lives = ref(3)
const wave = ref(1)
const phase = ref<'idle' | 'playing' | 'won' | 'lost'>('idle')
const sound = useSound()
useMusic('galaxian')
const phaseTitle = computed(() => ({ idle: 'Galaxian 👾', won: 'You Win! 🎉', lost: 'Game Over' }[phase.value] ?? 'Galaxian 👾'))
const keys = reactive({ left: false, right: false })

// ——— Types ———
interface Enemy {
  row: number; col: number; alive: boolean; diving: boolean
  x: number; y: number; vx: number; vy: number
  divePhase: 'attack' | 'return'; diveT: number; targetX: number; shotFired: boolean
}
interface Bullet { x: number; y: number }
interface Explosion { x: number; y: number; t: number }

// ——— Game objects ———
let enemies: Enemy[] = []
let formationX = 0
let formationT = 0
let playerX = W / 2
let pBullets: Bullet[] = []
let eBullets: Bullet[] = []
let explosions: Explosion[] = []
let diveTimer = 0
let nextDiveIn = 1800
let waveSpeed = 1
let rafId = 0
let lastTs = 0

// ——— Stars ———
const stars = Array.from({ length: 70 }, () => ({
  x: Math.random() * W,
  y: Math.random() * H,
  s: Math.random() > 0.7 ? 1.5 : 1,
}))

// ——— Helpers ———
function ctx() { return canvasEl.value?.getContext('2d') }
function slotX(e: Enemy) { return GRID_X0 + formationX + e.col * CELL_W + (CELL_W - ENEMY_W) / 2 }
function slotY(e: Enemy) { return GRID_Y0 + e.row * CELL_H + (CELL_H - ENEMY_H) / 2 }
function aliveEnemies() { return enemies.filter(e => e.alive) }

// ——— Drawing ———
function drawBg(c: CanvasRenderingContext2D) {
  c.fillStyle = '#0d0d1a'
  c.fillRect(0, 0, W, H)
  c.fillStyle = 'rgba(255,255,255,0.7)'
  for (const s of stars) c.fillRect(s.x, s.y, s.s, s.s)
  c.fillStyle = '#2a2a4a'
  c.fillRect(0, H - 22, W, 2)
}

function drawEnemy(c: CanvasRenderingContext2D, e: Enemy, bx: number, by: number) {
  const type = e.row === 0 ? 0 : e.row <= 2 ? 1 : 2
  c.fillStyle = (['#f97316', '#c084fc', '#22d3ee'] as const)[type]

  if (type === 0) {
    // Flagship: wide wing shape
    c.fillRect(bx + 8, by, 6, 4)
    c.fillRect(bx + 2, by + 4, 18, 9)
    c.fillRect(bx, by + 6, 3, 5)
    c.fillRect(bx + 19, by + 6, 3, 5)
    c.fillRect(bx + 4, by + 13, 14, 4)
    c.fillStyle = '#7c2d12'
    c.fillRect(bx + 7, by + 6, 3, 4)
    c.fillRect(bx + 12, by + 6, 3, 4)
  } else if (type === 1) {
    // Escort: butterfly silhouette
    c.fillRect(bx + 7, by, 8, 3)
    c.fillRect(bx + 3, by + 3, 16, 9)
    c.fillRect(bx, by + 5, 3, 5)
    c.fillRect(bx + 19, by + 5, 3, 5)
    c.fillRect(bx + 4, by + 12, 5, 4)
    c.fillRect(bx + 13, by + 12, 5, 4)
    c.fillStyle = '#581c87'
    c.fillRect(bx + 7, by + 5, 3, 4)
    c.fillRect(bx + 12, by + 5, 3, 4)
  } else {
    // Drone: compact angular shape
    c.fillRect(bx + 8, by + 2, 6, 4)
    c.fillRect(bx + 4, by + 6, 14, 8)
    c.fillRect(bx, by + 8, 5, 5)
    c.fillRect(bx + 17, by + 8, 5, 5)
    c.fillRect(bx + 6, by + 14, 10, 3)
    c.fillStyle = '#164e63'
    c.fillRect(bx + 8, by + 8, 3, 4)
    c.fillRect(bx + 11, by + 8, 3, 4)
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

  for (const e of enemies) {
    if (!e.alive) continue
    const bx = e.diving ? Math.round(e.x - ENEMY_W / 2) : Math.round(slotX(e))
    const by = e.diving ? Math.round(e.y - ENEMY_H / 2) : Math.round(slotY(e))
    if (by > -ENEMY_H && by < H + ENEMY_H) drawEnemy(c, e, bx, by)
  }

  if (phase.value === 'playing') drawPlayer(c)

  c.fillStyle = '#fbbf24'
  for (const b of pBullets) c.fillRect(b.x - 1.5, b.y, 3, 10)
  c.fillStyle = '#f87171'
  for (const b of eBullets) c.fillRect(b.x - 1.5, b.y, 3, 10)

  for (const ex of explosions) {
    const alpha = 1 - ex.t / 0.4
    const r = 4 + ex.t * 28
    c.strokeStyle = `rgba(251,191,36,${alpha})`
    c.lineWidth = 2
    c.beginPath(); c.arc(ex.x, ex.y, r, 0, Math.PI * 2); c.stroke()
    c.strokeStyle = `rgba(249,115,22,${alpha * 0.5})`
    c.beginPath(); c.arc(ex.x, ex.y, r * 0.5, 0, Math.PI * 2); c.stroke()
  }
}

// ——— Dive logic ———
function initEnemy(row: number, col: number): Enemy {
  return { row, col, alive: true, diving: false, x: 0, y: 0, vx: 0, vy: 0, divePhase: 'attack', diveT: 0, targetX: 0, shotFired: false }
}

function launchDiver(e: Enemy) {
  if (!e.alive || e.diving) return
  e.diving = true
  e.divePhase = 'attack'
  e.diveT = 0
  e.shotFired = false
  e.x = slotX(e) + ENEMY_W / 2
  e.y = slotY(e) + ENEMY_H / 2
  e.targetX = playerX + (Math.random() - 0.5) * 80
  const speed = BASE_DIVE_SPEED * waveSpeed
  const dx = e.targetX - e.x
  const dy = H - e.y + 60
  const len = Math.sqrt(dx * dx + dy * dy)
  e.vx = (dx / len) * speed * 0.7
  e.vy = (dy / len) * speed
}

function triggerDive() {
  const pool = aliveEnemies().filter(e => !e.diving)
  if (!pool.length) return

  const commanders = pool.filter(e => e.row === 0)
  const escorts = pool.filter(e => e.row <= 2)
  const rng = Math.random()
  let leader: Enemy | undefined
  if (commanders.length && rng < 0.25) {
    leader = commanders[Math.floor(Math.random() * commanders.length)]
  } else if (escorts.length && rng < 0.65) {
    leader = escorts[Math.floor(Math.random() * escorts.length)]
  } else {
    leader = pool[Math.floor(Math.random() * pool.length)]
  }
  if (!leader) return
  launchDiver(leader)

  // Flagship takes up to 2 escorts
  if (leader.row === 0 && Math.random() < 0.6) {
    const nearby = pool.filter(e => e !== leader && e.row <= 2 && Math.abs(e.col - leader!.col) <= 1)
    const count = Math.min(nearby.length, Math.random() < 0.5 ? 1 : 2)
    for (let i = 0; i < count; i++) launchDiver(nearby[i]!)
  }
}

function updateDivers(dt: number) {
  for (const e of enemies) {
    if (!e.alive || !e.diving) continue
    e.diveT += dt / 1000

    if (e.divePhase === 'attack') {
      const osc = Math.sin(e.diveT * 3.5) * 18 * (dt / 1000)
      e.x += e.vx * dt / 1000 + osc
      e.y += e.vy * dt / 1000
      // Gently home toward target X
      e.vx += (e.targetX - e.x) * 0.6 * dt / 1000

      // Fire once mid-dive
      if (!e.shotFired && e.y > H * 0.4) {
        e.shotFired = true
        eBullets.push({ x: e.x, y: e.y + ENEMY_H / 2 })
      }

      if (e.y > H + ENEMY_H) {
        // Reappear at top and fly down to slot
        e.divePhase = 'return'
        e.x = slotX(e) + ENEMY_W / 2
        e.y = -ENEMY_H * 2
        e.vx = 0
        e.vy = RETURN_SPEED
      }
    } else {
      // Spring toward slot x while descending
      const tx = slotX(e) + ENEMY_W / 2
      e.vx += (tx - e.x) * 5 * dt / 1000
      e.vx *= 0.88
      e.x += e.vx * dt / 1000
      e.y += e.vy * dt / 1000
      if (e.y >= slotY(e) + ENEMY_H / 2) e.diving = false
    }
  }
}

function updateFormation(dt: number) {
  formationT += dt / 1000
  formationX = Math.sin(formationT * SWAY_FREQ) * SWAY_AMP
}

function updatePlayer(dt: number) {
  const spd = PLAYER_SPEED * dt / 1000
  if (keys.left) playerX = Math.max(PLAYER_W / 2, playerX - spd)
  if (keys.right) playerX = Math.min(W - PLAYER_W / 2, playerX + spd)
}

function updateBullets(dt: number) {
  const ps = PBULLET_SPEED * dt / 1000
  const es = EBULLET_SPEED * dt / 1000
  pBullets = pBullets.filter(b => { b.y -= ps; return b.y > -10 })
  eBullets = eBullets.filter(b => { b.y += es; return b.y < H + 10 })
}

function updateDiveTimer(dt: number) {
  diveTimer += dt
  if (diveTimer >= nextDiveIn) {
    diveTimer = 0
    nextDiveIn = (1000 + Math.random() * 2000) / waveSpeed
    triggerDive()
  }
}

function checkCollisions() {
  // Player bullets hit enemies
  for (let bi = pBullets.length - 1; bi >= 0; bi--) {
    const b = pBullets[bi]!
    let hit = false
    for (const e of enemies) {
      if (!e.alive) continue
      const ex = e.diving ? e.x - ENEMY_W / 2 : slotX(e)
      const ey = e.diving ? e.y - ENEMY_H / 2 : slotY(e)
      if (b.x >= ex && b.x <= ex + ENEMY_W && b.y >= ey && b.y <= ey + ENEMY_H) {
        e.alive = false
        hit = true
        explosions.push({ x: ex + ENEMY_W / 2, y: ey + ENEMY_H / 2, t: 0 })
        const pts = e.diving
          ? (e.row === 0 ? 160 : e.row <= 2 ? 100 : 60)
          : (e.row === 0 ? 80 : e.row <= 2 ? 50 : 30)
        score.value += pts
        sound.explode()
        break
      }
    }
    if (hit) pBullets.splice(bi, 1)
  }

  // Enemy bullets hit player
  const px = playerX - PLAYER_W / 2
  eBullets = eBullets.filter(b => {
    if (b.x >= px && b.x <= px + PLAYER_W && b.y >= PLAYER_Y && b.y <= PLAYER_Y + PLAYER_H) {
      lives.value--
      sound.playerHit()
      explosions.push({ x: playerX, y: PLAYER_Y + PLAYER_H / 2, t: 0 })
      if (lives.value <= 0) { phase.value = 'lost'; sound.gameOver() }
      return false
    }
    return true
  })

  // Diving enemies ram player (attack phase only)
  for (const e of enemies) {
    if (!e.alive || !e.diving || e.divePhase !== 'attack') continue
    if (
      e.x + ENEMY_W / 2 >= px && e.x - ENEMY_W / 2 <= px + PLAYER_W &&
      e.y + ENEMY_H / 2 >= PLAYER_Y && e.y - ENEMY_H / 2 <= PLAYER_Y + PLAYER_H
    ) {
      e.alive = false
      explosions.push({ x: e.x, y: e.y, t: 0 })
      lives.value--
      sound.playerHit()
      explosions.push({ x: playerX, y: PLAYER_Y + PLAYER_H / 2, t: 0 })
      if (lives.value <= 0) { phase.value = 'lost'; sound.gameOver() }
    }
  }
}

function tryFire() {
  if (phase.value !== 'playing' || pBullets.length >= 2) return
  pBullets.push({ x: playerX, y: PLAYER_Y })
  sound.shoot()
}

function spawnEnemies() {
  enemies = []
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      enemies.push(initEnemy(r, c))
}

function nextWave() {
  wave.value++
  if (wave.value > MAX_WAVES) { phase.value = 'won'; sound.win(); return }
  waveSpeed = 1 + (wave.value - 1) * 0.15
  pBullets = []
  eBullets = []
  diveTimer = 0
  nextDiveIn = 1500
  formationT = 0
  spawnEnemies()
}

function gameLoop(ts: number) {
  const dt = Math.min(ts - lastTs, 50)
  lastTs = ts

  updatePlayer(dt)
  updateBullets(dt)
  updateFormation(dt)
  updateDivers(dt)
  updateDiveTimer(dt)
  explosions = explosions.filter(ex => { ex.t += dt / 1000; return ex.t < 0.4 })
  checkCollisions()

  if (phase.value === 'playing' && aliveEnemies().length === 0) nextWave()

  draw()
  if (phase.value === 'playing') rafId = requestAnimationFrame(gameLoop)
}

function startGame() {
  cancelAnimationFrame(rafId)
  score.value = 0
  lives.value = 3
  wave.value = 1
  waveSpeed = 1
  playerX = W / 2
  pBullets = []
  eBullets = []
  explosions = []
  formationX = 0
  formationT = 0
  diveTimer = 0
  nextDiveIn = 1800
  spawnEnemies()
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
  gap: 16px;
}

.wave-text {
  font-size: 0.9rem;
  font-weight: 700;
  color: #64748b;
  letter-spacing: 0.05em;
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
