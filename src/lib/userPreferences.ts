import type { BotDifficulty } from '../analysis/botAI'
import { isAppTheme, type AppTheme } from '../app/appTheme'
import type { PlayableCardId } from '../card/cardCatalog'
import type { BlankTileCount } from '../mahjong/deck'
import type { TileGraphics } from '../tiles/tileGraphics'
import { isHelpPreset, type HelpPreset } from './helpPreset'
import { getSupabase } from './supabase'

/** Menu settings synced to Supabase for the signed-in user (localStorage remains the cache). */
export type SyncedUserPreferences = {
  playableCardId: PlayableCardId
  botDifficulty: BotDifficulty
  appTheme: AppTheme
  tileGraphics: TileGraphics
  botWinsEnabled: boolean
  colorButtonsEnabled: boolean
  undoEnabled: boolean
  animationsEnabled: boolean
  deadHandWarningsEnabled: boolean
  jokerSwapHintEnabled: boolean
  mahjongHintEnabled: boolean
  mahjongHintDelaySeconds: number
  jokerSwapHintDelaySeconds: number
  deadTileHintEnabled: boolean
  botHandsIdentifierEnabled: boolean
  concealedHandReminderEnabled: boolean
  blankTilesEnabled: boolean
  blankTileCount: BlankTileCount
  tenJokersEnabled: boolean
  playAsEastEnabled: boolean
  suggestedHandsTrayDefaultOpen: boolean
  handProbabilityEnabled: boolean
  helpPreset: HelpPreset
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v != null && !Array.isArray(v)
}

/** Soft-parse cloud JSON so older/partial rows still apply known fields. */
export function parseSyncedUserPreferences(raw: unknown): Partial<SyncedUserPreferences> | null {
  if (!isRecord(raw)) return null
  const out: Partial<SyncedUserPreferences> = {}

  if (raw.playableCardId === 'mock' || raw.playableCardId === '2025' || raw.playableCardId === '2026') {
    out.playableCardId = raw.playableCardId
  }
  if (raw.botDifficulty === 'easy' || raw.botDifficulty === 'normal' || raw.botDifficulty === 'hard') {
    out.botDifficulty = raw.botDifficulty
  }
  if (typeof raw.appTheme === 'string' && isAppTheme(raw.appTheme)) out.appTheme = raw.appTheme
  if (typeof raw.tileGraphics === 'string') out.tileGraphics = raw.tileGraphics as TileGraphics
  if (typeof raw.botWinsEnabled === 'boolean') out.botWinsEnabled = raw.botWinsEnabled
  if (typeof raw.colorButtonsEnabled === 'boolean') out.colorButtonsEnabled = raw.colorButtonsEnabled
  if (typeof raw.undoEnabled === 'boolean') out.undoEnabled = raw.undoEnabled
  if (typeof raw.animationsEnabled === 'boolean') out.animationsEnabled = raw.animationsEnabled
  if (typeof raw.deadHandWarningsEnabled === 'boolean') {
    out.deadHandWarningsEnabled = raw.deadHandWarningsEnabled
  }
  if (typeof raw.jokerSwapHintEnabled === 'boolean') out.jokerSwapHintEnabled = raw.jokerSwapHintEnabled
  if (typeof raw.mahjongHintEnabled === 'boolean') out.mahjongHintEnabled = raw.mahjongHintEnabled
  if (typeof raw.mahjongHintDelaySeconds === 'number') {
    out.mahjongHintDelaySeconds = raw.mahjongHintDelaySeconds
  }
  if (typeof raw.jokerSwapHintDelaySeconds === 'number') {
    out.jokerSwapHintDelaySeconds = raw.jokerSwapHintDelaySeconds
  }
  if (typeof raw.deadTileHintEnabled === 'boolean') out.deadTileHintEnabled = raw.deadTileHintEnabled
  if (typeof raw.botHandsIdentifierEnabled === 'boolean') {
    out.botHandsIdentifierEnabled = raw.botHandsIdentifierEnabled
  }
  if (typeof raw.concealedHandReminderEnabled === 'boolean') {
    out.concealedHandReminderEnabled = raw.concealedHandReminderEnabled
  }
  if (typeof raw.blankTilesEnabled === 'boolean') out.blankTilesEnabled = raw.blankTilesEnabled
  if (typeof raw.blankTileCount === 'number') out.blankTileCount = raw.blankTileCount as BlankTileCount
  if (typeof raw.tenJokersEnabled === 'boolean') out.tenJokersEnabled = raw.tenJokersEnabled
  if (typeof raw.playAsEastEnabled === 'boolean') out.playAsEastEnabled = raw.playAsEastEnabled
  if (typeof raw.suggestedHandsTrayDefaultOpen === 'boolean') {
    out.suggestedHandsTrayDefaultOpen = raw.suggestedHandsTrayDefaultOpen
  }
  if (typeof raw.handProbabilityEnabled === 'boolean') {
    out.handProbabilityEnabled = raw.handProbabilityEnabled
  }
  if (isHelpPreset(raw.helpPreset)) out.helpPreset = raw.helpPreset

  return out
}

export async function loadUserPreferences(): Promise<{
  prefs: Partial<SyncedUserPreferences> | null
  error: string | null
}> {
  const supabase = getSupabase()
  if (!supabase) return { prefs: null, error: 'Supabase is not configured.' }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { prefs: null, error: 'Not signed in.' }

  const { data, error } = await supabase
    .from('user_preferences')
    .select('prefs')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return { prefs: null, error: error.message }
  if (!data) return { prefs: null, error: null }
  return { prefs: parseSyncedUserPreferences(data.prefs), error: null }
}

export async function saveUserPreferences(
  prefs: SyncedUserPreferences,
): Promise<{ error: string | null }> {
  const supabase = getSupabase()
  if (!supabase) return { error: 'Supabase is not configured.' }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { error } = await supabase.from('user_preferences').upsert(
    {
      user_id: user.id,
      prefs,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  return { error: error?.message ?? null }
}

/** Debounce rapid menu toggles into a single upsert. */
export function createDebouncedPrefsSaver(delayMs = 400): {
  schedule: (prefs: SyncedUserPreferences) => void
  cancel: () => void
} {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: SyncedUserPreferences | null = null

  return {
    schedule(prefs) {
      pending = prefs
      if (timer != null) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        const next = pending
        pending = null
        if (next) void saveUserPreferences(next)
      }, delayMs)
    },
    cancel() {
      if (timer != null) clearTimeout(timer)
      timer = null
      pending = null
    },
  }
}
