<template>
  <div class="page">
    <nav>
      <NuxtLink to="/" class="back">← Games</NuxtLink>
      <button class="mute-btn" @click="toggleMute">{{ muted ? '🔇' : '🔊' }}</button>
    </nav>
    <canvas ref="canvas" :width="W" :height="H" class="game-canvas" />
    <div class="mobile-controls">
      <div class="ud-pad">
        <button class="ctrl-btn" @touchstart.prevent="keys.up=true" @touchend.prevent="keys.up=false">▲</button>
        <button class="ctrl-btn" @touchstart.prevent="keys.down=true" @touchend.prevent="keys.down=false">▼</button>
      </div>
      <div class="action-btns">
        <button class="ctrl-btn fire-btn" @touchstart.prevent="keys.fire=true" @touchend.prevent="keys.fire=false">FIRE</button>
        <button class="ctrl-btn bomb-btn" @touchstart.prevent="keys.bomb=true" @touchend.prevent="keys.bomb=false">BOMB</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ ssr: false })
import { ref, onMounted, onUnmounted } from 'vue'
import { useSound } from '~/composables/useSound'
import { useMusic } from '~/composables/useMusic'

const { muted, toggleMute } = useMusic('scramble')
const sound = useSound()
const canvas = ref<HTMLCanvasElement | null>(null)

// ── Canvas size ────────────────────────────────────────────────────────────────
const W = 460, H = 300

// ── Constants ──────────────────────────────────────────────────────────────────
const PLAYER_X   = 88
const SHIP_W     = 28, SHIP_H = 13
const SCROLL_BASE= 72
const SEG_W      = 52
const LASER_SPD  = 355
const BOMB_GRAV  = 265
const FUEL_MAX   = 100
const FUEL_DRAIN = 6.5
const FIRE_CD    = 0.20
const BOMB_CD    = 0.38
const ZONE_LEN   = 2000
const NUM_ZONES  = 5

// Terrain envelope per zone: [groundLo, groundHi, ceilLo, ceilHi]
// groundY = top-of-ground y (larger → more ground at bottom)
// ceilY   = bottom-of-ceiling y (smaller → more ceiling at top)
const ZT = [
  { gLo: H-92, gHi: H-54, cLo: 20, cHi: 40 },
  { gLo: H-96, gHi: H-58, cLo: 24, cHi: 45 },
  { gLo: H-96, gHi: H-60, cLo: 26, cHi: 48 },
  { gLo: H-102,gHi: H-64, cLo: 30, cHi: 56 },
  { gLo: H-92, gHi: H-54, cLo: 22, cHi: 42 },
]

// ── Types ──────────────────────────────────────────────────────────────────────
type GState = 'start' | 'playing' | 'gameover' | 'win'
interface Pt      { x: number; y: number }
interface Laser   { x: number; y: number }
interface Bomb    { x: number; y: number; vy: number }
interface GObj    { x: number; gy: number; type: 'launcher'|'fuel'|'base'; alive: boolean; cd: number }
interface ERocket { x: number; y: number; vy: number; alive: boolean }
interface UFO     { x: number; y: number; alive: boolean; hp: number; fcd: number }
interface EBullet { x: number; y: number; vx: number; vy: number; alive: boolean }
interface Fball   { x: number; y: number; baseY: number; t: number; alive: boolean }
interface Ptcl    { x: number; y: number; vx: number; vy: number; life: number; ml: number; col: string; r: number }

// ── Reactive UI state ──────────────────────────────────────────────────────────
const gstate  = ref<GState>('start')
const score   = ref(0)
const hiscore = ref(0)
const lives   = ref(3)
const fuel    = ref(FUEL_MAX)
const zoneN   = ref(1)

// ── Mutable game vars ──────────────────────────────────────────────────────────
let pY = H / 2, pVY = 0
let scrollX = 0, scrollSpd = SCROLL_BASE
let hitTimer = 0, fireCd = 0, bombCd = 0
let segsSinceObj = 0
let baseSpawned = false

