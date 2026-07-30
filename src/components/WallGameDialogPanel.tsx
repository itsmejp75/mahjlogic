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

/**
 * Wall / Mah Jongg / bot-win panel. Drop-in is driven by the Web Animations API (not CSS
 * `@keyframes`) so iOS WKWebView / installed PWA actually runs the enter — CSS animations
 * applied on mount often freeze at the first keyframe (opacity 0).
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

    if (motionBlocked(el) || typeof el.animate !== 'function') {
      el.classList.add('wall-game-dialog--enter-settled')
      return
    }

    let cancelled = false
    let anim: Animation | null = null
    let raf2 = 0
    // Double rAF: park above the viewport one frame, then drop+fade (iOS needs the gap).
    // Keep translateZ(0) after settle so atmosphere paint doesn’t re-slice when WAAPI ends.
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (cancelled || !ref.current) return
        const node = ref.current
        const fromY = Math.max(node.getBoundingClientRect().height + 20, 96)
        node.classList.add('wall-game-dialog--enter-running')
        anim = node.animate(
          [
            { opacity: 0, transform: `translate3d(0, ${-fromY}px, 0)` },
            { opacity: 1, transform: 'translate3d(0, 0, 0)' },
          ],
          { duration: spec.duration, easing: spec.easing, fill: 'forwards' },
        )
        anim.onfinish = () => {
          node.style.opacity = '1'
          node.style.transform = 'translateZ(0)'
          node.classList.add('wall-game-dialog--enter-settled')
          node.classList.remove('wall-game-dialog--enter-running')
          anim?.cancel()
        }
      })
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      anim?.cancel()
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
