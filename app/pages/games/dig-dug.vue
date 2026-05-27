<template>
  <div class="page">
    <nav class="nav">
      <NuxtLink to="/games" class="back">← Back</NuxtLink>
      <div class="hud-row">
        <span class="lv-text">LV{{ level }}</span>
        <span class="score-text">{{ score }}</span>
        <span class="lives-text">
          <span v-for="i in 3" :key="i" class="heart" :class="{ dim: i > lives }">♥</span>
        </span>
        <button class="mute-btn" @click="sound.toggleMute()">{{ sound.muted.value ? '🔇' : '🔊' }}</button>
      </div>
    </nav>

    <div class="game-wrap">
      <canvas ref="canvas" :width="W" :height="H" class="canvas" />
    </div>

    <p class="hint">Arrow keys / WASD: move · Z or Space: pump</p>

    <div class="mobile-ctrl">
      <div class="dpad">
        <button class="ctrl-btn dpad-up"
          @touchstart.prevent="keys.up=true" @touchend.prevent="keys.up=false"
          @mousedown="keys.up=true" @mouseup="keys.up=false" @mouseleave="keys.up=false">▲</button>
        <button class="ctrl-btn dpad-left"
          @touchstart.prevent="keys.left=true" @touchend.prevent="keys.left=false"
          @mousedown="keys.left=true" @mouseup="keys.left=false" @mouseleave="keys.left=false">◀</button>
        <button class="ctrl-btn dpad-right"
          @touchstart.prevent="keys.right=true" @touchend.prevent="keys.right=false"
          @mousedown="keys.right=true" @mouseup="keys.right=false" @mouseleave="keys.right=false">▶</button>
        <button class="ctrl-btn dpad-down"
          @touchstart.prevent="keys.down=true" @touchend.prevent="keys.down=false"
          @mousedown="keys.down=true" @mouseup="keys.down=false" @mouseleave="keys.down=false">▼</button>
      </div>
      <button class="ctrl-btn pump-btn"
        @touchstart.prevent="keys.fire=true" @touchend.prevent="keys.fire=false"
        @mousedown="keys.fire=true" @mouseup="keys.fire=false" @mouseleave="keys.fire=false">PUMP</button>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ ssr: false })

// ── Constants ──────────────────────────────────────────────────────────────────
const W = 480
const H = 528
const CELL = 16
const COLS = W / CELL        // 30
const ROWS = H / CELL        // 33
const PUMP_MAX = CELL * 5
const PUMP_SPD = 220
const PLAYER_SPD = 64
const GRAV = 220
const MAX_LEVEL = 5

// ── Types ─────────────────────────────────────────────────────────────────────
type Dir = 'up' | 'down' | 'left' | 'right'
type Phase = 'idle' | 'playing' | 'gameover' | 'win'

interface Enemy {
  id: number; type: 'pooka' | 'fygar'
  x: number; y: number; tx: number; ty: number
  col: number; row: number; dir: Dir
  alive: boolean
  inflated: number       // 0-3; at 3 = pop
  inflateT: number       // accumulates while pumped
  deflateT: number       // accumulates while not pumped; deflates at 1.5s
  pumped: boolean        // set each frame by pump check
  ghosting: boolean      // can pass through dirt
  ghostTimer: number
  ghostCooldown: number
  fireTimer: number
  fireBeam: number       // fygar: cells of active fire (decrements over time)
  speed: number
  invincible: boolean    // brief window after entering stage
}

interface Boulder {
  col: number; row: number
  x: number; y: number
  vy: number; falling: boolean
}

interface Particle {
  x: number; y: number; vx: number; vy: number
  color: string; life: number
}

// ── Reactive state ─────────────────────────────────────────────────────────────
const canvas = ref<HTMLCanvasElement | null>(null)
const score = ref(0)
const lives = ref(3)
const level = ref(1)
const phase = ref<Phase>('idle')

const sound = useSound()
useMusic('dig-dug')

// ── Mutable game state ─────────────────────────────────────────────────────────
const keys = reactive({ up: false, down: false, left: false, right: false, fire: false })

let grid: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false))  // true = dirt

