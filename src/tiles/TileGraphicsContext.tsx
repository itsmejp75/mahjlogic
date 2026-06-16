import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { TileGraphics } from './tileGraphics'
import { DEFAULT_TILE_GRAPHICS } from './tileGraphics'

export type TileGraphicsContextValue = {
  tileGraphics: TileGraphics
  alternateDragons: boolean
}

const TileGraphicsContext = createContext<TileGraphicsContextValue>({
  tileGraphics: DEFAULT_TILE_GRAPHICS,
  alternateDragons: false,
})

export function TileGraphicsProvider({
  tileGraphics,
  alternateDragons,
  children,
}: TileGraphicsContextValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({ tileGraphics, alternateDragons }),
    [tileGraphics, alternateDragons],
  )
  return (
    <TileGraphicsContext.Provider value={value}>
      {children}
    </TileGraphicsContext.Provider>
  )
}

export function useTileGraphics(): TileGraphicsContextValue {
  return useContext(TileGraphicsContext)
}
