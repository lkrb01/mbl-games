<template>
  <div class="page">
    <nav class="nav">
      <NuxtLink to="/games" class="back">← Back</NuxtLink>
      <div class="nav-right">
        <button class="mute-btn" :title="sound.muted.value ? 'Unmute' : 'Mute'" @click="sound.toggleMute()">{{ sound.muted.value ? '🔇' : '🔊' }}</button>
        <span v-if="screen === 'playing'" class="score-display">{{ scoreLabel }}</span>
      </div>
    </nav>

    <div class="game-wrap">
      <canvas
        ref="canvas"
        :width="W"
        :height="H"
        class="canvas"
        @mousemove="onMouseMove"
        @mousedown="onMouseDown"
        @touchmove.prevent="onTouchMove"
        @touchstart.prevent="onTouchStart"
      />

      <div v-if="screen === 'menu'" class="overlay">
        <div class="overlay-box">
          <h2 class="over-title">⚽ Soccer</h2>
          <p class="over-hint">Choose a mode</p>
          <div class="mode-grid">
            <button class="mode-btn" @click="startMode('penalty')">
              <span class="mode-icon">🥅</span>
              <span class="mode-name">Penalty Shootout</span>
              <span class="mode-desc">5 kicks · beat the keeper</span>
            </button>
            <button class="mode-btn" @click="startMode('freekick')">
              <span class="mode-icon">🌀</span>
              <span class="mode-name">Free Kick</span>
              <span class="mode-desc">Hit targets in 30 seconds</span>
            </button>
            <button class="mode-btn" @click="startMode('goalkeeper')">
              <span class="mode-icon">🧤</span>
              <span class="mode-name">Goalkeeper</span>
              <span class="mode-desc">Save 10 incoming shots</span>
            </button>
          </div>
        </div>
      </div>

      <div v-if="screen === 'result'" class="overlay">
        <div class="overlay-box">
          <h2 class="over-title">{{ resultTitle }}</h2>
          <p class="over-score">{{ resultScore }}</p>
          <div class="btn-row">
            <button class="btn btn-sec" @click="screen = 'menu'">Menu</button>
            <button class="btn" @click="startMode(mode)">Play Again</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const W = 480
const H = 340

// Goal geometry — shooter/freekick view
const GL = 100, GR = 380, GT = 45, GB = 180
const GW = GR - GL, GH = GB - GT

// Goalkeeper view goal geometry
const GK_GL = 55, GK_GR = W - 55, GK_GT = 25, GK_GB = H - 50
const GK_GW = GK_GR - GK_GL, GK_GH = GK_GB - GK_GT

type Mode = 'penalty' | 'freekick' | 'goalkeeper'
type Screen = 'menu' | 'playing' | 'result'
type Phase = 'aim' | 'hint' | 'animating' | 'feedback'

const canvas = ref<HTMLCanvasElement | null>(null)
const screen = ref<Screen>('menu')
const mode = ref<Mode>('penalty')
const sound = useSound()
useMusic('soccer')

const scored = ref(0)
const saved = ref(0)
const kicksLeft = ref(5)
const shotsLeft = ref(10)
const timeLeft = ref(30)
const resultTitle = ref('')
const resultScore = ref('')

const scoreLabel = computed(() => {
  if (mode.value === 'penalty') return `${scored.value} goals · ${kicksLeft.value} left`
  if (mode.value === 'freekick') return `${scored.value} pts · ${timeLeft.value}s`
  return `${saved.value} / 10 saved`
})

let phase: Phase = 'aim'
let animStart = 0
let animFrame: number | null = null
let timerInterval: ReturnType<typeof setInterval> | null = null
let shotTimeout: ReturnType<typeof setTimeout> | null = null

let aimX = W / 2
let aimY = (GT + GB) / 2
let keeperTargetX = W / 2
let feedbackText = ''
let feedbackColor = '#34d399'

interface Target { x: number; y: number; r: number }
let targets: Target[] = []

let incomingZone = 0
let playerZone = -1

function ctx() { return canvas.value?.getContext('2d') ?? null }

// ─── Drawing helpers ─────────────────────────────────────────────────────────

function drawPent(c: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  c.beginPath()
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2
    i === 0 ? c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
            : c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
  }
  c.closePath(); c.fill()
}

function postGradient(c: CanvasRenderingContext2D, x1: number, x2: number) {
  const g = c.createLinearGradient(x1, 0, x2, 0)
  g.addColorStop(0, '#9ab0c0')
  g.addColorStop(0.28, '#ffffff')
  g.addColorStop(0.65, '#dde8f0')
  g.addColorStop(1, '#8090a0')
  return g
}

// ─── Stadium background ──────────────────────────────────────────────────────

