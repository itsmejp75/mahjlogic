/**
 * NMJL 2026 card — league rules summary (teaching / UI). Not a substitute for the official card PDF.
 * Source: league copy provided with `src/card/data/2026-nmjl-card.csv`.
 */

/** 2026-only: in the Year (“2026”) section, 0 (soap) is neutral for color / opposing-suit placement vs #1 and #4. */
export const NMJL_2026_NEUTRAL_ZERO_YEAR_RULE =
  'On the 2026 card only: in the Year section, “0” is neutral — adjoining 2s and 6s may use dots as one of the represented suit colors alongside the white dragons (soap), not only opposing craks and bams.'

export const NMJL_2026_STANDARD_LEGEND = [
  'Standard: eight Flowers and eight Jokers.',
  'Run — any consecutive numbers; Pair — 2 like tiles; Pung — 3; Kong — 4; Quint — 5; Sextet — 6.',
  '1 color — any 1 suit; 2 colors — any 2 suits; 3 colors — any 3 suits.',
  'F — Flower; X — Exposed; P — Concealed; D — Dragon.',
  'Matching dragons: Craks/Reds, Bams/Greens, Dots/Whites (Soaps).',
] as const

export const NMJL_2026_CHARLESTON_RULES = [
  'Charleston: any 3 tiles may be passed except Jokers.',
  'First Charleston (compulsory): right, across, left. May be stopped only after the first left.',
  'Courtesy pass still applies.',
  'Second Charleston (optional): left, across, right.',
  'Blind pass of 1, 2, or 3 tiles allowed on first left and/or last right.',
  'Courtesy pass (optional): 0–3 tiles with player across.',
] as const

export const NMJL_2026_GAMEPLAY_RULES = [
  'Game begins with East discarding a 14th tile. Players to the right pick and discard in turn.',
  'Claiming a discard: only to complete a Pung, Kong, Quint, or Sextet in an exposed hand — not for singles/pairs groupings (e.g. FF, NEWS, 2026) except to declare Mah Jongg.',
  'A discard may not be claimed for exposure or Mah Jongg after the next player in turn has picked and racked or discarded.',
  'A player may change the number and type of tiles in an exposure until that player has discarded.',
] as const

export const NMJL_2026_DEAD_HAND_RULES = [
  'Dead hand: incorrect tile count or incorrect exposure.',
  'A dead player does not pick or discard but pays the winner like other non-winners.',
  'Scores use card values (e.g. X25 exposed 25, c50 concealed 50).',
] as const

export const NMJL_2026_JOKER_RULES = [
  'Discarded Joker — never callable; dead.',
  'Jokers fill tiles in any Pung, Kong, Quint, or Sextet.',
  'Jokers never replace singles (e.g. NEWS, 2026) or any part of a pair.',
  'On your turn, jokers in exposures may be replaced with like naturals.',
  'Jokers may be exchanged from exposures made before a hand was declared dead.',
  'Mah Jongg without a joker — double value from all (exception: Singles and Pairs).',
  'False Mah Jongg — declarer’s hand is dead.',
  'Three dead hands not from false Mah Jongg — surviving player throws in; no payment.',
] as const