// player pixel and grid pos
let px = 0, py = 0, ptx = 0, pty = 0
let pcol = 0, prow = 0
let pdir: Dir = 'right'
let pmoving = false
let pdead = false, pdeadT = 0
let pinvT = 0               // invincibility after respawn
let ppump = false, ppumpLen = 0

let enemies: Enemy[] = []
let boulders: Boulder[] = []
let particles: Particle[] = []
let eid = 0, rafId = 0, lastTs = 0
let levelClearTimer = 0   // >0 while showing level-clear interstitial

const ALL_BANDS = [
  { dirt: '#a04e1c', tunnel: '#1c0900' },
  { dirt: '#7a2e0e', tunnel: '#130500' },
  { dirt: '#1a6030', tunnel: '#051408' },
  { dirt: '#145e5e', tunnel: '#041818' },
  { dirt: '#6e3a8a', tunnel: '#150a1c' },
  { dirt: '#1a3a8a', tunnel: '#050e1c' },
  { dirt: '#8a5a14', tunnel: '#1c1204' },
  { dirt: '#8a1a1a', tunnel: '#1c0505' },
  { dirt: '#1a5a8a', tunnel: '#05121c' },
  { dirt: '#5a8a14', tunnel: '#111c04' },
]
let bandColors: { dirt: string; tunnel: string }[] = ALL_BANDS.slice(0, 4)

function randomizeBands() {
  const shuffled = [...ALL_BANDS].sort(() => Math.random() - 0.5)
  bandColors = shuffled.slice(0, 4)
}

// ── Grid helpers ───────────────────────────────────────────────────────────────
const cx = (c: number) => c * CELL
const cy = (r: number) => r * CELL
const toCol = (x: number) => Math.round(x / CELL)
const toRow = (y: number) => Math.round(y / CELL)
const inBounds = (c: number, r: number) => c >= 0 && c < COLS && r >= 0 && r < ROWS
const isDirt = (c: number, r: number) => inBounds(c, r) && grid[r]![c]
const isOpen = (c: number, r: number) => inBounds(c, r) && !grid[r]![c]

function dd(d: Dir): [number, number] {
  if (d === 'up') return [0, -1]
  if (d === 'down') return [0, 1]
  if (d === 'left') return [-1, 0]
  return [1, 0]
}

// ── Initialisation ─────────────────────────────────────────────────────────────
function buildGrid() {
  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(true))
  // Top row always open (surface)
  for (let c = 0; c < COLS; c++) grid[0]![c] = false
}

function placeBoulders() {
  boulders = []
  const pos: [number, number][] = [
    [4,2],[10,2],[16,2],[22,2],[27,2],
    [2,6],[7,7],[13,6],[19,7],[25,6],[28,7],
    [5,11],[11,10],[16,11],[22,10],[27,11],
    [3,16],[9,15],[14,16],[20,15],[25,16],
    [6,21],[12,20],[18,21],[23,20],
    [8,26],[15,25],[22,26],
  ]
  for (const [c, r] of pos) {
    if (inBounds(c, r)) boulders.push({ col: c, row: r, x: cx(c), y: cy(r), vy: 0, falling: false })
  }
}

function spawnEnemies() {
  enemies = []
  const count = Math.min(3 + level.value, 8)
  const spd = 28 + level.value * 4
  for (let i = 0; i < count; i++) {
    const col = i % 2 === 0 ? 0 : COLS - 1
    const row = 2 + i * 4
    const type: 'pooka' | 'fygar' = i % 3 === 2 ? 'fygar' : 'pooka'
    if (inBounds(col, row)) grid[row]![col] = false
    enemies.push({
      id: eid++, type,
      x: cx(col), y: cy(row), tx: cx(col), ty: cy(row),
      col, row, dir: col === 0 ? 'right' : 'left',
      alive: true, inflated: 0, inflateT: 0, deflateT: 0, pumped: false,
      ghosting: false, ghostTimer: 4 + Math.random() * 6, ghostCooldown: 0,
      fireTimer: 3 + Math.random() * 4, fireBeam: 0,
      speed: spd * (0.8 + Math.random() * 0.4),
      invincible: true,
    })
  }
  // Release enemies from spawn immunity after 2s
  setTimeout(() => { for (const e of enemies) e.invincible = false }, 2000)
}

