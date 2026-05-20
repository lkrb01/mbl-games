<template>
  <div class="page">
    <nav class="nav">
      <NuxtLink to="/games" class="back">← Back</NuxtLink>
      <div class="hud">
        <button class="mute-btn" :title="sound.muted.value ? 'Unmute' : 'Mute'" @click="sound.toggleMute()">{{ sound.muted.value ? '🔇' : '🔊' }}</button>
        <span class="hud-item">🪙 {{ coinCount }}</span>
        <span class="hud-item lives">{{ '❤️'.repeat(lives) }}</span>
      </div>
    </nav>

    <div class="game-wrap">
      <canvas ref="canvasEl" :width="W" :height="H" class="canvas" />

      <!-- Setup screen -->
      <div v-if="phase === 'ready'" class="overlay">
        <div class="overlay-box">
          <p class="over-emoji">🏃</p>
          <h2 class="over-title">Platformer</h2>
          <p class="over-hint">Collect coins · Stomp enemies · Don't fall!</p>
          <div class="diff-row">
            <button
              v-for="d in DIFFICULTIES"
              :key="d.key"
              class="diff-btn"
              :class="{ active: difficulty === d.key }"
              @click="difficulty = d.key"
            >{{ d.label }}</button>
          </div>
          <button class="btn" @click="startGame">Start</button>
        </div>
      </div>

      <!-- Game over screen -->
      <div v-if="phase === 'over'" class="overlay">
        <div class="overlay-box">
          <p class="over-emoji">💀</p>
          <h2 class="over-title">Game Over</h2>
          <p class="over-score">Score: {{ finalScore }}</p>
          <p class="over-sub">{{ Math.floor(distancePx / 10) }}m · {{ coinCount }} coins</p>
          <div class="diff-row">
            <button
              v-for="d in DIFFICULTIES"
              :key="d.key"
              class="diff-btn"
              :class="{ active: difficulty === d.key }"
              @click="difficulty = d.key"
            >{{ d.label }}</button>
          </div>
          <button class="btn" @click="startGame">Play Again</button>
        </div>
      </div>
    </div>

    <div class="controls">
      <div class="ctrl-group">
        <button
          class="ctrl-btn"
          @pointerdown.prevent="keys.left = true"
          @pointerup="keys.left = false"
          @pointercancel="keys.left = false"
          @pointerleave="keys.left = false"
        >◀</button>
        <button
          class="ctrl-btn"
          @pointerdown.prevent="keys.right = true"
          @pointerup="keys.right = false"
          @pointercancel="keys.right = false"
          @pointerleave="keys.right = false"
        >▶</button>
      </div>
      <button class="ctrl-btn jump-btn" @pointerdown.prevent="tryJump">▲ Jump</button>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ ssr: false })

const W = 460
const H = 360
const GRAVITY = 1900
const JUMP_FORCE = -660
const PLAYER_SPD = 220
const FLOOR_Y = H - 24

interface Plat  { x: number; y: number; w: number; h: number }
interface Coin  { x: number; y: number; collected: boolean }
interface Enemy { x: number; y: number; vx: number; w: number; h: number; platLeft: number; platRight: number; dead: boolean }
interface Star  { x: number; y: number; r: number }
interface Diff  { key: string; label: string; minGap: number; maxGap: number; minPlat: number; maxPlat: number; enemyChance: number; enemySpd: number }

const DIFFICULTIES: Diff[] = [
  { key: 'easy',   label: '😊 Easy',   minGap: 70,  maxGap: 120, minPlat: 130, maxPlat: 220, enemyChance: 0.12, enemySpd: 55  },
  { key: 'medium', label: '😤 Medium', minGap: 95,  maxGap: 165, minPlat: 90,  maxPlat: 170, enemyChance: 0.26, enemySpd: 95  },
  { key: 'hard',   label: '💀 Hard',   minGap: 120, maxGap: 210, minPlat: 65,  maxPlat: 120, enemyChance: 0.42, enemySpd: 145 },
]

const sound = useSound()
useMusic('platformer')
const canvasEl = ref<HTMLCanvasElement | null>(null)
const phase = ref<'ready' | 'playing' | 'over'>('ready')
const coinCount = ref(0)
const lives = ref(3)
const finalScore = ref(0)
const difficulty = ref('medium')

let ctx: CanvasRenderingContext2D | null = null
let raf: number | null = null
let lastTime = 0
let camX = 0
let distancePx = 0

const keys = reactive({ left: false, right: false })
let jumpQueued = false
let wasOnGround = false

// Player state (plain vars for perf)
let px = 0, py = 0, pvx = 0, pvy = 0
const PW = 28, PH = 36
let onGround = false
let invincible = 0

let platforms: Plat[] = []
let coins: Coin[] = []
let enemies: Enemy[] = []
let stars: Star[] = []
let genX = 0

