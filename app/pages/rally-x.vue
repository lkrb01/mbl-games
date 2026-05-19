<template>
  <div class="page">
    <nav class="nav">
      <NuxtLink to="/" class="back">← Back</NuxtLink>
      <div class="hud">
        <button class="mute-btn" :title="sound.muted.value ? 'Unmute' : 'Mute'" @click="sound.toggleMute()">{{ sound.muted.value ? '🔇' : '🔊' }}</button>
        <span class="hud-item">⭐ {{ score }}</span>
        <span class="hud-item">🚩 {{ flagsLeft }}</span>
        <span class="hud-item lives">{{ '❤️'.repeat(lives) }}</span>
        <span class="hud-item smoke-row">
          <span v-for="i in MAX_SMOKE" :key="i" :class="i <= smokeCountRef ? 'smk-on' : 'smk-off'">💨</span>
        </span>
      </div>
    </nav>

    <div class="game-wrap">
      <canvas ref="canvasEl" :width="W" :height="H" class="canvas" />

      <div v-if="phase !== 'playing'" class="overlay">
        <div class="overlay-box">
          <p class="over-emoji">{{ phase === 'over' ? '💀' : phase === 'rounddone' ? '🏆' : '🚗' }}</p>
          <h2 class="over-title">{{ overlayTitle }}</h2>
          <p class="over-sub">{{ overlaySub }}</p>
          <button class="btn" @click="onOverlayBtn">{{ overlayBtn }}</button>
        </div>
      </div>
    </div>

    <div class="controls">
      <div class="dpad">
        <div class="dpad-row">
          <button class="ctrl-btn"
            @pointerdown.prevent="keys.up = true"
            @pointerup="keys.up = false" @pointercancel="keys.up = false" @pointerleave="keys.up = false">▲</button>
        </div>
        <div class="dpad-row">
          <button class="ctrl-btn"
            @pointerdown.prevent="keys.left = true"
            @pointerup="keys.left = false" @pointercancel="keys.left = false" @pointerleave="keys.left = false">◀</button>
          <button class="ctrl-btn smoke-ctrl" @pointerdown.prevent="deploySmoke">💨</button>
          <button class="ctrl-btn"
            @pointerdown.prevent="keys.right = true"
            @pointerup="keys.right = false" @pointercancel="keys.right = false" @pointerleave="keys.right = false">▶</button>
        </div>
        <div class="dpad-row">
          <button class="ctrl-btn"
            @pointerdown.prevent="keys.down = true"
            @pointerup="keys.down = false" @pointercancel="keys.down = false" @pointerleave="keys.down = false">▼</button>
        </div>
      </div>
      <p class="ctrl-hint">Space = smoke</p>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ ssr: false })

// ── Constants ─────────────────────────────────────────────────────────────────
const T = 36                          // tile px
const MAP_COLS = 25, MAP_ROWS = 19
const W = 460, H = 320
const CAR_W = 22, CAR_H = 26
const PLAYER_SPD = 115
const ENEMY_SPD_BASE = 68
const MAX_SMOKE = 3
const SMOKE_LIFE = 4                  // seconds smoke cloud lasts
const SMOKE_REFILL_TIME = 6          // seconds per smoke unit

// H-road rows and V-road cols form the navigable grid
const H_ROADS = new Set([1, 5, 9, 13, 17])
const V_ROADS = new Set([1, 4, 8, 12, 16, 20, 23])

// Flag positions: [row, col] — all at valid intersections
const FLAG_TILES: [number, number][] = [
  [1, 1], [1, 20], [5, 4], [5, 23],
  [9, 4], [9, 20], [13, 1], [13, 16],
  [17, 8], [17, 23],
]

// Enemy starts: [row, col, dx, dy]
const ENEMY_STARTS: [number, number, number, number][] = [
  [1, 4,   1,  0],
  [1, 16, -1,  0],
  [17, 4,  1,  0],
  [17, 16, 0, -1],
  [9, 23, -1,  0],
]