function resetPlayer() {
  pcol = Math.floor(COLS / 2); prow = 1
  px = cx(pcol); py = cy(prow)
  ptx = px; pty = py
  pdir = 'right'; pmoving = false
  pdead = false; pdeadT = 0; pinvT = 1.5
  ppump = false; ppumpLen = 0
  if (inBounds(pcol, prow)) grid[prow]![pcol] = false
}

function initGame() {
  score.value = 0; lives.value = 3; level.value = 1
  particles = []; eid = 0; levelClearTimer = 0
  randomizeBands()
  buildGrid(); placeBoulders(); spawnEnemies(); resetPlayer()
  phase.value = 'playing'
}

function startNextLevel() {
  level.value++
  particles = []; levelClearTimer = 0
  randomizeBands()
  buildGrid(); placeBoulders(); spawnEnemies(); resetPlayer()
  phase.value = 'playing'
}

// ── Particles ──────────────────────────────────────────────────────────────────
function burst(x: number, y: number, color: string, n = 8) {
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.4
    const s = 30 + Math.random() * 70
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, color, life: 0.9 })
  }
}

// ── Update ─────────────────────────────────────────────────────────────────────
function update(dt: number) {
  if (phase.value !== 'playing') return

  if (levelClearTimer > 0) {
    levelClearTimer -= dt
    if (levelClearTimer <= 0) startNextLevel()
    updateParticles(dt)
    return
  }

  updatePlayer(dt)
  updateEnemies(dt)
  updateBoulders(dt)
  updateParticles(dt)

  if (enemies.length > 0 && enemies.every(e => !e.alive)) {
    if (level.value >= MAX_LEVEL) { phase.value = 'win'; sound.win() }
    else { levelClearTimer = 2.0; sound.celebrate() }
  }
}

function updatePlayer(dt: number) {
  if (pinvT > 0) pinvT -= dt

  if (pdead) {
    pdeadT -= dt
    if (pdeadT <= 0) {
      if (lives.value > 0) resetPlayer()
      else { phase.value = 'gameover'; sound.gameOver() }
    }
    return
  }

  // Pump logic
  if (keys.fire && !pmoving) {
    ppump = true
    ppumpLen = Math.min(ppumpLen + PUMP_SPD * dt, PUMP_MAX)
    pumpHitCheck(dt)
  } else {
    if (ppump) {
      // Deflate pumped enemies when key released
      for (const e of enemies) e.pumped = false
    }
    ppump = false
    ppumpLen = Math.max(ppumpLen - PUMP_SPD * 2 * dt, 0)
  }

  // Movement blocked while actively pumping
  if (keys.fire && ppump) return

  if (!pmoving) {
    let d: Dir | null = null
    if (keys.up) d = 'up'
    else if (keys.down) d = 'down'
    else if (keys.left) d = 'left'
    else if (keys.right) d = 'right'

    if (d) {
      const [dc, dr] = dd(d)
      const nc = pcol + dc, nr = prow + dr
      if (inBounds(nc, nr)) {
        // Block if stationary boulder is in target cell
        const blocked = boulders.some(b => b.col === nc && b.row === nr && !b.falling)
        if (!blocked) {
          pdir = d; pmoving = true
          ptx = cx(nc); pty = cy(nr)
          if (grid[nr]![nc]) { grid[nr]![nc] = false; sound.eat() }
        }
      }
    }
  } else {
    const dx = ptx - px, dy = pty - py
    const dist = Math.sqrt(dx * dx + dy * dy)
    const step = PLAYER_SPD * dt
    if (dist <= step) {
      px = ptx; py = pty
      pcol = toCol(px); prow = toRow(py)
      pmoving = false
    } else {
      px += (dx / dist) * step
      py += (dy / dist) * step
    }
  }

  // Enemy collision
  if (pinvT <= 0) {
    for (const e of enemies) {
      if (!e.alive || e.inflated >= 2 || e.invincible) continue
      if (Math.abs(px - e.x) < CELL * 0.75 && Math.abs(py - e.y) < CELL * 0.75) {
        killPlayer(); return
      }
    }
  }
}

