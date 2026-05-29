import { createContext, useContext, type ReactNode } from 'react'
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
  return (
    <TileGraphicsContext.Provider value={{ tileGraphics, alternateDragons }}>
      {children}
    </TileGraphicsContext.Provider>
  )
}

export function useTileGraphics(): TileGraphicsContextValue {
  return useContext(TileGraphicsContext)
}
