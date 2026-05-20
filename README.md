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
| 🚀 **Scramble** | Canvas | Side-scrolling shooter — fly through enemy terrain, bomb fuel depots to keep going, reach the base |
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

## Use as a Nuxt layer

The package is structured as a portable **Nuxt 4 layer**. Drop it into any Nuxt 4 project and all games appear at `/games/*` without touching your own routes.

### From GitHub (no npm publish needed)

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  extends: ['github:lkrb01/mbl-games'],
})
```

### From a local path

```ts
export default defineNuxtConfig({
  extends: ['../mbl-games'],
})
```

Games will be available at `/games`, `/games/snake`, `/games/scramble`, etc. Your own `/` page is untouched — the layer only adds routes under `/games/`.

## Project structure

```
app/
  pages/
    index.vue                  # Redirects to /games (override in your own app)
    games/
      index.vue                # Game picker hub  →  /games
      snake.vue                #                  →  /games/snake
      memory.vue
      quiz.vue
      2048.vue
      space-invaders.vue
      rally-x.vue
      platformer.vue
      scramble.vue
      animal-count.vue
      spell-the-animal.vue
  composables/
    _audioState.ts             # Shared AudioContext + mute state
    useSound.ts                # Sound effects
    useMusic.ts                # Background music sequencer + track data
public/
  mbl-logo.svg
```

## Docker

Run the latest image directly — no Node.js installation required:

```bash
docker run -p 3000:3000 lkrb01/mbl-games:latest
```

Then open [http://localhost:3000](http://localhost:3000).

To run on a different port (e.g. 8080):

```bash
docker run -p 8080:3000 lkrb01/mbl-games:latest
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