function pumpHitCheck(dt: number) {
  const [dc, dr] = dd(pdir)
  const bx = px + CELL / 2, by = py + CELL / 2

  for (const e of enemies) {
    if (!e.alive) continue
    const ex = e.x + CELL / 2, ey = e.y + CELL / 2

    let hit = false
    if (dc !== 0 && Math.abs(ey - by) < CELL * 0.8) {
      const step = (ex - bx) * dc
      if (step > 0 && step <= ppumpLen) {
        let ok = true
        for (let i = 1; i * CELL < step - 4; i++) {
          if (isDirt(pcol + dc * i, prow)) { ok = false; break }
        }
        if (ok) hit = true
      }
    } else if (dr !== 0 && Math.abs(ex - bx) < CELL * 0.8) {
      const step = (ey - by) * dr
      if (step > 0 && step <= ppumpLen) {
        let ok = true
        for (let i = 1; i * CELL < step - 4; i++) {
          if (isDirt(pcol, prow + dr * i)) { ok = false; break }
        }
        if (ok) hit = true
      }
    }

    if (hit) {
      e.pumped = true
      e.inflateT += dt
      e.deflateT = 0
      if (e.inflateT >= 0.55 && e.inflated < 3) {
        e.inflated++
        e.inflateT = 0
        sound.flip()
        if (e.inflated >= 3) popEnemy(e)
      }
    }
  }
}

function popEnemy(e: Enemy) {
  e.alive = false
  const base = e.type === 'fygar' ? 400 : 200
  const depth = Math.floor(e.row / 6) * (e.type === 'fygar' ? 200 : 100)
  score.value += base + depth
  sound.explode()
  burst(e.x + CELL / 2, e.y + CELL / 2, e.type === 'fygar' ? '#4ade80' : '#fb923c', 10)
}

function killPlayer() {
  if (pdead || pinvT > 0) return
  pdead = true; pdeadT = 1.8; ppump = false; ppumpLen = 0
  lives.value--
  sound.playerHit()
  burst(px + CELL / 2, py + CELL / 2, '#818cf8', 14)
}

function updateEnemies(dt: number) {
  for (const e of enemies) {
    if (!e.alive) continue

    // Deflate if not pumped this frame
    if (!e.pumped) {
      if (e.inflated > 0) {
        e.deflateT += dt
        if (e.deflateT >= 1.5) { e.inflated = Math.max(0, e.inflated - 1); e.deflateT = 0; e.inflateT = 0 }
      }
    } else {
      e.deflateT = 0
    }
    e.pumped = false  // reset for next frame

    if (e.inflated > 0) continue  // frozen while inflated

    // Ghost mode timing
    if (e.ghostCooldown > 0) e.ghostCooldown -= dt
    if (!e.ghosting) {
      e.ghostTimer -= dt
      if (e.ghostTimer <= 0 && e.ghostCooldown <= 0) { e.ghosting = true; e.ghostTimer = 1.2 + Math.random() * 2 }
    } else {
      e.ghostTimer -= dt
      if (e.ghostTimer <= 0) { e.ghosting = false; e.ghostCooldown = 6 + Math.random() * 6; e.ghostTimer = 5 + Math.random() * 7 }
    }

    // Fygar fire
    if (e.type === 'fygar') {
      if (e.fireBeam > 0) {
        e.fireBeam -= dt * 2
        if (!pdead && pinvT <= 0) {
          const fd = e.dir === 'right' ? 1 : -1
          for (let i = 1; i <= Math.ceil(e.fireBeam); i++) {
            if (e.col + fd * i === pcol && e.row === prow) { killPlayer(); break }
          }
        }
      } else {
        e.fireTimer -= dt
        const fd = e.dir === 'right' ? 1 : -1
        if (e.fireTimer <= 0 && isOpen(e.col + fd, e.row)) {
          e.fireBeam = 2.5; e.fireTimer = 4 + Math.random() * 3; sound.shoot()
        }
      }
    }

    // Movement
    const dx = e.tx - e.x, dy = e.ty - e.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const step = e.speed * dt
    if (dist <= step) {
      e.x = e.tx; e.y = e.ty
      e.col = toCol(e.x); e.row = toRow(e.y)
      enemyChooseDir(e)
    } else {
      e.x += (dx / dist) * step
      e.y += (dy / dist) * step
    }
  }
}

