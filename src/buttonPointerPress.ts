/** Tracks pointer position so transient press chrome clears when the finger/cursor leaves. */
export const BTN_POINTER_DOWN_CLASS = 'btn--pointer-down'

const PRESSABLE_SELECTOR =
  '.btn, .btn__undo-inset[role="button"], .hands-panel__display-toggle, .hands-suggested-pin'

function findPressable(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null
  const el = target.closest<HTMLElement>(PRESSABLE_SELECTOR)
  if (!el) return null
  if (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true') return null
  return el
}

function isPointerInside(el: HTMLElement, x: number, y: number): boolean {
  const rect = el.getBoundingClientRect()
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

function syncPressedClass(el: HTMLElement, x: number, y: number) {
  el.classList.toggle(BTN_POINTER_DOWN_CLASS, isPointerInside(el, x, y))
}

/** Call once at startup; `:active` alone sticks until release even after pointer-leave. */
export function initButtonPointerPress(): void {
  let activeEl: HTMLElement | null = null
  let activePointerId: number | null = null

  const clearActive = () => {
    activeEl?.classList.remove(BTN_POINTER_DOWN_CLASS)
    activeEl = null
    activePointerId = null
  }

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    const el = findPressable(e.target)
    if (!el) return
    activeEl = el
    activePointerId = e.pointerId
    syncPressedClass(el, e.clientX, e.clientY)
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!activeEl || e.pointerId !== activePointerId) return
    syncPressedClass(activeEl, e.clientX, e.clientY)
  }

  const onPointerEnd = (e: PointerEvent) => {
    if (!activeEl || e.pointerId !== activePointerId) return
    clearActive()
  }

  const opts: AddEventListenerOptions = { capture: true, passive: true }
  document.addEventListener('pointerdown', onPointerDown, opts)
  document.addEventListener('pointermove', onPointerMove, opts)
  document.addEventListener('pointerup', onPointerEnd, opts)
  document.addEventListener('pointercancel', onPointerEnd, opts)
}
