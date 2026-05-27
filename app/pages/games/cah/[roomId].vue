<template>
  <div class="room-page">

    <!-- Nav -->
    <nav class="nav">
      <NuxtLink to="/games/cah" class="back">← Lobby</NuxtLink>
      <span class="nav-title">Cards Against Humanity</span>
      <div class="nav-right">
        <button class="mute-btn" :title="sound.muted.value ? 'Unmute' : 'Mute'" @click="sound.toggleMute()">
          {{ sound.muted.value ? '🔇' : '🔊' }}
        </button>
      </div>
    </nav>

    <!-- Reconnect banner -->
    <Transition name="banner">
      <div v-if="status === 'disconnected' || status === 'connecting'" class="reconnect-banner">
        <div class="spinner small" />
        {{ status === 'connecting' ? 'Connecting…' : 'Connection lost — reconnecting…' }}
      </div>
    </Transition>

    <!-- ── Connecting / room not found ─────────────────────────────────────── -->
    <div v-if="!room" class="center-msg">
      <div v-if="status === 'error'" class="error-state">
        <p class="big-icon">💔</p>
        <p>Could not connect to the room.</p>
        <NuxtLink to="/games/cah" class="back-link">Back to lobby →</NuxtLink>
      </div>
      <div v-else class="loading-state">
        <div class="spinner" />
        <p>Connecting…</p>
      </div>
    </div>

    <!-- ── LOBBY: waiting room ─────────────────────────────────────────────── -->
    <CahWaitingRoom
      v-else-if="room.phase === 'LOBBY'"
      :room="room"
      :my-player-id="playerId"
      :is-host="myPlayer?.isHost ?? false"
      @start="startGame"
      @kick="kickPlayer"
    />

    <!-- ── Active game ─────────────────────────────────────────────────────── -->
    <template v-else-if="room.phase !== 'GAME_OVER'">

      <!-- Scoreboard -->
      <CahScoreboard
        :players="room.players"
        :my-player-id="playerId"
      />

      <!-- Round number -->
      <p v-if="currentRound" class="round-label">
        Round {{ currentRound.number }}
      </p>

      <!-- Black card -->
      <CahBlackCard
        v-if="currentRound"
        :card="currentRound.blackCard"
        large
      />

      <!-- ── READING ──────────────────────────────────────────────────────── -->
      <div v-if="room.phase === 'READING'" class="phase-message reading">
        <div class="spinner small" />
        <p>
          {{ czarName }} is the Card Czar — everyone pick your best answer…
        </p>
      </div>

      <!-- ── ANSWERING ───────────────────────────────────────────────────── -->
      <CahPlayerHand
        v-if="room.phase === 'ANSWERING' && currentRound"
        :hand="myHand"
        :selected-cards="selectedCards"
        :black-card="currentRound.blackCard"
        :can-play="canPlayCards"
        :is-czar="myPlayer?.isCzar ?? false"
        :has-submitted="hasSubmitted"
        :submitted-count="currentRound.submissions.length"
        :total-players="nonCzarCount"
        @toggle-card="wrappedToggle"
        @submit="playCards"
      />

      <!-- ── JUDGING ─────────────────────────────────────────────────────── -->
      <CahPlayedAnswers
        v-if="room.phase === 'JUDGING' && currentRound"
        :submissions="currentRound.submissions"
        :card-index="cardIndex"
        :can-judge="canJudge"
        :czar-name="czarName"
        :winner-id="currentRound.winnerId"
        :players="room.players"
        @reveal="revealSubmission"
        @pick-winner="pickWinner"
      />

      <!-- ── SCORES overlay ──────────────────────────────────────────────── -->
      <Transition name="scores">
        <div v-if="room.phase === 'SCORES'" class="scores-overlay">
          <div class="scores-card">
            <p class="scores-round">Round {{ currentRound?.number }}</p>
            <p class="scores-winner-line">
              🏆 <strong>{{ roundWinnerName }}</strong> wins the round!
            </p>

            <!-- Winning cards -->
            <div v-if="winningCards.length" class="winning-cards">
              <CahWhiteCard
                v-for="card in winningCards"
                :key="card.id"
                :text="card.text"
                winner
              />
            </div>

            <!-- Progress to victory -->
            <div class="points-progress">
              <template v-for="player in [...room.players].sort((a, b) => b.score - a.score)" :key="player.id">
                <div class="progress-row">
                  <span class="progress-name">{{ player.id === playerId ? 'You' : player.name }}</span>
                  <div class="progress-bar-track">
                    <div
                      class="progress-bar-fill"
                      :style="{ width: `${(player.score / room.config.pointsToWin) * 100}%` }"
                    />
                  </div>
                  <span class="progress-score">{{ player.score }}/{{ room.config.pointsToWin }}</span>
                </div>
              </template>
            </div>

            <button
              v-if="myPlayer?.isHost"
              class="next-btn"
              @click="nextRound"
            >
              Next round →
            </button>
            <p v-else class="next-waiting">
              Waiting for host to continue…
            </p>
          </div>
        </div>
      </Transition>

      <!-- Answer timer -->
      <div v-if="timerSeconds > 0 && room.phase === 'ANSWERING'" class="timer-bar">
        <div
          class="timer-fill"
          :style="{ width: `${(timerSeconds / room.config.answerTimerSeconds) * 100}%` }"
          :class="{ urgent: timerSeconds <= 5 }"
        />
        <span class="timer-label">{{ timerSeconds }}s</span>
      </div>

    </template>

    <!-- ── GAME OVER ───────────────────────────────────────────────────────── -->
    <CahGameOverScreen
      v-else-if="room.phase === 'GAME_OVER'"
      :players="room.players"
      :my-player-id="playerId"
    />

    <!-- Error toast -->
    <Transition name="toast">
      <div v-if="error" class="error-toast">{{ error }}</div>
    </Transition>

  </div>