function drawStadiumBg() {
  const c = ctx()!

  // Night sky
  const sky = c.createLinearGradient(0, 0, 0, GB)
  sky.addColorStop(0, '#06090f')
  sky.addColorStop(0.7, '#0a1420')
  sky.addColorStop(1, '#0c1c14')
  c.fillStyle = sky
  c.fillRect(0, 0, W, GB)

  // Floodlight halos from top corners
  for (const [lx, ly] of [[0, 0], [W, 0], [W * 0.32, -10], [W * 0.68, -10]] as [number,number][]) {
    const g = c.createRadialGradient(lx, ly, 0, lx, ly, 200)
    g.addColorStop(0, 'rgba(255,250,210,0.09)')
    g.addColorStop(0.5, 'rgba(255,250,210,0.03)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    c.fillStyle = g
    c.fillRect(0, 0, W, GB)
  }

  // Stars
  c.fillStyle = 'rgba(255,255,255,0.55)'
  for (const [sx, sy] of [[38,6],[88,10],[150,4],[210,13],[268,7],[330,11],[395,5],[448,14],[70,19],[290,17],[175,21]] as [number,number][]) {
    c.beginPath(); c.arc(sx, sy, 0.65, 0, Math.PI * 2); c.fill()
  }

  // Stand silhouette — behind & sides of goal
  c.fillStyle = '#080c10'
  // Upper stand (above crossbar)
  c.beginPath()
  c.moveTo(0, 0)
  c.lineTo(0, GT - 2)
  for (let x = 0; x <= W; x += 7) {
    const b = Math.sin(x * 0.22) * 3.5 + Math.sin(x * 0.55) * 2 + Math.sin(x * 1.1) * 1.2
    c.lineTo(x, GT - 3 + b)
  }
  c.lineTo(W, 0)
  c.closePath(); c.fill()

  // Left stand (beside goal)
  c.beginPath()
  c.moveTo(0, GT - 2); c.lineTo(GL - 6, GT - 2); c.lineTo(GL, GB); c.lineTo(0, GB)
  c.closePath(); c.fill()

  // Right stand
  c.beginPath()
  c.moveTo(GR + 6, GT - 2); c.lineTo(W, GT - 2); c.lineTo(W, GB); c.lineTo(GR, GB)
  c.closePath(); c.fill()

  // Faint crowd lights in stands (small dots)
  for (let i = 0; i < 28; i++) {
    const sx = 10 + (i * 61) % (W - 20)
    const sy = 2 + (i * 37) % (GT - 8)
    const alpha = 0.12 + (i % 5) * 0.04
    c.fillStyle = `rgba(255,240,200,${alpha})`
    c.beginPath(); c.arc(sx, sy, 1, 0, Math.PI * 2); c.fill()
  }
}

// ─── Pitch ────────────────────────────────────────────────────────────────────

function drawPitch() {
  const c = ctx()!
  const pitchH = H - GB

  // Alternating grass stripes
  const stripes = 8
  for (let i = 0; i < stripes; i++) {
    const y1 = GB + (i / stripes) * pitchH
    const y2 = GB + ((i + 1) / stripes) * pitchH
    c.fillStyle = i % 2 === 0 ? '#1d6828' : '#1a5f24'
    c.fillRect(0, y1, W, y2 - y1)
  }

  // Subtle vignette on pitch edges
  const vL = c.createLinearGradient(0, 0, 60, 0)
  vL.addColorStop(0, 'rgba(0,0,0,0.18)'); vL.addColorStop(1, 'rgba(0,0,0,0)')
  c.fillStyle = vL; c.fillRect(0, GB, 60, pitchH)
  const vR = c.createLinearGradient(W, 0, W - 60, 0)
  vR.addColorStop(0, 'rgba(0,0,0,0.18)'); vR.addColorStop(1, 'rgba(0,0,0,0)')
  c.fillStyle = vR; c.fillRect(W - 60, GB, 60, pitchH)

  // Pitch markings
  c.strokeStyle = 'rgba(255,255,255,0.62)'
  c.lineWidth = 1.5

  // Goal line
  c.beginPath(); c.moveTo(0, GB); c.lineTo(W, GB); c.stroke()

  // 6-yard box in perspective
  const bx = 22, bd = 52, spread = 1.75
  c.beginPath(); c.moveTo(GL - bx, GB); c.lineTo(GL - bx * spread, GB + bd); c.stroke()
  c.beginPath(); c.moveTo(GR + bx, GB); c.lineTo(GR + bx * spread, GB + bd); c.stroke()
  c.beginPath(); c.moveTo(GL - bx * spread, GB + bd); c.lineTo(GR + bx * spread, GB + bd); c.stroke()

  // Penalty area near edge (faint)
  c.strokeStyle = 'rgba(255,255,255,0.35)'
  c.lineWidth = 1.2
  const pad = GB + bd + 58
  c.beginPath(); c.moveTo(0, pad); c.lineTo(W, pad); c.stroke()

  // Penalty spot
  c.fillStyle = 'rgba(255,255,255,0.7)'
  c.beginPath(); c.arc(W / 2, H - 38, 3.5, 0, Math.PI * 2); c.fill()
}

// ─── Goal (3D) ────────────────────────────────────────────────────────────────

function drawGoal() {
  const c = ctx()!
  const p = 7
  const depth = 20
  const backL = GL + depth, backR = GR - depth
  const backT = GT + depth * 0.45, backB = GB + depth * 0.45

  // Depth side panels
  c.fillStyle = 'rgba(160,185,200,0.18)'
  c.beginPath(); c.moveTo(GL, GT); c.lineTo(backL, backT); c.lineTo(backL, backB); c.lineTo(GL, GB); c.closePath(); c.fill()
  c.beginPath(); c.moveTo(GR, GT); c.lineTo(backR, backT); c.lineTo(backR, backB); c.lineTo(GR, GB); c.closePath(); c.fill()
  // Top depth panel
  c.fillStyle = 'rgba(160,185,200,0.14)'
  c.beginPath(); c.moveTo(GL, GT); c.lineTo(GR, GT); c.lineTo(backR, backT); c.lineTo(backL, backT); c.closePath(); c.fill()

  // Net — perspective lines to back
  const netCols = 14, netRows = 9
  c.lineWidth = 0.7

  for (let i = 0; i <= netCols; i++) {
    const tx = GL + (i / netCols) * GW
    const bx = backL + (i / netCols) * (backR - backL)
    c.strokeStyle = 'rgba(255,255,255,0.11)'
    c.beginPath(); c.moveTo(tx, GT); c.lineTo(bx, backT); c.stroke()
    c.beginPath(); c.moveTo(tx, GB); c.lineTo(bx, backB); c.stroke()
  }
  for (let i = 0; i <= netRows; i++) {
    const t = i / netRows
    const fy = GT + t * GH, by = backT + t * (backB - backT)
    c.strokeStyle = 'rgba(255,255,255,0.09)'
    c.beginPath(); c.moveTo(GL, fy); c.lineTo(backL, by); c.stroke()
    c.beginPath(); c.moveTo(GR, fy); c.lineTo(backR, by); c.stroke()
    c.beginPath(); c.moveTo(backL, by); c.lineTo(backR, by); c.stroke()
  }

  // Posts (cylindrical gradient look)
  c.fillStyle = postGradient(c, GL - p / 2, GL + p / 2)
  c.beginPath(); c.roundRect(GL - p / 2, GT, p, GH + p / 2, 2); c.fill()
  c.fillStyle = postGradient(c, GR - p / 2, GR + p / 2)
  c.beginPath(); c.roundRect(GR - p / 2, GT, p, GH + p / 2, 2); c.fill()

  // Crossbar
  const barG = c.createLinearGradient(0, GT - p / 2, 0, GT + p / 2)
  barG.addColorStop(0, '#8090a0'); barG.addColorStop(0.4, '#ffffff'); barG.addColorStop(1, '#8090a0')
  c.fillStyle = barG
  c.beginPath(); c.roundRect(GL - p / 2, GT - p / 2, GW + p, p, 2); c.fill()

  // Goal line
  c.fillStyle = 'rgba(255,255,255,0.55)'
  c.fillRect(GL, GB - 2, GW, 2)
}

// ─── Keeper ───────────────────────────────────────────────────────────────────

function drawKeeper(t = 0) {
  const c = ctx()!
  const kx = W / 2 + (keeperTargetX - W / 2) * Math.sin(t * Math.PI / 2)
  const lean = (keeperTargetX - W / 2) / (GW * 0.5) * 0.5 * t

  c.save()
  c.translate(kx, GB - 62)
  c.rotate(lean)

  // Kit gradient (light from top-left)
  const kitG = c.createLinearGradient(-16, -30, 16, 20)
  kitG.addColorStop(0, '#5b9cf6')
  kitG.addColorStop(0.5, '#2563eb')
  kitG.addColorStop(1, '#1d4ed8')

  // Body
  c.fillStyle = kitG
  c.beginPath(); c.roundRect(-15, -30, 30, 44, [4, 4, 2, 2]); c.fill()

  // Kit number
  c.fillStyle = 'rgba(255,255,255,0.55)'
  c.font = 'bold 9px system-ui'
  c.textAlign = 'center'; c.textBaseline = 'middle'
  c.fillText('1', 0, -10)

  // Shorts
  c.fillStyle = '#1e3a8a'
  c.beginPath(); c.roundRect(-15, 12, 13, 18, [0, 0, 3, 3]); c.fill()
  c.beginPath(); c.roundRect(2, 12, 13, 18, [0, 0, 3, 3]); c.fill()

  // Socks + boots
  c.fillStyle = '#93c5fd'
  c.fillRect(-14, 30, 11, 8)
  c.fillRect(3, 30, 11, 8)
  c.fillStyle = '#111'
  c.beginPath(); c.roundRect(-15, 36, 13, 6, 2); c.fill()
  c.beginPath(); c.roundRect(2, 36, 13, 6, 2); c.fill()

  // Head
  const headG = c.createRadialGradient(-3, -46, 2, 0, -43, 13)
  headG.addColorStop(0, '#fde68a')
  headG.addColorStop(1, '#d97706')
  c.fillStyle = headG
  c.beginPath(); c.arc(0, -43, 13, 0, Math.PI * 2); c.fill()

  // Hair
  c.fillStyle = '#92400e'
  c.beginPath(); c.ellipse(0, -53, 10, 5, 0, Math.PI, 0); c.fill()

  // Gloves (bright yellow, extended toward dive direction)
  const diveDir = keeperTargetX > W / 2 ? 1 : -1
  const gloveExt = t * diveDir * 8
  c.fillStyle = '#fbbf24'
  c.strokeStyle = '#92400e'; c.lineWidth = 0.8
  c.beginPath(); c.arc(-22 - gloveExt, -8, 9, 0, Math.PI * 2); c.fill(); c.stroke()
  c.beginPath(); c.arc(22 + gloveExt, -8, 9, 0, Math.PI * 2); c.fill(); c.stroke()
  // Glove fingers
  c.fillStyle = '#f59e0b'
  for (let f = -1; f <= 1; f++) {
    c.beginPath(); c.arc(-22 - gloveExt + f * 3.5, -15, 3, 0, Math.PI * 2); c.fill()
    c.beginPath(); c.arc(22 + gloveExt + f * 3.5, -15, 3, 0, Math.PI * 2); c.fill()
  }

  c.restore()
}

// ─── Ball ─────────────────────────────────────────────────────────────────────

function drawBall(x: number, y: number, scale = 1, spin = 0) {
  const c = ctx()!
  const r = 12 * scale

  c.save()
  c.translate(x, y)

  // Ground shadow
  c.fillStyle = 'rgba(0,0,0,0.28)'
  c.beginPath(); c.ellipse(1, r + 2, r * 0.72, r * 0.18, 0, 0, Math.PI * 2); c.fill()

  // 3D sphere gradient
  const grad = c.createRadialGradient(-r * 0.28, -r * 0.32, r * 0.04, 0, 0, r)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.45, '#eeeeee')
  grad.addColorStop(1, '#aaaaaa')
  c.fillStyle = grad
  c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill()

  // Pentagon patches (clipped to ball)
  c.save()
  c.beginPath(); c.arc(0, 0, r - 0.5, 0, Math.PI * 2); c.clip()
  c.fillStyle = '#111'
  c.rotate(spin)
  drawPent(c, 0, 0, r * 0.27)                                     // center
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2
    drawPent(c, Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6, r * 0.21)
  }
  c.restore()

  // Specular highlight
  const spec = c.createRadialGradient(-r * 0.28, -r * 0.3, 0, -r * 0.2, -r * 0.22, r * 0.48)
  spec.addColorStop(0, 'rgba(255,255,255,0.65)')
  spec.addColorStop(0.5, 'rgba(255,255,255,0.12)')
  spec.addColorStop(1, 'rgba(255,255,255,0)')
  c.fillStyle = spec
  c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill()

  c.restore()
}