let groundPts: Pt[]      = []
let ceilPts:   Pt[]      = []
let gobjs:     GObj[]    = []
let lasers:    Laser[]   = []
let bombs:     Bomb[]    = []
let eRockets:  ERocket[] = []
let ufos:      UFO[]     = []
let eBullets:  EBullet[] = []
let fballs:    Fball[]   = []
let ptcls:     Ptcl[]    = []

const keys = { up: false, down: false, fire: false, bomb: false }
let animId = 0, lastTs = 0

// ── Helpers ────────────────────────────────────────────────────────────────────
function lerpY(pts: Pt[], x: number): number {
  for (let i = 0; i < pts.length - 1; i++) {
    if (x >= pts[i].x && x <= pts[i + 1].x) {
      const t = (x - pts[i].x) / (pts[i + 1].x - pts[i].x)
      return pts[i].y + t * (pts[i + 1].y - pts[i].y)
    }
  }
  return pts.length ? pts[pts.length - 1].y : H / 2
}

function zoneIdx() { return Math.min(Math.floor(scrollX / ZONE_LEN), NUM_ZONES - 1) }

function burst(x: number, y: number, col: string, n = 12) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const s = 35 + Math.random() * 115
    ptcls.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s, life: 0.5+Math.random()*0.5, ml: 1, col, r: 2+Math.random()*4 })
  }
}

function addTerrainSeg() {
  const zi = zoneIdx()
  const zt = ZT[zi]
  const lastG = groundPts[groundPts.length - 1]
  const lastC = ceilPts[ceilPts.length - 1]
  const nx = lastG.x + SEG_W

  const tgY = zt.gLo + Math.random() * (zt.gHi - zt.gLo)
  const tcY = zt.cLo + Math.random() * (zt.cHi - zt.cLo)
  let ngY = lastG.y * 0.68 + tgY * 0.32
  let ncY = lastC.y * 0.68 + tcY * 0.32

  const minGap = 78
  if (ngY - ncY < minGap) ngY = ncY + minGap

  groundPts.push({ x: nx, y: ngY })
  ceilPts.push({   x: nx, y: ncY })

  // Ground object spawning
  segsSinceObj++
  const isBaseZone = zi === NUM_ZONES - 1 && scrollX > ZONE_LEN * 4.55
  if (isBaseZone && !baseSpawned) {
    gobjs.push({ x: nx, gy: ngY, type: 'base', alive: true, cd: 0 })
    baseSpawned = true
    segsSinceObj = 0
  } else if (!isBaseZone && segsSinceObj >= 4 + Math.floor(Math.random() * 4)) {
    const type: GObj['type'] = Math.random() < 0.38 ? 'fuel' : 'launcher'
    gobjs.push({ x: nx, gy: ngY, type, alive: true, cd: 0 })
    segsSinceObj = 0
  }
}

function initTerrain() {
  groundPts = []; ceilPts = []
  let gy = H - 72, cy = 32
  for (let x = 0; x <= W + SEG_W * 4; x += SEG_W) {
    groundPts.push({ x, y: gy + (Math.random() - 0.5) * 16 })
    ceilPts.push({   x, y: cy + (Math.random() - 0.5) * 8  })
    gy = groundPts[groundPts.length-1].y
    cy = ceilPts[ceilPts.length-1].y
  }
  segsSinceObj = 0
  baseSpawned  = false
}

function initGame() {
  pY = H/2; pVY = 0
  scrollX = 0; scrollSpd = SCROLL_BASE
  hitTimer = 0; fireCd = 0; bombCd = 0
  lasers=[]; bombs=[]; eRockets=[]; ufos=[]; eBullets=[]; fballs=[]; ptcls=[]; gobjs=[]
  score.value=0; lives.value=3; fuel.value=FUEL_MAX; zoneN.value=1
  initTerrain()
  gstate.value = 'playing'
}

