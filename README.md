# MBL Games — Made by Lars

A collection of browser games built with Nuxt 4 and Vue 3. No external game libraries — every game runs on canvas or Vue reactivity, with procedurally generated sound effects and MIDI-style background music via the Web Audio API.

## Games

| Game | Type | Description |
|------|------|-------------|
| 🃏 **Cards Against Humanity** | Multiplayer | Party game for horrible people — fill in the blanks, the most wrong answer wins. Public & private rooms, shareable links, solo demo with bots |
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
| 👾 **Galaxian** | Canvas | Fixed shooter — dive-bombing alien formations, survive as long as you can |
| ⛏️ **Dig Dug** | Canvas | Dig tunnels, inflate enemies to pop them, drop boulders to crush them |

## Audio

All audio is generated at runtime — no audio files or external assets.

- **Sound effects** — oscillators and noise buffers via the Web Audio API (`useSound` composable)
- **Background music** — a lookahead sequencer schedules notes 150 ms ahead for smooth, click-free looping (`useMusic` composable). Each game has a unique track tuned to its mood
- **Mute toggle** — a single 🔊/🔇 button on every game page controls both music and effects; preference is persisted to `localStorage`

## Tech

- **[Nuxt 4](https://nuxt.com)** with the `app/` directory layout
- **Vue 3** Composition API — `<script setup>`, `ref`, `computed`, `watch`
- **Canvas API** — Snake, Space Invaders, Platformer, Rally-X, Scramble, Galaxian, Dig Dug
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
      cah/
        index.vue              # CAH lobby        →  /games/cah
        [roomId].vue           # CAH game room    →  /games/cah/:id
      snake.vue                #                  →  /games/snake
      memory.vue  …            # (all other games)
  components/
    cah/                       # CAH-specific UI components
  composables/
    _audioState.ts             # Shared AudioContext + mute state
    useSound.ts                # Sound effects (includes CAH sounds)
    useMusic.ts                # Background music sequencer + track data
    useCAHSocket.ts            # WebSocket lifecycle + reconnect
    useCAHGame.ts              # Reactive game state + actions
server/
  routes/games/cah/ws.ts      # WebSocket endpoint — full game state machine
  api/games/cah/
    rooms.get.ts               # List public rooms
    rooms.post.ts              # Create a room
    rooms/[roomId].get.ts      # Room info (join validation)
  utils/
    cahCards.ts                # Load + shuffle card packs
    cahRoomStore.ts            # In-memory room store, bot timers, broadcast
shared/
  types/cah.ts                 # Shared TypeScript types (room, player, messages…)
public/
  cards/cah-base.json          # CAH base card set (90 black, 460 white)
  mbl-logo.svg
```

> **Note on multiplayer hosting:** Cards Against Humanity uses WebSockets and an in-memory room store — it requires a persistent Node.js process. The Docker image and Fly.io deployment satisfy this. Static/edge deployments will serve the UI but the game will not connect.

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