// ─── Crosshair ────────────────────────────────────────────────────────────────

function drawCrosshair(x: number, y: number) {
  const c = ctx()!
  const pulse = 0.72 + Math.sin(performance.now() / 550) * 0.28
  const s = 15, b = 5

  c.save()
  c.strokeStyle = `rgba(255,70,70,${pulse})`
  c.lineWidth = 1.8

  // Corner brackets
  c.beginPath(); c.moveTo(x - s, y - s + b); c.lineTo(x - s, y - s); c.lineTo(x - s + b, y - s); c.stroke()
  c.beginPath(); c.moveTo(x + s - b, y - s); c.lineTo(x + s, y - s); c.lineTo(x + s, y - s + b); c.stroke()
  c.beginPath(); c.moveTo(x - s, y + s - b); c.lineTo(x - s, y + s); c.lineTo(x - s + b, y + s); c.stroke()
  c.beginPath(); c.moveTo(x + s - b, y + s); c.lineTo(x + s, y + s); c.lineTo(x + s, y + s - b); c.stroke()

  // Center dot
  c.fillStyle = `rgba(255,70,70,${pulse})`
  c.beginPath(); c.arc(x, y, 2, 0, Math.PI * 2); c.fill()

  c.restore()
}

// ─── Targets ──────────────────────────────────────────────────────────────────

