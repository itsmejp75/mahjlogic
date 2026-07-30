import {
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { easeOutCubic, rafAnimate, type RafAnimHandle } from '../lib/rafAnimate'

type EnterVariant = 'win' | 'end'

const ENTER: Record<
  EnterVariant,
  { duration: number; className: string }
> = {
  win: {
    duration: 1350,
    className: 'wall-game-dialog--mahjong-win-enter',
  },
  end: {
    duration: 480,
    className: 'wall-game-dialog--end-enter',
  },
}

function animationsOff(el: HTMLElement): boolean {
  return el.closest('[data-animations]')?.getAttribute('data-animations') === 'off'
}

function settleEnter(node: HTMLElement) {
  node.style.opacity = '1'
  node.style.transform = 'translateZ(0)'
  node.classList.add('wall-game-dialog--enter-settled')
  node.classList.remove('wall-game-dialog--enter-running')
}

/**
 * Wall / Mah Jongg / bot-win panel drop-in.
 *
 * Driven by rAF + inline styles (not CSS @keyframes / WAAPI). On iOS WKWebView /
 * installed PWA those APIs often freeze at opacity 0 on mount; writing style each
 * frame matches the joker-timeshare fix that already works in this app.
 *
 * Respects in-app Animations only — do not gate on prefers-reduced-motion (iOS
 * Reduce Motion would leave the panel parked invisible / skip the celebration).
 */
export function WallGameDialogPanel({
  enter,
  className,
  children,
  ...rest
}: {
  enter: EnterVariant
  className?: string
  children: ReactNode
} & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>) {
  const ref = useRef<HTMLDivElement>(null)
  const spec = ENTER[enter]

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    el.classList.remove('wall-game-dialog--enter-settled', 'wall-game-dialog--enter-running')

    if (animationsOff(el)) {
      settleEnter(el)
      return
    }

    let cancelled = false
    let settled = false
    let handle: RafAnimHandle | null = null
    let fallbackTimer = 0
    let startRaf2 = 0

    const finish = () => {
      if (cancelled || settled || !ref.current) return
      settled = true
      handle?.cancel()
      handle = null
      window.clearTimeout(fallbackTimer)
      fallbackTimer = 0
      settleEnter(ref.current)
    }

    const fromY = Math.max(el.getBoundingClientRect().height + 20, 96)
    el.style.opacity = '0'
    el.style.transform = `translate3d(0, ${-fromY}px, 0)`
    el.classList.add('wall-game-dialog--enter-running')
    void el.offsetWidth

    const startRaf1 = requestAnimationFrame(() => {
      startRaf2 = requestAnimationFrame(() => {
        if (cancelled || !ref.current) return
        const node = ref.current
        const dist = Math.max(node.getBoundingClientRect().height + 20, fromY)

        handle = rafAnimate({
          durationMs: spec.duration,
          easing: easeOutCubic,
          onUpdate: (e) => {
            if (!ref.current) return
            ref.current.style.opacity = String(e)
            ref.current.style.transform = `translate3d(0, ${-dist * (1 - e)}px, 0)`
          },
          onDone: finish,
        })
      })
    })

    // Hard guarantee: never leave the panel at opacity 0.
    fallbackTimer = window.setTimeout(finish, spec.duration + 200)

    return () => {
      cancelled = true
      cancelAnimationFrame(startRaf1)
      cancelAnimationFrame(startRaf2)
      handle?.cancel()
      window.clearTimeout(fallbackTimer)
      el.style.removeProperty('opacity')
      el.style.removeProperty('transform')
      el.classList.remove('wall-game-dialog--enter-settled', 'wall-game-dialog--enter-running')
    }
  }, [enter, spec.duration])

  return (
    <div
      ref={ref}
      className={['wall-game-dialog', spec.className, className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </div>
  )
}