function enemyChooseDir(e: Enemy) {
  // Try to continue in current direction first (75% chance)
  const [dc, dr] = dd(e.dir)
  const nc = e.col + dc, nr = e.row + dr
  const canContinue = inBounds(nc, nr) && (isOpen(nc, nr) || e.ghosting)
  if (canContinue && Math.random() < 0.75) { enemyMove(e, e.dir); return }

  // Pick a direction biased toward player
  const dirs: Dir[] = ['up', 'down', 'left', 'right']
  dirs.sort(() => Math.random() - 0.5)
  const toward: Dir = pcol > e.col ? 'right' : pcol < e.col ? 'left' : prow > e.row ? 'down' : 'up'
  if (Math.random() < 0.45) dirs.unshift(toward)

  for (const d of dirs) {
    const [ddc, ddr] = dd(d)
    const nnc = e.col + ddc, nnr = e.row + ddr
    if (inBounds(nnc, nnr) && (isOpen(nnc, nnr) || e.ghosting)) {
      enemyMove(e, d); return
    }
  }
  // Completely stuck: ghost through dirt forcibly
  for (const d of dirs) {
    const [ddc, ddr] = dd(d)
    const nnc = e.col + ddc, nnr = e.row + ddr
    if (inBounds(nnc, nnr)) {
      if (isDirt(nnc, nnr)) grid[nnr]![nnc] = false
      enemyMove(e, d); return
    }
  }
}

function enemyMove(e: Enemy, d: Dir) {
  const [dc, dr] = dd(d)
  const nc = e.col + dc, nr = e.row + dr
  if (!inBounds(nc, nr)) return
  if (isDirt(nc, nr) && !e.ghosting) return
  if (isDirt(nc, nr) && e.ghosting) grid[nr]![nc] = false
  e.dir = d; e.tx = cx(nc); e.ty = cy(nr)
}

function updateBoulders(dt: number) {
  for (const b of boulders) {
    if (!b.falling) {
      const br = b.row + 1
      const belowClear = inBounds(b.col, br) && isOpen(b.col, br)
        && !boulders.some(o => o !== b && o.col === b.col && o.row === br && !o.falling)
      if (belowClear) { b.falling = true; b.vy = 40 }
    }

    if (b.falling) {
      b.vy = Math.min(b.vy + GRAV * dt, 300)
      b.y += b.vy * dt

      const curRow = Math.round(b.y / CELL)
      const nextRow = curRow + 1
      const shouldLand = !inBounds(b.col, nextRow)
        || isDirt(b.col, nextRow)
        || boulders.some(o => o !== b && o.col === b.col && o.row === nextRow && !o.falling)

      if (shouldLand && b.y >= cy(curRow) - 2) {
        b.row = curRow; b.y = cy(b.row); b.falling = false; b.vy = 0
        crushAt(b.col, b.row)
      }
    }
  }
}

function crushAt(col: number, row: number) {
  let n = 0
  for (const e of enemies) {
    if (e.alive && e.col === col && e.row === row) {
      e.alive = false; n++
      sound.explode()
      burst(cx(col) + CELL / 2, cy(row) + CELL / 2, '#fbbf24', 10)
    }
  }
  if (n > 0) score.value += n === 1 ? 1000 : n === 2 ? 2500 : 4000
  if (!pdead && pinvT <= 0 && pcol === col && prow === row) killPlayer()
}

function updateParticles(dt: number) {
  for (const p of particles) {
    p.x += p.vx * dt; p.y += p.vy * dt
    p.vy += 80 * dt; p.life -= dt
  }
  particles = particles.filter(p => p.life > 0)
}