function drawTargets() {
  const c = ctx()!
  for (const t of targets) {
    // Outer ring
    c.beginPath(); c.arc(t.x, t.y, t.r, 0, Math.PI * 2)
    c.fillStyle = 'rgba(251,191,36,0.15)'; c.fill()
    c.strokeStyle = '#fbbf24'; c.lineWidth = 2; c.stroke()
    // Inner ring
    c.beginPath(); c.arc(t.x, t.y, t.r * 0.55, 0, Math.PI * 2)
    c.strokeStyle = 'rgba(251,191,36,0.5)'; c.lineWidth = 1; c.stroke()
    // Bull
    c.fillStyle = '#fbbf24'
    c.beginPath(); c.arc(t.x, t.y, 4, 0, Math.PI * 2); c.fill()
  }
}

// ─── Wall ─────────────────────────────────────────────────────────────────────

function drawWall() {
  const c = ctx()!
  // Wall stands ~40% of the way from goal line toward the shooter
  const wy = GB + (H - 38 - GB) * 0.42
  const positions = [W / 2 - 46, W / 2, W / 2 + 46]

  // Scale up slightly — wall is closer to viewer than the goal
  const s = 1.3
  for (const px of positions) {
    c.save()
    c.translate(px, wy)
    c.scale(s, s)

    // Jersey shadow
    c.fillStyle = 'rgba(0,0,0,0.2)'
    c.beginPath(); c.roundRect(-12, -45, 24, 44, 3); c.fill()

    // Jersey
    const jerseyG = c.createLinearGradient(-12, -45, 12, -1)
    jerseyG.addColorStop(0, '#dc2626'); jerseyG.addColorStop(1, '#991b1b')
    c.fillStyle = jerseyG
    c.beginPath(); c.roundRect(-12, -45, 24, 44, 3); c.fill()

    // Shorts
    c.fillStyle = '#111827'
    c.fillRect(-12, -5, 11, 14); c.fillRect(1, -5, 11, 14)

    // Head
    const hg = c.createRadialGradient(-2, -58, 1, 0, -57, 11)
    hg.addColorStop(0, '#fde68a'); hg.addColorStop(1, '#d97706')
    c.fillStyle = hg
    c.beginPath(); c.arc(0, -57, 11, 0, Math.PI * 2); c.fill()

    // Arms up (wall posture)
    c.fillStyle = '#fde68a'
    c.beginPath(); c.roundRect(-20, -42, 8, 22, 3); c.fill()
    c.beginPath(); c.roundRect(12, -42, 8, 22, 3); c.fill()

    c.restore()
  }
}