function killPlayer() {
  burst(PLAYER_X, pY, '#7ec8e3', 20)
  sound.playerHit()
  lives.value--
  if (lives.value <= 0) {
    if (score.value > hiscore.value) hiscore.value = score.value
    gstate.value = 'gameover'
    sound.gameOver()
  } else {
    hitTimer = 2.5
    fuel.value = Math.max(28, fuel.value)
  }
}

function hitGobj(o: GObj) {
  if (!o.alive) return
  o.alive = false
  if (o.type === 'fuel') {
    fuel.value = Math.min(FUEL_MAX, fuel.value + 32)
    score.value += 80
    burst(o.x, o.gy, '#ff9900', 14)
    sound.eat()
  } else if (o.type === 'launcher') {
    score.value += 150
    burst(o.x, o.gy, '#ff5533', 14)
    sound.explode()
  } else if (o.type === 'base') {
    score.value += 1000
    if (score.value > hiscore.value) hiscore.value = score.value
    burst(o.x, o.gy - 20, '#ffff44', 32)
    burst(o.x - 20, o.gy - 10, '#ff8800', 20)
    burst(o.x + 20, o.gy - 10, '#ff4444', 20)
    gstate.value = 'win'
    sound.win()
  }
}

// ── Update ─────────────────────────────────────────────────────────────────────
function update(dt: number) {
  if (gstate.value !== 'playing') return

  const zi = zoneIdx()
  zoneN.value  = zi + 1
  scrollSpd = SCROLL_BASE + zi * 12
  const sdx = scrollSpd * dt
  scrollX += sdx

  // Player vertical movement
  if (keys.up)   pVY -= 320 * dt
  if (keys.down) pVY += 320 * dt
  pVY *= (1 - 7 * dt)
  pY  += pVY * dt

  // Scroll terrain and objects
  for (const p of groundPts) p.x -= sdx
  for (const p of ceilPts)   p.x -= sdx
  for (const o of gobjs)     o.x -= sdx

  // Prune off-screen terrain (keep pts[0].x <= 0)
  while (groundPts.length > 1 && groundPts[1].x < 0) { groundPts.shift(); ceilPts.shift() }

  // Extend terrain ahead
  while (groundPts[groundPts.length - 1].x < W + SEG_W * 2) addTerrainSeg()

  // Prune off-screen objects
  gobjs = gobjs.filter(o => o.x > -70)

  // Terrain collision
  const gndY = lerpY(groundPts, PLAYER_X)
  const celY = lerpY(ceilPts,   PLAYER_X)
  if (hitTimer <= 0 && (pY - SHIP_H/2 < celY + 2 || pY + SHIP_H/2 > gndY - 2)) {
    killPlayer(); return
  }
  pY = Math.max(celY + SHIP_H/2 + 3, Math.min(gndY - SHIP_H/2 - 3, pY))

  if (hitTimer > 0) hitTimer -= dt

  // Fuel drain
  fuel.value = Math.max(0, fuel.value - FUEL_DRAIN * dt)
  if (fuel.value <= 0 && hitTimer <= 0) { killPlayer(); return }

  // Weapons: laser
  fireCd -= dt
  if (keys.fire && fireCd <= 0) {
    lasers.push({ x: PLAYER_X + SHIP_W / 2, y: pY })
    sound.shoot()
    fireCd = FIRE_CD
  }

  // Weapons: bomb
  bombCd -= dt
  if (keys.bomb && bombCd <= 0) {
    bombs.push({ x: PLAYER_X, y: pY + SHIP_H / 2 + 2, vy: 30 })
    sound.shoot()
    bombCd = BOMB_CD
  }

  // Move lasers
  for (const l of lasers) l.x += LASER_SPD * dt
  lasers = lasers.filter(l => l.x < W + 10)

  // Move bombs + ground collision
  for (const b of bombs) {
    b.x += scrollSpd * dt * 0.35
    b.vy += BOMB_GRAV * dt
    b.y  += b.vy * dt
  }
  bombs = bombs.filter(b => {
    if (b.x > W + 10 || b.y > H + 10) return false
    const by = lerpY(groundPts, b.x)
    if (b.y >= by - 4) {
      burst(b.x, by, '#ff8844', 8)
      for (const o of gobjs) if (o.alive && Math.abs(b.x - o.x) < 30) hitGobj(o)
      return false
    }
    return true
  })

  // Laser vs ground objects
  for (const l of lasers) {
    for (const o of gobjs) {
      if (o.alive && Math.abs(l.x - o.x) < 24 && Math.abs(l.y - o.gy) < 32) {
        l.x = W + 100; hitGobj(o)
      }
    }
  }

  // Ground object AI: launchers fire rockets
  for (const o of gobjs) {
    if (!o.alive || o.type !== 'launcher') continue
    o.cd -= dt
    if (o.cd <= 0 && o.x > 0 && o.x < W) {
      const dx = PLAYER_X - o.x
      if (dx > -40 && dx < 230) {
        eRockets.push({ x: o.x, y: o.gy - 18, vy: -145, alive: true })
        o.cd = 2.5 + Math.random() * 2
      } else { o.cd = 0.5 }
    }
  }

  // Spawn UFOs (zone 1+)
  const farGndY = lerpY(groundPts, W + 10)
  const farCelY = lerpY(ceilPts,   W + 10)
  if (zi >= 1 && Math.random() < (0.30 + zi * 0.07) * dt) {
    ufos.push({
      x: W + 22,
      y: farCelY + 22 + Math.random() * Math.max(0, farGndY - farCelY - 44),
      alive: true, hp: 2, fcd: 1.5 + Math.random() * 2,
    })
  }

  // Spawn fireballs (zone 2+)
  if (zi >= 2 && Math.random() < (0.22 + zi * 0.05) * dt) {
    const fy = farCelY + 22 + Math.random() * Math.max(0, farGndY - farCelY - 44)
    fballs.push({ x: W + 22, y: fy, baseY: fy, t: 0, alive: true })
  }

  // Update enemy rockets
  for (const r of eRockets) {
    r.x -= sdx; r.y += r.vy * dt
    if (r.y < -20 || r.x < -10) { r.alive = false; continue }
    for (const l of lasers) {
      if (Math.abs(l.x-r.x) < 10 && Math.abs(l.y-r.y) < 10) {
        r.alive=false; l.x=W+100; score.value+=80; burst(r.x, r.y, '#ffcc00'); sound.explode()
      }
    }
    if (hitTimer<=0 && Math.abs(r.x-PLAYER_X)<14 && Math.abs(r.y-pY)<11) {
      r.alive=false; killPlayer(); return
    }
  }
  eRockets = eRockets.filter(r => r.alive)

  // Update UFOs
  for (const u of ufos) {
    u.x -= (52 + zi * 9) * dt
    u.fcd -= dt
    if (u.fcd <= 0 && u.x > 0 && u.x < W) {
      const dx = PLAYER_X - u.x, dy = pY - u.y
      const d  = Math.hypot(dx, dy)
      eBullets.push({ x: u.x, y: u.y, vx: dx/d*128, vy: dy/d*128, alive: true })
      u.fcd = 2 + Math.random() * 1.5
    }
    if (u.x < -32) { u.alive = false; continue }
    for (const l of lasers) {
      if (Math.abs(l.x-u.x)<17 && Math.abs(l.y-u.y)<10) {
        l.x=W+100; u.hp--; burst(u.x, u.y, '#88aaff', 7)
        if (u.hp<=0) { u.alive=false; score.value+=100; sound.explode() }
      }
    }
    if (hitTimer<=0 && Math.abs(u.x-PLAYER_X)<18 && Math.abs(u.y-pY)<11) {
      u.alive=false; killPlayer(); return
    }
  }
  ufos = ufos.filter(u => u.alive)

  // Update enemy bullets
  for (const b of eBullets) {
    b.x += b.vx*dt; b.y += b.vy*dt
    if (b.x<-10||b.x>W+10||b.y<-10||b.y>H+10) { b.alive=false; continue }
    if (hitTimer<=0 && Math.abs(b.x-PLAYER_X)<11 && Math.abs(b.y-pY)<9) {
      b.alive=false; killPlayer(); return
    }
  }
  eBullets = eBullets.filter(b => b.alive)

  // Update fireballs
  for (const f of fballs) {
    f.t += dt; f.x -= 65 * dt
    f.y = f.baseY + Math.sin(f.t * 2.8) * 38
    if (f.x < -22) { f.alive=false; continue }
    for (const l of lasers) {
      if (Math.abs(l.x-f.x)<13 && Math.abs(l.y-f.y)<13) {
        f.alive=false; l.x=W+100; score.value+=150; burst(f.x, f.y, '#ff6600'); sound.explode()
      }
    }
    if (hitTimer<=0 && Math.abs(f.x-PLAYER_X)<13 && Math.abs(f.y-pY)<12) {
      f.alive=false; killPlayer(); return
    }
  }
  fballs = fballs.filter(f => f.alive)

  // Update particles
  for (const p of ptcls) {
    p.x += p.vx*dt; p.y += p.vy*dt
    p.vy += 55*dt; p.vx *= 1 - 2*dt; p.life -= dt
  }
  ptcls = ptcls.filter(p => p.life > 0)
}

