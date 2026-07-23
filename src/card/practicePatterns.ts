import type { TileDef } from '../mahjong/types'
import type { CardTextSeg } from './cardText'

/**
 * A tile group describes one required set of tiles within a hand pattern.
 *
 * - `fixed`       – count up to `need` tiles matching `test` (test is already rank/type-specific)
 * - `rank`        – need `need` tiles all sharing the same rank/type; picks the best available key
 * - `consec`      – need two consecutive-rank suit groups of `need1` + `need2`; finds best starting rank
 * - `shared-rank` – legacy pooled same-rank count (do not use for multi-suit “like number” lines).
 * - `shared-rank-suits` – same rank **R**, each subgroup from a **different** suit (`needs` length 2–3).
 * - `suit-locked-rank` – one suit + one rank, `need` tiles (e.g. one-suit “1111 (any #)”).
 * - `consec-multi`– N consecutive-rank groups of sizes `needs[0..N-1]`; finds best starting rank
 *   (rank counts **pooled across suits** — only for patterns that truly allow mixed suits).
 * - `suit-locked-consec-multi` – same as consecutive ranks but all groups must be **one suit**;
 *   picks the best (suit, start rank).
 */
export type PatternGroup =
  | { kind: 'fixed';        need: number;  test: (def: TileDef) => boolean; canUseJoker?: boolean }
  | { kind: 'rank';         need: number;  test: (def: TileDef) => boolean }
  | { kind: 'consec'; need1: number; need2: number; test: (def: TileDef) => boolean; opposingSuits?: true }
  | { kind: 'shared-rank';  needs: number[]; test: (def: TileDef) => boolean }
  /**
   * Same digit rank **R**; each `needs[i]` from a **different** real suit (card “color” slots).
   * See `nmjlSuitSlots.ts` — permutations of `{bam, dot, crak}` onto the slot count, not fixed ink→suit.
   */
  | { kind: 'shared-rank-suits'; needs: number[]; test: (def: TileDef) => boolean }
  /** One suit, one rank — take up to `need` matching suit tiles (one-suit kong / pung size).
   *  `dragonCount` (optional): also include this many suit-matched dragons.
   *  `dragonsFirst` (optional): render dragons before rank tiles (default: rank tiles first). */
  | { kind: 'suit-locked-rank'; need: number; test: (def: TileDef) => boolean; dragonCount?: number; dragonsFirst?: boolean }
  | { kind: 'consec-multi'; needs: number[]; test: (def: TileDef) => boolean }
  | { kind: 'suit-locked-consec-multi'; needs: number[]; test: (def: TileDef) => boolean }
  /**
   * All tiles must share one suit. Tries bam/dot/crak and picks best.
   * `rankNeeds`     – which ranks are needed and how many of each
   * `dragonCount`   – how many matching-suit dragons needed (bam→green, dot→soap, crak→red).
   *                   Set to 0 if the hand uses opposing dragons or no dragons.
   * `opposingDragons` – if set, instead of the matching dragon:
   *   - default: `need` tiles **each** of the two non-matching dragon types (e.g. DDD DDD)
   *   - `eitherType: true`: one meld of `need` tiles of **either** non-matching type (e.g. DDDD)
   */
  | {
      kind: 'suit-locked'
      rankNeeds: Array<{ rank: number; need: number }>
      dragonCount: number
      opposingDragons?: { need: number; eitherType?: boolean }
      /** When true, dragons appear before rank tiles in the strip (e.g. "DDDD 3333…"). Default: false. */
      dragonsFirst?: boolean
    }
  /**
   * A run of `numGroups` consecutive ranks, all in the same suit, plus a matching dragon pair.
   * Tries each suit and each possible starting rank; picks the combination that fills most tiles.
   *   bam → green dragon,  dot → soap dragon,  crak → red dragon
   * `rankCount`  – tiles needed per rank (e.g. 2 for pairs).
   * `dragonCount`– matching-dragon tiles needed (0 if none).
   */
  | { kind: 'suit-locked-consec'; numGroups: number; rankCount: number; dragonCount: number }
  /**
   * 2026 **13579 #4** / **369 #5**: three distinct suits. One suit holds the “mixed” block
   * (13579: six tiles with one paired odd; 369: four tiles `3369`/`3669`/`3699`). The other two
   * suits each hold a kong of **that same pair rank** (“kongs match pair”). `odds` is the allowed
   * pair ranks ([1,3,5,7,9] or [3,6,9]).
   */
  | {
      kind: 'odd-pair-kongs-triple'
      odds: readonly number[]
    }
  /**
   * Card **ink colors** = distinct **suit slots** (A / B / C), not fixed bam/dot/crak — see
   * `nmjlSuitSlots.ts`. Each outer `colorGroups[i]` is one slot; inner arrays are rank runs in
   * that slot. Matcher tries every assignment of real suits to slots and picks the best fill.
   * Jokers may be used for sub-groups that set `canUseJoker: true` (i.e. pungs, not pairs).
   */
  | {
      kind: 'suit-permute'
      colorGroups: Array<Array<{ rank: number; need: number; canUseJoker?: boolean }>>
      /** Optional per-color-group dragon count. `colorGroupDragonCounts[i]` matching dragons are
       *  appended to color group `i`, typed to match that group's assigned suit. */
      colorGroupDragonCounts?: number[]
      /**
       * Dragons of the **remaining** suit — the one suit not claimed by any color group.
       * Only valid when `colorGroups.length < 3` (i.e. 1 or 2 color groups leave a free suit).
       * Use for hands like "FFF 1111 2222 DDD" where the DDD must be the opposing/third suit.
       */
      trailingDragonCount?: number
      /**
       * When true, `rank` values in colorGroups are 1-indexed consecutive offsets: rank 1 = base
       * rank N, rank 2 = base rank N+1, etc. The matcher searches every valid base rank (1 through
       * 9 − maxOffset) to find the best (suit assignment, base rank) combination.
       * Use for hands like "FFF 1111 2222 DDD" where 1111/2222 can be any consecutive rank pair.
       */
      consecRanks?: true
    }
  /**
   * Parenthetical “Any 3 Dragons” (e.g. W&D #2): three dragon melds whose **types** are a permutation
   * of green / red / soap (card prints one assignment; matcher tries every order). `cardDragons[i]` is
   * the stand-in type for meld `i` in **card line / title preview** only — not a legality constraint.
   */
  | {
      kind: 'dragon-meld-permute'
      needs: number[]
      cardDragons: Array<'green' | 'red' | 'soap'>
    }