// ─── Feedback ─────────────────────────────────────────────────────────────────

function drawFeedback() {
  const c = ctx()!
  c.save()
  // Background pill
  c.fillStyle = 'rgba(0,0,0,0.55)'
  c.beginPath(); c.roundRect(W / 2 - 110, H / 2 - 48, 220, 58, 12); c.fill()
  // Text
  c.fillStyle = feedbackColor
  c.font = 'bold 40px system-ui'
  c.textAlign = 'center'; c.textBaseline = 'middle'
  c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = 12
  c.fillText(feedbackText, W / 2, H / 2 - 20)
  c.restore()
}

// ─── Goalkeeper view ──────────────────────────────────────────────────────────

function drawGoalkeeperView() {
  const c = ctx()!

  // Night pitch background
  const bg = c.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#060a0f')
  bg.addColorStop(0.45, '#0b1820')
  bg.addColorStop(1, '#1a6025')
  c.fillStyle = bg
  c.fillRect(0, 0, W, H)

  // Floodlight glow
  for (const [lx, ly] of [[0, 0], [W, 0]] as [number,number][]) {
    const g = c.createRadialGradient(lx, ly, 0, lx, ly, 260)
    g.addColorStop(0, 'rgba(255,250,210,0.1)'); g.addColorStop(1, 'rgba(0,0,0,0)')
    c.fillStyle = g; c.fillRect(0, 0, W, H)
  }

  // Stars
  c.fillStyle = 'rgba(255,255,255,0.5)'
  for (const [sx, sy] of [[50,8],[140,5],[260,9],[370,6],[440,12]] as [number,number][]) {
    c.beginPath(); c.arc(sx, sy, 0.6, 0, Math.PI * 2); c.fill()
  }

  // Pitch vanishing lines
  c.strokeStyle = 'rgba(255,255,255,0.1)'
  c.lineWidth = 1
  c.beginPath(); c.moveTo(0, H); c.lineTo(W / 2, GK_GT + GK_GH * 0.5); c.stroke()
  c.beginPath(); c.moveTo(W, H); c.lineTo(W / 2, GK_GT + GK_GH * 0.5); c.stroke()

  // Pitch surface
  const pitchG = c.createLinearGradient(0, GK_GB, 0, H)
  pitchG.addColorStop(0, '#1d6828'); pitchG.addColorStop(1, '#155520')
  c.fillStyle = pitchG
  c.fillRect(0, GK_GB, W, H - GK_GB)

  const zw = GK_GW / 3, zh = GK_GH / 2

  // Zones
  for (let i = 0; i < 6; i++) {
    const col = i % 3, row = Math.floor(i / 3)
    const zx = GK_GL + col * zw, zy = GK_GT + row * zh

    const isHint = phase === 'hint' && i === incomingZone
    const isFb = phase === 'feedback'
    const isPlayer = isFb && i === playerZone
    const isCorrect = isFb && i === incomingZone

    let alpha = 0.1, rgb = '255,255,255'
    if (isHint) { rgb = '251,191,36'; alpha = 0.42 }
    if (isPlayer && !isCorrect) { rgb = '239,68,68'; alpha = 0.38 }
    if (isCorrect) { rgb = '52,211,153'; alpha = 0.38 }

    c.fillStyle = `rgba(${rgb},${alpha})`
    c.beginPath(); c.roundRect(zx + 3, zy + 3, zw - 6, zh - 6, 4); c.fill()
    c.strokeStyle = `rgba(${rgb},${Math.min(alpha + 0.3, 1)})`
    c.lineWidth = 1.5
    c.beginPath(); c.roundRect(zx + 3, zy + 3, zw - 6, zh - 6, 4); c.stroke()
  }

  // Goal net (perspective)
  const gkDepth = 18
  const bL = GK_GL + gkDepth, bR = GK_GR - gkDepth
  const bT = GK_GT + gkDepth * 0.4, bB = GK_GB + gkDepth * 0.4
  c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 0.8
  for (let i = 0; i <= 10; i++) {
    const tx = GK_GL + (i / 10) * GK_GW, bx = bL + (i / 10) * (bR - bL)
    c.beginPath(); c.moveTo(tx, GK_GT); c.lineTo(bx, bT); c.stroke()
    c.beginPath(); c.moveTo(tx, GK_GB); c.lineTo(bx, bB); c.stroke()
  }
  for (let i = 0; i <= 8; i++) {
    const t = i / 8
    const fy = GK_GT + t * GK_GH, by = bT + t * (bB - bT)
    c.beginPath(); c.moveTo(GK_GL, fy); c.lineTo(bL, by); c.stroke()
    c.beginPath(); c.moveTo(GK_GR, fy); c.lineTo(bR, by); c.stroke()
    c.beginPath(); c.moveTo(bL, by); c.lineTo(bR, by); c.stroke()
  }

  // Goal posts (cylindrical)
  const p = 9
  c.fillStyle = postGradient(c, GK_GL - p / 2, GK_GL + p / 2)
  c.beginPath(); c.roundRect(GK_GL - p / 2, GK_GT, p, GK_GH + p / 2, 2); c.fill()
  c.fillStyle = postGradient(c, GK_GR - p / 2, GK_GR + p / 2)
  c.beginPath(); c.roundRect(GK_GR - p / 2, GK_GT, p, GK_GH + p / 2, 2); c.fill()
  const barG = c.createLinearGradient(0, GK_GT - p / 2, 0, GK_GT + p / 2)
  barG.addColorStop(0, '#8090a0'); barG.addColorStop(0.4, '#fff'); barG.addColorStop(1, '#8090a0')
  c.fillStyle = barG
  c.beginPath(); c.roundRect(GK_GL - p / 2, GK_GT - p / 2, GK_GW + p, p, 2); c.fill()
  c.fillStyle = 'rgba(255,255,255,0.4)'
  c.fillRect(GK_GL, GK_GB - 2, GK_GW, 2)

  // Zone labels
  if (phase === 'aim') {
    const labels = [['Top', 'Left'], ['Top', 'Ctr'], ['Top', 'Right'], ['Bot', 'Left'], ['Bot', 'Ctr'], ['Bot', 'Right']]
    c.font = '600 11px system-ui'
    c.textAlign = 'center'; c.textBaseline = 'middle'
    for (let i = 0; i < 6; i++) {
      const col = i % 3, row = Math.floor(i / 3)
      const zx = GK_GL + col * zw, zy = GK_GT + row * zh
      c.fillStyle = 'rgba(255,255,255,0.5)'
      c.fillText(labels[i]![0]!, zx + zw / 2, zy + zh / 2 - 8)
      c.fillText(labels[i]![1]!, zx + zw / 2, zy + zh / 2 + 8)
    }
  }

  // Incoming ball
  if (phase === 'animating') {
    const col = incomingZone % 3, row = Math.floor(incomingZone / 3)
    const tx = GK_GL + (col + 0.5) * zw, ty = GK_GT + (row + 0.5) * zh
    const t = Math.min((performance.now() - animStart) / 900, 1)
    const eased = 1 - Math.pow(1 - t, 2)
    const bx = W / 2 + (tx - W / 2) * eased
    const by = H * 1.1 + (ty - H * 1.1) * eased
    drawBall(bx, by, 0.3 + eased * 1.4, t * 6)
  }

  if (phase === 'feedback') drawFeedback()
}

