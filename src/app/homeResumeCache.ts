import type { InProgressGameSnapshot } from '../lib/inProgressGame'

/** Last known in-progress hand for this session — shared by Home and Play eager paint. */
let homeResumeCache: { userId: string; snap: InProgressGameSnapshot | null } | null = null

export function setHomeResumeCache(
  userId: string,
  snap: InProgressGameSnapshot | null,
): void {
  homeResumeCache = { userId, snap }
}

export function clearHomeResumeCache(): void {
  homeResumeCache = null
}

/** Play can eager-paint a saved hand before cloud hydrate finishes. */
export function peekHomeResumeCache(
  userId: string | undefined,
): { status: 'unknown' } | { status: 'ready'; snap: InProgressGameSnapshot | null } {
  if (!userId) return { status: 'unknown' }
  if (!homeResumeCache || homeResumeCache.userId !== userId) return { status: 'unknown' }
  return { status: 'ready', snap: homeResumeCache.snap }
}