export type PracticePattern = {
  id: string
  title: string
  /** Color-coded card text segments (NMJL ink conventions). */
  titleSegments?: CardTextSeg[]
  /** League card hand index when present (e.g. 1a, 2b). Mock card omits. */
  cardHandCode?: string
  /** Parenthetical constraints from the league card line. Mock card omits. */
  cardParenthesis?: string
  /** Total tiles the complete hand requires (always 14). */
  roughTarget: number
  section: string
  points: number
  /** Closed hands must be won on self-draw. */
  closed: boolean
  /**
   * Explicit tile groups for accurate "tiles away" counting.
   * When defined, the group-based algorithm replaces the simple matches() count.
   * Each group's `need` values must sum to `roughTarget`.
   */
  groups?: PatternGroup[]
  /** Returns true if this tile type/rank is useful for this hand. */
  matches: (def: TileDef) => boolean
  /**
   * When the matcher emits strip tiles in **group-append order** but the printed card line uses a
   * different order: display index `d` shows the tile from group-strip index `cardLineFromGroupSlotMap[d]`.
   * Length must equal `roughTarget` when set. NMJL CSV hands can set the same field when title
   * segments are insufficient.
   */
  cardLineFromGroupSlotMap?: readonly number[]
  /**
   * When true, `patternLinePreviewSlots` / defs use **group** metadata even if `titleSegments` parse
   * to a full hand (ranks on the card are placeholders vs. matcher semantics — e.g. 13579 #4).
   */
  previewSlotsFromGroups?: boolean
  /** Skip realigning greedy strip cells to title preview order (paired with `previewSlotsFromGroups`). */
  skipStripTitleReorder?: boolean
  /**
   * Joker eligibility from `patternPreviewJokerEligibleBySlot` is indexed in **card/display** order.
   * Greedy strip assignment walks **group** order; for group slot `g`, use eligibility from display
   * index `jokerEligibleGroupToDisplaySlot[g]`. When omitted but `cardLineFromGroupSlotMap` is set,
   * the inverse of that map is used. Set explicitly when the strip is not permuted but joker flags
   * still need realignment (e.g. `like-4`).
   */
  jokerEligibleGroupToDisplaySlot?: readonly number[]
}

// ── tile-type helpers ─────────────────────────────────────────────────────────
/** @public Shared by league-card pattern modules (not a playable card book). */
export function suit(...ranks: number[]) {
  const s = new Set(ranks)
  return (def: TileDef) => def.cat === 'suit' && s.has(def.rank)
}
export const flower = (def: TileDef) => def.cat === 'flower'
export const dragon = (def: TileDef) => def.cat === 'dragon'
export const wind = (def: TileDef) => def.cat === 'wind'
export const anySuit = (def: TileDef) => def.cat === 'suit'
/** Bam + crak only — legacy / opposing-column like-number layouts. */
export const bamCrakSuit = (def: TileDef) => def.cat === 'suit' && (def.suit === 'bam' || def.suit === 'crak')
export const redDrg = (def: TileDef) => def.cat === 'dragon' && def.dragon === 'red'
export const grnDrg = (def: TileDef) => def.cat === 'dragon' && def.dragon === 'green'
export const soapDrg = (def: TileDef) => def.cat === 'dragon' && def.dragon === 'soap'
export const northW = (def: TileDef) => def.cat === 'wind' && def.wind === 'N'
export const eastW = (def: TileDef) => def.cat === 'wind' && def.wind === 'E'
export const westW = (def: TileDef) => def.cat === 'wind' && def.wind === 'W'
export const southW = (def: TileDef) => def.cat === 'wind' && def.wind === 'S'

export function or(...fns: Array<(d: TileDef) => boolean>) {
  return (def: TileDef) => fns.some((f) => f(def))
}

// ── color-segment helpers (NMJL ink conventions) ──────────────────────────────
export const n = (t: string): CardTextSeg => ({ t, ink: 'navy' })
export const g = (t: string): CardTextSeg => ({ t, ink: 'green' })
export const r = (t: string): CardTextSeg => ({ t, ink: 'red' })
export const fl = (t: string): CardTextSeg => ({ t, ink: 'flower' })
export const sp = (t: string): CardTextSeg => ({ t, ink: 'navy' })
export const so = (t: string): CardTextSeg => ({ t, ink: 'soap' })


/** Mock practice hands live in `mockCardBook.ts` (from `data/mock-nmjl-card.csv`). */
