import type { BlackCard, WhiteCard } from '../../shared/types/cah'

// ── Card pack data ─────────────────────────────────────────────────────────────
//
// Nitro/Rollup bundles the server at build time and cannot resolve dynamic
// template-literal imports (e.g. `import(\`...cah-${name}.json\`)`).
// All packs must be imported as static string literals so the bundler can
// include them. Add new packs here when you create more JSON files.

import basePack from '../../public/cards/cah-base.json'

interface CardPack {
  pack: string
  black: Array<{ id: string; text: string; pick: number }>
  white: Array<{ id: string; text: string }>
}

// Registry: packName → raw JSON data
const PACK_REGISTRY: Record<string, CardPack> = {
  base: basePack as CardPack,
}

// ── Cache + parsing ────────────────────────────────────────────────────────────

const packCache = new Map<string, { black: BlackCard[]; white: WhiteCard[] }>()

function loadPack(packName: string): { black: BlackCard[]; white: WhiteCard[] } {
  if (packCache.has(packName)) return packCache.get(packName)!

  const data = PACK_REGISTRY[packName]
  if (!data) throw new Error(`Card pack "${packName}" not found.`)

  const parsed = {
    black: data.black.map((c) => ({
      id: c.id,
      text: c.text,
      pick: (c.pick ?? 1) as 1 | 2 | 3,
      pack: packName,
    })),
    white: data.white.map((c) => ({
      id: c.id,
      text: c.text,
      pack: packName,
    })),
  }

  packCache.set(packName, parsed)
  return parsed
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns merged card arrays for the requested packs.
 * Cards from multiple packs are concatenated (not de-duped across packs).
 */
export function getCardsByPacks(packs: string[]): { black: BlackCard[]; white: WhiteCard[] } {
  const results = packs.map(loadPack)
  return {
    black: results.flatMap((r) => r.black),
    white: results.flatMap((r) => r.white),
  }
}

// ── Shuffle utilities ──────────────────────────────────────────────────────────

/**
 * Fisher-Yates in-place shuffle. Returns the same array (mutated).
 */
export function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i] as T
    arr[i] = arr[j] as T
    arr[j] = tmp
  }
  return arr
}

/**
 * Returns a new shuffled copy without mutating the original.
 */
export function shuffled<T>(arr: T[]): T[] {
  return shuffleInPlace([...arr])
}