// ─── Main draw loop ─────────────────────────────────────────────────────────

function draw() {
  const c = ctx()
  if (!c) return
  c.clearRect(0, 0, W, H)

  if (mode.value === 'goalkeeper') {
    drawGoalkeeperView()
    return
  }

  drawStadiumBg()
  drawPitch()
  drawGoal()

  if (mode.value === 'freekick') {
    drawTargets()
  }

  const animT = phase === 'animating'
    ? Math.min((performance.now() - animStart) / 650, 1)
    : phase === 'feedback' ? 1 : 0

  drawKeeper(animT)

  if (mode.value === 'freekick') drawWall()

  if (phase === 'aim') {
    drawBall(W / 2, H - 38, 1, 0)
    drawCrosshair(aimX, aimY)
  } else if (phase === 'animating') {
    const eased = 1 - Math.pow(1 - animT, 2)
    const bx = W / 2 + (aimX - W / 2) * eased
    const by = H - 38 + (aimY - (H - 38)) * eased
    const arc = Math.sin(animT * Math.PI) * -25
    const spin = (performance.now() - animStart) / 180
    drawBall(bx, by + arc, 1 - eased * 0.35, spin)
  } else if (phase === 'feedback') {
    drawBall(aimX, aimY, 0.7, 0)
    drawFeedback()
  }

  c.textAlign = 'left'
}

// ─── Game logic ──────────────────────────────────────────────────────────────

