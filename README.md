# MBL Games — Made by Lars

A collection of browser games built with Nuxt 4 and Vue 3. No external game libraries — every game runs on canvas or Vue reactivity, with procedurally generated sound effects and MIDI-style background music via the Web Audio API.

## Games

| Game | Type | Description |
|------|------|-------------|
| 🐍 **Snake** | Canvas | Classic snake — eat food, grow longer, don't hit yourself |
| 🃏 **Memory** | DOM | Flip cards and match all pairs in as few moves as possible |
| 🧠 **Quiz** | DOM | 140 questions across 7 categories, 10 per round |
| 🔢 **2048** | DOM | Slide and merge tiles to reach 2048 |
| 👾 **Space Invaders** | Canvas | Shoot down waves of descending aliens |
| 🚗 **Rally-X** | Canvas | Drive a maze, collect flags, use smoke to shake off enemy cars |
| 🏃 **Platformer** | Canvas | Side-scrolling — jump between platforms, stomp enemies, collect coins |
| 🔢 **Animal Count** | DOM | Count animals and tap the right number (great for small children) |
| 🔤 **Spell the Animal** | DOM | Tap letters in order to spell the animal's name |

## Audio

All audio is generated at runtime — no audio files or external assets.

- **Sound effects** — oscillators and noise buffers via the Web Audio API (`useSound` composable)
- **Background music** — a lookahead sequencer schedules notes 150 ms ahead for smooth, click-free looping (`useMusic` composable). Each game has a unique track tuned to its mood
- **Mute toggle** — a single 🔊/🔇 button on every game page controls both music and effects; preference is persisted to `localStorage`

## Tech

- **[Nuxt 4](https://nuxt.com)** with the `app/` directory layout
- **Vue 3** Composition API — `<script setup>`, `ref`, `computed`, `watch`
- **Canvas API** — Snake, Space Invaders, Platformer, Rally-X
- **Web Audio API** — all sound and music, zero audio files
- No UI component libraries, no game engines, no audio dependencies

## Project structure

```
app/
  pages/
    index.vue             # Home screen / game picker
    snake.vue
    memory.vue
    quiz.vue
    2048.vue
    space-invaders.vue
    rally-x.vue
    platformer.vue
    animal-count.vue
    spell-the-animal.vue
  composables/
    _audioState.ts        # Shared AudioContext + mute state
    useSound.ts           # Sound effects
    useMusic.ts           # Background music sequencer + track data
public/
  mbl-logo.svg
```

## Development

```bash
npm install
npm run dev       # http://localhost:3000
```

```bash
npm run build     # Production build
npm run preview   # Preview production build locally
```
