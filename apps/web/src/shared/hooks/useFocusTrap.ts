/**
 * useFocusTrap
 *
 * Держит фокус внутри контейнера — для модальных окон и диалогов.
 * Жил в `features/dashboard/hooks/useKeyboardNavigation`, переехал сюда, когда
 * понадобился диалогу подтверждения из общего слоя.
 */

import { useEffect } from 'react'

export function useFocusTrap(
    containerRef: React.RefObject<HTMLElement>,
    isActive: boolean = true
) {
    useEffect(() => {
        if (!isActive) return

        const container = containerRef.current
        if (!container) return

        // Get all focusable elements
        const getFocusableElements = () => {
            return container.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )
        }

        // Handle Tab key
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Tab') return

            const focusableElements = Array.from(getFocusableElements())
            if (focusableElements.length === 0) return

            const firstElement = focusableElements[0]
            const lastElement = focusableElements[focusableElements.length - 1]

            // Shift + Tab (backwards)
            if (event.shiftKey) {
                if (document.activeElement === firstElement) {
                    event.preventDefault()
                    lastElement.focus()
                }
            }
            // Tab (forwards)
            else {
                if (document.activeElement === lastElement) {
                    event.preventDefault()
                    firstElement.focus()
                }
            }
        }

        container.addEventListener('keydown', handleKeyDown)

        // Focus first element on mount
        const focusableElements = getFocusableElements()
        if (focusableElements.length > 0) {
            focusableElements[0].focus()
        }

        return () => {
            container.removeEventListener('keydown', handleKeyDown)
        }
    }, [containerRef, isActive])
}
