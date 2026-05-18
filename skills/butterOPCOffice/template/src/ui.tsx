import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PAGE_EMOJIS } from './model'

// Close a panel on outside click or Escape.
export function useDismiss<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null)
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    // Defer so the click that opened the panel doesn't immediately close it.
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDown)
      document.addEventListener('keydown', onKey)
    }, 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  return ref
}

interface PopoverProps {
  anchor: DOMRect
  onClose: () => void
  children: React.ReactNode
  width?: number
  align?: 'left' | 'right'
}

export function Popover({ anchor, onClose, children, width = 260, align = 'left' }: PopoverProps) {
  const ref = useDismiss<HTMLDivElement>(onClose)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth || width
    const h = el.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = align === 'right' ? anchor.right - w : anchor.left
    let top = anchor.bottom + 4
    if (left + w > vw - 8) left = vw - 8 - w
    if (left < 8) left = 8
    if (top + h > vh - 8) top = Math.max(8, anchor.top - h - 4)
    setPos({ left, top })
  }, [anchor, width, align])

  return (
    <div ref={ref} className="popover" style={{ left: pos.left, top: pos.top, width }}>
      {children}
    </div>
  )
}

interface EmojiPickerProps {
  anchor: DOMRect
  onPick: (emoji: string) => void
  onClose: () => void
  allowRemove?: boolean
}

export function EmojiPicker({ anchor, onPick, onClose, allowRemove }: EmojiPickerProps) {
  return (
    <Popover anchor={anchor} onClose={onClose} width={296}>
      <div className="emoji-pop">
        {allowRemove && (
          <button
            className="emoji-remove"
            onClick={() => {
              onPick('')
              onClose()
            }}
          >
            Remove icon
          </button>
        )}
        <div className="emoji-grid">
          {PAGE_EMOJIS.map((e) => (
            <button
              key={e}
              className="emoji-cell"
              onClick={() => {
                onPick(e)
                onClose()
              }}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    </Popover>
  )
}

// ----------------------------------------------------------------- toast
let toastFn: ((m: string) => void) | null = null
export function toast(message: string) {
  toastFn?.(message)
}

export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    toastFn = (m) => setMsg(m)
    return () => {
      toastFn = null
    }
  }, [])
  useEffect(() => {
    if (msg == null) return
    const t = setTimeout(() => setMsg(null), 2400)
    return () => clearTimeout(t)
  }, [msg])
  if (msg == null) return null
  return <div className="toast">{msg}</div>
}