// ── State ─────────────────────────────────────────────────────────────────────
interface Enemy { x: number; y: number; dx: number; dy: number; speedMult: number }
interface Flag  { wx: number; wy: number; collected: boolean }
interface Smoke { wx: number; wy: number; life: number }

const sound = useSound()
useMusic('rally-x')
const canvasEl = ref<HTMLCanvasElement | null>(null)
const phase = ref<'ready' | 'playing' | 'rounddone' | 'over'>('ready')
const score = ref(0)
const lives = ref(3)
const round = ref(1)
const flagsLeft = ref(0)
const smokeCountRef = ref(MAX_SMOKE)

const overlayTitle = computed(() => {
  if (phase.value === 'ready')     return 'Rally-X'
  if (phase.value === 'rounddone') return `Round ${round.value} Clear!`
  return 'Game Over'
})
const overlaySub = computed(() => {
  if (phase.value === 'ready')     return 'Collect all flags · Avoid red cars · Space = smoke'
  if (phase.value === 'rounddone') return `Score: ${score.value}`
  return `Score: ${score.value}`
})
const overlayBtn = computed(() => {
  if (phase.value === 'ready') return 'Start'
  if (phase.value === 'rounddone') return 'Next Round'
  return 'Play Again'
})

let ctx: CanvasRenderingContext2D | null = null
let raf: number | null = null
let lastTime = 0

// Player
let px = 0, py = 0, pdx = 1, pdy = 0
let invincible = 0

// World objects
let MAP: number[][]
let enemies: Enemy[] = []
let flags: Flag[] = []
let smokes: Smoke[] = []
let smokeCount = MAX_SMOKE
let smokeRefill = 0

// Camera
let camX = 0, camY = 0

const keys = reactive({ up: false, down: false, left: false, right: false })

// ── Map ───────────────────────────────────────────────────────────────────────
function buildMap(): number[][] {
  const m = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLS).fill(1))
  for (let r = 1; r < MAP_ROWS - 1; r++)
    for (let c = 1; c < MAP_COLS - 1; c++)
      if (H_ROADS.has(r) || V_ROADS.has(c)) m[r][c] = 0
  return m
}

function tileAt(wx: number, wy: number): number {
  const c = Math.floor(wx / T), r = Math.floor(wy / T)
  if (r < 0 || r >= MAP_ROWS || c < 0 || c >= MAP_COLS) return 1
  return MAP[r][c]
}

function canMove(x: number, y: number): boolean {
  const p = 2
  return tileAt(x + p, y + p) === 0 &&
         tileAt(x + CAR_W - p, y + p) === 0 &&
         tileAt(x + p, y + CAR_H - p) === 0 &&
         tileAt(x + CAR_W - p, y + CAR_H - p) === 0
}

// Top-left of car centered in tile
function tileX(c: number) { return c * T + (T - CAR_W) / 2 }
function tileY(r: number) { return r * T + (T - CAR_H) / 2 }

// ── Session management ────────────────────────────────────────────────────────
function startRound() {
  MAP = buildMap()

  px = tileX(12); py = tileY(9)
  pdx = 1; pdy = 0; invincible = 0

  flags = FLAG_TILES.map(([r, c]) => ({
    wx: c * T + T / 2, wy: r * T + T / 2, collected: false,
  }))
  flagsLeft.value = flags.length

  const espd = ENEMY_SPD_BASE + (round.value - 1) * 14
  enemies = ENEMY_STARTS.map(([r, c, dx, dy]) => ({
    x: tileX(c), y: tileY(r), dx, dy,
    speedMult: 0.88 + Math.random() * 0.24,
  }))

  smokes = []
  smokeCount = MAX_SMOKE
  smokeCountRef.value = MAX_SMOKE
  smokeRefill = 0

  camX = Math.max(0, Math.min(px + CAR_W / 2 - W / 2, MAP_COLS * T - W))
  camY = Math.max(0, Math.min(py + CAR_H / 2 - H / 2, MAP_ROWS * T - H))
}