// ── Draw ───────────────────────────────────────────────────────────────────────
function draw(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#050510'
  ctx.fillRect(0, 0, W, H)

  // Parallax stars
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  for (let i = 0; i < 55; i++) {
    const sx = ((i * 139.3 + scrollX * 0.12) % (W + 1) + W + 1) % (W + 1)
    const sy = (i * 79.1) % (H * 0.65)
    ctx.fillRect(sx | 0, sy | 0, 1, 1)
  }

  // Terrain drawing helper
  function drawTerrain(pts: Pt[], fromTop: boolean) {
    if (pts.length < 2) return
    ctx.fillStyle = '#1b2e1b'
    ctx.beginPath()
    if (fromTop) {
      ctx.moveTo(pts[0].x, 0)
      for (const p of pts) ctx.lineTo(p.x, p.y)
      ctx.lineTo(pts[pts.length-1].x, 0)
    } else {
      ctx.moveTo(pts[0].x, H)
      for (const p of pts) ctx.lineTo(p.x, p.y)
      ctx.lineTo(pts[pts.length-1].x, H)
    }
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#3a6e3a'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i < pts.length; i++) {
      i === 0 ? ctx.moveTo(pts[i].x, pts[i].y) : ctx.lineTo(pts[i].x, pts[i].y)
    }
    ctx.stroke()
  }
  drawTerrain(ceilPts, true)
  drawTerrain(groundPts, false)

  // Ground objects
  ctx.save()
  for (const o of gobjs) {
    if (!o.alive) continue
    if (o.type === 'launcher') {
      ctx.fillStyle = '#808080'
      ctx.fillRect(o.x-6, o.gy-26, 12, 26)
      ctx.fillStyle = '#b4b4b4'
      ctx.beginPath(); ctx.moveTo(o.x-5, o.gy-26); ctx.lineTo(o.x+5, o.gy-26); ctx.lineTo(o.x, o.gy-38); ctx.fill()
      ctx.fillStyle = '#444'
      ctx.fillRect(o.x-9, o.gy-3, 18, 3)
    } else if (o.type === 'fuel') {
      ctx.fillStyle = '#bb5500'
      ctx.fillRect(o.x-14, o.gy-20, 28, 20)
      ctx.fillStyle = '#ff9900'
      ctx.fillRect(o.x-14, o.gy-24, 28, 5)
      ctx.fillStyle = '#ffffff'
      ctx.font = '8px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('FUEL', o.x, o.gy-7)
    } else if (o.type === 'base') {
      ctx.fillStyle = '#550000'
      ctx.fillRect(o.x-36, o.gy-46, 72, 46)
      ctx.fillStyle = '#880000'
      ctx.fillRect(o.x-26, o.gy-58, 52, 14)
      ctx.fillStyle = '#cc0000'
      ctx.fillRect(o.x-16, o.gy-64, 32, 8)
      ctx.strokeStyle = '#ff3333'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(o.x, o.gy-64); ctx.lineTo(o.x, o.gy-74); ctx.stroke()
      ctx.fillStyle = '#ff4444'
      ctx.beginPath(); ctx.arc(o.x, o.gy-76, 4, 0, Math.PI*2); ctx.fill()
      ctx.fillStyle = '#ffaaaa'
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('BASE', o.x, o.gy-28)
    }
  }
  ctx.restore()

  // Enemy rockets
  for (const r of eRockets) {
    ctx.fillStyle = '#ffdd00'
    ctx.beginPath(); ctx.moveTo(r.x, r.y-10); ctx.lineTo(r.x-4, r.y+6); ctx.lineTo(r.x+4, r.y+6); ctx.fill()
    ctx.fillStyle = '#ff6600'
    ctx.fillRect(r.x-3, r.y+5, 6, 4)
  }

  // UFOs
  for (const u of ufos) {
    ctx.fillStyle = '#4477ee'
    ctx.beginPath(); ctx.ellipse(u.x, u.y, 17, 7, 0, 0, Math.PI*2); ctx.fill()
    ctx.fillStyle = '#88aaff'
    ctx.beginPath(); ctx.ellipse(u.x, u.y-5, 9, 6, 0, 0, Math.PI*2); ctx.fill()
    ctx.fillStyle = 'rgba(100,140,255,0.35)'
    ctx.beginPath(); ctx.ellipse(u.x, u.y+2, 20, 4, 0, 0, Math.PI*2); ctx.fill()
  }

  // Fireballs
  for (const f of fballs) {
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 11)
    g.addColorStop(0,    '#ffffff')
    g.addColorStop(0.35, '#ff8800')
    g.addColorStop(1,    'transparent')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(f.x, f.y, 11, 0, Math.PI*2); ctx.fill()
  }

  // Enemy bullets
  ctx.fillStyle = '#ff66ff'
  for (const b of eBullets) {
    ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI*2); ctx.fill()
  }

  // Lasers
  for (const l of lasers) {
    ctx.fillStyle = 'rgba(255,60,60,0.35)'
    ctx.fillRect(l.x-8, l.y-4, 20, 8)
    ctx.fillStyle = '#ff3333'
    ctx.fillRect(l.x-8, l.y-2, 20, 4)
  }

  // Bombs
  for (const b of bombs) {
    ctx.fillStyle = 'rgba(255,255,80,0.3)'
    ctx.beginPath(); ctx.arc(b.x, b.y, 7, 0, Math.PI*2); ctx.fill()
    ctx.fillStyle = '#ffff44'
    ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI*2); ctx.fill()
  }

  // Player ship
  if (gstate.value === 'playing') {
    const blink = hitTimer > 0 && Math.floor(hitTimer * 8) % 2 === 0
    if (!blink) {
      // Engine flame
      const fl = 8 + Math.random() * 6
      const fg = ctx.createLinearGradient(PLAYER_X-SHIP_W/2-fl, pY, PLAYER_X-SHIP_W/2, pY)
      fg.addColorStop(0, 'transparent'); fg.addColorStop(1, '#ff8800')
      ctx.fillStyle = fg
      ctx.beginPath()
      ctx.moveTo(PLAYER_X-SHIP_W/2, pY-4)
      ctx.lineTo(PLAYER_X-SHIP_W/2-fl, pY)
      ctx.lineTo(PLAYER_X-SHIP_W/2, pY+4)
      ctx.fill()
      // Body
      ctx.fillStyle = '#7ec8e3'
      ctx.beginPath()
      ctx.moveTo(PLAYER_X+SHIP_W/2, pY)
      ctx.lineTo(PLAYER_X-SHIP_W/2, pY-SHIP_H/2)
      ctx.lineTo(PLAYER_X-SHIP_W/3, pY)
      ctx.lineTo(PLAYER_X-SHIP_W/2, pY+SHIP_H/2)
      ctx.closePath(); ctx.fill()
      // Lower wing
      ctx.fillStyle = '#5aabcc'
      ctx.beginPath()
      ctx.moveTo(PLAYER_X-SHIP_W/8, pY+2)
      ctx.lineTo(PLAYER_X-SHIP_W/2, pY+SHIP_H/2)
      ctx.lineTo(PLAYER_X+SHIP_W/4, pY+SHIP_H/3)
      ctx.closePath(); ctx.fill()
      // Cockpit
      ctx.fillStyle = '#1a4a6a'
      ctx.beginPath(); ctx.arc(PLAYER_X+2, pY, 5, 0, Math.PI*2); ctx.fill()
      ctx.fillStyle = 'rgba(160,230,255,0.7)'
      ctx.beginPath(); ctx.arc(PLAYER_X+1, pY-1, 3, 0, Math.PI*2); ctx.fill()
    }
  }

  // Particles
  for (const p of ptcls) {
    ctx.globalAlpha = Math.max(0, p.life / p.ml)
    ctx.fillStyle = p.col
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, p.r * (p.life/p.ml)), 0, Math.PI*2); ctx.fill()
  }
  ctx.globalAlpha = 1

  // HUD
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(0, 0, W, 22)

  ctx.font = '11px monospace'
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'left'
  ctx.fillText(`${score.value}`, 8, 15)
  ctx.fillStyle = '#555'
  ctx.fillText(`HI ${hiscore.value}`, 68, 15)

  ctx.fillStyle = '#aaaaaa'
  ctx.textAlign = 'center'
  ctx.fillText(`ZONE ${zoneN.value}`, W / 2, 15)

  // Fuel bar
  const fbX = W - 122, fbW = 78
  ctx.fillStyle = '#222'
  ctx.fillRect(fbX, 5, fbW, 12)
  const fp = fuel.value / FUEL_MAX
  ctx.fillStyle = fp > 0.4 ? '#00cc44' : fp > 0.2 ? '#ffaa00' : '#ff2200'
  ctx.fillRect(fbX, 5, fbW * fp, 12)
  ctx.strokeStyle = '#444'
  ctx.lineWidth = 1
  ctx.strokeRect(fbX, 5, fbW, 12)
  ctx.fillStyle = '#888'
  ctx.font = '9px monospace'
  ctx.textAlign = 'right'
  ctx.fillText('FUEL', fbX - 3, 15)

  // Lives (ship icons)
  ctx.fillStyle = '#7ec8e3'
  ctx.textAlign = 'right'
  ctx.font = '10px monospace'
  for (let i = 0; i < lives.value; i++) ctx.fillText('▶', W - 4 - i * 13, 15)

  // Overlays
  if (gstate.value === 'start') {
    drawOverlay(ctx, 'SCRAMBLE',
      ['↑ ↓  Fly    SPACE  Fire    Z  Bomb', 'Bomb or shoot fuel tanks to refuel', 'Destroy the enemy base to win', '', 'PRESS SPACE TO START'],
      '#ff4444')
  } else if (gstate.value === 'gameover') {
    drawOverlay(ctx, 'GAME OVER',
      [`Score: ${score.value}`, `Hi-Score: ${hiscore.value}`, '', 'PRESS SPACE TO RETRY'],
      '#ff4444')
  } else if (gstate.value === 'win') {
    drawOverlay(ctx, 'BASE DESTROYED!',
      [`Score: ${score.value}`, `Hi-Score: ${hiscore.value}`, '', 'PRESS SPACE TO PLAY AGAIN'],
      '#ffff44')
  }
}

