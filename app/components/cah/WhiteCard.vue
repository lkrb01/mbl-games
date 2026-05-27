<template>
  <div
    class="white-card"
    :class="{
      selected,
      winner,
      interactive: clickable,
      'face-down': faceDown,
    }"
    :role="clickable ? 'button' : undefined"
    :tabindex="clickable ? 0 : undefined"
    @click="clickable && $emit('click')"
    @keydown.enter="clickable && $emit('click')"
    @keydown.space.prevent="clickable && $emit('click')"
  >
    <div v-if="faceDown" class="card-back">
      <span class="card-back-logo">🃏</span>
    </div>
    <div v-else class="card-front">
      <p class="card-text">{{ text }}</p>
      <span v-if="winner" class="winner-badge">👑</span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  text?: string
  selected?: boolean
  winner?: boolean
  faceDown?: boolean
  clickable?: boolean
}>()

defineEmits<{ click: [] }>()
</script>

<style scoped>
.white-card {
  background: #f8fafc;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
  min-height: 110px;
  display: flex;
  flex-direction: column;
  position: relative;
  transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
  user-select: none;
}

.white-card.interactive {
  cursor: pointer;
}

.white-card.interactive:hover {
  transform: translateY(-4px);
  border-color: #818cf8;
  box-shadow: 0 8px 24px rgba(129, 140, 248, 0.3);
}

.white-card.selected {
  transform: translateY(-8px);
  border-color: #818cf8;
  box-shadow: 0 12px 32px rgba(129, 140, 248, 0.4);
  background: #eef2ff;
}

.white-card.winner {
  border-color: #fbbf24;
  box-shadow: 0 8px 32px rgba(251, 191, 36, 0.4);
  background: #fffbeb;
}

.white-card.face-down {
  background: #1e1e2e;
  border-color: #2d2d44;
  cursor: pointer;
}

.card-front {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.card-text {
  font-size: 0.95rem;
  font-weight: 600;
  color: #0f172a;
  line-height: 1.5;
  flex: 1;
}

.winner-badge {
  position: absolute;
  top: 8px;
  right: 10px;
  font-size: 1.2rem;
}

.card-back {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-back-logo {
  font-size: 2rem;
  opacity: 0.4;
}
</style>
