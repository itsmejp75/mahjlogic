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

export type AppMenuOpenApi = {
  menuOpen: boolean
  setMenuOpen: Dispatch<SetStateAction<boolean>>
  toggleMenu: () => void
}

const AppMenuOpenContext = createContext<AppMenuOpenApi | null>(null)

/**
 * Imperative open/close for App callbacks (new game, post-game “open menu”, etc.) without
 * making `App` a context consumer — that would re-render the whole play tree on every toggle.
 */
export const appMenuOpenApiRef: {
  current: Pick<AppMenuOpenApi, 'setMenuOpen' | 'toggleMenu'>
} = {
  current: {
    setMenuOpen: () => {},
    toggleMenu: () => {},
  },
}

/**
 * Owns `menuOpen` above the play tree. Non-consumer children keep their last element
 * identity from `App`, so opening/closing the menu does not re-render racks / DnD.
 */
export function AppMenuOpenProvider({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const toggleMenu = useCallback(() => setMenuOpen((v) => !v), [])
  const value = useMemo(
    () => ({ menuOpen, setMenuOpen, toggleMenu }),
    [menuOpen, toggleMenu],
  )

  useEffect(() => {
    appMenuOpenApiRef.current = { setMenuOpen, toggleMenu }
  }, [setMenuOpen, toggleMenu])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <AppMenuOpenContext.Provider value={value}>{children}</AppMenuOpenContext.Provider>
  )
}

export function useAppMenuOpen(): AppMenuOpenApi {
  const ctx = useContext(AppMenuOpenContext)
  if (!ctx) {
    throw new Error('useAppMenuOpen requires AppMenuOpenProvider')
  }
  return ctx
}

/** Renders children only while the menu is open (context consumer — siblings do not re-render). */
export function AppMenuOpenGate({ children }: { children: ReactNode }) {
  const { menuOpen } = useAppMenuOpen()
  if (!menuOpen) return null
  return children
}