function drawOverlay(ctx: CanvasRenderingContext2D, title: string, lines: string[], tc: string) {
  ctx.fillStyle = 'rgba(0,0,0,0.78)'
  ctx.fillRect(0, 0, W, H)
  ctx.textAlign = 'center'
  ctx.font = 'bold 26px monospace'
  ctx.fillStyle = tc
  ctx.fillText(title, W/2, H/2 - 44)
  ctx.font = '12px monospace'
  ctx.fillStyle = '#cccccc'
  lines.forEach((l, i) => ctx.fillText(l, W/2, H/2 - 10 + i * 22))
}

// ── Game loop ──────────────────────────────────────────────────────────────────
function loop(ts: number) {
  const dt = Math.min((ts - lastTs) / 1000, 0.05)
  lastTs = ts
  const ctx = canvas.value?.getContext('2d')
  if (ctx) { update(dt); draw(ctx) }
  animId = requestAnimationFrame(loop)
}

function onKeyDn(e: KeyboardEvent) {
  if (e.key === 'ArrowUp'   || e.key === 'w' || e.key === 'W') { keys.up   = true; e.preventDefault() }
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { keys.down = true; e.preventDefault() }
  if (e.key === ' ') {
    if (gstate.value !== 'playing') { initGame(); return }
    keys.fire = true; e.preventDefault()
  }
  if (e.key === 'z' || e.key === 'Z' || e.key === 'x' || e.key === 'X') { keys.bomb = true; e.preventDefault() }
}
function onKeyUp(e: KeyboardEvent) {
  if (e.key === 'ArrowUp'   || e.key === 'w' || e.key === 'W') keys.up   = false
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keys.down = false
  if (e.key === ' ') keys.fire = false
  if (e.key === 'z' || e.key === 'Z' || e.key === 'x' || e.key === 'X') keys.bomb = false
}

