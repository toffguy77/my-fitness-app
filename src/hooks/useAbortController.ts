'use client'

import { useEffect, useState, useCallback } from 'react'

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
    // Use useState to create controller once
    const [controller] = useState(() => new AbortController())

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            // Abort all pending requests when component unmounts
            controller.abort()
        }
    }, [controller])

    // Create stable abort function
    const abort = useCallback(() => {
        controller.abort()
    }, [controller])

    // Return stable object with signal and abort function
    return {
        signal: controller.signal,
        abort
    }
}
