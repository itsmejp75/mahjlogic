import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'

export type SuggestedHandsTrayApi = {
  trayOpen: boolean
  setTrayOpen: Dispatch<SetStateAction<boolean>>
  toggleTray: () => void
}

const SuggestedHandsTrayContext = createContext<SuggestedHandsTrayApi | null>(null)

/**
 * Imperative tray open/close for App round handlers without making `App` a tray consumer
 * (which would re-render the play tree on every tray open/close).
 */
export const suggestedHandsTrayApiRef: {
  current: Pick<SuggestedHandsTrayApi, 'setTrayOpen' | 'toggleTray'>
} = {
  current: {
    setTrayOpen: () => {},
    toggleTray: () => {},
  },
}

export function SuggestedHandsTrayProvider({
  children,
  initialOpen,
}: {
  children: ReactNode
  initialOpen: boolean
}) {
  const [trayOpen, setTrayOpen] = useState(initialOpen)
  const toggleTray = useCallback(() => setTrayOpen((v) => !v), [])
  const value = useMemo(
    () => ({ trayOpen, setTrayOpen, toggleTray }),
    [trayOpen, toggleTray],
  )

  useEffect(() => {
    suggestedHandsTrayApiRef.current = { setTrayOpen, toggleTray }
  }, [setTrayOpen, toggleTray])

  return (
    <SuggestedHandsTrayContext.Provider value={value}>
      {children}
    </SuggestedHandsTrayContext.Provider>
  )
}

export function useSuggestedHandsTray(): SuggestedHandsTrayApi {
  const ctx = useContext(SuggestedHandsTrayContext)
  if (!ctx) {
    throw new Error('useSuggestedHandsTray requires SuggestedHandsTrayProvider')
  }
  return ctx
}

/** Adds tray-open layout class without re-rendering rack children. */
export function SuggestedHandsDndFrame({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const { trayOpen } = useSuggestedHandsTray()
  return (
    <div
      className={[
        'app-dnd-frame',
        trayOpen ? 'app-dnd-frame--suggested-hands-open' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
}