function spawnTargets() {
  const corners: [number, number][] = [
    [GL + 28, GT + 22], [GR - 28, GT + 22],
    [GL + 55, GT + 65], [GR - 55, GT + 65],
  ]
  targets = [...corners].sort(() => Math.random() - 0.5).slice(0, 3).map(([x, y]) => ({ x, y, r: 20 }))
}

function shoot() {
  if (phase !== 'aim' || screen.value !== 'playing') return
  phase = 'animating'
  animStart = performance.now()
  sound.shoot()

  const inGoal = aimX > GL + 8 && aimX < GR - 8 && aimY > GT + 4 && aimY < GB - 4

  if (mode.value === 'penalty') {
    const shotZone = aimX < GL + GW / 3 ? 0 : aimX > GL + 2 * GW / 3 ? 2 : 1
    const diveZone = Math.random() < 0.65
      ? shotZone
      : ([0, 1, 2] as const).filter(z => z !== shotZone)[Math.floor(Math.random() * 2)]!
    const diveX = [GL + GW * 0.14, W / 2, GL + GW * 0.86][diveZone]!
    keeperTargetX = diveX
    const wasSaved = inGoal && diveZone === shotZone && Math.random() < 0.72

    setTimeout(() => {
      phase = 'feedback'
      if (!inGoal) { feedbackText = 'MISSED!'; feedbackColor = '#94a3b8'; sound.wrong() }
      else if (wasSaved) { feedbackText = 'SAVED!'; feedbackColor = '#ef4444'; sound.wrong() }
      else { feedbackText = 'GOAL!'; feedbackColor = '#34d399'; sound.correct(); scored.value++ }
      setTimeout(() => nextPenaltyKick(), 1100)
    }, 700)
  }

  if (mode.value === 'freekick') {
    const hitIdx = targets.findIndex(t => Math.hypot(aimX - t.x, aimY - t.y) < t.r + 6)
    const wallBlocked = aimX > W / 2 - 50 && aimX < W / 2 + 50 && aimY > GT + 40 && Math.random() < 0.5

    setTimeout(() => {
      phase = 'feedback'
      if (wallBlocked) {
        feedbackText = 'BLOCKED!'; feedbackColor = '#94a3b8'; sound.wrong()
      } else if (hitIdx >= 0) {
        feedbackText = '★ BULLSEYE!'; feedbackColor = '#fbbf24'; sound.celebrate()
        scored.value += 2
        targets.splice(hitIdx, 1)
        if (targets.length === 0) spawnTargets()
      } else if (inGoal) {
        feedbackText = 'GOAL!'; feedbackColor = '#34d399'; sound.correct(); scored.value++
      } else {
        feedbackText = 'MISSED!'; feedbackColor = '#94a3b8'; sound.wrong()
      }
      setTimeout(() => { phase = 'aim' }, 700)
    }, 700)
  }
}

function nextPenaltyKick() {
  kicksLeft.value--
  if (kicksLeft.value <= 0) { endGame(); return }
  aimX = W / 2; aimY = (GT + GB) / 2
  keeperTargetX = W / 2
  phase = 'aim'
}

function startShot() {
  playerZone = -1
  incomingZone = Math.floor(Math.random() * 6)
  phase = 'hint'

  setTimeout(() => {
    phase = 'animating'
    animStart = performance.now()
    setTimeout(() => {
      if (phase !== 'feedback') {
        phase = 'aim'
        shotTimeout = setTimeout(() => {
          if (phase === 'aim') goalkeeperDive(-1)
        }, 1500)
      }
    }, 900)
  }, 600)
}

function goalkeeperDive(zone: number) {
  if (shotTimeout) { clearTimeout(shotTimeout); shotTimeout = null }
  if (phase !== 'aim' && phase !== 'animating') return
  playerZone = zone
  phase = 'feedback'

  if (playerZone === incomingZone) {
    feedbackText = 'SAVED!'; feedbackColor = '#34d399'; sound.correct(); saved.value++
  } else {
    feedbackText = 'GOAL!'; feedbackColor = '#ef4444'; sound.wrong()
  }

  setTimeout(() => {
    shotsLeft.value--
    if (shotsLeft.value <= 0) { endGame(); return }
    startShot()
  }, 1100)
}

function endGame() {
  screen.value = 'result'
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null }
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null }
  if (shotTimeout) { clearTimeout(shotTimeout); shotTimeout = null }

  if (mode.value === 'penalty') {
    resultTitle.value = scored.value >= 4 ? '🏆 Excellent!' : scored.value >= 3 ? '👍 Not bad!' : '😔 Better luck next time'
    resultScore.value = `${scored.value} / 5 goals`
  } else if (mode.value === 'freekick') {
    resultTitle.value = scored.value >= 12 ? '🏆 Sniper!' : scored.value >= 6 ? '👍 Nice shooting!' : '😔 Keep practicing'
    resultScore.value = `${scored.value} points in 30s`
  } else {
    resultTitle.value = saved.value >= 8 ? '🏆 World Class!' : saved.value >= 5 ? '👍 Solid keeping!' : '😔 Keep training'
    resultScore.value = `${saved.value} / 10 saves`
  }

  scored.value >= (mode.value === 'penalty' ? 4 : mode.value === 'freekick' ? 12 : 99) || saved.value >= 8
    ? sound.win()
    : sound.gameOver()
}

