import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { TileGraphics } from './tileGraphics'
import { DEFAULT_TILE_GRAPHICS } from './tileGraphics'

export type TileGraphicsContextValue = {
  tileGraphics: TileGraphics
}

const TileGraphicsContext = createContext<TileGraphicsContextValue>({
  tileGraphics: DEFAULT_TILE_GRAPHICS,
})

export function TileGraphicsProvider({
  tileGraphics,
  children,
}: TileGraphicsContextValue & { children: ReactNode }) {
  const value = useMemo(() => ({ tileGraphics }), [tileGraphics])
  return (
    <TileGraphicsContext.Provider value={value}>
      {children}
    </TileGraphicsContext.Provider>
  )
}

export function useTileGraphics(): TileGraphicsContextValue {
  return useContext(TileGraphicsContext)
}
