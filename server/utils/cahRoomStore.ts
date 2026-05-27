import type { Peer } from 'crossws'
import { customAlphabet } from 'nanoid'
import type {
  BlackCard,
  ClientGameState,
  GamePhase,
  Player,
  Room,
  RoomConfig,
  Round,
  ServerMessage,
  Submission,
  WhiteCard,
} from '../../shared/types/cah'
import { GamePhase as Phase } from '../../shared/types/cah'
import { getCardsByPacks, shuffled, shuffleInPlace } from './cahCards'

// ── Room ID generator — 6 uppercase chars, e.g. "XK7P2Q" ────────────────────

const genRoomId = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6)
const genPlayerId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16)

// ── Internal room state ────────────────────────────────────────────────────────

export interface RoomState {
  room: Room
  peers: Map<string, Peer>              // playerId → WS peer
  deck: { black: BlackCard[]; white: WhiteCard[] }
  hands: Map<string, string[]>          // playerId → white card IDs
  whiteCardIndex: Record<string, WhiteCard> // id → WhiteCard (for quick lookup)
  _timers: Map<string, ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>>
}

// ── The store ──────────────────────────────────────────────────────────────────

const rooms = new Map<string, RoomState>()

// ── TTL cleanup — runs every 60 s, deletes rooms idle for 2+ hours with no peers

if (import.meta.server) {
  setInterval(() => {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000
    for (const [id, state] of rooms) {
      const hasConnected = [...state.peers.values()].some(() => true) // peer exists
      if (!hasConnected && state.room.lastActivityAt < cutoff) {
        deleteRoom(id)
      }
    }
  }, 60_000)
}

// ── Store helpers ──────────────────────────────────────────────────────────────

export function getRoom(roomId: string): RoomState | undefined {
  return rooms.get(roomId)
}

export function getRoomCount(): number {
  return rooms.size
}

export function getPublicRooms() {
  return [...rooms.values()]
    .filter((s) => s.room.config.isPublic)
    .map((s) => ({
      id: s.room.id,
      name: s.room.config.name,
      playerCount: s.room.players.filter((p) => !p.isBot && p.connected).length,
      maxPlayers: s.room.config.maxPlayers,
      phase: s.room.phase,
    }))
}

// ── Room lifecycle ─────────────────────────────────────────────────────────────

export function createRoom(
  config: Partial<RoomConfig>,
  botCount = 0
): RoomState {
  const roomId = genRoomId()

  const resolvedConfig: RoomConfig = {
    name: config.name ?? 'Game Room',
    maxPlayers: config.maxPlayers ?? 10,
    isPublic: config.isPublic ?? true,
    pointsToWin: config.pointsToWin ?? 8,
    handSize: config.handSize ?? 10,
    packs: config.packs ?? ['base'],
    answerTimerSeconds: config.answerTimerSeconds ?? 0,
    bots: Math.min(botCount, 4),
  }

  const cards = getCardsByPacks(resolvedConfig.packs)

  const state: RoomState = {
    room: {
      id: roomId,
      config: resolvedConfig,
      phase: Phase.LOBBY,
      players: [],
      currentRound: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    },
    peers: new Map(),
    deck: {
      black: shuffled(cards.black),
      white: shuffled(cards.white),
    },
    hands: new Map(),
    whiteCardIndex: Object.fromEntries(cards.white.map((c) => [c.id, c])),
    _timers: new Map(),
  }

  // Add bots
  for (let i = 0; i < resolvedConfig.bots; i++) {
    const bot: Player = {
      id: genPlayerId(),
      name: `Bot ${i + 1}`,
      score: 0,
      isHost: false,
      isCzar: false,
      isBot: true,
      connected: true,
    }
    state.room.players.push(bot)
    state.hands.set(bot.id, [])
  }

  rooms.set(roomId, state)
  return state
}

export function deleteRoom(roomId: string): void {
  const state = rooms.get(roomId)
  if (!state) return

  // Cancel all timers
  for (const timer of state._timers.values()) clearTimeout(timer as ReturnType<typeof setTimeout>)

  // Close all peer connections
  for (const peer of state.peers.values()) {
    try { peer.close() } catch { /* ignore */ }
  }

  rooms.delete(roomId)
}

// ── Player management ──────────────────────────────────────────────────────────

export function addPlayer(state: RoomState, peer: Peer, playerId: string, name: string): Player {
  const isFirstHuman = state.room.players.every((p) => p.isBot)

  const player: Player = {
    id: playerId,
    name,
    score: 0,
    isHost: isFirstHuman,
    isCzar: false,
    isBot: false,
    connected: true,
  }

  state.room.players.push(player)
  state.peers.set(playerId, peer)
  state.hands.set(playerId, [])
  touch(state)
  return player
}

export function reconnectPlayer(state: RoomState, peer: Peer, playerId: string): Player | null {
  const player = state.room.players.find((p) => p.id === playerId)
  if (!player) return null

  player.connected = true
  state.peers.set(playerId, peer)
  touch(state)
  return player
}

export function disconnectPlayer(state: RoomState, playerId: string): void {
  const player = state.room.players.find((p) => p.id === playerId)
  if (player) player.connected = false
  state.peers.delete(playerId)
  touch(state)
}

