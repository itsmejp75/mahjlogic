import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  durationSecondsSince,
  hasLiveGame,
  resetAnalyticsForTests,
  setAnalyticsUser,
  trackGameAbandonedIfInProgress,
  trackGameEnd,
  trackGameStart,
  trackPageView,
  winnerIdForOutcome,
  winnerKindForOutcome,
} from './analytics'

describe('analytics helpers', () => {
  it('maps outcomes to winner kind and id', () => {
    expect(winnerKindForOutcome('player_win')).toBe('human')
    expect(winnerKindForOutcome('bot_win')).toBe('bot')
    expect(winnerKindForOutcome('wall_game')).toBe('none')
    expect(winnerKindForOutcome('abandoned')).toBe('none')
    expect(winnerIdForOutcome('player_win', { playerId: 'user-abc' })).toBe('user-abc')
    expect(winnerIdForOutcome('player_win')).toBe('human')
    expect(winnerIdForOutcome('bot_win', { botSeat: 'South' })).toBe('bot:south')
    expect(winnerIdForOutcome('bot_win')).toBe('bot')
    expect(winnerIdForOutcome('wall_game')).toBe('none')
  })

  it('rounds duration to whole seconds', () => {
    expect(durationSecondsSince(1_000, 1_000)).toBe(0)
    expect(durationSecondsSince(1_000, 1_499)).toBe(0)
    expect(durationSecondsSince(1_000, 1_500)).toBe(1)
    expect(durationSecondsSince(1_000, 61_000)).toBe(60)
  })
})

describe('game start / end events', () => {
  const gtag = vi.fn()

  beforeEach(() => {
    resetAnalyticsForTests()
    gtag.mockReset()
    vi.stubGlobal('window', {
      gtag,
      location: { origin: 'https://mahjlogic.com', search: '' },
    })
  })

  afterEach(() => {
    resetAnalyticsForTests()
    vi.unstubAllGlobals()
  })

  it('sends game_start and a matching game_end with duration and win fields', () => {
    setAnalyticsUser('user-abc')
    vi.spyOn(Date, 'now').mockReturnValue(10_000)
    trackGameStart({
      roundId: 'r1',
      cardId: 'nmjl-2026',
      botDifficulty: 'standard',
    })
    expect(hasLiveGame()).toBe(true)
    expect(gtag).toHaveBeenCalledWith('event', 'game_start', {
      player_id: 'user-abc',
      card_id: 'nmjl-2026',
      bot_difficulty: 'standard',
      resumed: 0,
    })

    vi.spyOn(Date, 'now').mockReturnValue(40_000)
    const sent = trackGameEnd({
      outcome: 'player_win',
      handTitle: '2468 #1',
      handSection: '2468',
      cardHandCode: '1',
      jokerCount: 2,
      winMethod: 'self-draw',
    })
    expect(sent).toBe(true)
    expect(hasLiveGame()).toBe(false)
    expect(gtag).toHaveBeenCalledWith(
      'event',
      'game_end',
      expect.objectContaining({
        outcome: 'player_win',
        player_id: 'user-abc',
        winner_kind: 'human',
        winner: 'user-abc',
        duration_seconds: 30,
        card_id: 'nmjl-2026',
        hand_title: '2468 #1',
        joker_count: 2,
        win_method: 'self-draw',
      }),
    )
  })

  it('attributes bot wins to bot:<seat> and keeps the logged-in player_id', () => {
    setAnalyticsUser('user-abc')
    trackGameStart({ roundId: 'r2', cardId: 'nmjl-2026', botDifficulty: 'easy' })
    trackGameEnd({
      outcome: 'bot_win',
      handTitle: 'Like Numbers',
      handSection: 'LIKE NUMBERS',
      cardHandCode: '3',
      jokerCount: 0,
      winMethod: 'called-discard',
      botSeat: 'West',
    })
    expect(gtag).toHaveBeenCalledWith(
      'event',
      'game_end',
      expect.objectContaining({
        outcome: 'bot_win',
        player_id: 'user-abc',
        winner_kind: 'bot',
        winner: 'bot:west',
        bot_seat: 'west',
        hand_title: 'Like Numbers',
        joker_count: 0,
      }),
    )
  })

  it('binds and clears the GA user id on sign-in / sign-out', () => {
    setAnalyticsUser('user-abc')
    expect(gtag).toHaveBeenCalledWith('config', 'G-RVCERNZJ9S', {
      send_page_view: false,
      user_id: 'user-abc',
    })
    setAnalyticsUser(null)
    expect(gtag).toHaveBeenCalledWith('config', 'G-RVCERNZJ9S', {
      send_page_view: false,
      user_id: '',
    })
  })

  it('does not send new_rack or abandoned without a live start', () => {
    expect(trackGameEnd({ outcome: 'new_rack' })).toBe(false)
    expect(trackGameAbandonedIfInProgress()).toBe(false)
    expect(gtag).not.toHaveBeenCalled()
  })

  it('sends abandoned once, then still allows a later real result after resume', () => {
    trackGameStart({ roundId: 'r3', cardId: 'nmjl-2026', botDifficulty: 'standard' })
    expect(trackGameAbandonedIfInProgress()).toBe(true)
    expect(trackGameAbandonedIfInProgress()).toBe(false)

    trackGameStart({
      roundId: 'r3',
      cardId: 'nmjl-2026',
      botDifficulty: 'standard',
      resumed: true,
    })
    expect(gtag).toHaveBeenCalledWith(
      'event',
      'game_start',
      expect.objectContaining({ resumed: 1 }),
    )
    expect(trackGameEnd({ outcome: 'player_win', jokerCount: 1, handTitle: 'Wins' })).toBe(true)
  })

  it('does not send a second real end for the same round', () => {
    trackGameStart({ roundId: 'r4', cardId: 'nmjl-2026', botDifficulty: 'standard' })
    expect(trackGameEnd({ outcome: 'wall_game', endedBy: 'natural' })).toBe(true)
    expect(trackGameEnd({ outcome: 'player_win' })).toBe(false)
    const ends = gtag.mock.calls.filter((c) => c[1] === 'game_end')
    expect(ends).toHaveLength(1)
  })

  it('dedupes rapid identical page views (Strict Mode remount)', () => {
    trackPageView('/play')
    trackPageView('/play')
    const views = gtag.mock.calls.filter((c) => c[1] === 'page_view')
    expect(views).toHaveLength(1)
    trackPageView('/home')
    expect(gtag.mock.calls.filter((c) => c[1] === 'page_view')).toHaveLength(2)
  })
})