function tryJump() { jumpQueued = true }

function currentDiff(): Diff {
  return DIFFICULTIES.find(d => d.key === difficulty.value) ?? DIFFICULTIES[1]!
}

function initStars() {
  stars = Array.from({ length: 80 }, () => ({
    x: Math.random() * W * 10,
    y: Math.random() * H * 0.72,
    r: Math.random() < 0.25 ? 2 : 1,
  }))
}

function genChunk() {
  if (platforms.length === 0) {
    platforms.push({ x: -80, y: FLOOR_Y, w: 400, h: 24 })
    genX = 320
    return
  }
  const d = currentDiff()
  const lastPlat = platforms[platforms.length - 1]!
  const gapW = d.minGap + Math.random() * (d.maxGap - d.minGap)
  const platW = d.minPlat + Math.random() * (d.maxPlat - d.minPlat)
  const dy = (Math.random() - 0.5) * 160
  const newY = Math.max(H * 0.18, Math.min(FLOOR_Y - 8, lastPlat.y + dy))
  const newX = genX + gapW

  platforms.push({ x: newX, y: newY, w: platW, h: 20 })

  // Coins on platform
  if (Math.random() < 0.78) {
    const n = Math.random() < 0.4 ? 3 : 1
    for (let i = 0; i < n; i++) {
      coins.push({ x: newX + platW * ((i + 1) / (n + 1)), y: newY - 22, collected: false })
    }
  }

  // Enemy
  if (Math.random() < d.enemyChance && platW >= 100) {
    const spd = d.enemySpd * (Math.random() < 0.5 ? 1 : -1)
    enemies.push({
      x: newX + 16, y: newY - 28, vx: spd,
      w: 28, h: 28,
      platLeft: newX + 2, platRight: newX + platW - 30,
      dead: false,
    })
  }

  genX = newX + platW
}

function startGame() {
  coinCount.value = 0
  lives.value = 3
  finalScore.value = 0
  distancePx = 0
  camX = 0
  px = 80; py = 260; pvx = 0; pvy = 0
  onGround = false; invincible = 0; wasOnGround = false
  platforms = []; coins = []; enemies = []
  genX = 0
  initStars()
  genChunk(); genChunk(); genChunk(); genChunk()
  phase.value = 'playing'
  lastTime = performance.now()
  if (raf) cancelAnimationFrame(raf)
  raf = requestAnimationFrame(loop)
}

function loop(ts: number) {
  const dt = Math.min((ts - lastTime) / 1000, 0.05)
  lastTime = ts
  update(dt)
  draw()
  if (phase.value === 'playing') raf = requestAnimationFrame(loop)
}