// ── Draw ───────────────────────────────────────────────────────────────────────
function draw() {
  const c = canvas.value?.getContext('2d')
  if (!c) return

  // Band colors: 4 wide horizontal zones like original Dig Dug
  const bandOf = (r: number) => Math.min(Math.floor(r / (ROWS / 4)), 3)

  // Background per band (shown in tunnels)
  for (let b = 0; b < 4; b++) {
    const y0 = Math.round(b * H / 4)
    const y1 = Math.round((b + 1) * H / 4)
    c.fillStyle = bandColors[b]!.tunnel
    c.fillRect(0, y0, W, y1 - y0)
  }

  // Dirt
  for (let r = 0; r < ROWS; r++) {
    const band = bandOf(r)
    for (let col = 0; col < COLS; col++) {
      if (!grid[r]![col]) continue
      const x = cx(col), y = cy(r)
      c.fillStyle = bandColors[band]!.dirt
      c.fillRect(x, y, CELL, CELL)
      c.fillStyle = 'rgba(0,0,0,0.22)'
      c.fillRect(x + 3, y + 3, 2, 2)
      c.fillRect(x + 10, y + 9, 2, 2)
      c.fillRect(x + 5, y + 12, 2, 2)
      c.fillRect(x + 12, y + 5, 1, 1)
    }
  }

  // Boulders
  for (const b of boulders) {
    const bx = Math.round(b.x), by = Math.round(b.y)
    c.fillStyle = '#94a3b8'
    c.beginPath(); c.arc(bx + CELL / 2, by + CELL / 2, CELL / 2 - 1, 0, Math.PI * 2); c.fill()
    c.fillStyle = '#cbd5e1'
    c.beginPath(); c.arc(bx + CELL / 2 - 2, by + CELL / 2 - 3, 3, 0, Math.PI * 2); c.fill()
    c.fillStyle = '#475569'
    c.beginPath(); c.arc(bx + CELL / 2 + 2, by + CELL / 2 + 2, 2, 0, Math.PI * 2); c.fill()
  }

  // Particles
  c.save()
  for (const p of particles) {
    c.globalAlpha = Math.max(0, p.life / 0.9)
    c.fillStyle = p.color
    c.fillRect(p.x - 2, p.y - 2, 4, 4)
  }
  c.restore()

  // Pump beam
  if (ppump && ppumpLen > 2 && !pdead) {
    const [dc, dr] = dd(pdir)
    const bx2 = px + CELL / 2, by2 = py + CELL / 2
    c.strokeStyle = '#fbbf24'
    c.lineWidth = 3
    c.lineCap = 'round'
    c.beginPath(); c.moveTo(bx2, by2)
    c.lineTo(bx2 + dc * ppumpLen, by2 + dr * ppumpLen)
    c.stroke()
    c.fillStyle = '#fbbf24'
    c.beginPath(); c.arc(bx2 + dc * ppumpLen, by2 + dr * ppumpLen, 3, 0, Math.PI * 2); c.fill()
  }

  // Enemies
  for (const e of enemies) {
    if (!e.alive) continue
    drawEnemy(c, e)
  }

  // Player
  if (!pdead || (Math.floor(pdeadT * 10) % 2 === 0 && pdeadT > 0.4)) {
    drawPlayer(c)
  }

  // Overlays
  if (levelClearTimer > 0) {
    drawOverlay(c, 'LEVEL CLEAR!', [`Score: ${score.value}`, `Next: Level ${level.value + 1}`], '#fbbf24')
  } else if (phase.value === 'idle') {
    drawOverlay(c, 'DIG DUG', ['Arrow keys or WASD to dig', 'Hold Z or Space to inflate enemies', 'Drop boulders to crush them!'], '#f97316')
  } else if (phase.value === 'gameover') {
    drawOverlay(c, 'GAME OVER', [`Score: ${score.value}`], '#ef4444')
  } else if (phase.value === 'win') {
    drawOverlay(c, 'YOU WIN!', [`Score: ${score.value}`, 'All levels cleared!'], '#22c55e')
  }
}

