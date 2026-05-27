<template>
  <div class="waiting">

    <div class="room-header">
      <h1 class="room-name">{{ room.config.name }}</h1>
      <p class="room-subtitle">Waiting for players…</p>
    </div>

    <!-- Shareable code + link -->
    <div class="share-box">
      <div class="room-code">{{ room.id }}</div>
      <button class="copy-btn" @click="copyLink">
        {{ copied ? '✓ Copied!' : '🔗 Copy invite link' }}
      </button>
    </div>

    <!-- Player list -->
    <ul class="player-list">
      <li
        v-for="player in room.players"
        :key="player.id"
        class="player-row"
        :class="{ me: player.id === myPlayerId }"
      >
        <span class="player-icon">
          <template v-if="player.isBot">🤖</template>
          <template v-else-if="player.isHost">⭐</template>
          <template v-else>👤</template>
        </span>
        <span class="player-name">
          {{ player.name }}
          <span v-if="player.id === myPlayerId" class="you-tag">(you)</span>
        </span>
        <span v-if="player.isHost" class="host-tag">Host</span>
        <span v-if="player.isBot" class="bot-tag">Bot</span>

        <!-- Host can kick human players -->
        <button
          v-if="isHost && !player.isHost && !player.isBot && player.id !== myPlayerId"
          class="kick-btn"
          title="Kick player"
          @click="$emit('kick', player.id)"
        >✕</button>
      </li>
    </ul>

    <!-- Status / start -->
    <div class="footer">
      <p class="player-count">
        {{ room.players.length }} / {{ room.config.maxPlayers }} players
        <span v-if="room.players.length < 3" class="need-more">
          — need at least {{ 3 - room.players.length }} more
        </span>
      </p>

      <button
        v-if="isHost"
        class="start-btn"
        :disabled="room.players.length < 3"
        @click="$emit('start')"
      >
        Start game →
      </button>
      <p v-else class="waiting-msg">
        Waiting for the host to start…
      </p>
    </div>

  </div>
</template>

<script setup lang="ts">
import type { Room } from '../../../shared/types/cah'

const props = defineProps<{
  room: Room
  myPlayerId: string
  isHost: boolean
}>()

defineEmits<{
  start: []
  kick: [playerId: string]
}>()

const copied = ref(false)

function copyLink() {
  const url = `${location.origin}/games/cah/${props.room.id}`
  navigator.clipboard.writeText(url).catch(() => {})
  copied.value = true
  setTimeout(() => { copied.value = false }, 2_000)
}
</script>

<style scoped>
.waiting {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
  width: 100%;
  max-width: 500px;
  padding: 16px 0;
}

.room-header { text-align: center; }

.room-name {
  font-size: clamp(1.4rem, 4vw, 2rem);
  font-weight: 800;
  color: #f1f5f9;
}

.room-subtitle {
  margin-top: 4px;
  font-size: 0.9rem;
  color: #64748b;
}

/* Share */
.share-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.room-code {
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: 0.25em;
  color: #818cf8;
  background: #1e1e2e;
  border: 1px solid #2d2d44;
  border-radius: 12px;
  padding: 10px 28px;
}

.copy-btn {
  background: none;
  border: 1px solid #2d2d44;
  border-radius: 8px;
  color: #94a3b8;
  font-size: 0.875rem;
  font-family: inherit;
  padding: 7px 16px;
  cursor: pointer;
  transition: all 0.15s;
}
.copy-btn:hover { border-color: #818cf8; color: #f1f5f9; }

/* Player list */
.player-list {
  list-style: none;
  padding: 0;
  margin: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.player-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: #1e1e2e;
  border: 1px solid #2d2d44;
  border-radius: 10px;
}

.player-row.me { border-color: #818cf8; }

.player-icon { font-size: 1.1rem; }

.player-name {
  flex: 1;
  font-weight: 600;
  color: #f1f5f9;
  font-size: 0.95rem;
}

.you-tag  { color: #94a3b8; font-weight: 400; font-size: 0.85rem; }
.host-tag { font-size: 0.75rem; font-weight: 700; color: #fbbf24; background: #1c1810; padding: 2px 8px; border-radius: 999px; }
.bot-tag  { font-size: 0.75rem; font-weight: 700; color: #64748b; background: #0f0f1a; padding: 2px 8px; border-radius: 999px; }

.kick-btn {
  background: none;
  border: none;
  color: #475569;
  cursor: pointer;
  font-size: 0.9rem;
  padding: 4px 6px;
  border-radius: 4px;
  transition: color 0.15s;
}
.kick-btn:hover { color: #f87171; }

/* Footer */
.footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.player-count {
  font-size: 0.9rem;
  color: #64748b;
}
.need-more { color: #f87171; }

.start-btn {
  width: 100%;
  padding: 14px;
  background: #818cf8;
  border: none;
  border-radius: 12px;
  color: #0f0f1a;
  font-size: 1rem;
  font-weight: 800;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
  font-family: inherit;
}
.start-btn:hover:not(:disabled) { background: #a5b4fc; }
.start-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.waiting-msg { color: #64748b; font-size: 0.9rem; }
</style>