function aabb(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

function update(dt: number) {
  while (genX - camX < W * 2.5) genChunk()

  // Horizontal movement
  pvx = keys.left ? -PLAYER_SPD : keys.right ? PLAYER_SPD : 0
  px += pvx * dt
  if (px < camX + 4) px = camX + 4

  // Gravity
  pvy = Math.min(pvy + GRAVITY * dt, 950)

  // Jump impulse
  if (jumpQueued && onGround) {
    pvy = JUMP_FORCE
    onGround = false
    sound.jump()
  }
  jumpQueued = false

  const prevY = py
  py += pvy * dt

  // Platform landing (top surface only)
  const prevOnGround = onGround
  onGround = false
  for (const p of platforms) {
    if (aabb(px, py, PW, PH, p.x, p.y, p.w, p.h)) {
      if (pvy >= 0 && prevY + PH <= p.y + 4) {
        py = p.y - PH
        pvy = 0
        onGround = true
      }
    }
  }

  if (onGround && !prevOnGround) sound.land()

  // Camera
  const targetCam = px - W * 0.3
  if (targetCam > camX) {
    camX = targetCam
    distancePx = camX
  }

  // Coins
  for (const c of coins) {
    if (c.collected) continue
    const dx = c.x - (px + PW / 2)
    const dy = c.y - (py + PH / 2)
    if (dx * dx + dy * dy < 22 * 22) {
      c.collected = true
      coinCount.value++
      sound.eat()
    }
  }

  // Enemies
  if (invincible > 0) invincible -= dt

  for (const e of enemies) {
    if (e.dead) continue
    e.x += e.vx * dt
    if (e.x <= e.platLeft)  { e.x = e.platLeft;  e.vx =  Math.abs(e.vx) }
    if (e.x >= e.platRight) { e.x = e.platRight; e.vx = -Math.abs(e.vx) }

    if (aabb(px, py, PW, PH, e.x, e.y, e.w, e.h)) {
      // Stomp: player falling and feet above enemy midline
      if (pvy > 0 && py + PH < e.y + e.h * 0.55 + 10) {
        e.dead = true
        pvy = -380
        coinCount.value += 2
        sound.stomp()
      } else if (invincible <= 0) {
        lives.value--
        invincible = 2
        pvy = -300
        sound.playerHit()
        if (lives.value <= 0) { endGame(); return }
      }
    }
  }

  // Fall off
  if (py > H + 80) {
    lives.value--
    sound.playerHit()
    if (lives.value <= 0) { endGame(); return }
    const respawn = platforms.find(p => p.x + p.w > camX + 40 && p.x < camX + W && p.y < H)
    px = respawn ? respawn.x + 16 : camX + 60
    py = respawn ? respawn.y - PH - 10 : 80
    pvy = 0; invincible = 2
  }

  // Cull objects behind camera
  platforms = platforms.filter(p => p.x + p.w > camX - 120)
  coins     = coins.filter(c => c.x > camX - 120)
  enemies   = enemies.filter(e => e.x + e.w > camX - 120)
}

function endGame() {
  finalScore.value = coinCount.value * 10 + Math.floor(distancePx / 10)
  phase.value = 'over'
  sound.gameOver()
  if (raf) cancelAnimationFrame(raf)
}

// ── Drawing ───────────────────────────────────────────────────────────────────
function draw() {
  if (!ctx) return
  const now = performance.now() / 1000

  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#07071e')
  sky.addColorStop(1, '#0d1f3c')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)

  // Stars (parallax at 8%)
  ctx.fillStyle = '#ffffff'
  const starShift = (camX * 0.08) % W
  for (const s of stars) {
    const sx = ((s.x - starShift) % (W * 10) + W * 10) % (W * 10)
    if (sx > W + 4) continue
    ctx.globalAlpha = 0.55 + Math.sin(now + s.x) * 0.1
    ctx.beginPath()
    ctx.arc(sx, s.y, s.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // Platforms
  for (const p of platforms) {
    const sx = p.x - camX
    if (sx + p.w < -10 || sx > W + 10) continue
    ctx.fillStyle = '#5c4033'
    ctx.fillRect(sx, p.y + 6, p.w, p.h - 6)
    ctx.fillStyle = '#15803d'
    ctx.fillRect(sx, p.y, p.w, 8)
    ctx.fillStyle = '#4ade80'
    ctx.fillRect(sx + 2, p.y + 1, p.w - 4, 3)
  }

  // Coins (bobbing)
  for (const c of coins) {
    if (c.collected) continue
    const sx = c.x - camX
    if (sx < -20 || sx > W + 20) continue
    const bob = Math.sin(now * 3.5 + c.x * 0.05) * 3
    ctx.fillStyle = '#fbbf24'
    ctx.beginPath()
    ctx.arc(sx, c.y + bob, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fde68a'
    ctx.beginPath()
    ctx.arc(sx - 2, c.y + bob - 2, 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // Enemies
  ctx.lineWidth = 2
  for (const e of enemies) {
    if (e.dead) continue
    const sx = e.x - camX
    if (sx + e.w < -10 || sx > W + 10) continue
    // Body
    ctx.fillStyle = '#dc2626'
    roundRect(sx, e.y, e.w, e.h, 4)
    // Feet
    ctx.fillStyle = '#991b1b'
    ctx.fillRect(sx + 4,        e.y + e.h, 8, 5)
    ctx.fillRect(sx + e.w - 12, e.y + e.h, 8, 5)
    // X eyes
    ctx.strokeStyle = '#fecaca'
    for (const [ox, oy] of [[6, 7], [17, 7]] as [number, number][]) {
      ctx.beginPath(); ctx.moveTo(sx + ox, e.y + oy);     ctx.lineTo(sx + ox + 5, e.y + oy + 5); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(sx + ox + 5, e.y + oy); ctx.lineTo(sx + ox, e.y + oy + 5);     ctx.stroke()
    }
  }
  ctx.lineWidth = 1

  // Player (blink when invincible)
  const blink = invincible > 0 && Math.floor(invincible * 10) % 2 === 0
  if (!blink) {
    const sx = px - camX
    // Body
    ctx.fillStyle = '#818cf8'
    roundRect(sx, py, PW, PH, 5)
    // Legs
    ctx.fillStyle = '#4338ca'
    ctx.fillRect(sx + 2, py + PH * 0.62, PW - 4, PH * 0.38)
    // Running feet
    if (pvx !== 0 && onGround) {
      const f = Math.floor(now * 9) % 2
      ctx.fillStyle = '#312e81'
      ctx.fillRect(sx + (f ? 8 : 3),  py + PH, 8, 6)
      ctx.fillRect(sx + (f ? 3 : 14), py + PH, 8, 6)
    } else if (onGround) {
      ctx.fillStyle = '#312e81'
      ctx.fillRect(sx + 3,  py + PH, 8, 6)
      ctx.fillRect(sx + 14, py + PH, 8, 6)
    }
    // Eyes
    ctx.fillStyle = '#fff'
    ctx.fillRect(sx + 5,  py + 8,  7, 7)
    ctx.fillRect(sx + 16, py + 8,  7, 7)
    ctx.fillStyle = '#1e1b4b'
    ctx.fillRect(sx + 7,  py + 10, 4, 4)
    ctx.fillRect(sx + 18, py + 10, 4, 4)
    // Pupils follow movement dir
    if (pvx > 0) { ctx.fillStyle = '#1e1b4b'; ctx.fillRect(sx + 8,  py + 10, 4, 4); ctx.fillRect(sx + 19, py + 10, 4, 4) }
  }

  // Distance meter
  ctx.fillStyle = 'rgba(100,116,139,0.8)'
  ctx.font = '11px monospace'
  ctx.fillText(`${Math.floor(distancePx / 10)}m`, 6, H - 6)
}

function roundRect(x: number, y: number, w: number, h: number, r: number) {
  if (!ctx) return
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.fill()
}

// ── Keyboard & lifecycle ──────────────────────────────────────────────────────
onMounted(() => {
  ctx = canvasEl.value?.getContext('2d') ?? null

  function onKeyDown(e: KeyboardEvent) {
    if (phase.value !== 'playing') {
      if (e.code === 'Space' || e.code === 'Enter') startGame()
      return
    }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA')  keys.left  = true
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true
    if (e.code === 'ArrowUp' || e.code === 'Space' || e.code === 'KeyW') {
      e.preventDefault(); tryJump()
    }
  }
  function onKeyUp(e: KeyboardEvent) {
    if (e.code === 'ArrowLeft'  || e.code === 'KeyA') keys.left  = false
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false
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
  padding: 20px 16px 32px;
  background: radial-gradient(ellipse at top, #0d1117 0%, #0f0f1a 70%);
}

.nav {
  width: 100%;
  max-width: 460px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.back { font-size: 0.9rem; color: #64748b; transition: color 0.15s; }
.back:hover { color: #94a3b8; }

.hud { display: flex; align-items: center; gap: 12px; }
.hud-item { font-size: 1rem; font-weight: 700; color: #f1f5f9; }
.lives { letter-spacing: -2px; }

.mute-btn {
  background: none; border: none; font-size: 1.1rem;
  cursor: pointer; padding: 2px 4px; opacity: 0.5;
  transition: opacity 0.15s; line-height: 1;
}
.mute-btn:hover { opacity: 1; }

.game-wrap {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 0 40px rgba(129, 140, 248, 0.15);
}

.canvas {
  display: block;
  border-radius: 12px;
  border: 2px solid #2d2d44;
  max-width: 100%;
}

/* ── Overlay ── */
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 5, 20, 0.88);
  backdrop-filter: blur(6px);
  border-radius: 10px;
}

.overlay-box {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.over-emoji { font-size: 3.5rem; line-height: 1; }

.over-title { font-size: 2rem; font-weight: 900; color: #f1f5f9; }

.over-hint { font-size: 0.9rem; color: #94a3b8; }

.over-score { font-size: 1.5rem; font-weight: 800; color: #818cf8; }

.over-sub { font-size: 0.9rem; color: #64748b; margin-top: -8px; }

.diff-row { display: flex; gap: 8px; }

.diff-btn {
  padding: 8px 16px;
  background: #1e1e2e;
  border: 1px solid #3d3d5c;
  border-radius: 8px;
  color: #94a3b8;
  font-size: 0.875rem;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.diff-btn:hover { border-color: #818cf8; color: #f1f5f9; }
.diff-btn.active { background: #2d2a50; border-color: #818cf8; color: #c7d2fe; font-weight: 700; }

.btn {
  padding: 12px 36px;
  background: #818cf8;
  color: #0f0f1a;
  font-size: 1rem;
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
  justify-content: space-between;
  width: 100%;
  max-width: 460px;
  margin-top: 20px;
  gap: 12px;
}

.ctrl-group { display: flex; gap: 10px; }

.ctrl-btn {
  width: 72px;
  height: 64px;
  background: #1e1e2e;
  border: 2px solid #3d3d5c;
  border-radius: 12px;
  color: #e2e8f0;
  font-size: 1.4rem;
  cursor: pointer;
  touch-action: none;
  user-select: none;
  transition: background 0.1s, border-color 0.1s;
}
.ctrl-btn:active { background: #2d2a50; border-color: #818cf8; }

.jump-btn {
  width: 120px;
  background: #2d2a50;
  border-color: #818cf8;
  color: #c7d2fe;
  font-size: 1.1rem;
  font-weight: 700;
}
.jump-btn:active { background: #3d3a70; }
</style>
