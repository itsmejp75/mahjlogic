/** Coaching intensity chosen on Home; maps onto individual hint toggles. */
export type HelpPreset = 'off' | 'guided' | 'full'

export const HELP_PRESETS: readonly HelpPreset[] = ['off', 'guided', 'full'] as const

export const HELP_PRESET_LABEL: Record<HelpPreset, string> = {
  off: 'Off',
  guided: 'Guided',
  full: 'Full',
}

export const LS_KEY_HELP_PRESET = 'mahjlogic.helpPreset'

export type HelpPresetFlags = {
  suggestedHandsTrayDefaultOpen: boolean
  mahjongHintEnabled: boolean
  jokerSwapHintEnabled: boolean
  deadTileHintEnabled: boolean
  handProbabilityEnabled: boolean
  deadHandWarningsEnabled: boolean
  botHandsIdentifierEnabled: boolean
  concealedHandReminderEnabled: boolean
}

export function isHelpPreset(v: unknown): v is HelpPreset {
  return v === 'off' || v === 'guided' || v === 'full'
}

export function helpFlagsForPreset(preset: HelpPreset): HelpPresetFlags {
  if (preset === 'off') {
    return {
      suggestedHandsTrayDefaultOpen: false,
      mahjongHintEnabled: false,
      jokerSwapHintEnabled: false,
      deadTileHintEnabled: false,
      handProbabilityEnabled: false,
      deadHandWarningsEnabled: false,
      botHandsIdentifierEnabled: false,
      concealedHandReminderEnabled: false,
    }
  }
  if (preset === 'full') {
    return {
      // Tray starts closed on new games; player opens Hands when they want it.
      suggestedHandsTrayDefaultOpen: false,
      mahjongHintEnabled: true,
      jokerSwapHintEnabled: true,
      deadTileHintEnabled: true,
      handProbabilityEnabled: true,
      deadHandWarningsEnabled: true,
      botHandsIdentifierEnabled: true,
      concealedHandReminderEnabled: true,
    }
  }
  // Guided — core hints on; Hands tray available but not forced open
  return {
    suggestedHandsTrayDefaultOpen: false,
    mahjongHintEnabled: true,
    jokerSwapHintEnabled: true,
    deadTileHintEnabled: true,
    handProbabilityEnabled: true,
    deadHandWarningsEnabled: true,
    botHandsIdentifierEnabled: true,
    concealedHandReminderEnabled: true,
  }
}

/** Persist preset + mapped flags to localStorage. */
export function writeHelpPresetToStorage(preset: HelpPreset): void {
  const flags = helpFlagsForPreset(preset)
  try {
    localStorage.setItem(LS_KEY_HELP_PRESET, preset)
    localStorage.setItem(
      'mahjlogic.suggestedHandsTrayDefaultOpen',
      flags.suggestedHandsTrayDefaultOpen ? 'true' : 'false',
    )
    localStorage.setItem('mahjlogic.mahjongHintEnabled', flags.mahjongHintEnabled ? 'true' : 'false')
    localStorage.setItem(
      'mahjlogic.jokerSwapHintEnabled',
      flags.jokerSwapHintEnabled ? 'true' : 'false',
    )
    localStorage.setItem('mahjlogic.deadTileHintEnabled', flags.deadTileHintEnabled ? 'true' : 'false')
    localStorage.setItem(
      'mahjlogic.handProbabilityEnabled',
      flags.handProbabilityEnabled ? 'true' : 'false',
    )
    localStorage.setItem(
      'mahjlogic.deadHandWarningsEnabled',
      flags.deadHandWarningsEnabled ? 'true' : 'false',
    )
    localStorage.setItem(
      'mahjlogic.botHandsIdentifierEnabled',
      flags.botHandsIdentifierEnabled ? 'true' : 'false',
    )
    localStorage.setItem(
      'mahjlogic.concealedHandReminderEnabled',
      flags.concealedHandReminderEnabled ? 'true' : 'false',
    )
  } catch {
    /* ignore */
  }
}

export function readHelpPresetFromStorage(): HelpPreset {
  try {
    const v = localStorage.getItem(LS_KEY_HELP_PRESET)
    if (isHelpPreset(v)) return v
  } catch {
    /* ignore */
  }
  return 'guided'
}
