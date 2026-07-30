import { useEffect, useRef, type RefObject } from 'react'

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  w: number
  h: number
  rot: number
  vr: number
  color: string
  /** Once true, draw on the front layer (over dialog / rack / everything). */
  emerged: boolean
  life: number
  decay: number
}

const COLORS = [
  '#e11d48', // rose
  '#dc2626', // red
  '#16a34a', // green
  '#15803d', // deep green
  '#eab308', // gold
  '#f59e0b', // amber
  '#f8fafc', // ivory
  '#38bdf8', // sky
  '#2dd4bf', // teal
]

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** `power` 1 = full height; lower values keep pieces nearer the rack (trail filler). */
function createBurst(
  originX: number,
  originY: number,
  count: number,
  power = 1,
): Particle[] {
  const out: Particle[] = []
  const pwr = Math.max(0.28, Math.min(1, power))
  for (let i = 0; i < count; i++) {
    // Wide upward fountain (~±58°); late stream uses a bit less lateral throw.
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI * (0.52 + 0.14 * pwr))
    const speed = (12 + Math.random() * 15) * pwr
    out.push({
      x: originX + (Math.random() - 0.5) * 24,
      y: originY + (Math.random() - 0.5) * 8,
      vx: Math.cos(angle) * speed + (Math.random() - 0.5) * (1.4 + pwr),
      vy: Math.sin(angle) * speed - (1.6 + 3 * pwr + Math.random() * 4 * pwr),
      w: 5.5 + Math.random() * 5.5,
      h: 7.5 + Math.random() * 9,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.35,
      color: COLORS[(Math.random() * COLORS.length) | 0]!,
      emerged: false,
      life: 1,
      decay: 0.004 + Math.random() * 0.0035,
    })
  }
  return out
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(p.rot)
  ctx.globalAlpha = Math.max(0, Math.min(1, p.life))
  ctx.fillStyle = p.color
  ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
  ctx.restore()
}

/**
 * Celebration burst on player Mah Jongg: particles launch from behind the rack,
 * clear its top edge, then fall in front of the win overlay and the rest of the UI.
 */
export function MahjongWinConfetti({
  active,
  animationsEnabled,
  originRef,
}: {
  active: boolean
  animationsEnabled: boolean
  originRef: RefObject<HTMLElement | null>
}) {
  const behindRef = useRef<HTMLCanvasElement>(null)
  const frontRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!active || !animationsEnabled || prefersReducedMotion()) return

    const behind = behindRef.current
    const front = frontRef.current
    if (!behind || !front) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let width = 0
    let height = 0
    let rackTop = 0
    let particles: Particle[] = []
    let raf = 0
    let cancelled = false
    let lastTs = 0

    const syncSize = () => {
      width = window.innerWidth
      height = window.innerHeight
      for (const canvas of [behind, front]) {
        canvas.width = Math.max(1, Math.floor(width * dpr))
        canvas.height = Math.max(1, Math.floor(height * dpr))
        canvas.style.width = `${width}px`
        canvas.style.height = `${height}px`
        const ctx = canvas.getContext('2d')
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
    }

    const measureOrigin = () => {
      const el = originRef.current
      if (!el) {
        return { x: width / 2, y: height * 0.78, top: height * 0.7 }
      }
      const r = el.getBoundingClientRect()
      // Spawn mid-control (e.g. MahJ button); emerge once pieces clear its top edge.
      return {
        x: r.left + r.width / 2,
        y: r.top + r.height * 0.55,
        top: r.top + 1,
      }
    }

    syncSize()
    // Stream for ~¼s — same total volume, emitted continuously instead of one bang.
    const totalCount = Math.round(Math.min(240, Math.max(155, width * 0.2)))
    const emitMs = 250
    let startTs = 0
    let spawned = 0

    const tick = (ts: number) => {
      if (cancelled) return
      if (!startTs) startTs = ts
      const elapsed = ts - startTs
      const dt = lastTs ? Math.min(32, ts - lastTs) / 16.67 : 1
      lastTs = ts

      if (spawned < totalCount) {
        const progress = Math.min(elapsed, emitMs) / emitMs
        const target = Math.min(totalCount, Math.ceil(progress * totalCount))
        const n = target - spawned
        if (n > 0) {
          const o = measureOrigin()
          rackTop = o.top
          // Ease down launch height through the stream so the tail fills just above the origin.
          const power = 1 - 0.58 * progress * progress
          particles.push(...createBurst(o.x, o.y, n, power))
          spawned = target
        }
      }

      const bctx = behind.getContext('2d')
      const fctx = front.getContext('2d')
      if (!bctx || !fctx) return
      bctx.clearRect(0, 0, width, height)
      fctx.clearRect(0, 0, width, height)

      const gravity = 0.28 * dt
      const drag = Math.pow(0.992, dt)

      let alive = 0
      for (const p of particles) {
        p.vy += gravity
        p.vx *= drag
        p.vy *= drag
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.rot += p.vr * dt
        p.life -= p.decay * dt

        if (!p.emerged && p.y < rackTop) {
          p.emerged = true
        }

        if (p.life <= 0 || p.y > height + 40) continue
        alive += 1
        drawParticle(p.emerged ? fctx : bctx, p)
      }

      if (alive > 0 || spawned < totalCount) {
        raf = requestAnimationFrame(tick)
        return
      }
      bctx.clearRect(0, 0, width, height)
      fctx.clearRect(0, 0, width, height)
    }

    const onResize = () => {
      syncSize()
      const o = measureOrigin()
      rackTop = o.top
    }
    window.addEventListener('resize', onResize)
    // Wait a frame so the MahJ button remount/ref is laid out before the first spawn.
    raf = requestAnimationFrame(() => {
      if (cancelled) return
      const o = measureOrigin()
      rackTop = o.top
      raf = requestAnimationFrame(tick)
    })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      const bctx = behind.getContext('2d')
      const fctx = front.getContext('2d')
      bctx?.clearRect(0, 0, behind.width, behind.height)
      fctx?.clearRect(0, 0, front.width, front.height)
    }
  }, [active, animationsEnabled, originRef])

  if (!active || !animationsEnabled) return null

  return (
    <>
      <canvas
        ref={behindRef}
        className="mahjong-win-confetti mahjong-win-confetti--behind"
        aria-hidden="true"
      />
      <canvas
        ref={frontRef}
        className="mahjong-win-confetti mahjong-win-confetti--front"
        aria-hidden="true"
      />
    </>
  )
}
