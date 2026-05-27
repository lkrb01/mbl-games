<template>
  <div class="game-over">

    <div class="trophy">🏆</div>
    <h1 class="winner-name">{{ t.wins(winner.name) }}</h1>
    <p class="winner-score">{{ t.points(winner.score) }}</p>

    <div class="leaderboard">
      <h2 class="lb-title">{{ t.finalScore }}</h2>
      <ul class="lb-list">
        <li
          v-for="(player, index) in sorted"
          :key="player.id"
          class="lb-row"
          :class="{ first: index === 0, me: player.id === myPlayerId }"
        >
          <span class="lb-rank">{{ index + 1 }}</span>
          <span class="lb-name">
            {{ player.name }}
            <span v-if="player.id === myPlayerId" class="you-tag">{{ t.you }}</span>
          </span>
          <span class="lb-score">{{ player.score }}</span>
        </li>
      </ul>
    </div>

    <div class="actions">
      <NuxtLink to="/games/cah" class="lobby-btn">{{ t.backLobby }}</NuxtLink>
    </div>

  </div>
</template>

<script setup lang="ts">
import type { Player } from '../../../shared/types/cah'

const props = defineProps<{
  players: Player[]
  myPlayerId?: string
  lang?: 'en' | 'sv'
}>()

const STRINGS = {
  en: {
    wins:       (name: string) => `${name} wins!`,
    points:     (n: number) => `${n} Awesome Point${n !== 1 ? 's' : ''}`,
    finalScore: 'Final Scores',
    you:        '(you)',
    backLobby:  '← Back to lobby',
  },
  sv: {
    wins:       (name: string) => `${name} vinner!`,
    points:     (n: number) => `${n} Häftiga poäng`,
    finalScore: 'Slutresultat',
    you:        '(du)',
    backLobby:  '← Tillbaka till lobbyn',
  },
}
const t = computed(() => STRINGS[props.lang ?? 'en'])

const sorted = computed(() =>
  [...props.players].sort((a, b) => b.score - a.score),
)

const winner = computed(() => sorted.value[0] ?? props.players[0]!)
</script>

<style scoped>
.game-over {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  text-align: center;
  width: 100%;
  max-width: 480px;
  padding: 16px 0;
}

.trophy {
  font-size: 4rem;
  filter: drop-shadow(0 4px 16px rgba(251, 191, 36, 0.5));
}

.winner-name {
  font-size: clamp(1.8rem, 5vw, 2.6rem);
  font-weight: 800;
  color: #fbbf24;
}

.winner-score {
  font-size: 1rem;
  color: #94a3b8;
}

.leaderboard {
  width: 100%;
  background: #1e1e2e;
  border: 1px solid #2d2d44;
  border-radius: 16px;
  padding: 24px;
}

.lb-title {
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 16px;
}

.lb-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.lb-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  background: #0f0f1a;
  transition: background 0.2s;
}

.lb-row.first {
  background: #1c1810;
  border: 1px solid #fbbf24;
}

.lb-row.me { border: 1px solid #818cf8; }

.lb-rank {
  font-size: 0.85rem;
  font-weight: 800;
  color: #475569;
  width: 20px;
  text-align: center;
}
.lb-row.first .lb-rank { color: #fbbf24; }

.lb-name {
  flex: 1;
  font-weight: 600;
  color: #e2e8f0;
  text-align: left;
}

.you-tag { color: #64748b; font-size: 0.82rem; font-weight: 400; }

.lb-score {
  font-size: 1.1rem;
  font-weight: 800;
  color: #818cf8;
  min-width: 28px;
  text-align: right;
}
.lb-row.first .lb-score { color: #fbbf24; }

.actions { width: 100%; }

.lobby-btn {
  display: block;
  padding: 14px;
  background: #1e1e2e;
  border: 1px solid #2d2d44;
  border-radius: 12px;
  color: #94a3b8;
  text-decoration: none;
  font-weight: 700;
  font-size: 0.95rem;
  text-align: center;
  transition: all 0.15s;
}
.lobby-btn:hover { border-color: #818cf8; color: #f1f5f9; }
</style>
