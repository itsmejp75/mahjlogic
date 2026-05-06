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
  | { kind: 'fixed';        need: number;  test: (def: TileDef) => boolean }
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
   * `opposingDragons` – if set, instead of the matching dragon, count `need` tiles each of the
   *                     two dragon types that do NOT match the chosen suit.
   */
  | {
      kind: 'suit-locked'
      rankNeeds: Array<{ rank: number; need: number }>
      dragonCount: number
      opposingDragons?: { need: number }
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
/** Bam + crak only — like-number kongs opposing the soap (dot) column on `FFF 1111 DDD 1111`. */
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

// ── hands ─────────────────────────────────────────────────────────────────────
export const PRACTICE_PATTERNS: PracticePattern[] = [

  // ═══════════════════════════════════════════════════════════════ 2468 ═══════

  {
    id: '2468-1', section: '2468', points: 25, closed: false, roughTarget: 14,
    title: 'FFFF 2 44 666 8888',
    titleSegments: [fl('FFFF '), n('2 44 666 8888')],
    // 4 flowers + all numbers one suit (rank2:1, rank4:2, rank6:3, rank8:4)
    groups: [
      { kind: 'fixed',       need: 4, test: flower },
      { kind: 'suit-locked', rankNeeds: [{rank:2,need:1},{rank:4,need:2},{rank:6,need:3},{rank:8,need:4}], dragonCount: 0 },
    ],
    matches: or(flower, suit(2, 4, 6, 8)),
  },
  {
    id: '2468-2', section: '2468', points: 25, closed: false, roughTarget: 14,
    title: '22 4444 666 666 88',
    titleSegments: [n('22 4444 '), r('666 '), g('666 '), n('88')],
    // Three color slots: navy(22+4444+88) | red(666) | green(666).
    // Card order is interleaved: [22 4444][666-red][666-green][88], custom reorder applied.
    groups: [
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 2, need: 2 }, { rank: 4, need: 4, canUseJoker: true }, { rank: 8, need: 2 }],
          [{ rank: 6, need: 3, canUseJoker: true }],
          [{ rank: 6, need: 3, canUseJoker: true }],
        ],
      },
    ],
    matches: suit(2, 4, 6, 8),
  },
  {
    id: '2468-3', section: '2468', points: 25, closed: false, roughTarget: 14,
    title: '222 444 6666 8888',
    titleSegments: [r('222 444 '), g('6666 8888')],
    // Card: 222 444 red (suit A); 6666 8888 green (suit B). Two distinct suits.
    groups: [
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 2, need: 3, canUseJoker: true }, { rank: 4, need: 3, canUseJoker: true }],
          [{ rank: 6, need: 4, canUseJoker: true }, { rank: 8, need: 4, canUseJoker: true }],
        ],
      },
    ],
    matches: suit(2, 4, 6, 8),
  },
  {
    id: '2468-4', section: '2468', points: 25, closed: false, roughTarget: 14,
    title: '22 44 444 666 8888',
    titleSegments: [r('22 44 '), n('444 666 8888')],
    // Card: 22 44 red (suit A); 444 666 8888 navy (suit B — same suit as the 444 and 8888).
    groups: [
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 2, need: 2 }, { rank: 4, need: 2 }],
          [{ rank: 4, need: 3, canUseJoker: true }, { rank: 6, need: 3, canUseJoker: true }, { rank: 8, need: 4, canUseJoker: true }],
        ],
      },
    ],
    matches: suit(2, 4, 6, 8),
  },
  {
    id: '2468-5', section: '2468', points: 25, closed: false, roughTarget: 14,
    title: 'FF 4444 8888 DDDD',
    titleSegments: [fl('FF '), n('4444 8888 '), n('DDDD')],
    // 2 flowers + rank4:4 + rank8:4 (same suit) + 4 matching dragons
    groups: [
      { kind: 'fixed',       need: 2, test: flower },
      { kind: 'suit-locked', rankNeeds: [{rank:4,need:4},{rank:8,need:4}], dragonCount: 4 },
    ],
    matches: or(flower, suit(4, 8), dragon),
  },
  {
    id: '2468-6', section: '2468', points: 25, closed: false, roughTarget: 14,
    title: 'FF 4444 8888 DDDD',
    titleSegments: [fl('FF '), n('4444 '), g('8888 '), n('DDDD')],
    // Card: 4444 + DDDD navy (suit A, dragon matches suit A); 8888 green (suit B). Two distinct suits.
    // Note: dragon must match suit A — `rank` group accepts any dragon type as the best approximation.
    groups: [
      { kind: 'fixed', need: 2, test: flower },
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 4, need: 4, canUseJoker: true }],
          [{ rank: 8, need: 4, canUseJoker: true }],
        ],
      },
      { kind: 'rank', need: 4, test: dragon },
    ],
    matches: or(flower, suit(4, 8), dragon),
  },
  {
    id: '2468-7', section: '2468', points: 30, closed: false, roughTarget: 14,
    title: 'FF 2222 44 66 8888',
    titleSegments: [fl('FF '), r('2222 '), n('44 66 '), g('8888')],
    // Card: 2222 red (slot A); 44 66 navy (slot B, same suit); 8888 green (slot C). Three distinct suits.
    groups: [
      { kind: 'fixed', need: 2, test: flower },
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 2, need: 4, canUseJoker: true }],
          [{ rank: 4, need: 2 }, { rank: 6, need: 2 }],
          [{ rank: 8, need: 4, canUseJoker: true }],
        ],
      },
    ],
    matches: or(flower, suit(2, 4, 6, 8)),
  },
  {
    id: '2468-8', section: '2468', points: 30, closed: true, roughTarget: 14,
    title: '222 444 666 888 DD',
    titleSegments: [n('222 444 666 888 DD')],
    // Card: entire line one ink = all one suit. DD same ink = dragon matches that suit.
    groups: [
      { kind: 'suit-locked', rankNeeds: [{ rank: 2, need: 3 }, { rank: 4, need: 3 }, { rank: 6, need: 3 }, { rank: 8, need: 3 }], dragonCount: 2 },
    ],
    matches: or(suit(2, 4, 6, 8), dragon),
  },

  // ══════════════════════════════════════════════════ ANY LIKE NUMBERS ════════

  {
    id: 'like-1', section: 'ANY LIKE NUMBERS', points: 25, closed: false, roughTarget: 14,
    title: 'FFFF 1111 11 1111 (any #)',
    titleSegments: [fl('FFFF '), r('1111 '), g('11 '), n('1111')],
    // 4 flowers + 10 tiles of the same rank (4+2+4) — all three suit groups share one rank
    groups: [
      { kind: 'fixed',       need: 4,        test: flower },
      { kind: 'shared-rank-suits', needs: [4,2,4], test: anySuit },
    ],
    matches: or(flower, anySuit),
  },
  {
    id: 'like-2', section: 'ANY LIKE NUMBERS', points: 25, closed: false, roughTarget: 14,
    title: 'FF 1111 DD 1111 DD (any #)',
    titleSegments: [fl('FF '), r('1111 DD '), g('1111 DD ')],
    // 2 flowers + 8 suit tiles of same rank (4+4) + 2 pairs of different dragon types
    groups: [
      { kind: 'fixed',       need: 2,      test: flower },
      { kind: 'shared-rank-suits', needs: [4,4], test: anySuit },
      { kind: 'fixed',       need: 2,      test: dragon },
      { kind: 'fixed',       need: 2,      test: dragon },
    ],
    matches: or(flower, anySuit, dragon),
  },
  {
    id: 'like-3', section: 'ANY LIKE NUMBERS', points: 25, closed: false, roughTarget: 14,
    title: 'FFF 1111 DDD 1111 (any #)',
    titleSegments: [fl('FFF '), r('1111 '), n('DDD '), g('1111')],
    // 3 flowers + 8 suit tiles same rank in **bam + crak** (opposing soap/dot column) + **3 soaps**
    groups: [
      { kind: 'fixed',       need: 3,      test: flower },
      { kind: 'shared-rank-suits', needs: [4,4], test: bamCrakSuit },
      { kind: 'fixed',       need: 3,      test: soapDrg },
    ],
    matches: or(flower, bamCrakSuit, soapDrg),
  },
  {
    id: 'like-4', section: 'ANY LIKE NUMBERS', points: 30, closed: true, roughTarget: 14,
    title: '11 DD 111 DDD 1111 (any #)',
    titleSegments: [r('11 DD '), g('111 DDD '), n('1111')],
    // 9 suit tiles of same rank (2+3+4) + 2 pairs/pung of different dragon types
    groups: [
      { kind: 'shared-rank-suits', needs: [2,3,4], test: anySuit },
      { kind: 'fixed',       need: 2,        test: dragon },
      { kind: 'fixed',       need: 3,        test: dragon },
    ],
    matches: or(anySuit, dragon),
  },

  // ═══════════════════════════════════════════════════════════════ MATH ═══════

  {
    id: 'math-1', section: 'MATH', points: 25, closed: false, roughTarget: 14,
    title: 'FFFF 4444 × 8888 = 32',
    titleSegments: [fl('FFFF '), r('4444 × '), g('8888 '), sp('= '), n('3'), n('2')],
    // Three card inks = three **distinct** suits: red (4444), green (8888), black sum digits (32).
    groups: [
      { kind: 'fixed', need: 4, test: flower },
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 4, need: 4, canUseJoker: true }],
          [{ rank: 8, need: 4, canUseJoker: true }],
          [{ rank: 3, need: 1 }, { rank: 2, need: 1 }],
        ],
      },
    ],
    matches: or(flower, suit(4, 8, 3, 2)),
  },
  {
    id: 'math-2', section: 'MATH', points: 25, closed: false, roughTarget: 14,
    title: 'DDDD 3333 × 7777 = 21',
    titleSegments: [n('DDDD '), r('3333 × '), g('7777 '), sp('= '), n('2'), n('1')],
    // Navy “DDDD” + navy “21” = one suit: four matching dragons + ranks 2 & 1 in that suit.
    // Red 3333 and green 7777 are the other two suit slots.
    groups: [
      {
        kind: 'suit-locked',
        rankNeeds: [
          { rank: 2, need: 1 },
          { rank: 1, need: 1 },
        ],
        dragonCount: 4,
        dragonsFirst: true,
      },
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 3, need: 4, canUseJoker: true }],
          [{ rank: 7, need: 4, canUseJoker: true }],
        ],
      },
    ],
    matches: or(dragon, suit(3, 7, 2, 1)),
  },
  {
    id: 'math-3a', section: 'MATH', points: 25, closed: false, roughTarget: 14,
    title: 'FF 3333 + 4444 = 7777',
    titleSegments: [fl('FF '), n('3333 + '), n('4444 = '), n('7777')],
    // Card prints all one ink — entire equation is **one** suit (not suit-permute).
    groups: [
      { kind: 'fixed', need: 2, test: flower },
      {
        kind: 'suit-locked',
        rankNeeds: [
          { rank: 3, need: 4 },
          { rank: 4, need: 4 },
          { rank: 7, need: 4 },
        ],
        dragonCount: 0,
      },
    ],
    matches: or(flower, suit(3, 4, 7)),
  },
  {
    id: 'math-3b', section: 'MATH', points: 25, closed: false, roughTarget: 14,
    title: 'FF 3333 + 4444 = 7777',
    titleSegments: [fl('FF '), r('3333 + '), g('4444 = '), g('7777')],
    // Two inks: red (3333) = suit A, green (4444 + 7777) = suit B.
    groups: [
      { kind: 'fixed', need: 2, test: flower },
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 3, need: 4, canUseJoker: true }],
          [{ rank: 4, need: 4, canUseJoker: true }, { rank: 7, need: 4, canUseJoker: true }],
        ],
      },
    ],
    matches: or(flower, suit(3, 4, 7)),
  },
  {
    id: 'math-4a', section: 'MATH', points: 25, closed: false, roughTarget: 14,
    title: 'FFFF 5555 + 6666 = 11',
    titleSegments: [fl('FFFF '), n('5555 + '), n('6666 '), sp('= '), n('11')],
    // All one ink on the card — 5s, 6s, and pair of 1s share **one** suit (`suit-locked`).
    groups: [
      { kind: 'fixed', need: 4, test: flower },
      {
        kind: 'suit-locked',
        rankNeeds: [
          { rank: 5, need: 4 },
          { rank: 6, need: 4 },
          { rank: 1, need: 2 },
        ],
        dragonCount: 0,
      },
    ],
    matches: or(flower, suit(5, 6, 1)),
  },
  {
    id: 'math-4b', section: 'MATH', points: 25, closed: false, roughTarget: 14,
    title: 'FFFF 5555 + 6666 = 11',
    titleSegments: [fl('FFFF '), r('5555 + '), g('6666 '), sp('= '), n('11')],
    // Three inks ⇒ three suits: red (5555), green (6666), black “11” = **third** suit (not green’s).
    groups: [
      { kind: 'fixed', need: 4, test: flower },
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 5, need: 4, canUseJoker: true }],
          [{ rank: 6, need: 4, canUseJoker: true }],
          [{ rank: 1, need: 2 }],
        ],
      },
    ],
    matches: or(flower, suit(5, 6, 1)),
  },
  {
    id: 'math-5a', section: 'MATH', points: 25, closed: false, roughTarget: 14,
    title: 'DD 8888 − 3333 = 5555',
    titleSegments: [n('DD '), n('8888 − '), n('3333 '), sp('= '), n('5555')],
    // One suit for all numbers + matching dragon pair (dot→soap, bam→green, crak→red).
    groups: [
      {
        kind: 'suit-locked',
        rankNeeds: [
          { rank: 8, need: 4 },
          { rank: 3, need: 4 },
          { rank: 5, need: 4 },
        ],
        dragonCount: 2,
        dragonsFirst: true,
      },
    ],
    matches: or(dragon, suit(8, 3, 5)),
  },
  {
    id: 'math-5b', section: 'MATH', points: 25, closed: false, roughTarget: 14,
    title: 'DD 8888 − 3333 = 5555',
    titleSegments: [n('DD '), r('8888 − '), g('3333 '), sp('= '), n('5555')],
    // Three inks: red (8888), green (3333), black “=5555” sum in a **third** suit (not red’s 5s).
    groups: [
      { kind: 'rank', need: 2, test: dragon },
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 8, need: 4, canUseJoker: true }],
          [{ rank: 3, need: 4, canUseJoker: true }],
          [{ rank: 5, need: 4, canUseJoker: true }],
        ],
      },
    ],
    matches: or(dragon, suit(8, 3, 5)),
  },
  {
    id: 'math-6', section: 'MATH', points: 30, closed: true, roughTarget: 14,
    title: '333 + 444 − 555 − 222 = 00',
    titleSegments: [n('333 + 444 − 555 − 222 '), sp('= '), n('00')],
    // Card: entire equation in ONE ink = all same suit.
    // "= 00" means soap dragons, which locks the suit to dot (bam→green, dot→soap, crak→red).
    // Pungs can use jokers; the dragon pair cannot.
    groups: [
      {
        kind: 'suit-locked',
        rankNeeds: [
          { rank: 3, need: 3 },
          { rank: 4, need: 3 },
          { rank: 5, need: 3 },
          { rank: 2, need: 3 },
        ],
        dragonCount: 2,
      },
    ],
    matches: or(suit(3, 4, 5, 2), soapDrg),
  },

  // ═══════════════════════════════════════════════════════════════ QUINTS ═════

  {
    id: 'quint-1', section: 'QUINTS', points: 40, closed: false, roughTarget: 14,
    title: '11111 2222 333 44 (any 4 consec.)',
    titleSegments: [n('11111 2222 333 44')],
    // 4 consecutive ranks: 5 of rank N, 4 of N+1, 3 of N+2, 2 of N+3
    groups: [
      { kind: 'suit-locked-consec-multi', needs: [5, 4, 3, 2], test: anySuit },
    ],
    matches: anySuit,
  },
  {
    id: 'quint-2', section: 'QUINTS', points: 45, closed: false, roughTarget: 14,
    title: 'FFFFF DDDDD 1111 (any #)',
    titleSegments: [fl('FFFFF '), n('DDDDD '), n('1111')],
    // 5 flowers + 5 suit-matched dragons + 4 suit tiles of best rank (all same suit).
    groups: [
      { kind: 'fixed', need: 5, test: flower },
      { kind: 'suit-locked-rank', need: 4, test: anySuit, dragonCount: 5, dragonsFirst: true },
    ],
    matches: or(flower, dragon, anySuit),
  },
  {
    id: 'quint-3', section: 'QUINTS', points: 40, closed: false, roughTarget: 14,
    title: '11111 3333 555 DD',
    titleSegments: [n('11111 3333 555 '), n('DD')],
    // All one color = all one suit + matching dragon pair
    groups: [
      { kind: 'suit-locked', rankNeeds: [{rank:1,need:5},{rank:3,need:4},{rank:5,need:3}], dragonCount: 2 },
    ],
    matches: or(suit(1, 3, 5), dragon),
  },
  {
    id: 'quint-4', section: 'QUINTS', points: 40, closed: false, roughTarget: 14,
    title: '55555 7777 999 DD',
    titleSegments: [n('55555 7777 999 '), n('DD')],
    // All one color = all one suit + matching dragon pair
    groups: [
      { kind: 'suit-locked', rankNeeds: [{rank:5,need:5},{rank:7,need:4},{rank:9,need:3}], dragonCount: 2 },
    ],
    matches: or(suit(5, 7, 9), dragon),
  },
  {
    id: 'quint-5a', section: 'QUINTS', points: 35, closed: false, roughTarget: 14,
    title: 'FFFFF 33 666 9999',
    titleSegments: [fl('FFFFF '), n('33 666 9999')],
    // 5 flowers + all numbers one suit
    groups: [
      { kind: 'fixed',       need: 5, test: flower },
      { kind: 'suit-locked', rankNeeds: [{rank:3,need:2},{rank:6,need:3},{rank:9,need:4}], dragonCount: 0 },
    ],
    matches: or(flower, suit(3, 6, 9)),
  },
  {
    id: 'quint-5b', section: 'QUINTS', points: 35, closed: false, roughTarget: 14,
    title: 'FFFFF 33 666 9999',
    titleSegments: [fl('FFFFF '), r('33 '), g('666 '), n('9999')],
    // Card: three inks — 3 / 6 / 9 each in a **different** suit (unlike 5a, one suit).
    groups: [
      { kind: 'fixed', need: 5, test: flower },
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 3, need: 2 }],
          [{ rank: 6, need: 3, canUseJoker: true }],
          [{ rank: 9, need: 4, canUseJoker: true }],
        ],
      },
    ],
    matches: or(flower, suit(3, 6, 9)),
  },

  // ══════════════════════════════════════════════════ CONSECUTIVE RUNS ════════

  {
    id: 'consec-1', section: 'CONSECUTIVE RUNS', points: 25, closed: false, roughTarget: 14,
    title: '11 22 333 444 5555',
    titleSegments: [n('11 22 333 444 5555')],
    // All one color = all one suit; printed ranks are consecutive-run offsets.
    groups: [
      { kind: 'suit-locked-consec-multi', needs: [2, 2, 3, 3, 4], test: anySuit },
    ],
    matches: anySuit,
  },
  {
    id: 'consec-2', section: 'CONSECUTIVE RUNS', points: 25, closed: false, roughTarget: 14,
    title: '55 66 777 888 9999',
    titleSegments: [n('55 66 777 888 9999')],
    // All one color = all one suit; printed ranks are consecutive-run offsets.
    groups: [
      { kind: 'suit-locked-consec-multi', needs: [2, 2, 3, 3, 4], test: anySuit },
    ],
    matches: anySuit,
  },
  {
    id: 'consec-3', section: 'CONSECUTIVE RUNS', points: 25, closed: false, roughTarget: 14,
    title: '11 2222 3333 4444',
    titleSegments: [n('11 2222 3333 4444')],
    // Card: entire line one ink = all one suit; printed ranks are consecutive-run offsets.
    // Pair (first rank) no joker; kongs can use jokers.
    groups: [
      { kind: 'suit-locked-consec-multi', needs: [2, 4, 4, 4], test: anySuit },
    ],
    matches: anySuit,
  },
  {
    id: 'consec-4', section: 'CONSECUTIVE RUNS', points: 25, closed: false, roughTarget: 14,
    title: '1111 222 3333 DDD',
    titleSegments: [r('1111 222 '), g('3333 DDD')],
    // Two card colors = two suits. Red slot: N×4 + (N+1)×3.
    // Green slot: (N+2)×4 + 3 matching dragons.
    // Dragons MUST match the green suit's chosen tile type (bam→green, dot→soap, crak→red).
    groups: [
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 1, need: 4, canUseJoker: true }, { rank: 2, need: 3, canUseJoker: true }],
          [{ rank: 3, need: 4, canUseJoker: true }],
        ],
        colorGroupDragonCounts: [0, 3],
        consecRanks: true,
      },
    ],
    matches: or(anySuit, dragon),
  },
  {
    id: 'consec-5', section: 'CONSECUTIVE RUNS', points: 25, closed: false, roughTarget: 14,
    title: 'FFF 1111 2222 DDD',
    titleSegments: [fl('FFF '), r('1111 '), g('2222 '), n('DDD')],
    // Card: 1111 red (suit A, any rank N); 2222 green (suit B, rank N+1); DDD = third suit dragon.
    // consecRanks: true means rank values are 1-indexed offsets — the matcher finds the best base N.
    groups: [
      { kind: 'fixed', need: 3, test: flower },
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 1, need: 4, canUseJoker: true }],
          [{ rank: 2, need: 4, canUseJoker: true }],
        ],
        trailingDragonCount: 3,
        consecRanks: true,
      },
    ],
    matches: or(flower, anySuit, dragon),
  },
  {
    id: 'consec-6', section: 'CONSECUTIVE RUNS', points: 30, closed: false, roughTarget: 14,
    title: '1111 22 22 22 3333',
    titleSegments: [n('1111 '), r('22 '), n('22 '), g('22 '), n('3333')],
    // Card: outer NNNN/(N+2)×4 + middle (N+1) pairs in all three suits.
    groups: [
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 1, need: 4, canUseJoker: true }, { rank: 2, need: 2 }, { rank: 3, need: 4, canUseJoker: true }],
          [{ rank: 2, need: 2 }],
          [{ rank: 2, need: 2 }],
        ],
        consecRanks: true,
      },
    ],
    matches: anySuit,
  },
  {
    id: 'consec-7', section: 'CONSECUTIVE RUNS', points: 30, closed: false, roughTarget: 14,
    title: 'FF 11 222 33 444 DD',
    titleSegments: [fl('FF '), r('11 222 '), g('33 444 '), n('DD')],
    // 2 flowers; red slot (suit A): NN+(N+1)×3; green slot (suit B): (N+2) pair+(N+3)×3;
    // DD = opposing/third suit dragon.
    groups: [
      { kind: 'fixed', need: 2, test: flower },
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 1, need: 2 }, { rank: 2, need: 3, canUseJoker: true }],
          [{ rank: 3, need: 2 }, { rank: 4, need: 3, canUseJoker: true }],
        ],
        trailingDragonCount: 2,
        consecRanks: true,
      },
    ],
    matches: or(flower, anySuit, dragon),
  },
  {
    id: 'consec-8', section: 'CONSECUTIVE RUNS', points: 30, closed: true, roughTarget: 14,
    title: '111 22 333 DDD DDD',
    titleSegments: [r('111 22 333 '), g('DDD '), n('DDD')],
    // Numbers in one suit (red ink); the two colored "DDD" groups are the two OPPOSING dragons
    // to whatever suit the numbers use — not hardcoded green/soap. The card uses abstract color
    // slots: whichever suit wins, the other two dragon types fill the two DDD groups.
    groups: [
      {
        kind: 'suit-locked',
        rankNeeds: [{ rank: 1, need: 3 }, { rank: 2, need: 2 }, { rank: 3, need: 3 }],
        dragonCount: 0,
        opposingDragons: { need: 3 },
      },
    ],
    matches: or(suit(1, 2, 3), dragon),
  },

  // ═══════════════════════════════════════════════════════════════ 13579 ══════

  {
    id: '13579-1a', section: '13579', points: 25, closed: false, roughTarget: 14,
    title: '11 333 5555 777 99',
    titleSegments: [n('11 333 5555 777 99')],
    // All one color = all one suit
    groups: [
      { kind: 'suit-locked', rankNeeds: [{rank:1,need:2},{rank:3,need:3},{rank:5,need:4},{rank:7,need:3},{rank:9,need:2}], dragonCount: 0 },
    ],
    matches: suit(1, 3, 5, 7, 9),
  },
  {
    id: '13579-1b', section: '13579', points: 25, closed: false, roughTarget: 14,
    title: '11 333 5555 777 99',
    titleSegments: [n('11 333 '), g('5555 '), n('777 99')],
    // Two inks: navy (11 333 777 99 = suit A) and green (5555 = suit B).
    groups: [
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 1, need: 2 }, { rank: 3, need: 3, canUseJoker: true }, { rank: 7, need: 3, canUseJoker: true }, { rank: 9, need: 2 }],
          [{ rank: 5, need: 4, canUseJoker: true }],
        ],
      },
    ],
    matches: suit(1, 3, 5, 7, 9),
  },
  {
    id: '13579-2', section: '13579', points: 25, closed: false, roughTarget: 14,
    title: '1111 3333 333 555',
    titleSegments: [r('1111 3333 '), g('333 555')],
    // Card: 1111 3333 red; 333 555 green.
    groups: [
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 1, need: 4, canUseJoker: true }, { rank: 3, need: 3, canUseJoker: true }],
          [{ rank: 3, need: 4, canUseJoker: true }, { rank: 5, need: 3, canUseJoker: true }],
        ],
      },
    ],
    matches: suit(1, 3, 5),
  },
  {
    id: '13579-3', section: '13579', points: 25, closed: false, roughTarget: 14,
    title: '5555 7777 777 999',
    titleSegments: [r('5555 7777 '), g('777 999')],
    // Card: 5555 7777 red; 777 999 green.
    groups: [
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 5, need: 4, canUseJoker: true }, { rank: 7, need: 3, canUseJoker: true }],
          [{ rank: 7, need: 4, canUseJoker: true }, { rank: 9, need: 3, canUseJoker: true }],
        ],
      },
    ],
    matches: suit(5, 7, 9),
  },
  {
    id: '13579-4', section: '13579', points: 25, closed: false, roughTarget: 14,
    title: '1111 333 5555 DDD',
    titleSegments: [r('1111 333 '), g('5555 DDD')],
    // Card: 1111 333 red (suit A); 5555 + DDD green (suit B, dragon matches suit B). Two distinct suits.
    groups: [
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 1, need: 4, canUseJoker: true }, { rank: 3, need: 3, canUseJoker: true }],
          [{ rank: 5, need: 4, canUseJoker: true }],
        ],
        colorGroupDragonCounts: [0, 3],
      },
    ],
    matches: or(suit(1, 3, 5), dragon),
  },
  {
    id: '13579-5', section: '13579', points: 25, closed: false, roughTarget: 14,
    title: '5555 777 9999 DDD',
    titleSegments: [r('5555 777 '), g('9999 DDD')],
    // Card: 5555 777 red (suit A); 9999 + DDD green (suit B, dragon matches suit B). Two distinct suits.
    groups: [
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 5, need: 4, canUseJoker: true }, { rank: 7, need: 3, canUseJoker: true }],
          [{ rank: 9, need: 4, canUseJoker: true }],
        ],
        colorGroupDragonCounts: [0, 3],
      },
    ],
    matches: or(suit(5, 7, 9), dragon),
  },
  {
    id: '13579-6', section: '13579', points: 25, closed: false, roughTarget: 14,
    title: '11 333 DDDD 333 55',
    titleSegments: [r('11 333 '), g('DDDD '), n('333 55')],
    // Three color slots in card order: red(11+333) | green(DDDD) | navy(333+55).
    // Middle group has no rank tiles — only 4 dragons matching the green slot's assigned suit.
    groups: [
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 1, need: 2 }, { rank: 3, need: 3, canUseJoker: true }],
          [],
          [{ rank: 3, need: 3, canUseJoker: true }, { rank: 5, need: 2 }],
        ],
        colorGroupDragonCounts: [0, 4, 0],
      },
    ],
    matches: or(suit(1, 3, 5), dragon),
  },
  {
    id: '13579-7', section: '13579', points: 25, closed: false, roughTarget: 14,
    title: '55 777 DDDD 777 99',
    titleSegments: [r('55 777 '), g('DDDD '), n('777 99')],
    // Three color slots in card order: red(55+777) | green(DDDD) | navy(777+99).
    // Middle group has no rank tiles — only 4 dragons matching the green slot's assigned suit.
    groups: [
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 5, need: 2 }, { rank: 7, need: 3, canUseJoker: true }],
          [],
          [{ rank: 7, need: 3, canUseJoker: true }, { rank: 9, need: 2 }],
        ],
        colorGroupDragonCounts: [0, 4, 0],
      },
    ],
    matches: or(suit(5, 7, 9), dragon),
  },
  {
    id: '13579-8', section: '13579', points: 30, closed: false, roughTarget: 14,
    title: '11 33 55 7777 9999',
    titleSegments: [r('11 33 55 '), g('7777 '), n('9999')],
    // Card: low triple pairs red; 7777 green; 9999 navy.
    groups: [
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 1, need: 2 }, { rank: 3, need: 2 }, { rank: 5, need: 2 }],
          [{ rank: 7, need: 4, canUseJoker: true }],
          [{ rank: 9, need: 4, canUseJoker: true }],
        ],
      },
    ],
    matches: suit(1, 3, 5, 7, 9),
  },
  {
    id: '13579-9', section: '13579', points: 30, closed: true, roughTarget: 14,
    title: '111 3333 555 N E W S',
    titleSegments: [r('111 '), g('3333 '), n('555 N E W S')],
    // Three card digit colors = three distinct suits (NMJL suit slots), + one of each wind.
    groups: [
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 1, need: 3, canUseJoker: true }],
          [{ rank: 3, need: 4, canUseJoker: true }],
          [{ rank: 5, need: 3, canUseJoker: true }],
        ],
      },
      { kind: 'fixed', need: 1, test: northW },
      { kind: 'fixed', need: 1, test: eastW },
      { kind: 'fixed', need: 1, test: westW },
      { kind: 'fixed', need: 1, test: southW },
    ],
    matches: or(suit(1, 3, 5), wind),
  },
  {
    id: '13579-10', section: '13579', points: 30, closed: true, roughTarget: 14,
    title: '555 7777 999 N E W S',
    titleSegments: [r('555 '), g('7777 '), n('999 N E W S')],
    // Three card digit colors = three distinct suits, + one of each wind.
    groups: [
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 5, need: 3, canUseJoker: true }],
          [{ rank: 7, need: 4, canUseJoker: true }],
          [{ rank: 9, need: 3, canUseJoker: true }],
        ],
      },
      { kind: 'fixed', need: 1, test: northW },
      { kind: 'fixed', need: 1, test: eastW },
      { kind: 'fixed', need: 1, test: westW },
      { kind: 'fixed', need: 1, test: southW },
    ],
    matches: or(suit(5, 7, 9), wind),
  },

  // ══════════════════════════════════════════════════ WINDS-DRAGONS ═══════════

  {
    id: 'wd-1', section: 'WINDS-DRAGONS', points: 25, closed: false, roughTarget: 14,
    title: 'NNNN EEE WWW SSSS',
    titleSegments: [n('NNNN EEE WWW SSSS')],
    groups: [
      { kind: 'fixed', need: 4, test: northW },
      { kind: 'fixed', need: 3, test: eastW },
      { kind: 'fixed', need: 3, test: westW },
      { kind: 'fixed', need: 4, test: southW },
    ],
    matches: wind,
  },
  {
    id: 'wd-2', section: 'WINDS-DRAGONS', points: 25, closed: false, roughTarget: 14,
    title: 'FF DDDD N E W S DDDD (any 2 drag.)',
    titleSegments: [fl('FF '), r('DDDD '), n('N E W S '), g('DDDD')],
    // 2 flowers + two different dragon kongs (any types) + one each wind
    groups: [
      { kind: 'fixed', need: 2, test: flower },
      { kind: 'rank',  need: 4, test: dragon },
      { kind: 'rank',  need: 4, test: dragon },
      { kind: 'fixed', need: 1, test: northW },
      { kind: 'fixed', need: 1, test: eastW },
      { kind: 'fixed', need: 1, test: westW },
      { kind: 'fixed', need: 1, test: southW },
    ],
    matches: or(flower, dragon, wind),
  },
  {
    id: 'wd-3', section: 'WINDS-DRAGONS', points: 25, closed: false, roughTarget: 14,
    title: 'FFFF NNNN RR SSSS (red drag.)',
    titleSegments: [fl('FFFF '), n('NNNN '), r('RR '), n('SSSS')],
    // 4 flowers + 4 North + 2 red dragons + 4 South
    groups: [
      { kind: 'fixed', need: 4, test: flower },
      { kind: 'fixed', need: 4, test: northW },
      { kind: 'fixed', need: 2, test: redDrg },
      { kind: 'fixed', need: 4, test: southW },
    ],
    matches: or(flower, northW, southW, redDrg),
  },
  {
    id: 'wd-4', section: 'WINDS-DRAGONS', points: 25, closed: false, roughTarget: 14,
    title: 'FFFF EEEE GG WWWW (green drag.)',
    titleSegments: [fl('FFFF '), n('EEEE '), g('GG '), n('WWWW')],
    // 4 flowers + 4 East + 2 green dragons + 4 West
    groups: [
      { kind: 'fixed', need: 4, test: flower },
      { kind: 'fixed', need: 4, test: eastW },
      { kind: 'fixed', need: 2, test: grnDrg },
      { kind: 'fixed', need: 4, test: westW },
    ],
    matches: or(flower, eastW, westW, grnDrg),
  },
  {
    id: 'wd-5', section: 'WINDS-DRAGONS', points: 25, closed: false, roughTarget: 14,
    title: 'FFFF N EE WWW SSSS',
    titleSegments: [fl('FFFF '), n('N EE WWW SSSS')],
    // 4 flowers + winds in ascending counts (1 N, 2 E, 3 W, 4 S)
    groups: [
      { kind: 'fixed', need: 4, test: flower },
      { kind: 'fixed', need: 1, test: northW },
      { kind: 'fixed', need: 2, test: eastW },
      { kind: 'fixed', need: 3, test: westW },
      { kind: 'fixed', need: 4, test: southW },
    ],
    matches: or(flower, wind),
  },
  {
    id: 'wd-6', section: 'WINDS-DRAGONS', points: 30, closed: false, roughTarget: 14,
    title: 'FF NN 1111 2222 SS (consec.)',
    titleSegments: [fl('FF '), n('NN '), r('1111 '), g('2222 '), n('SS')],
    // 2 flowers + 2 N + consecutive pair (4+4) + 2 S
    groups: [
      { kind: 'fixed',  need: 2,           test: flower },
      { kind: 'fixed',  need: 2,           test: northW },
      // Card inks differ by suit — arm1 and arm2 must use different suits.
      { kind: 'consec', need1: 4, need2: 4, test: anySuit, opposingSuits: true },
      { kind: 'fixed',  need: 2,           test: southW },
    ],
    matches: or(flower, northW, southW, anySuit),
  },
  {
    id: 'wd-7', section: 'WINDS-DRAGONS', points: 30, closed: false, roughTarget: 14,
    title: 'FF EE 1111 2222 WW (consec.)',
    titleSegments: [fl('FF '), n('EE '), r('1111 '), g('2222 '), n('WW')],
    // 2 flowers + 2 E + consecutive pair (4+4) + 2 W
    groups: [
      { kind: 'fixed',  need: 2,           test: flower },
      { kind: 'fixed',  need: 2,           test: eastW },
      // Card inks differ by suit — arm1 and arm2 must use different suits.
      { kind: 'consec', need1: 4, need2: 4, test: anySuit, opposingSuits: true },
      { kind: 'fixed',  need: 2,           test: westW },
    ],
    matches: or(flower, eastW, westW, anySuit),
  },
  {
    id: 'wd-8', section: 'WINDS-DRAGONS', points: 30, closed: false, roughTarget: 14,
    title: 'NNNN DD DD DD SSSS',
    titleSegments: [n('NNNN '), r('DD '), n('DD '), g('DD '), n('SSSS')],
    // 4 North + one pair each of red/green/soap dragon + 4 South
    groups: [
      { kind: 'fixed', need: 4, test: northW },
      { kind: 'fixed', need: 2, test: redDrg },
      { kind: 'fixed', need: 2, test: grnDrg },
      { kind: 'fixed', need: 2, test: soapDrg },
      { kind: 'fixed', need: 4, test: southW },
    ],
    matches: or(northW, southW, dragon),
  },
  {
    id: 'wd-9', section: 'WINDS-DRAGONS', points: 30, closed: false, roughTarget: 14,
    title: 'EEEE DD DD DD WWWW',
    titleSegments: [n('EEEE '), r('DD '), n('DD '), g('DD '), n('WWWW')],
    // 4 East + one pair each of red/green/soap dragon + 4 West
    groups: [
      { kind: 'fixed', need: 4, test: eastW },
      { kind: 'fixed', need: 2, test: redDrg },
      { kind: 'fixed', need: 2, test: grnDrg },
      { kind: 'fixed', need: 2, test: soapDrg },
      { kind: 'fixed', need: 4, test: westW },
    ],
    matches: or(eastW, westW, dragon),
  },
  {
    id: 'wd-10', section: 'WINDS-DRAGONS', points: 30, closed: true, roughTarget: 14,
    title: 'NN 111 1111 111 SS (like #s)',
    titleSegments: [n('NN '), r('111 '), n('1111 '), g('111 '), n('SS')],
    // 2 N + 10 suit tiles of same odd rank (3+4+3) + 2 S
    groups: [
      { kind: 'fixed',       need: 2,         test: northW },
      { kind: 'shared-rank-suits', needs: [3,4,3],  test: suit(1,3,5,7,9) },
      { kind: 'fixed',       need: 2,         test: southW },
    ],
    matches: or(northW, southW, anySuit),
  },
  {
    id: 'wd-11', section: 'WINDS-DRAGONS', points: 30, closed: true, roughTarget: 14,
    title: 'EE 222 2222 222 WW (like #s)',
    titleSegments: [n('EE '), r('222 '), n('2222 '), g('222 '), n('WW')],
    // 2 E + 10 suit tiles of same even rank (3+4+3) + 2 W
    groups: [
      { kind: 'fixed',       need: 2,         test: eastW },
      { kind: 'shared-rank-suits', needs: [3,4,3],  test: suit(2,4,6,8) },
      { kind: 'fixed',       need: 2,         test: westW },
    ],
    matches: or(eastW, westW, anySuit),
  },

  // ═══════════════════════════════════════════════════════════════ 369 ════════

  {
    id: '369-1', section: '369', points: 25, closed: false, roughTarget: 14,
    title: '33 666 333 66 9999',
    // 3 suits: red (33+666), green (333+66), navy/black (9999) — exactly as printed on card
    titleSegments: [r('33 '), r('666 '), g('333 '), g('66 '), n('9999')],
    groups: [
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 3, need: 2 }, { rank: 6, need: 3, canUseJoker: true }],  // suit A (red)
          [{ rank: 3, need: 3, canUseJoker: true }, { rank: 6, need: 2 }],  // suit B (green)
          [{ rank: 9, need: 4, canUseJoker: true }],                        // suit C (navy)
        ],
      },
    ],
    matches: suit(3, 6, 9),
  },
  {
    id: '369-2', section: '369', points: 25, closed: false, roughTarget: 14,
    title: 'FFFF 33 666 99 DDD',
    titleSegments: [fl('FFFF '), n('33 666 99 '), n('DDD')],
    // All numbers AND the dragon pung must be the same suit
    // (bam→green dragon, dot→soap dragon, crak→red dragon)
    groups: [
      { kind: 'fixed',       need: 4, test: flower },
      { kind: 'suit-locked', rankNeeds: [{rank:3,need:2},{rank:6,need:3},{rank:9,need:2}], dragonCount: 3 },
    ],
    matches: or(flower, suit(3, 6, 9), dragon),
  },
  {
    id: '369-3', section: '369', points: 25, closed: false, roughTarget: 14,
    title: '3333 66 9999 DDDD',
    titleSegments: [n('3333 66 9999 '), n('DDDD')],
    // All same suit + matching dragon kong
    groups: [
      { kind: 'suit-locked', rankNeeds: [{rank:3,need:4},{rank:6,need:2},{rank:9,need:4}], dragonCount: 4 },
    ],
    matches: or(suit(3, 6, 9), dragon),
  },
  {
    id: '369-4a', section: '369', points: 25, closed: false, roughTarget: 14,
    title: 'FF 3333 6666 9999',
    titleSegments: [fl('FF '), n('3333 6666 9999')],
    // 2 flowers + all kongs of 3, 6, 9 in the same suit
    groups: [
      { kind: 'fixed',       need: 2, test: flower },
      { kind: 'suit-locked', rankNeeds: [{rank:3,need:4},{rank:6,need:4},{rank:9,need:4}], dragonCount: 0 },
    ],
    matches: or(flower, suit(3, 6, 9)),
  },
  {
    id: '369-4b', section: '369', points: 25, closed: false, roughTarget: 14,
    title: 'FF 3333 6666 9999',
    titleSegments: [fl('FF '), r('3333 '), g('6666 '), n('9999')],
    // Card: 3333 red (suit A); 6666 green (suit B); 9999 navy (suit C). Three distinct suits.
    groups: [
      { kind: 'fixed', need: 2, test: flower },
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 3, need: 4, canUseJoker: true }],
          [{ rank: 6, need: 4, canUseJoker: true }],
          [{ rank: 9, need: 4, canUseJoker: true }],
        ],
      },
    ],
    matches: or(flower, suit(3, 6, 9)),
  },
  {
    id: '369-5', section: '369', points: 30, closed: false, roughTarget: 14,
    title: 'FF 33 66 99 DDD DDD',
    titleSegments: [fl('FF '), r('33 66 99 '), g('DDD '), n('DDD')],
    // Numbers all same suit; the two dragon pungs are the TWO NON-MATCHING types
    // e.g. dots → soap excluded → use red + green
    groups: [
      { kind: 'fixed',       need: 2, test: flower },
      { kind: 'suit-locked', rankNeeds: [{rank:3,need:2},{rank:6,need:2},{rank:9,need:2}], dragonCount: 0, opposingDragons: { need: 3 } },
    ],
    matches: or(flower, suit(3, 6, 9), dragon),
  },
  {
    id: '369-6', section: '369', points: 35, closed: true, roughTarget: 14,
    title: 'FF 3 66 999 3 66 999',
    titleSegments: [fl('FF '), r('3 66 999 '), g('3 66 999')],
    // Two groups of (3,66,999) in different suits
    groups: [
      { kind: 'fixed', need: 2, test: flower },
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 3, need: 1 }, { rank: 6, need: 2 }, { rank: 9, need: 3 }],
          [{ rank: 3, need: 1 }, { rank: 6, need: 2 }, { rank: 9, need: 3 }],
        ],
      },
    ],
    matches: or(flower, suit(3, 6, 9)),
  },

  // ══════════════════════════════════════════════════ SINGLES AND PAIRS ═══════

  {
    id: 'sp-1', section: 'SINGLES AND PAIRS', points: 50, closed: true, roughTarget: 14,
    title: 'NN EE WW SS 11 11 11 (like #s)',
    titleSegments: [n('NN EE WW SS '), r('11 '), g('11 '), n('11')],
    // 2 each of all 4 winds + 3 pairs of suit tiles all sharing one rank
    groups: [
      { kind: 'fixed',       need: 2,        test: northW },
      { kind: 'fixed',       need: 2,        test: eastW },
      { kind: 'fixed',       need: 2,        test: westW },
      { kind: 'fixed',       need: 2,        test: southW },
      { kind: 'shared-rank-suits', needs: [2,2,2], test: anySuit },
    ],
    matches: or(wind, anySuit),
  },
  {
    id: 'sp-2', section: 'SINGLES AND PAIRS', points: 50, closed: true, roughTarget: 14,
    title: 'FF 11 33 55 77 99 DD',
    titleSegments: [fl('FF '), n('11 33 55 77 99 '), n('DD')],
    // All five odd pairs AND the dragon pair must share one suit
    // (bam→green dragon, dot→soap dragon, crak→red dragon).  No jokers in pairs.
    groups: [
      { kind: 'fixed',       need: 2,  test: flower },
      { kind: 'suit-locked', rankNeeds: [{rank:1,need:2},{rank:3,need:2},{rank:5,need:2},{rank:7,need:2},{rank:9,need:2}], dragonCount: 2 },
    ],
    matches: or(flower, suit(1, 3, 5, 7, 9), dragon),
  },
  {
    id: 'sp-3', section: 'SINGLES AND PAIRS', points: 50, closed: true, roughTarget: 14,
    title: '11 22 33 44 55 66 DD (consec.)',
    titleSegments: [n('11 22 33 44 55 66 '), n('DD')],
    // All 6 consecutive pairs must be the same suit; dragon pair must match that suit.
    // (bam→green, dot→soap, crak→red). No jokers in pairs.
    groups: [
      { kind: 'suit-locked-consec', numGroups: 6, rankCount: 2, dragonCount: 2 },
    ],
    matches: or(anySuit, dragon),
  },
  {
    id: 'sp-4', section: 'SINGLES AND PAIRS', points: 50, closed: true, roughTarget: 14,
    title: 'FF 2 4 66 88 22 44 6 8',
    titleSegments: [fl('FF '), r('2 4 66 88 '), g('22 44 6 8')],
    // 2 flowers + navy (2,4,66,88) = suit A + green (22,44,6,8) = suit B.  No jokers in singles/pairs.
    groups: [
      { kind: 'fixed', need: 2, test: flower },
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 2, need: 1 }, { rank: 4, need: 1 }, { rank: 6, need: 2 }, { rank: 8, need: 2 }],
          [{ rank: 2, need: 2 }, { rank: 4, need: 2 }, { rank: 6, need: 1 }, { rank: 8, need: 1 }],
        ],
      },
    ],
    matches: or(flower, suit(2, 4, 6, 8)),
  },
  {
    id: 'sp-5', section: 'SINGLES AND PAIRS', points: 50, closed: true, roughTarget: 14,
    title: '3 66 3 66 99 33 66 99',
    titleSegments: [r('3 66 '), g('3 66 99 '), n('33 66 99')],
    // Navy: rank3:1+rank6:2 = suit A.  Green: rank3:1+rank6:2+rank9:2 = suit B.  Red: rank3:2+rank6:2+rank9:2 = suit C.
    groups: [
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 3, need: 1 }, { rank: 6, need: 2 }],
          [{ rank: 3, need: 1 }, { rank: 6, need: 2 }, { rank: 9, need: 2 }],
          [{ rank: 3, need: 2 }, { rank: 6, need: 2 }, { rank: 9, need: 2 }],
        ],
      },
    ],
    matches: suit(3, 6, 9),
  },
  {
    id: 'sp-6', section: 'SINGLES AND PAIRS', points: 60, closed: true, roughTarget: 14,
    title: 'FF 11 22 33 DD DD DD (consec.)',
    titleSegments: [fl('FF '), n('11 22 33 '), r('DD '), g('DD '), so('DD')],
    // 2 flowers + 3 consecutive rank pairs + one pair each of red/green/soap dragon
    groups: [
      { kind: 'fixed',        need: 2,       test: flower },
      { kind: 'suit-locked-consec-multi', needs: [2, 2, 2], test: anySuit },
      { kind: 'fixed',        need: 2,       test: redDrg },
      { kind: 'fixed',        need: 2,       test: grnDrg },
      { kind: 'fixed',        need: 2,       test: soapDrg },
    ],
    matches: or(flower, anySuit, dragon),
  },
  {
    id: 'sp-7', section: 'SINGLES AND PAIRS', points: 75, closed: true, roughTarget: 14,
    title: 'FF D 1 2 3  D 1 2 3  D 1 2 3',
    titleSegments: [fl('FF '), r('D 1 2 3 '), g('D 1 2 3 '), n('D 1 2 3')],
    // 2 flowers + three color slots, each with a suit-matched dragon and singles 1/2/3.
    groups: [
      { kind: 'fixed', need: 2, test: flower },
      {
        kind: 'suit-permute',
        colorGroups: [
          [{ rank: 1, need: 1 }, { rank: 2, need: 1 }, { rank: 3, need: 1 }],
          [{ rank: 1, need: 1 }, { rank: 2, need: 1 }, { rank: 3, need: 1 }],
          [{ rank: 1, need: 1 }, { rank: 2, need: 1 }, { rank: 3, need: 1 }],
        ],
        colorGroupDragonCounts: [1, 1, 1],
      },
    ],
    matches: or(flower, dragon, suit(1, 2, 3)),
  },
]

/**
 * Reading order for the practice NMJL card as encoded in `PRACTICE_PATTERNS`:
 * first occurrence of each `section`, top-to-bottom / left-column-first in the source array.
 */
export const PRACTICE_CARD_SECTION_ORDER: readonly string[] = (() => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of PRACTICE_PATTERNS) {
    if (seen.has(p.section)) continue
    seen.add(p.section)
    out.push(p.section)
  }
  return out
})()
