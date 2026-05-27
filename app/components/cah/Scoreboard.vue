<template>
  <div class="scoreboard">
    <div
      v-for="player in players"
      :key="player.id"
      class="player-chip"
      :class="{
        czar: player.isCzar,
        disconnected: !player.connected && !player.isBot,
        me: player.id === myPlayerId,
      }"
    >
      <span class="chip-icon">
        <template v-if="player.isCzar">⚖️</template>
        <template v-else-if="player.isBot">🤖</template>
        <template v-else-if="player.isHost">⭐</template>
        <template v-else>👤</template>
      </span>
      <span class="chip-name">{{ player.isBot ? player.name : (player.id === myPlayerId ? 'You' : player.name) }}</span>
      <span class="chip-score">{{ player.score }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Player } from '../../../shared/types/cah'

defineProps<{
  players: Player[]
  myPlayerId?: string
}>()
</script>

<style scoped>
.scoreboard {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
  max-width: 700px;
  justify-content: center;
}

.player-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #1e1e2e;
  border: 1px solid #2d2d44;
  border-radius: 999px;
  font-size: 0.85rem;
  transition: border-color 0.2s;
}

.player-chip.czar {
  border-color: #fbbf24;
  background: #1c1810;
}

.player-chip.me {
  border-color: #818cf8;
}

.player-chip.disconnected {
  opacity: 0.4;
}

.chip-icon { font-size: 0.9rem; line-height: 1; }

.chip-name {
  color: #e2e8f0;
  font-weight: 600;
  max-width: 90px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chip-score {
  background: #0f0f1a;
  color: #818cf8;
  font-weight: 800;
  font-size: 0.8rem;
  padding: 2px 7px;
  border-radius: 999px;
  min-width: 24px;
  text-align: center;
}
</style>