onMounted(() => {
  lastTs = performance.now()
  initTerrain()
  animId = requestAnimationFrame(loop)
  window.addEventListener('keydown', onKeyDn)
  window.addEventListener('keyup',   onKeyUp)
})
onUnmounted(() => {
  cancelAnimationFrame(animId)
  window.removeEventListener('keydown', onKeyDn)
  window.removeEventListener('keyup',   onKeyUp)
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #050510;
  color: #f1f5f9;
  padding-bottom: 24px;
}

nav {
  width: 100%;
  max-width: 500px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
}

.back {
  color: #818cf8;
  text-decoration: none;
  font-size: 0.9rem;
}
.back:hover { text-decoration: underline; }

.mute-btn {
  background: none;
  border: 1px solid #2d2d44;
  border-radius: 6px;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px 10px;
  font-size: 1rem;
}

.game-canvas {
  border: 2px solid #1e1e3a;
  border-radius: 4px;
  max-width: 100%;
  image-rendering: pixelated;
}

.mobile-controls {
  display: flex;
  gap: 32px;
  align-items: center;
  margin-top: 18px;
}

.ud-pad {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.action-btns {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ctrl-btn {
  background: #1e1e2e;
  border: 2px solid #3d3d5c;
  border-radius: 8px;
  color: #f1f5f9;
  cursor: pointer;
  font-size: 1.1rem;
  padding: 12px 18px;
  min-width: 56px;
  min-height: 48px;
  touch-action: none;
  user-select: none;
}
.ctrl-btn:active { background: #2d2d4e; border-color: #818cf8; }

.fire-btn { border-color: #ff4444; color: #ff8888; font-size: 0.85rem; font-weight: 700; letter-spacing: 0.05em; }
.bomb-btn { border-color: #ffaa00; color: #ffcc44; font-size: 0.85rem; font-weight: 700; letter-spacing: 0.05em; }

@media (min-width: 600px) {
  .mobile-controls { display: none; }
}
</style>
