import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { consumePostLoginFrom, postLoginNav, rememberPostLoginFrom } from './postLoginNav'

describe('postLoginNav', () => {
  it('sends Login to Play through to the table', () => {
    expect(postLoginNav('/play')).toEqual({ path: '/play', state: { playIntent: 'enter' } })
  })

  it('sends Rack Checker login through to the checker', () => {
    expect(postLoginNav('/rack-checker')).toEqual({ path: '/rack-checker' })
  })

  it('sends header Login to the post-login hub', () => {
    expect(postLoginNav(undefined)).toEqual({ path: '/home' })
    expect(postLoginNav('/home')).toEqual({ path: '/home' })
  })
})

describe('rememberPostLoginFrom', () => {
  const memory = new Map<string, string>()

  beforeEach(() => {
    memory.clear()
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value)
      },
      removeItem: (key: string) => {
        memory.delete(key)
      },
      clear: () => memory.clear(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('persists Play / Rack Checker and defaults other visits to home', () => {
    rememberPostLoginFrom('/play')
    expect(consumePostLoginFrom()).toBe('/play')

    rememberPostLoginFrom('/rack-checker')
    expect(consumePostLoginFrom()).toBe('/rack-checker')

    rememberPostLoginFrom(undefined)
    expect(consumePostLoginFrom()).toBe('/home')
  })
})