export function removePlayer(state: RoomState, playerId: string): void {
  state.room.players = state.room.players.filter((p) => p.id !== playerId)
  state.peers.delete(playerId)
  state.hands.delete(playerId)

  // Re-assign host if needed
  const humans = state.room.players.filter((p) => !p.isBot && p.connected)
  if (humans.length > 0 && !humans.some((p) => p.isHost)) {
    humans[0]!.isHost = true
  }

  touch(state)
}

// ── Messaging ──────────────────────────────────────────────────────────────────

export function sendPeer(peer: Peer, msg: ServerMessage): void {
  peer.send(JSON.stringify(msg))
}

export function broadcast(state: RoomState, msg: ServerMessage, excludeId?: string): void {
  for (const [pid, peer] of state.peers) {
    if (pid !== excludeId) {
      try { peer.send(JSON.stringify(msg)) } catch { /* peer may have closed */ }
    }
  }
}

export function unicast(state: RoomState, playerId: string, msg: ServerMessage): void {
  const peer = state.peers.get(playerId)
  if (peer) {
    try { peer.send(JSON.stringify(msg)) } catch { /* ignore */ }
  }
}

// ── Card dealing ───────────────────────────────────────────────────────────────

export function dealCards(state: RoomState, playerId: string, count: number): void {
  const hand = state.hands.get(playerId) ?? []
  const needed = Math.min(count, state.deck.white.length)
  const newCards = state.deck.white.splice(0, needed)
  hand.push(...newCards.map((c) => c.id))
  state.hands.set(playerId, hand)
}

export function dealUpToHandSize(state: RoomState): void {
  const { handSize } = state.room.config
  for (const player of state.room.players) {
    const hand = state.hands.get(player.id) ?? []
    const needed = handSize - hand.length
    if (needed > 0) dealCards(state, player.id, needed)
  }
}

// ── Game state helpers ────────────────────────────────────────────────────────

export function buildClientState(state: RoomState, playerId: string): ClientGameState {
  const hand = state.hands.get(playerId) ?? []
  const cards: Record<string, WhiteCard> = {}
  for (const id of hand) {
    const card = state.whiteCardIndex[id]
    if (card) cards[id] = card
  }

  // Also include cards currently in the active round's submissions (for judging phase)
  if (state.room.currentRound) {
    for (const sub of state.room.currentRound.submissions) {
      if (sub.revealed || sub.playerId === playerId) {
        for (const id of sub.cards) {
          const card = state.whiteCardIndex[id]
          if (card) cards[id] = card
        }
      }
    }
  }

  return {
    room: state.room,
    myHand: hand,
    cards,
  }
}

export function broadcastStateToAll(state: RoomState): void {
  for (const [playerId] of state.peers) {
    const clientState = buildClientState(state, playerId)
    unicast(state, playerId, { type: 'STATE_UPDATE', state: clientState })
  }
}

// ── Round management ───────────────────────────────────────────────────────────

export function nextCzarId(state: RoomState): string {
  const players = state.room.players.filter((p) => p.connected || p.isBot)
  if (players.length === 0) return state.room.players[0]?.id ?? ''

  const currentCzarIndex = players.findIndex((p) => p.isCzar)
  const nextIndex = (currentCzarIndex + 1) % players.length

  // Clear old czar flag
  for (const p of state.room.players) p.isCzar = false
  players[nextIndex]!.isCzar = true

  return players[nextIndex]!.id
}

export function startNewRound(state: RoomState): Round | null {
  const blackCard = state.deck.black.pop()
  if (!blackCard) return null // ran out of black cards

  const czarId = nextCzarId(state)
  dealUpToHandSize(state)

  const round: Round = {
    number: (state.room.currentRound?.number ?? 0) + 1,
    czarId,
    blackCard,
    submissions: [],
    winnerId: null,
  }

  state.room.currentRound = round
  return round
}

export function setPhase(state: RoomState, phase: GamePhase): void {
  state.room.phase = phase
  touch(state)
}

export function getSubmission(state: RoomState, playerId: string): Submission | undefined {
  return state.room.currentRound?.submissions.find((s) => s.playerId === playerId)
}

export function allNonCzarSubmitted(state: RoomState): boolean {
  if (!state.room.currentRound) return false
  const { czarId } = state.room.currentRound
  const eligible = state.room.players.filter(
    (p) => p.id !== czarId && (p.connected || p.isBot)
  )
  return eligible.every((p) =>
    state.room.currentRound!.submissions.some((s) => s.playerId === p.id)
  )
}

// ── Timer helpers ──────────────────────────────────────────────────────────────

export function setTimer(
  state: RoomState,
  key: string,
  fn: () => void,
  delayMs: number
): void {
  clearTimerByKey(state, key)
  const t = setTimeout(fn, delayMs)
  state._timers.set(key, t)
}

export function setInterval_(
  state: RoomState,
  key: string,
  fn: () => void,
  intervalMs: number
): void {
  clearTimerByKey(state, key)
  const t = setInterval(fn, intervalMs)
  state._timers.set(key, t)
}

export function clearTimerByKey(state: RoomState, key: string): void {
  const t = state._timers.get(key)
  if (t !== undefined) {
    clearTimeout(t as ReturnType<typeof setTimeout>)
    clearInterval(t as ReturnType<typeof setInterval>)
    state._timers.delete(key)
  }
}

export function clearAllTimers(state: RoomState): void {
  for (const [key] of state._timers) clearTimerByKey(state, key)
}

// ── Internal ───────────────────────────────────────────────────────────────────

function touch(state: RoomState): void {
  state.room.lastActivityAt = Date.now()
}
