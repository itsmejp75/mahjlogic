import {
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react'

type EnterVariant = 'win' | 'end'

const ENTER: Record<
  EnterVariant,
  { duration: number; easing: string; className: string }
> = {
  win: {
    duration: 1350,
    easing: 'cubic-bezier(0.33, 0.08, 0.22, 1)',
    className: 'wall-game-dialog--mahjong-win-enter',
  },
  end: {
    duration: 480,
    easing: 'cubic-bezier(0.28, 0.1, 0.2, 1)',
    className: 'wall-game-dialog--end-enter',
  },
}

function motionBlocked(el: HTMLElement): boolean {
  if (el.closest('[data-animations]')?.getAttribute('data-animations') === 'off') {
    return true
  }
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function settleEnter(node: HTMLElement) {
  node.style.opacity = '1'
  node.style.transform = 'translateZ(0)'
  node.classList.add('wall-game-dialog--enter-settled')
  node.classList.remove('wall-game-dialog--enter-running')
}

/**
 * Wall / Mah Jongg / bot-win panel. Drop-in is driven by the Web Animations API (not CSS
 * `@keyframes`) so iOS WKWebView / installed PWA actually runs the enter — CSS animations
 * applied on mount often freeze at the first keyframe (opacity 0).
 *
 * Always settles with a timeout fallback: if WAAPI stalls at opacity 0 (common on mobile
 * Safari / standalone PWA), the dialog must still become visible.
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
    el.style.removeProperty('opacity')
    el.style.removeProperty('transform')

    if (motionBlocked(el) || typeof el.animate !== 'function') {
      settleEnter(el)
      return
    }

    let cancelled = false
    let settled = false
    let anim: Animation | null = null
    let raf2 = 0
    let fallbackTimer = 0

    const finish = () => {
      if (cancelled || settled || !ref.current) return
      settled = true
      const node = ref.current
      settleEnter(node)
      try {
        anim?.cancel()
      } catch {
        /* ignore */
      }
      anim = null
      window.clearTimeout(fallbackTimer)
      fallbackTimer = 0
    }

    // Park above the viewport in inline styles (not only CSS) so a stalled WAAPI cannot
    // leave the panel permanently invisible under the higher-specificity park rule.
    const parkY = Math.max(el.getBoundingClientRect().height + 20, 96)
    el.style.opacity = '0'
    el.style.transform = `translate3d(0, ${-parkY}px, 0)`
    void el.offsetWidth

    // Double rAF: park one frame, then drop+fade (iOS needs the gap).
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (cancelled || !ref.current) return
        const node = ref.current
        const fromY = Math.max(node.getBoundingClientRect().height + 20, parkY)
        node.classList.add('wall-game-dialog--enter-running')
        try {
          anim = node.animate(
            [
              { opacity: 0, transform: `translate3d(0, ${-fromY}px, 0)` },
              { opacity: 1, transform: 'translate3d(0, 0, 0)' },
            ],
            { duration: spec.duration, easing: spec.easing, fill: 'forwards' },
          )
          anim.addEventListener('finish', finish)
        } catch {
          finish()
          return
        }
        // Never leave the win/end panel frozen at opacity 0 on WKWebView / PWA.
        fallbackTimer = window.setTimeout(finish, spec.duration + 160)
      })
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      window.clearTimeout(fallbackTimer)
      try {
        anim?.cancel()
      } catch {
        /* ignore */
      }
      el.style.removeProperty('opacity')
      el.style.removeProperty('transform')
      el.classList.remove('wall-game-dialog--enter-settled', 'wall-game-dialog--enter-running')
    }
  }, [enter, spec.duration, spec.easing])

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
