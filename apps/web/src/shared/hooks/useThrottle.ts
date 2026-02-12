/**
 * useThrottle hook
 *
 * Throttles a value or callback to limit the rate of updates.
 * Useful for scroll handlers, resize handlers, and frequent events.
 */

import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Throttle a value
 *
 * @param value - The value to throttle
 * @param interval - Minimum interval between updates in milliseconds (default: 100ms)
 * @returns The throttled value
 *
 * @example
 * ```tsx
 * const [scrollPosition, setScrollPosition] = useState(0)
 * const throttledScroll = useThrottle(scrollPosition, 100)
 *
 * useEffect(() => {
 *   // This will only update at most every 100ms
 *   updateUI(throttledScroll)
 * }, [throttledScroll])
 * ```
 */
export function useThrottle<T>(value: T, interval: number = 100): T {
    const [throttledValue, setThrottledValue] = useState<T>(value)
    const lastUpdated = useRef<number>(Date.now())

    useEffect(() => {
        const now = Date.now()
        const timeSinceLastUpdate = now - lastUpdated.current

        if (timeSinceLastUpdate >= interval) {
            lastUpdated.current = now
            setThrottledValue(value)
        } else {
            const timer = setTimeout(() => {
                lastUpdated.current = Date.now()
                setThrottledValue(value)
            }, interval - timeSinceLastUpdate)

            return () => {
                clearTimeout(timer)
            }
        }
    }, [value, interval])

    return throttledValue
}

/**
 * Create a throttled callback function
 *
 * @param callback - The callback function to throttle
 * @param interval - Minimum interval between calls in milliseconds (default: 100ms)
 * @returns A throttled version of the callback
 *
 * @example
 * ```tsx
 * const handleScroll = useThrottledCallback((event: Event) => {
 *   updateScrollPosition(event)
 * }, 100)
 *
 * useEffect(() => {
 *   window.addEventListener('scroll', handleScroll)
 *   return () => window.removeEventListener('scroll', handleScroll)
 * }, [handleScroll])
 * ```
 */
export function useThrottledCallback<T extends (...args: unknown[]) => unknown>(
    callback: T,
    interval: number = 100
): (...args: Parameters<T>) => void {
    const lastCalledRef = useRef<number>(0)
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const callbackRef = useRef(callback)

    // Update callback ref when callback changes
    useEffect(() => {
        callbackRef.current = callback
    }, [callback])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current)
            }
        }
    }, [])

    return useCallback(
        (...args: Parameters<T>) => {
            const now = Date.now()
            const timeSinceLastCall = now - lastCalledRef.current

            if (timeSinceLastCall >= interval) {
                lastCalledRef.current = now
                callbackRef.current(...args)
            } else {
                // Schedule a trailing call
                if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current)
                }

                timeoutRef.current = setTimeout(() => {
                    lastCalledRef.current = Date.now()
                    callbackRef.current(...args)
                }, interval - timeSinceLastCall)
            }
        },
        [interval]
    )
}

export default useThrottle
