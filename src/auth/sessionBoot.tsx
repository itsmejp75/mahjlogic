import { createContext, useContext, type ReactNode } from 'react'

type SessionBootContextValue = {
  /** App finished prefs/resume bootstrap — loader may dismiss once the bar hits 100%. */
  notifySessionBootReady: () => void
  /** True after the boot loader has fully dismissed (safe to show resume UI). */
  bootLoaderDismissed: boolean
}

const SessionBootContext = createContext<SessionBootContextValue | null>(null)

export function SessionBootProvider({
  children,
  notifySessionBootReady,
  bootLoaderDismissed,
}: {
  children: ReactNode
  notifySessionBootReady: () => void
  bootLoaderDismissed: boolean
}) {
  return (
    <SessionBootContext.Provider value={{ notifySessionBootReady, bootLoaderDismissed }}>
      {children}
    </SessionBootContext.Provider>
  )
}

export function useSessionBoot() {
  return useContext(SessionBootContext)
}