function startGame() {
  score.value = 0; lives.value = 3; round.value = 1
  startRound()
  phase.value = 'playing'
  lastTime = performance.now()
  if (raf) cancelAnimationFrame(raf)
  raf = requestAnimationFrame(loop)
}

function nextRound() {
  round.value++
  startRound()
  phase.value = 'playing'
  lastTime = performance.now()
  if (raf) cancelAnimationFrame(raf)
  raf = requestAnimationFrame(loop)
}

function onOverlayBtn() {
  if (phase.value === 'rounddone') nextRound()
  else startGame()
}

function deploySmoke() {
  if (smokeCount <= 0 || phase.value !== 'playing') return
  smokeCount--
  smokeCountRef.value = smokeCount
  smokes.push({ wx: px + CAR_W / 2, wy: py + CAR_H / 2, life: SMOKE_LIFE })
  sound.shoot()
}

// ── Game loop ─────────────────────────────────────────────────────────────────
function loop(ts: number) {
  const dt = Math.min((ts - lastTime) / 1000, 0.05)
  lastTime = ts
  update(dt)
  draw()
  if (phase.value === 'playing') raf = requestAnimationFrame(loop)
}

function update(dt: number) {
  // ── Player movement ──────────────────────────────────────────────────────
  let ndx = pdx, ndy = pdy
  if (keys.left)  { ndx = -1; ndy = 0 }
  if (keys.right) { ndx =  1; ndy = 0 }
  if (keys.up)    { ndx =  0; ndy = -1 }
  if (keys.down)  { ndx =  0; ndy =  1 }

  // Try new direction first, fall back to current direction
  const nnx = px + ndx * PLAYER_SPD * dt
  const nny = py + ndy * PLAYER_SPD * dt
  if (canMove(nnx, nny)) {
    px = nnx; py = nny; pdx = ndx; pdy = ndy
  } else {
    const cx = px + pdx * PLAYER_SPD * dt
    const cy = py + pdy * PLAYER_SPD * dt
    if (canMove(cx, cy)) { px = cx; py = cy }
  }

  // ── Smoke refill ─────────────────────────────────────────────────────────
  smokeRefill += dt
  if (smokeRefill >= SMOKE_REFILL_TIME && smokeCount < MAX_SMOKE) {
    smokeCount++; smokeCountRef.value = smokeCount; smokeRefill = 0
  }
  smokes = smokes.filter(s => { s.life -= dt; return s.life > 0 })

  // ── Camera ───────────────────────────────────────────────────────────────
  camX = Math.max(0, Math.min(px + CAR_W / 2 - W / 2, MAP_COLS * T - W))
  camY = Math.max(0, Math.min(py + CAR_H / 2 - H / 2, MAP_ROWS * T - H))

  // ── Flag collection ───────────────────────────────────────────────────────
  const pcx = px + CAR_W / 2, pcy = py + CAR_H / 2
  for (const f of flags) {
    if (f.collected) continue
    const dx = pcx - f.wx, dy = pcy - f.wy
    if (dx * dx + dy * dy < (T * 0.62) ** 2) {
      f.collected = true
      flagsLeft.value--
      score.value += 100 * round.value
      sound.eat()
    }
  }
  if (flagsLeft.value === 0) {
    phase.value = 'rounddone'; sound.win()
    if (raf) cancelAnimationFrame(raf)
    return
  }

  // ── Enemies ───────────────────────────────────────────────────────────────
  if (invincible > 0) invincible -= dt
  const espd = (ENEMY_SPD_BASE + (round.value - 1) * 14)

  for (const e of enemies) {
    const inSmoke = smokes.some(s => {
      const dx = (e.x + CAR_W / 2) - s.wx, dy = (e.y + CAR_H / 2) - s.wy
      return dx * dx + dy * dy < (T * 1.4) ** 2
    })
    const speed = espd * e.speedMult * (inSmoke ? 0.18 : 1)

    const distX = pcx - (e.x + CAR_W / 2)
    const distY = pcy - (e.y + CAR_H / 2)

    const preferred = Math.abs(distX) >= Math.abs(distY)
      ? [{ x: Math.sign(distX), y: 0 }, { x: 0, y: Math.sign(distY) },
         { x: 0, y: -Math.sign(distY) }, { x: -Math.sign(distX), y: 0 }]
      : [{ x: 0, y: Math.sign(distY) }, { x: Math.sign(distX), y: 0 },
         { x: -Math.sign(distX), y: 0 }, { x: 0, y: -Math.sign(distY) }]

    // Try current direction first, then turn toward player
    const dirs = [{ x: e.dx, y: e.dy }, ...preferred]
    for (const d of dirs) {
      if (d.x === 0 && d.y === 0) continue
      const nx = e.x + d.x * speed * dt
      const ny = e.y + d.y * speed * dt
      if (canMove(nx, ny)) { e.x = nx; e.y = ny; e.dx = d.x; e.dy = d.y; break }
    }

    // Collision with player
    if (invincible <= 0) {
      const cdx = (e.x + CAR_W / 2) - pcx
      const cdy = (e.y + CAR_H / 2) - pcy
      if (Math.abs(cdx) < CAR_W * 0.82 && Math.abs(cdy) < CAR_H * 0.82) {
        lives.value--
        invincible = 3
        sound.playerHit()
        if (lives.value <= 0) {
          phase.value = 'over'; sound.gameOver()
          if (raf) cancelAnimationFrame(raf)
          return
        }
      }
    }
  }
}

