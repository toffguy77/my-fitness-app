/**
 * useKeyboardNavigation hook
 *
 * Provides comprehensive keyboard navigation support for dashboard components.
 * Implements WCAG 2.1 keyboard navigation guidelines.
 *
 * Requirements: 16.1, 16.4
 */

import { useEffect, useCallback, useRef } from 'react'

/**
 * Keyboard navigation options
 */
export interface KeyboardNavigationOptions {
    /**
     * Enable arrow key navigation
     */
    enableArrowKeys?: boolean

    /**
     * Enable Home/End key navigation
     */
    enableHomeEnd?: boolean

    /**
     * Enable Page Up/Page Down navigation
     */
    enablePageKeys?: boolean

    /**
     * Callback when arrow left is pressed
     */
    onArrowLeft?: () => void

    /**
     * Callback when arrow right is pressed
     */
    onArrowRight?: () => void

    /**
     * Callback when arrow up is pressed
     */
    onArrowUp?: () => void

    /**
     * Callback when arrow down is pressed
     */
    onArrowDown?: () => void

    /**
     * Callback when Home key is pressed
     */
    onHome?: () => void

    /**
     * Callback when End key is pressed
     */
    onEnd?: () => void

    /**
     * Callback when Page Up is pressed
     */
    onPageUp?: () => void

    /**
     * Callback when Page Down is pressed
     */
    onPageDown?: () => void

    /**
     * Callback when Enter is pressed
     */
    onEnter?: () => void

    /**
     * Callback when Space is pressed
     */
    onSpace?: () => void

    /**
     * Callback when Escape is pressed
     */
    onEscape?: () => void

    /**
     * Whether to prevent default behavior
     */
    preventDefault?: boolean

    /**
     * Whether to stop propagation
     */
    stopPropagation?: boolean
}

/**
 * useKeyboardNavigation hook
 *
 * Provides keyboard event handling for navigation
 */
export function useKeyboardNavigation(
    elementRef: React.RefObject<HTMLElement>,
    options: KeyboardNavigationOptions = {}
) {
    const {
        enableArrowKeys = true,
        enableHomeEnd = true,
        enablePageKeys = false,
        onArrowLeft,
        onArrowRight,
        onArrowUp,
        onArrowDown,
        onHome,
        onEnd,
        onPageUp,
        onPageDown,
        onEnter,
        onSpace,
        onEscape,
        preventDefault = true,
        stopPropagation = false,
    } = options

    // Store callbacks in refs to avoid re-creating event listener
    const callbacksRef = useRef({
        onArrowLeft,
        onArrowRight,
        onArrowUp,
        onArrowDown,
        onHome,
        onEnd,
        onPageUp,
        onPageDown,
        onEnter,
        onSpace,
        onEscape,
    })

    // Update callbacks ref when they change
    useEffect(() => {
        callbacksRef.current = {
            onArrowLeft,
            onArrowRight,
            onArrowUp,
            onArrowDown,
            onHome,
            onEnd,
            onPageUp,
            onPageDown,
            onEnter,
            onSpace,
            onEscape,
        }
    }, [
        onArrowLeft,
        onArrowRight,
        onArrowUp,
        onArrowDown,
        onHome,
        onEnd,
        onPageUp,
        onPageDown,
        onEnter,
        onSpace,
        onEscape,
    ])

    // Handle keyboard events
    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            const { key } = event
            const callbacks = callbacksRef.current

            let handled = false

            // Arrow keys
            if (enableArrowKeys) {
                if (key === 'ArrowLeft' && callbacks.onArrowLeft) {
                    callbacks.onArrowLeft()
                    handled = true
                } else if (key === 'ArrowRight' && callbacks.onArrowRight) {
                    callbacks.onArrowRight()
                    handled = true
                } else if (key === 'ArrowUp' && callbacks.onArrowUp) {
                    callbacks.onArrowUp()
                    handled = true
                } else if (key === 'ArrowDown' && callbacks.onArrowDown) {
                    callbacks.onArrowDown()
                    handled = true
                }
            }

            // Home/End keys
            if (enableHomeEnd) {
                if (key === 'Home' && callbacks.onHome) {
                    callbacks.onHome()
                    handled = true
                } else if (key === 'End' && callbacks.onEnd) {
                    callbacks.onEnd()
                    handled = true
                }
            }

            // Page Up/Down keys
            if (enablePageKeys) {
                if (key === 'PageUp' && callbacks.onPageUp) {
                    callbacks.onPageUp()
                    handled = true
                } else if (key === 'PageDown' && callbacks.onPageDown) {
                    callbacks.onPageDown()
                    handled = true
                }
            }

            // Enter key
            if (key === 'Enter' && callbacks.onEnter) {
                callbacks.onEnter()
                handled = true
            }

            // Space key
            if (key === ' ' && callbacks.onSpace) {
                callbacks.onSpace()
                handled = true
            }

            // Escape key
            if (key === 'Escape' && callbacks.onEscape) {
                callbacks.onEscape()
                handled = true
            }

            // Prevent default and stop propagation if requested
            if (handled) {
                if (preventDefault) {
                    event.preventDefault()
                }
                if (stopPropagation) {
                    event.stopPropagation()
                }
            }
        },
        [enableArrowKeys, enableHomeEnd, enablePageKeys, preventDefault, stopPropagation]
    )

    // Attach event listener
    useEffect(() => {
        const element = elementRef.current
        if (!element) return

        element.addEventListener('keydown', handleKeyDown)

        return () => {
            element.removeEventListener('keydown', handleKeyDown)
        }
    }, [elementRef, handleKeyDown])
}

