<template>
  <div class="hand-area">

    <!-- Status bar -->
    <div class="hand-status">
      <template v-if="hasSubmitted">
        <span class="submitted-msg">{{ t.submitted }}</span>
        <span class="submitted-count">{{ t.played(submittedCount, totalPlayers) }}</span>
      </template>
      <template v-else-if="canPlay">
        <span class="pick-instruction">
          {{ t.pick(blackCard.pick) }}
          <strong>{{ blackCard.pick }}</strong>
          {{ t.card(blackCard.pick) }}
        </span>
        <span class="selected-count" :class="{ ready: selectedCards.length === blackCard.pick }">
          {{ t.selected(selectedCards.length, blackCard.pick) }}
        </span>
      </template>
      <template v-else>
        <span class="czar-msg">{{ t.czar }}</span>
      </template>
    </div>

    <!-- Cards -->
    <div v-if="!isCzar" class="cards-scroll">
      <div class="cards-track">
        <CahWhiteCard
          v-for="card in hand"
          :key="card.id"
          :text="card.text"
          :selected="selectedCards.includes(card.id)"
          :clickable="canPlay && !hasSubmitted"
          @click="$emit('toggleCard', card.id)"
        />
      </div>
    </div>

    <!-- Submit button -->
    <button
      v-if="canPlay && !hasSubmitted"
      class="submit-btn"
      :disabled="selectedCards.length !== blackCard.pick"
      @click="$emit('submit')"
    >
      <span v-if="selectedCards.length === blackCard.pick">{{ t.playBtn(blackCard.pick) }}</span>
      <span v-else>{{ t.selectMore(blackCard.pick - selectedCards.length) }}</span>
    </button>

  </div>
</template>

<script setup lang="ts">
import type { BlackCard, WhiteCard } from '../../../shared/types/cah'

const props = defineProps<{
  hand: WhiteCard[]
  selectedCards: string[]
  blackCard: BlackCard
  canPlay: boolean
  isCzar: boolean
  hasSubmitted: boolean
  submittedCount: number
  totalPlayers: number
  lang?: 'en' | 'sv'
}>()

const STRINGS = {
  en: {
    submitted:   '✓ Cards submitted — waiting for others…',
    played:      (n: number, t: number) => `${n} / ${t} played`,
    pick:        (n: number) => `Pick`,
    card:        (n: number) => `card${n > 1 ? 's' : ''}`,
    selected:    (n: number, t: number) => `${n}/${t} selected`,
    czar:        '⚖️ You are the Card Czar — sit back and wait!',
    playBtn:     (n: number) => `Play ${n > 1 ? 'cards' : 'card'} →`,
    selectMore:  (n: number) => `Select ${n} more…`,
  },
  sv: {
    submitted:   '✓ Kort spelade — väntar på andra…',
    played:      (n: number, t: number) => `${n} / ${t} spelade`,
    pick:        (n: number) => `Välj`,
    card:        (n: number) => `kort`,
    selected:    (n: number, t: number) => `${n}/${t} valda`,
    czar:        '⚖️ Du är Kortcesar — luta dig tillbaka och vänta!',
    playBtn:     (n: number) => `Spela kort →`,
    selectMore:  (n: number) => `Välj ${n} till…`,
  },
}
const t = computed(() => STRINGS[props.lang ?? 'en'])

defineEmits<{
  toggleCard: [cardId: string]
  submit: []
}>()
</script>

<style scoped>
.hand-area {
  width: 100%;
  max-width: 700px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.hand-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 4px;
}

.pick-instruction {
  font-size: 0.9rem;
  color: #94a3b8;
}
.pick-instruction strong { color: #f1f5f9; }

.selected-count {
  font-size: 0.85rem;
  color: #64748b;
  font-weight: 700;
  transition: color 0.2s;
}
.selected-count.ready { color: #4ade80; }

.submitted-msg {
  font-size: 0.9rem;
  color: #4ade80;
  font-weight: 600;
}

.submitted-count {
  font-size: 0.85rem;
  color: #64748b;
}

.czar-msg {
  font-size: 0.9rem;
  color: #94a3b8;
  font-style: italic;
}

/* Horizontal scroll container */
.cards-scroll {
  overflow-x: auto;
  overflow-y: visible;
  padding-bottom: 8px;
  /* Smooth scrolling on iOS */
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: #2d2d44 transparent;
}
.cards-scroll::-webkit-scrollbar { height: 4px; }
.cards-scroll::-webkit-scrollbar-track { background: transparent; }
.cards-scroll::-webkit-scrollbar-thumb { background: #2d2d44; border-radius: 2px; }

.cards-track {
  display: flex;
  gap: 12px;
  min-width: max-content;
  padding: 4px 2px 4px;
}

.cards-track > * {
  width: 160px;
  flex-shrink: 0;
}

/* Submit button */
.submit-btn {
  padding: 13px;
  background: #818cf8;
  border: none;
  border-radius: 12px;
  color: #0f0f1a;
  font-size: 1rem;
  font-weight: 800;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
  font-family: inherit;
  width: 100%;
}
.submit-btn:hover:not(:disabled) { background: #a5b4fc; }
.submit-btn:disabled {
  background: #1e1e2e;
  color: #475569;
  border: 1px solid #2d2d44;
  cursor: not-allowed;
}
</style>
