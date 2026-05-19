<template>
  <div class="home">
    <header class="hero">
      <img src="/mbl-logo.svg" alt="MBL — Made by Lars" class="logo" />
      <p class="subtitle">Games</p>
    </header>

    <main class="grid">
      <NuxtLink v-for="game in games" :key="game.slug" :to="`/${game.slug}`" class="card">
        <div class="card-icon">{{ game.icon }}</div>
        <h2 class="card-title">{{ game.name }}</h2>
        <p class="card-desc">{{ game.description }}</p>
        <span class="card-cta">Play →</span>
      </NuxtLink>
    </main>
  </div>
</template>

<script setup lang="ts">
const games = [
  {
    slug: 'snake',
    name: 'Snake',
    icon: '🐍',
    description: 'Guide the snake, eat food and grow — but don\'t hit the walls or yourself.',
  },
  {
    slug: 'memory',
    name: 'Memory',
    icon: '🃏',
    description: 'Flip cards and match all pairs in as few moves as possible.',
  },
  {
    slug: 'quiz',
    name: 'Quiz',
    icon: '🧠',
    description: 'Answer 10 questions across topics and see how many you can get right.',
  },
  {
    slug: '2048',
    name: '2048',
    icon: '🔢',
    description: 'Slide tiles and merge matching numbers to reach the 2048 tile.',
  },
  {
    slug: 'space-invaders',
    name: 'Space Invaders',
    icon: '👾',
    description: 'Shoot down waves of alien invaders before they reach the ground.',
  },
  {
    slug: 'rally-x',
    name: 'Rally-X',
    icon: '🚗',
    description: 'Drive through the maze, collect all flags, and use smoke to shake off enemy cars.',
  },
  {
    slug: 'platformer',
    name: 'Platformer',
    icon: '🏃',
    description: 'Run, jump and collect coins. Stomp enemies and survive as long as you can!',
  },
  {
    slug: 'animal-count',
    name: 'Animal Count',
    icon: '🔢',
    description: 'Count the animals on screen and tap the right number. Great for little ones!',
  },
  {
    slug: 'spell-the-animal',
    name: 'Spell the Animal',
    icon: '🔤',
    description: 'Look at the animal and tap the letters to spell its name.',
  },
]
</script>

<style scoped>
.home {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 24px;
  background: radial-gradient(ellipse at top, #1e1b4b 0%, #0f0f1a 60%);
}

.hero {
  text-align: center;
  margin-bottom: 40px;
}

.logo {
  height: clamp(60px, 14vw, 96px);
  width: auto;
}

.subtitle {
  margin-top: 4px;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: #4a4a6a;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 24px;
  width: 100%;
  max-width: 900px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 32px 28px;
  background: #1e1e2e;
  border: 1px solid #2d2d44;
  border-radius: 16px;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  cursor: pointer;
}

.card:hover {
  transform: translateY(-4px);
  border-color: #818cf8;
  box-shadow: 0 8px 32px rgba(129, 140, 248, 0.2);
}

.card-icon {
  font-size: 2.5rem;
  line-height: 1;
}

.card-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #f1f5f9;
}

.card-desc {
  font-size: 0.925rem;
  color: #94a3b8;
  line-height: 1.6;
  flex: 1;
}

.card-cta {
  font-size: 0.9rem;
  font-weight: 600;
  color: #818cf8;
  margin-top: 4px;
}
</style>
