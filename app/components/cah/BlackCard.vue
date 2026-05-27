<template>
  <div class="black-card" :class="{ large }">
    <p class="text">
      <template v-for="(part, i) in parts" :key="i">
        <span>{{ part }}</span>
        <span v-if="i < parts.length - 1" class="blank">______</span>
      </template>
    </p>
    <div v-if="card.pick > 1" class="pick-badge">PICK {{ card.pick }}</div>
  </div>
</template>

<script setup lang="ts">
import type { BlackCard } from '../../../shared/types/cah'

const props = defineProps<{
  card: BlackCard
  large?: boolean
}>()

const parts = computed(() => props.card.text.split('_'))
</script>

<style scoped>
.black-card {
  background: #111;
  border: 2px solid #222;
  border-radius: 14px;
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  position: relative;
  width: 100%;
  max-width: 340px;
}

.black-card.large {
  max-width: 440px;
  padding: 32px 36px;
}

.text {
  font-size: 1.05rem;
  font-weight: 700;
  color: #f8fafc;
  line-height: 1.7;
  word-break: break-word;
}

.black-card.large .text {
  font-size: 1.25rem;
}

.blank {
  display: inline-block;
  border-bottom: 3px solid #f8fafc;
  min-width: 80px;
  margin: 0 3px;
  vertical-align: bottom;
  line-height: 1;
}

.pick-badge {
  align-self: flex-end;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: #f8fafc;
  border: 2px solid #f8fafc;
  border-radius: 6px;
  padding: 3px 8px;
  opacity: 0.8;
}
</style>