function drawPlayer(c: CanvasRenderingContext2D) {
  const x = Math.round(px), y = Math.round(py)
  const flip = pdir === 'left' ? -1 : 1
  const foot = pmoving ? (Math.floor(Date.now() / 100) % 2) : 0

  c.save()
  c.translate(x + CELL / 2, y + CELL / 2)
  c.scale(flip, 1)

  // Body
  c.fillStyle = '#818cf8'
  c.fillRect(-6, -4, 12, 9)
  // Head
  c.fillStyle = '#fde68a'
  c.fillRect(-4, -9, 8, 7)
  // Goggles
  c.fillStyle = '#312e81'
  c.fillRect(-3, -7, 3, 3)
  c.fillRect(1, -7, 3, 3)
  c.fillStyle = '#a5f3fc'
  c.fillRect(-2, -6, 2, 2)
  c.fillRect(2, -6, 2, 2)
  // Legs
  c.fillStyle = '#6366f1'
  c.fillRect(-5, 5, 4, foot ? 5 : 3)
  c.fillRect(1, 5, 4, foot ? 3 : 5)

  c.restore()
}

function drawEnemy(c: CanvasRenderingContext2D, e: Enemy) {
  const x = Math.round(e.x), y = Math.round(e.y)
  const sc = 1 + e.inflated * 0.18
  c.save()
  c.globalAlpha = e.ghosting ? 0.45 : 1
  c.translate(x + CELL / 2, y + CELL / 2)
  c.scale(sc, sc)

  if (e.type === 'pooka') {
    // Round red body
    c.fillStyle = '#ef4444'
    c.beginPath(); c.arc(0, 0, 7, 0, Math.PI * 2); c.fill()
    // Goggles (always face direction of travel)
    const gf = e.dir === 'left' ? -1 : 1
    c.fillStyle = '#fbbf24'
    c.fillRect(gf > 0 ? -6 : -1, -3, 4, 4)
    c.fillRect(gf > 0 ? 1 : -5, -3, 4, 4)
    c.fillStyle = '#1c1917'
    c.fillRect(gf > 0 ? -5 : 0, -2, 2, 2)
    c.fillRect(gf > 0 ? 2 : -4, -2, 2, 2)
    // Feet
    c.fillStyle = '#b91c1c'
    c.fillRect(-5, 5, 3, 4)
    c.fillRect(2, 5, 3, 4)
  } else {
    // Fygar dragon body
    c.fillStyle = '#16a34a'
    c.fillRect(-7, -4, 14, 9)
    // Head
    const hf = e.dir === 'left' ? -1 : 1
    c.fillStyle = '#15803d'
    c.fillRect(hf > 0 ? 4 : -9, -3, 6, 7)
    // Spikes on head
    c.fillStyle = '#4ade80'
    c.fillRect(hf > 0 ? 7 : -10, -6, 3, 4)
    c.fillRect(hf > 0 ? 9 : -12, -4, 3, 3)
    // Eye
    c.fillStyle = '#fbbf24'
    c.fillRect(hf > 0 ? 5 : -7, -2, 2, 2)
    // Wings
    c.fillStyle = '#22c55e'
    c.fillRect(-5, -8, 4, 5)
    c.fillRect(1, -8, 4, 5)
    // Fire breath
    if (e.fireBeam > 0) {
      const fd = e.dir === 'right' ? 1 : -1
      const fl = e.fireBeam * CELL
      c.globalAlpha = 0.85
      c.fillStyle = '#fbbf24'
      c.fillRect(fd > 0 ? 10 : -10 - fl, -3, fl, 6)
      c.fillStyle = '#f97316'
      c.fillRect(fd > 0 ? 10 : -10 - fl * 0.6, -2, fl * 0.6, 4)
    }
  }
  c.restore()
}

