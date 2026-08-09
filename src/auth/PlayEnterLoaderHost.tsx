import { useCallback, useSyncExternalStore } from 'react'
import { AuthThemeLoading } from './AuthThemeLoading'
import {
  getPlayEnterLoaderActive,
  getPlayEnterLoaderEpoch,
  notifyPlayEnterLoaderBarComplete,
  subscribePlayEnterLoader,
} from './playEnterLoader'

/** Fixed boot theater that survives Home/Landing → /play route swaps. */
export function PlayEnterLoaderHost() {
  const active = useSyncExternalStore(
    subscribePlayEnterLoader,
    getPlayEnterLoaderActive,
    () => false,
  )
  const epoch = useSyncExternalStore(
    subscribePlayEnterLoader,
    getPlayEnterLoaderEpoch,
    () => 0,
  )

  const onFillComplete = useCallback(() => {
    notifyPlayEnterLoaderBarComplete()
  }, [])

  if (!active) return null

  return <AuthThemeLoading key={`play-enter-${epoch}`} cover onFillComplete={onFillComplete} />
}
