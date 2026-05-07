import type { TileInstance } from '../mahjong/types'
import { charlestonAllowsBlind } from '../mahjong/charleston'
import { rankSuggestedHands } from '../analysis/suggestedHands'
import type { CoachReport, TrainingSnapshot } from './types'

function countJokers(tiles: TileInstance[]) {
  return tiles.filter((t) => t.def.cat === 'joker').length
}

function suggested(snapshot: TrainingSnapshot) {
  return rankSuggestedHands({
    hand: snapshot.hand,
    wallRemaining: snapshot.wallRemaining,
    discards: snapshot.discards,
    exposures: snapshot.exposures,
    playerClaimMelds: snapshot.eastExposures ?? [],
  })
}

/**
 * MahjLogic “XG-style” coach **interface** — stub + heuristics today; rollouts later.
 * `suggestedHands` uses the built-in practice patterns until your NMJL JSON is loaded.
 */
export function analyzeTrainingState(snapshot: TrainingSnapshot): CoachReport {
  const suggestedHands = suggested(snapshot)
  const { hand, passSlots, charlestonPhase, awaitingSecondCharlestonChoice } = snapshot
  const filled = passSlots.filter(Boolean) as TileInstance[]
  const n = filled.length
  const phase = charlestonPhase
  const courtesy = phase === 'courtesy'
  const blindOk = phase != null && charlestonAllowsBlind(phase)

  if (awaitingSecondCharlestonChoice) {
    return {
      headline: 'Continue with the second Charleston?',
      moves: [
        {
          label: 'Second round',
          detail:
            'Choose three tiles to pass for the second left, or leave the pass strip empty and tap Pass to skip the rest of the second Charleston and go to the courtesy pass (NMJL).',
          band: 'unknown',
        },
      ],
      engineMode: 'stub',
      suggestedHands,
    }
  }

  if (n === 0 && courtesy) {
    return {
      headline: 'Courtesy pass: zero tiles (no exchange).',
      moves: [
        {
          label: 'Coach engine',
          detail:
            'NMJL allows 0–3 tiles across on the courtesy pass. Tap Send pass to skip the exchange.',
          band: 'unknown',
        },
      ],
      engineMode: 'stub',
      suggestedHands,
    }
  }

  if (n === 0 && blindOk) {
    return {
      headline: 'Full blind pass — three tiles from the incoming batch.',
      moves: [
        {
          label: 'Blind pass',
          detail:
            'Allowed on first left and second right only. You pass no tiles from your rack; three random tiles from the incoming pass are forwarded.',
          band: 'unknown',
        },
      ],
      engineMode: 'stub',
      suggestedHands,
    }
  }

  if (n === 0) {
    return {
      headline: 'Pick three tiles for this pass.',
      moves: [
        {
          label: 'Coach engine',
          detail:
            'Simulation mode is not on yet. When it is, this panel will rank pass sets like XG ranks moves — with equity gaps and a “best alternative” line.',
          band: 'unknown',
        },
      ],
      engineMode: 'stub',
      suggestedHands,
    }
  }

  if (n < 3 && !courtesy && !blindOk) {
    return {
      headline: `${3 - n} more tile(s) to finish this pass.`,
      moves: [
        {
          label: 'Partial pass',
          detail:
            'Heuristics and rollouts need the full triplet. Finish the pass to log it for later comparison.',
          band: 'unknown',
        },
      ],
      engineMode: 'stub',
      suggestedHands,
    }
  }

  if (n < 3 && blindOk) {
    return {
      headline: `${3 - n} tile(s) blind from incoming — rack + blind = 3.`,
      moves: [
        {
          label: 'Blind pass',
          detail:
            'NMJL: on first left and second right you may forward tiles from the incoming pass without placing them on your rack.',
          band: 'unknown',
        },
      ],
      engineMode: 'stub',
      suggestedHands,
    }
  }

  if (courtesy && n < 3 && n > 0) {
    return {
      headline: `Courtesy pass — ${n} tile(s) across.`,
      moves: [
        {
          label: 'Courtesy size',
          detail:
            'All seats pass the same count. You can pass 0–3; bots match your count at random.',
          band: 'unknown',
        },
      ],
      engineMode: 'stub',
      suggestedHands,
    }
  }

  const moves: CoachReport['moves'] = []
  const jokersKept = countJokers(hand)
  const jokersPassed = countJokers(filled)

  if (jokersPassed > 0) {
    moves.push({
      label: 'Jokers in this pass',
      detail:
        jokersKept >= 2
          ? 'You still hold multiple jokers after this pass — passing one can be fine when you are flooded, but it is usually a red flag in Charleston.'
          : 'Passing a joker in Charleston is almost always expensive. XG-style equity will quantify this once the rollout engine exists.',
      band: jokersKept >= 2 ? 'close' : 'blunder',
    })
  }

  const flowersPassed = filled.filter((t) => t.def.cat === 'flower').length
  if (flowersPassed >= 2) {
    moves.push({
      label: 'Flowers',
      detail:
        'Passing multiple flowers early is uncommon unless you are pivoting hard. The coach will compare against alternative keeps once tile odds are modeled.',
      band: 'inaccuracy',
    })
  }

  if (moves.length === 0) {
    moves.push({
      label: 'Heuristic scan',
      detail:
        'No instant red flags from cheap rules. Next step for “XG-like” depth: simulate thousands of table finishes from this wall + bot priors, score each legal pass triplet.',
      band: 'unknown',
    })
  }

  return {
    headline: 'Pass complete — equity rollout pending.',
    moves,
    engineMode: moves.some((m) => m.band !== 'unknown') ? 'heuristic' : 'stub',
    suggestedHands,
  }
}