// ── Drawing ───────────────────────────────────────────────────────────────────
function draw() {
  if (!ctx) return
  const now = performance.now() / 1000

  // Tiles
  const c0 = Math.max(0, Math.floor(camX / T))
  const r0 = Math.max(0, Math.floor(camY / T))
  const c1 = Math.min(MAP_COLS, c0 + Math.ceil(W / T) + 2)
  const r1 = Math.min(MAP_ROWS, r0 + Math.ceil(H / T) + 2)

  for (let r = r0; r < r1; r++) {
    for (let c = c0; c < c1; c++) {
      const sx = c * T - camX, sy = r * T - camY
      if (MAP[r][c] === 1) {
        ctx.fillStyle = '#183d18'
        ctx.fillRect(sx, sy, T, T)
        ctx.fillStyle = '#1e4e1e'
        ctx.fillRect(sx + 1, sy + 1, T - 2, T - 2)
      } else {
        ctx.fillStyle = '#12121e'
        ctx.fillRect(sx, sy, T, T)
        ctx.fillStyle = '#1a1a2e'
        ctx.fillRect(sx + 2, sy + 2, T - 4, T - 4)
      }
    }
  }

  // Smoke clouds
  for (const s of smokes) {
    const sx = s.wx - camX, sy = s.wy - camY
    const alpha = Math.min(1, s.life / 1.5) * 0.55
    ctx.fillStyle = `rgba(160,170,200,${alpha})`
    ctx.beginPath()
    ctx.arc(sx, sy, T * 1.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = `rgba(190,200,220,${alpha * 0.6})`
    ctx.beginPath()
    ctx.arc(sx + 8, sy - 6, T * 0.9, 0, Math.PI * 2)
    ctx.fill()
  }

  // Flags
  for (const f of flags) {
    if (f.collected) continue
    const sx = f.wx - camX, sy = f.wy - camY
    if (sx < -30 || sx > W + 30 || sy < -30 || sy > H + 30) continue
    const bob = Math.sin(now * 4 + f.wx) * 2
    ctx.fillStyle = '#64748b'
    ctx.fillRect(sx - 1, sy - 18 + bob, 2, 20)
    ctx.fillStyle = '#fbbf24'
    ctx.beginPath()
    ctx.moveTo(sx + 1, sy - 18 + bob)
    ctx.lineTo(sx + 1, sy - 9 + bob)
    ctx.lineTo(sx + 12, sy - 13.5 + bob)
    ctx.closePath()
    ctx.fill()
  }

  // Enemies
  for (const e of enemies) {
    drawCar(e.x - camX, e.y - camY, e.dx, e.dy, '#dc2626', '#7f1d1d')
  }

  // Player (blink when invincible)
  if (!(invincible > 0 && Math.floor(invincible * 10) % 2 === 0)) {
    drawCar(px - camX, py - camY, pdx, pdy, '#818cf8', '#3730a3')
  }

  // Mini-map
  drawMinimap()

  // Round label
  ctx.fillStyle = 'rgba(100,116,139,0.8)'
  ctx.font = '11px monospace'
  ctx.fillText(`Round ${round.value}`, 6, H - 6)
}

function drawCar(sx: number, sy: number, dx: number, dy: number, body: string, detail: string) {
  if (!ctx) return
  ctx.fillStyle = body
  ctx.fillRect(sx, sy, CAR_W, CAR_H)

  // Windshield (front of car)
  ctx.fillStyle = '#c7d2fe'
  if      (dy < 0) ctx.fillRect(sx + 3, sy, CAR_W - 6, 5)
  else if (dy > 0) ctx.fillRect(sx + 3, sy + CAR_H - 5, CAR_W - 6, 5)
  else if (dx < 0) ctx.fillRect(sx, sy + 4, 5, CAR_H - 8)
  else             ctx.fillRect(sx + CAR_W - 5, sy + 4, 5, CAR_H - 8)

  // Hood detail
  ctx.fillStyle = detail
  if      (dy < 0) ctx.fillRect(sx + 3, sy + 5, CAR_W - 6, 4)
  else if (dy > 0) ctx.fillRect(sx + 3, sy + CAR_H - 9, CAR_W - 6, 4)
  else if (dx < 0) ctx.fillRect(sx + 5, sy + 4, 4, CAR_H - 8)
  else             ctx.fillRect(sx + CAR_W - 9, sy + 4, 4, CAR_H - 8)

  // Wheels
  ctx.fillStyle = '#0a0a14'
  ctx.fillRect(sx - 2, sy + 3,          3, 5)
  ctx.fillRect(sx + CAR_W - 1, sy + 3,  3, 5)
  ctx.fillRect(sx - 2, sy + CAR_H - 8,  3, 5)
  ctx.fillRect(sx + CAR_W - 1, sy + CAR_H - 8, 3, 5)
}

function drawMinimap() {
  if (!ctx) return
  const S = 3.5            // px per tile
  const mw = Math.ceil(MAP_COLS * S)
  const mh = Math.ceil(MAP_ROWS * S)
  const ox = W - mw - 6, oy = H - mh - 6

  ctx.fillStyle = 'rgba(0,0,0,0.75)'
  ctx.fillRect(ox - 2, oy - 2, mw + 4, mh + 4)

  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      ctx.fillStyle = MAP[r][c] === 1 ? '#1e4e1e' : '#1a1a30'
      ctx.fillRect(ox + c * S, oy + r * S, S, S)
    }
  }

  for (const f of flags) {
    if (f.collected) continue
    ctx.fillStyle = '#fbbf24'
    const fx = ox + (f.wx / T) * S - 1, fy = oy + (f.wy / T) * S - 1
    ctx.fillRect(fx, fy, 2.5, 2.5)
  }

  ctx.fillStyle = '#ef4444'
  for (const e of enemies) {
    ctx.fillRect(ox + ((e.x + CAR_W / 2) / T) * S - 1.5, oy + ((e.y + CAR_H / 2) / T) * S - 1.5, 3, 3)
  }

  ctx.fillStyle = '#818cf8'
  ctx.fillRect(ox + ((px + CAR_W / 2) / T) * S - 2, oy + ((py + CAR_H / 2) / T) * S - 2, 4, 4)

  // Viewport rectangle
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.lineWidth = 1
  ctx.strokeRect(ox + (camX / T) * S, oy + (camY / T) * S, (W / T) * S, (H / T) * S)
}