function drawOverlay(c: CanvasRenderingContext2D, title: string, lines: string[], color: string) {
  c.fillStyle = 'rgba(0,0,0,0.78)'
  c.fillRect(0, 0, W, H)
  c.textAlign = 'center'
  c.fillStyle = color
  c.font = 'bold 38px monospace'
  c.fillText(title, W / 2, H / 2 - 50)
  c.fillStyle = '#e2e8f0'
  c.font = '13px monospace'
  for (let i = 0; i < lines.length; i++) c.fillText(lines[i]!, W / 2, H / 2 - 10 + i * 22)
  c.fillStyle = '#64748b'
  c.font = '13px monospace'
  c.fillText('Press Space to start', W / 2, H / 2 + lines.length * 22 + 20)
  c.textAlign = 'left'
}

// ── Main loop ─────────────────────────────────────────────────────────────────
function loop(ts: number) {
  const dt = Math.min((ts - lastTs) / 1000, 0.05)
  lastTs = ts
  try { update(dt); draw() } catch (e) { console.error('dig-dug loop:', e) }
  rafId = requestAnimationFrame(loop)
}

function onKeydown(e: KeyboardEvent) {
  const k = e.key
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(k)) e.preventDefault()
  if (k === 'ArrowUp' || k === 'w' || k === 'W') keys.up = true
  if (k === 'ArrowDown' || k === 's' || k === 'S') keys.down = true
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = true
  if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = true
  if (k === ' ' || k === 'z' || k === 'Z') {
    if (phase.value !== 'playing') { initGame(); return }
    keys.fire = true
  }
}

function onKeyup(e: KeyboardEvent) {
  const k = e.key
  if (k === 'ArrowUp' || k === 'w' || k === 'W') keys.up = false
  if (k === 'ArrowDown' || k === 's' || k === 'S') keys.down = false
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = false
  if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = false
  if (k === ' ' || k === 'z' || k === 'Z') keys.fire = false
}

onMounted(() => {
  lastTs = performance.now()
  draw()
  rafId = requestAnimationFrame(loop)
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
  background: radial-gradient(ellipse at top, #1c0a00 0%, #0f0f1a 70%);
}

.nav {
  width: 100%;
  max-width: 500px;
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

.hud-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.lv-text {
  font-size: 0.85rem;
  font-weight: 700;
  color: #64748b;
  letter-spacing: 0.05em;
}

.score-text {
  font-size: 1.2rem;
  font-weight: 800;
  color: #fbbf24;
  min-width: 56px;
  text-align: right;
}

.lives-text { display: flex; gap: 2px; }
.heart { font-size: 1.1rem; color: #f43f5e; }
.heart.dim { color: #3a1a0a; }

.mute-btn {
  background: none; border: none; font-size: 1.1rem;
  cursor: pointer; padding: 2px 4px;
  opacity: 0.5; transition: opacity 0.15s; line-height: 1;
}
.mute-btn:hover { opacity: 1; }

.game-wrap {
  position: relative;
  border: 2px solid #7c2d12;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 0 40px rgba(249, 115, 22, 0.12);
}

.canvas {
  display: block;
  width: 100%;
  max-width: 480px;
  height: auto;
}

.hint {
  margin-top: 14px;
  font-size: 0.8rem;
  color: #4a5568;
}

.mobile-ctrl {
  margin-top: 24px;
  display: flex;
  align-items: center;
  gap: 28px;
}

.dpad {
  display: grid;
  grid-template-columns: 52px 52px 52px;
  grid-template-rows: 52px 52px;
  gap: 4px;
}

.dpad-up    { grid-column: 2; grid-row: 1; }
.dpad-left  { grid-column: 1; grid-row: 2; }
.dpad-right { grid-column: 3; grid-row: 2; }
.dpad-down  { grid-column: 2; grid-row: 2; }

.ctrl-btn {
  width: 52px; height: 52px;
  background: #1e1e2e;
  border: 1px solid #2d2d44;
  border-radius: 10px;
  color: #e2e8f0;
  font-size: 1.1rem;
  cursor: pointer;
  transition: background 0.1s;
  touch-action: manipulation;
  user-select: none;
  display: flex; align-items: center; justify-content: center;
}
.ctrl-btn:hover { background: #2d2d44; }
.ctrl-btn:active { background: #3d3d5c; }

.pump-btn {
  width: 72px; height: 72px;
  border-color: #f97316;
  color: #f97316;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  border-radius: 50%;
}
</style>
