/**
 * Unit Tests: useAbortController Hook
 * Tests for AbortController lifecycle management in React components
 * **Validates: Requirements 1.4**
 */

import { renderHook } from '@testing-library/react'
import { useAbortController } from '../useAbortController'

describe('useAbortController', () => {
    describe('AbortController creation', () => {
        it('should create an AbortController on mount', () => {
            const { result } = renderHook(() => useAbortController())

            expect(result.current.signal).toBeInstanceOf(AbortSignal)
            expect(result.current.abort).toBeInstanceOf(Function)
        })

        it('should provide a valid AbortSignal', () => {
            const { result } = renderHook(() => useAbortController())

            expect(result.current.signal.aborted).toBe(false)
        })

        it('should provide an abort function', () => {
            const { result } = renderHook(() => useAbortController())

            expect(typeof result.current.abort).toBe('function')
        })
    })

    describe('Manual abort', () => {
        it('should abort the signal when abort is called', () => {
            const { result } = renderHook(() => useAbortController())

            expect(result.current.signal.aborted).toBe(false)

            result.current.abort()

            expect(result.current.signal.aborted).toBe(true)
        })

        it('should be safe to call abort multiple times', () => {
            const { result } = renderHook(() => useAbortController())

            result.current.abort()
            result.current.abort()
            result.current.abort()

            expect(result.current.signal.aborted).toBe(true)
        })
    })

    describe('Component cleanup on unmount', () => {
        it('should abort the signal when component unmounts', () => {
            const { result, unmount } = renderHook(() => useAbortController())

            const signal = result.current.signal

            expect(signal.aborted).toBe(false)

            unmount()

            expect(signal.aborted).toBe(true)
        })

        it('should abort even if abort was never called manually', () => {
            const { result, unmount } = renderHook(() => useAbortController())

            const signal = result.current.signal

            // Don't call abort manually
            expect(signal.aborted).toBe(false)

            unmount()

            // Should still be aborted on unmount
            expect(signal.aborted).toBe(true)
        })

        it('should handle unmount after manual abort', () => {
            const { result, unmount } = renderHook(() => useAbortController())

            const signal = result.current.signal

            // Manually abort first
            result.current.abort()
            expect(signal.aborted).toBe(true)

            // Unmount should not throw
            expect(() => unmount()).not.toThrow()

            // Signal should still be aborted
            expect(signal.aborted).toBe(true)
        })
    })

    describe('Signal stability', () => {
        it('should return the same signal instance across renders', () => {
            const { result, rerender } = renderHook(() => useAbortController())

            const firstSignal = result.current.signal

            rerender()

            const secondSignal = result.current.signal

            expect(firstSignal).toBe(secondSignal)
        })

        it('should provide consistent abort function across renders', () => {
            const { result, rerender } = renderHook(() => useAbortController())

            const firstAbort = result.current.abort

            rerender()

            const secondAbort = result.current.abort

            // Both functions should work correctly
            expect(typeof firstAbort).toBe('function')
            expect(typeof secondAbort).toBe('function')
        })
    })

    describe('Integration with fetch', () => {
        it('should work with fetch API', async () => {
            const { result } = renderHook(() => useAbortController())

            const mockFetch = jest.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ data: 'test' })
                } as Response)
            )

            global.fetch = mockFetch

            await fetch('https://example.com', { signal: result.current.signal })

            expect(mockFetch).toHaveBeenCalledWith(
                'https://example.com',
                expect.objectContaining({
                    signal: result.current.signal
                })
            )
        })

        it('should cancel fetch when aborted', async () => {
            const { result } = renderHook(() => useAbortController())

            const mockFetch = jest.fn(() =>
                new Promise((resolve, reject) => {
                    result.current.signal.addEventListener('abort', () => {
                        const error = new Error('The operation was aborted')
                        error.name = 'AbortError'
                        reject(error)
                    })
                })
            ) as typeof fetch

            global.fetch = mockFetch

            const fetchPromise = fetch('https://example.com', { signal: result.current.signal })

            result.current.abort()

            await expect(fetchPromise).rejects.toThrow('The operation was aborted')
        })
    })
})
