/** dnd-kit id: entire discard pile panel (joker reclaim staging — no separate UI). */
export const JOKER_SWAP_STAGING_ID = 'joker-swap-staging'

/** dnd-kit id: drop zone for East’s discard before committing (main game). */
export const EAST_DISCARD_STAGING_ID = 'east-discard-staging'

/** dnd-kit id: first empty exposure slot while an opponent discard is active — training: drop to start Call. */
export const CALL_INITIATE_FIRST_SLOT_ID = 'call-initiate-first-empty'

const INCOMING_BOT_DISCARD_DRAG_PREFIX = 'incoming-bot-discard:'

/** Sortable id for the live bot discard in the exposure rack last slot (bot-turn Call drag). */
export function incomingBotDiscardDragId(tileId: string): string {
  return `${INCOMING_BOT_DISCARD_DRAG_PREFIX}${tileId}`
}

export function parseIncomingBotDiscardDragId(id: string): string | null {
  if (!id.startsWith(INCOMING_BOT_DISCARD_DRAG_PREFIX)) return null
  const tileId = id.slice(INCOMING_BOT_DISCARD_DRAG_PREFIX.length)
  return tileId.length > 0 ? tileId : null
}