/**
 * useFocusTrap hook
 *
 * Traps focus within a container (useful for modals/dialogs)
 */
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

/**
 * useRovingTabIndex hook
 *
 * Implements roving tabindex pattern for keyboard navigation
 * (useful for lists, grids, toolbars)
 */
export function useRovingTabIndex(
    containerRef: React.RefObject<HTMLElement>,
    options: {
        orientation?: 'horizontal' | 'vertical' | 'both'
        loop?: boolean
        initialIndex?: number
    } = {}
) {
    const { orientation = 'horizontal', loop = true, initialIndex = 0 } = options
    const currentIndexRef = useRef(initialIndex)

    // Get all navigable items
    const getNavigableItems = useCallback(() => {
        const container = containerRef.current
        if (!container) return []

        return Array.from(
            container.querySelectorAll<HTMLElement>('[role="button"], button, [data-navigable="true"]')
        ).filter((el) => !el.hasAttribute('disabled'))
    }, [containerRef])

    // Focus item at index
    const focusItem = useCallback(
        (index: number) => {
            const items = getNavigableItems()
            if (items.length === 0) return

            // Update tabindex
            items.forEach((item, i) => {
                if (i === index) {
                    item.setAttribute('tabindex', '0')
                    item.focus()
                } else {
                    item.setAttribute('tabindex', '-1')
                }
            })

            currentIndexRef.current = index
        },
        [getNavigableItems]
    )

    // Navigate to next item
    const navigateNext = useCallback(() => {
        const items = getNavigableItems()
        if (items.length === 0) return

        let nextIndex = currentIndexRef.current + 1

        if (nextIndex >= items.length) {
            nextIndex = loop ? 0 : items.length - 1
        }

        focusItem(nextIndex)
    }, [getNavigableItems, loop, focusItem])

    // Navigate to previous item
    const navigatePrevious = useCallback(() => {
        const items = getNavigableItems()
        if (items.length === 0) return

        let prevIndex = currentIndexRef.current - 1

        if (prevIndex < 0) {
            prevIndex = loop ? items.length - 1 : 0
        }

        focusItem(prevIndex)
    }, [getNavigableItems, loop, focusItem])

    // Navigate to first item
    const navigateFirst = useCallback(() => {
        focusItem(0)
    }, [focusItem])

    // Navigate to last item
    const navigateLast = useCallback(() => {
        const items = getNavigableItems()
        if (items.length === 0) return

        focusItem(items.length - 1)
    }, [getNavigableItems, focusItem])

    // Handle keyboard events
    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const handleKeyDown = (event: KeyboardEvent) => {
            const { key } = event

            let handled = false

            // Horizontal navigation
            if (orientation === 'horizontal' || orientation === 'both') {
                if (key === 'ArrowRight') {
                    navigateNext()
                    handled = true
                } else if (key === 'ArrowLeft') {
                    navigatePrevious()
                    handled = true
                }
            }

            // Vertical navigation
            if (orientation === 'vertical' || orientation === 'both') {
                if (key === 'ArrowDown') {
                    navigateNext()
                    handled = true
                } else if (key === 'ArrowUp') {
                    navigatePrevious()
                    handled = true
                }
            }

            // Home/End
            if (key === 'Home') {
                navigateFirst()
                handled = true
            } else if (key === 'End') {
                navigateLast()
                handled = true
            }

            if (handled) {
                event.preventDefault()
            }
        }

        container.addEventListener('keydown', handleKeyDown)

        // Initialize tabindex
        const items = getNavigableItems()
        items.forEach((item, i) => {
            item.setAttribute('tabindex', i === initialIndex ? '0' : '-1')
        })

        return () => {
            container.removeEventListener('keydown', handleKeyDown)
        }
    }, [
        containerRef,
        orientation,
        navigateNext,
        navigatePrevious,
        navigateFirst,
        navigateLast,
        getNavigableItems,
        initialIndex,
    ])

    return {
        focusItem,
        navigateNext,
        navigatePrevious,
        navigateFirst,
        navigateLast,
    }
}