// ── Keyboard & lifecycle ──────────────────────────────────────────────────────
onMounted(() => {
  ctx = canvasEl.value?.getContext('2d') ?? null

  function onKeyDown(e: KeyboardEvent) {
    if (phase.value !== 'playing') {
      if (e.code === 'Space' || e.code === 'Enter') onOverlayBtn()
      return
    }
    if (e.code === 'ArrowLeft'  || e.code === 'KeyA') keys.left  = true
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true
    if (e.code === 'ArrowUp'    || e.code === 'KeyW') { e.preventDefault(); keys.up   = true }
    if (e.code === 'ArrowDown'  || e.code === 'KeyS') { e.preventDefault(); keys.down = true }
    if (e.code === 'Space') { e.preventDefault(); deploySmoke() }
  }
  function onKeyUp(e: KeyboardEvent) {
    if (e.code === 'ArrowLeft'  || e.code === 'KeyA') keys.left  = false
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false
    if (e.code === 'ArrowUp'    || e.code === 'KeyW') keys.up    = false
    if (e.code === 'ArrowDown'  || e.code === 'KeyS') keys.down  = false
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup',   onKeyUp)
  onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup',   onKeyUp)
    if (raf) cancelAnimationFrame(raf)
  })
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 16px 28px;
  background: radial-gradient(ellipse at top, #0a1a0a 0%, #0f0f1a 70%);
}

.nav {
  width: 100%;
  max-width: 460px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.back { font-size: 0.9rem; color: #64748b; transition: color 0.15s; }
.back:hover { color: #94a3b8; }

.hud { display: flex; align-items: center; gap: 10px; }
.hud-item { font-size: 0.9rem; font-weight: 700; color: #f1f5f9; }
.lives { letter-spacing: -2px; }
.smoke-row { display: flex; gap: 2px; }
.smk-on  { font-size: 0.85rem; opacity: 1; }
.smk-off { font-size: 0.85rem; opacity: 0.2; }

.mute-btn {
  background: none; border: none; font-size: 1rem;
  cursor: pointer; padding: 2px 4px; opacity: 0.5;
  transition: opacity 0.15s; line-height: 1;
}
.mute-btn:hover { opacity: 1; }

.game-wrap {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 0 32px rgba(52, 211, 153, 0.12);
}

.canvas {
  display: block;
  border-radius: 10px;
  border: 2px solid #2d2d44;
  max-width: 100%;
}

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 10, 5, 0.88);
  backdrop-filter: blur(6px);
  border-radius: 8px;
}

.overlay-box {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.over-emoji  { font-size: 3rem; line-height: 1; }
.over-title  { font-size: 1.8rem; font-weight: 900; color: #f1f5f9; }
.over-sub    { font-size: 0.9rem; color: #94a3b8; max-width: 280px; text-align: center; }

.btn {
  padding: 11px 32px;
  background: #34d399;
  color: #0f0f1a;
  font-size: 0.95rem;
  font-weight: 700;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.15s;
}
.btn:hover { opacity: 0.9; transform: scale(1.03); }

/* ── Controls ── */
.controls {
  display: flex;
  align-items: center;
  gap: 24px;
  margin-top: 18px;
}

.dpad { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.dpad-row { display: flex; gap: 4px; }

.ctrl-btn {
  width: 58px;
  height: 52px;
  background: #1e1e2e;
  border: 2px solid #3d3d5c;
  border-radius: 10px;
  color: #e2e8f0;
  font-size: 1.2rem;
  cursor: pointer;
  touch-action: none;
  user-select: none;
  transition: background 0.1s, border-color 0.1s;
}
.ctrl-btn:active { background: #2a2a40; border-color: #34d399; }

.smoke-ctrl {
  background: #1a2e20;
  border-color: #34d399;
  color: #34d399;
  font-size: 1rem;
}
.smoke-ctrl:active { background: #253d2a; }

.ctrl-hint { font-size: 0.75rem; color: #374151; }
</style>
