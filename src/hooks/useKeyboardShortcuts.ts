'use client'

import { useEffect } from 'react'

interface KeyboardShortcut {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  handler: (e: KeyboardEvent) => void
  preventDefault?: boolean
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const ctrlMatch = shortcut.ctrlKey === undefined ? true : (shortcut.ctrlKey === e.ctrlKey)
        const metaMatch = shortcut.metaKey === undefined ? true : (shortcut.metaKey === e.metaKey)
        const shiftMatch = shortcut.shiftKey === undefined ? true : (shortcut.shiftKey === e.shiftKey)
        const altMatch = shortcut.altKey === undefined ? true : (shortcut.altKey === e.altKey)
        const keyMatch = shortcut.key.toLowerCase() === e.key.toLowerCase()

        if (ctrlMatch && metaMatch && shiftMatch && altMatch && keyMatch) {
          if (shortcut.preventDefault !== false) {
            e.preventDefault()
          }
          shortcut.handler(e)
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [shortcuts, enabled])
}
