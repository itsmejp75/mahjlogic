export type DeadHandReason =
  | 'call-insufficient-meld'
  | 'invalid-call-meld'
  | 'illegal-mahjong-self-draw'
  | 'illegal-mahjong-call-staged'
  | 'illegal-mahjong-call-discard'
  | 'illegal-mahjong-bot-discard'
  | 'call-exposure-no-line'
  | 'discard-no-line'

export function deadHandExplanation(
  reason: DeadHandReason | null | undefined,
  cardShortLabel: string,
): string {
  switch (reason) {
    case 'call-insufficient-meld':
      return (
        "You attempted to call a tile and didn't have enough tiles to create a valid meld. " +
        'Your hand is dead - the game is over.'
      )
    case 'invalid-call-meld':
      return (
        'You exposed a call meld that was not valid for that discard. ' +
        'Your hand is dead — the game is over.'
      )
    case 'illegal-mahjong-self-draw':
      return (
        `You declared Mah Jongg on a self-draw, but your tiles do not complete any legal hand on the ${cardShortLabel}. ` +
        'Your hand is dead — the game is over.'
      )
    case 'illegal-mahjong-call-staged':
      return (
        `You declared Mah Jongg while calling, but your staged tiles do not complete a legal hand on the ${cardShortLabel}. ` +
        'Your hand is dead — the game is over.'
      )
    case 'illegal-mahjong-call-discard':
      return (
        `You declared Mah Jongg on a called discard, but your hand does not complete any legal hand on the ${cardShortLabel}. ` +
        'Your hand is dead — the game is over.'
      )
    case 'illegal-mahjong-bot-discard':
      return (
        `You declared Mah Jongg on a discard, but your hand does not complete any legal hand on the ${cardShortLabel}. ` +
        'Your hand is dead — the game is over.'
      )
    case 'call-exposure-no-line':
      return (
        `Calling exposed a meld that does not fit any playable hand on the ${cardShortLabel}. ` +
        'Your hand is dead — the game is over.'
      )
    case 'discard-no-line':
      return (
        `Your discard left exposures that do not fit any playable hand on the ${cardShortLabel}. ` +
        'Your hand is dead — the game is over.'
      )
    default:
      return (
        `Your tiles and exposures do not form a legal hand on the ${cardShortLabel}. ` +
        'Your hand is officially dead — the game is over.'
      )
  }
}
