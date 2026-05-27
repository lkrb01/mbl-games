// ── Game phases ────────────────────────────────────────────────────────────────

export enum GamePhase {
  LOBBY     = 'LOBBY',      // waiting for players, host can start
  READING   = 'READING',    // black card revealed, brief pause before answering
  ANSWERING = 'ANSWERING',  // players submit white card(s); Card Czar waits
  JUDGING   = 'JUDGING',    // all answers revealed; Czar picks winner
  SCORES    = 'SCORES',     // round winner shown; brief pause before next round
  GAME_OVER = 'GAME_OVER',  // final winner declared
}

// ── Cards ──────────────────────────────────────────────────────────────────────

export interface BlackCard {
  id: string
  text: string      // "_" marks each blank (1–3 blanks)
  pick: 1 | 2 | 3  // how many white cards must be submitted
  pack: string
}

export interface WhiteCard {
  id: string
  text: string
  pack: string
}

// ── Players ────────────────────────────────────────────────────────────────────

export interface Player {
  id: string         // nanoid — stable across reconnects (stored client-side)
  name: string
  score: number
  isHost: boolean
  isCzar: boolean
  isBot: boolean
  connected: boolean // false when WS drops but grace period is active
}

// ── Round ──────────────────────────────────────────────────────────────────────

export interface Submission {
  playerId: string
  cards: string[]    // white card IDs, in play order
  revealed: boolean  // false until Czar flips during JUDGING
}

export interface Round {
  number: number
  czarId: string
  blackCard: BlackCard
  submissions: Submission[]
  winnerId: string | null
}

// ── Room ───────────────────────────────────────────────────────────────────────

export interface RoomConfig {
  name: string
  maxPlayers: number          // default 10
  isPublic: boolean
  pointsToWin: number         // default 8 (Awesome Points)
  handSize: number            // default 10
  packs: string[]             // e.g. ["base"]
  answerTimerSeconds: number  // 0 = no timer
  bots: number                // 0 = no bots (demo mode uses 2–4)
}

export interface Room {
  id: string
  config: RoomConfig
  phase: GamePhase
  players: Player[]
  currentRound: Round | null
  createdAt: number
  lastActivityAt: number
}

// ── What the server sends each individual client ───────────────────────────────

export interface ClientGameState {
  room: Room
  myHand: string[]                   // white card IDs held by this player only
  cards: Record<string, WhiteCard>   // lookup for all cards referenced in myHand
}

// ── REST responses ─────────────────────────────────────────────────────────────

export interface PublicRoomSummary {
  id: string
  name: string
  playerCount: number
  maxPlayers: number
  phase: GamePhase
}

export interface CreateRoomBody {
  playerName: string
  config: Partial<RoomConfig>
  bots?: number
}

// ── WebSocket messages: Client → Server ───────────────────────────────────────

export type ClientMessage =
  | { type: 'JOIN_ROOM';          roomId: string; playerId: string; playerName: string }
  | { type: 'START_GAME' }
  | { type: 'PLAY_CARDS';         cardIds: string[] }
  | { type: 'REVEAL_SUBMISSION';  index: number }
  | { type: 'PICK_WINNER';        winnerId: string }
  | { type: 'NEXT_ROUND' }
  | { type: 'KICK_PLAYER';        targetId: string }
  | { type: 'LEAVE_ROOM' }
  | { type: 'PING' }

// ── WebSocket messages: Server → Client ───────────────────────────────────────

export type ServerMessage =
  | { type: 'WELCOME';               playerId: string; roomId: string }
  | { type: 'STATE_UPDATE';          state: ClientGameState }
  | { type: 'PLAYER_JOINED';         player: Player }
  | { type: 'PLAYER_LEFT';           playerId: string }
  | { type: 'PLAYER_DISCONNECTED';   playerId: string }
  | { type: 'PHASE_CHANGED';         phase: GamePhase; round?: Round }
  | { type: 'CARDS_PLAYED';          playerId: string; count: number }
  | { type: 'SUBMISSION_REVEALED';   index: number; cards: WhiteCard[] }
  | { type: 'ROUND_WINNER';          winnerId: string; cards: WhiteCard[] }
  | { type: 'SCORES_UPDATE';         players: Player[] }
  | { type: 'GAME_OVER';             winner: Player; scores: Player[] }
  | { type: 'TIMER_TICK';            secondsLeft: number }
  | { type: 'ERROR';                 code: string; message: string }
  | { type: 'PONG' }