</template>

<script setup lang="ts">
import { GamePhase } from '../../../../shared/types/cah'
import type { WhiteCard } from '../../../../shared/types/cah'

definePageMeta({ ssr: false })

const route = useRoute()
const roomId = computed(() => String(route.params.roomId))

const {
  room, myPlayer, myHand, cardIndex, currentRound,
  selectedCards, timerSeconds, canPlayCards, canJudge, hasSubmitted,
  error, status, playerId,
  toggleCard, playCards, revealSubmission, pickWinner, startGame, nextRound, kickPlayer,
} = useCAHGame(roomId)

// ── Derived helpers ──────────────────────────────────────────────────────────

const czarName = computed(() => {
  if (!room.value || !currentRound.value) return ''
  const czar = room.value.players.find((p) => p.id === currentRound.value!.czarId)
  return czar ? (czar.id === playerId.value ? 'You' : czar.name) : ''
})

const nonCzarCount = computed(() => {
  if (!room.value || !currentRound.value) return 0
  return room.value.players.filter(
    (p) => p.id !== currentRound.value!.czarId && (p.connected || p.isBot),
  ).length
})

const roundWinnerName = computed(() => {
  if (!room.value || !currentRound.value?.winnerId) return ''
  const winner = room.value.players.find((p) => p.id === currentRound.value!.winnerId)
  return winner ? (winner.id === playerId.value ? 'You' : winner.name) : ''
})

const winningCards = computed<WhiteCard[]>(() => {
  if (!currentRound.value?.winnerId) return []
  const winnerSub = currentRound.value.submissions.find(
    (s) => s.playerId === currentRound.value!.winnerId,
  )
  if (!winnerSub) return []
  return winnerSub.cards
    .map((id) => cardIndex.value[id])
    .filter((c): c is WhiteCard => c !== undefined)
})

// ── Sounds ───────────────────────────────────────────────────────────────────

const sound = useSound()

// Cards dealt → deal sound when phase enters READING
watch(() => room.value?.phase, (phase, prev) => {
  if (!prev) return   // skip initial population
  if (phase === GamePhase.READING)   sound.cahDeal()
  if (phase === GamePhase.GAME_OVER) {
    const scores = room.value?.players.map((p) => p.score) ?? [0]
    const myScore = myPlayer.value?.score ?? 0
    myScore >= Math.max(...scores) ? sound.win() : sound.gameOver()
  }
})

// Someone played cards → thud sound
watch(() => currentRound.value?.submissions.length, (n, prev) => {
  if (n !== undefined && prev !== undefined && n > prev) sound.cahPlay()
})

// A submission was revealed → flip sound
watch(
  () => currentRound.value?.submissions.filter((s) => s.revealed).length,
  (n, prev) => { if (n !== undefined && prev !== undefined && n > prev) sound.cahReveal() },
)

// Round winner announced → fanfare
watch(() => currentRound.value?.winnerId, (id) => { if (id) sound.cahRoundWin() })

// Card selected in hand → tick
const wrappedToggle = (cardId: string) => { sound.cahSelect(); toggleCard(cardId) }
</script>

<style scoped>
.room-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 20px 80px;
  background: radial-gradient(ellipse at top, #1a1a2e 0%, #0f0f1a 60%);
  gap: 24px;
}