function startMode(m: Mode) {
  if (animFrame) cancelAnimationFrame(animFrame)
  if (timerInterval) clearInterval(timerInterval)
  if (shotTimeout) clearTimeout(shotTimeout)

  mode.value = m
  screen.value = 'playing'
  scored.value = 0; saved.value = 0
  phase = 'aim'
  aimX = W / 2; aimY = (GT + GB) / 2
  keeperTargetX = W / 2
  feedbackText = ''

  if (m === 'penalty') {
    kicksLeft.value = 5
  } else if (m === 'freekick') {
    timeLeft.value = 30
    spawnTargets()
    timerInterval = setInterval(() => {
      timeLeft.value--
      if (timeLeft.value <= 0) endGame()
    }, 1000)
  } else {
    shotsLeft.value = 10
    startShot()
  }

  function loop() { draw(); animFrame = requestAnimationFrame(loop) }
  animFrame = requestAnimationFrame(loop)
}

// ─── Input ────────────────────────────────────────────────────────────────

function canvasCoords(clientX: number, clientY: number): [number, number] {
  const rect = canvas.value!.getBoundingClientRect()
  return [(clientX - rect.left) * (W / rect.width), (clientY - rect.top) * (H / rect.height)]
}

function updateAim(x: number, y: number) {
  if (phase !== 'aim' || mode.value === 'goalkeeper') return
  aimX = Math.max(GL + 8, Math.min(GR - 8, x))
  aimY = Math.max(GT + 4, Math.min(GB - 4, y))
}

function handleTap(x: number, y: number) {
  if (screen.value !== 'playing') return
  if (mode.value === 'goalkeeper') {
    if (phase !== 'aim' && phase !== 'animating') return
    if (x < GK_GL || x > GK_GR || y < GK_GT || y > GK_GB) return
    const zw = GK_GW / 3, zh = GK_GH / 2
    goalkeeperDive(Math.floor((y - GK_GT) / zh) * 3 + Math.floor((x - GK_GL) / zw))
  } else {
    updateAim(x, y)
    shoot()
  }
}

function onMouseMove(e: MouseEvent) {
  if (screen.value !== 'playing') return
  updateAim(...canvasCoords(e.clientX, e.clientY))
}
function onMouseDown(e: MouseEvent) { handleTap(...canvasCoords(e.clientX, e.clientY)) }
function onTouchMove(e: TouchEvent) {
  if (screen.value !== 'playing') return
  const t = e.touches[0]!
  updateAim(...canvasCoords(t.clientX, t.clientY))
}
function onTouchStart(e: TouchEvent) {
  const t = e.touches[0]!
  const [x, y] = canvasCoords(t.clientX, t.clientY)
  if (mode.value !== 'goalkeeper') updateAim(x, y)
  handleTap(x, y)
}

onMounted(() => draw())
onUnmounted(() => {
  if (animFrame) cancelAnimationFrame(animFrame)
  if (timerInterval) clearInterval(timerInterval)
  if (shotTimeout) clearTimeout(shotTimeout)
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 16px 40px;
  background: radial-gradient(ellipse at top, #0d2010 0%, #0f0f1a 70%);
}

.nav {
  width: 100%;
  max-width: 500px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.back {
  font-size: 0.9rem;
  color: #64748b;
  transition: color 0.15s;
}
.back:hover { color: #94a3b8; }

.score-display {
  font-size: 0.95rem;
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
  border: 2px solid #1e3a2a;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 0 40px rgba(52, 211, 153, 0.08);
}

.canvas {
  display: block;
  max-width: 100%;
  cursor: crosshair;
  touch-action: none;
}

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(8, 16, 10, 0.88);
  backdrop-filter: blur(5px);
}

.overlay-box {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  padding: 0 16px;
}

.over-title {
  font-size: 2rem;
  font-weight: 900;
  color: #f1f5f9;
}

.over-score {
  font-size: 1.3rem;
  font-weight: 700;
  color: #34d399;
}

.over-hint {
  font-size: 0.9rem;
  color: #64748b;
}

.mode-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 300px;
  margin-top: 4px;
}

.mode-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  background: #1e2e20;
  border: 1px solid #2d4430;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.15s;
  text-align: left;
  touch-action: manipulation;
}
.mode-btn:hover { background: #263828; border-color: #34d399; transform: translateY(-1px); }

.mode-icon { font-size: 1.6rem; line-height: 1; flex-shrink: 0; }

.mode-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: #f1f5f9;
  display: block;
}

.mode-desc {
  font-size: 0.78rem;
  color: #64748b;
  display: block;
  margin-top: 2px;
}

.btn-row {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.btn {
  padding: 12px 28px;
  background: #34d399;
  color: #0f0f1a;
  font-size: 1rem;
  font-weight: 700;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.15s;
  touch-action: manipulation;
}
.btn:hover { opacity: 0.9; transform: scale(1.03); }

.btn-sec {
  background: #1e2e20;
  color: #94a3b8;
  border: 1px solid #2d4430;
}
.btn-sec:hover { background: #263828; opacity: 1; }
</style>
