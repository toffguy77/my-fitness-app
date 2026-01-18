'use client'

import { useEffect, useRef, useMemo } from 'react'

/**
 * Hook return type
 */
export interface UseAbortController {
    signal: AbortSignal
    abort: () => void
}

/**
 * React hook для управления AbortController
 *
 * Автоматически создает AbortController при монтировании компонента
 * и отменяет все активные запросы при размонтировании.
 *
 * Это предотвращает утечки памяти и ошибки AbortError в консоли
 * при навигации пользователя до завершения запросов.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { signal, abort } = useAbortController()
 *
 *   const fetchData = async () => {
 *     try {
 *       const data = await fetchWithAbort('/api/data', { signal })
 *       // Handle data
 *     } catch (error) {
 *       if (!isAbortError(error)) {
 *         // Handle error
 *       }
 *     }
 *   }
 *
 *   return <button onClick={fetchData}>Fetch</button>
 * }
 * ```
 *
 * @returns Object with signal and abort function
 */
export function useAbortController(): UseAbortController {
    const controllerRef = useRef<AbortController | null>(null)

    // Initialize AbortController on mount (only once)
    if (controllerRef.current == null) {
        controllerRef.current = new AbortController()
    }

    // Cleanup on unmount
    useEffect(() => {
        const controller = controllerRef.current

        return () => {
            // Abort all pending requests when component unmounts
            controller?.abort()
        }
    }, [])

    // Memoize return value to avoid accessing ref during render
    return useMemo(() => {
        const controller = controllerRef.current
        if (!controller) {
            throw new Error('AbortController not initialized')
        }

        return {
            signal: controller.signal,
            abort: () => controller.abort()
        }
    }, [])
}