/* Nav */
.nav {
  width: 100%;
  max-width: 700px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.back {
  font-size: 0.9rem;
  color: #64748b;
  text-decoration: none;
  transition: color 0.2s;
  white-space: nowrap;
}
.back:hover { color: #94a3b8; }
.nav-title {
  flex: 1;
  font-size: 0.85rem;
  font-weight: 600;
  color: #475569;
  text-align: center;
  letter-spacing: 0.05em;
}
.nav-right { min-width: 80px; text-align: right; }

.conn-badge {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 999px;
}
.conn-badge.connecting   { background: #1c1810; color: #fbbf24; }
.conn-badge.disconnected { background: #1c1010; color: #f87171; }
.conn-badge.error        { background: #1c1010; color: #f87171; }

/* Loading / error states */
.center-msg {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  color: #64748b;
  font-size: 0.95rem;
}
.big-icon { font-size: 3rem; }
.back-link {
  color: #818cf8;
  text-decoration: none;
  font-weight: 600;
}

/* Spinner */
.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #2d2d44;
  border-top-color: #818cf8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.spinner.small { width: 20px; height: 20px; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Round label */
.round-label {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #475569;
}

/* READING phase */
.phase-message {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.9rem;
  color: #94a3b8;
  font-style: italic;
  max-width: 400px;
  text-align: center;
}

/* SCORES overlay */
.scores-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 24px;
}

.scores-card {
  background: #1e1e2e;
  border: 1px solid #2d2d44;
  border-radius: 20px;
  padding: 36px 32px;
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  text-align: center;
}

.scores-round {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #475569;
}

.scores-winner-line {
  font-size: 1.4rem;
  font-weight: 800;
  color: #f1f5f9;
}
.scores-winner-line strong { color: #fbbf24; }

.winning-cards {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}
.winning-cards > * { max-width: 200px; }

/* Points progress */
.points-progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.progress-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: #94a3b8;
  width: 70px;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.progress-bar-track {
  flex: 1;
  height: 6px;
  background: #0f0f1a;
  border-radius: 999px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: #818cf8;
  border-radius: 999px;
  transition: width 0.6s ease;
}

.progress-score {
  font-size: 0.8rem;
  font-weight: 700;
  color: #64748b;
  width: 36px;
  text-align: left;
}

.next-btn {
  padding: 13px;
  background: #818cf8;
  border: none;
  border-radius: 12px;
  color: #0f0f1a;
  font-size: 1rem;
  font-weight: 800;
  cursor: pointer;
  transition: background 0.15s;
  font-family: inherit;
}
.next-btn:hover { background: #a5b4fc; }

.next-waiting {
  font-size: 0.9rem;
  color: #64748b;
}

/* Timer bar */
.timer-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 6px;
  background: #0f0f1a;
  display: flex;
  align-items: center;
}
.timer-fill {
  height: 100%;
  background: #818cf8;
  transition: width 1s linear, background 0.3s;
}
.timer-fill.urgent { background: #f87171; }
.timer-label {
  position: absolute;
  right: 12px;
  bottom: 10px;
  font-size: 0.75rem;
  font-weight: 700;
  color: #94a3b8;
}

/* Error toast */
.error-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #1c1010;
  border: 1px solid #f87171;
  color: #f87171;
  font-size: 0.9rem;
  font-weight: 600;
  padding: 10px 20px;
  border-radius: 10px;
  z-index: 200;
  white-space: nowrap;
}

/* Mute button */
.mute-btn {
  background: none;
  border: none;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  line-height: 1;
  transition: opacity 0.2s;
}
.mute-btn:hover { opacity: 0.7; }

/* Reconnect banner */
.reconnect-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: #1c1810;
  border-bottom: 1px solid #fbbf24;
  color: #fbbf24;
  font-size: 0.85rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 8px 16px;
  z-index: 300;
}

.banner-enter-active, .banner-leave-active { transition: all 0.25s; }
.banner-enter-from, .banner-leave-to { opacity: 0; transform: translateY(-100%); }

/* Transitions */
.scores-enter-active, .scores-leave-active { transition: opacity 0.3s; }
.scores-enter-from, .scores-leave-to { opacity: 0; }

.toast-enter-active, .toast-leave-active { transition: all 0.3s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(12px); }

/* ── Mobile ────────────────────────────────────────────────────────────────── */
@media (max-width: 600px) {
  .room-page {
    padding: 16px 12px 100px;
    gap: 16px;
  }

  .nav-title { display: none; }

  .scores-card {
    padding: 24px 20px;
  }
}
</style>
