import { renderHook } from '@testing-library/react'
import { useLogger } from '../useLogger'

describe('useLogger', () => {
    it('returns logger functions', () => {
        const { result } = renderHook(() => useLogger())

        expect(result.current.debug).toBeDefined()
        expect(result.current.info).toBeDefined()
        expect(result.current.warn).toBeDefined()
        expect(result.current.error).toBeDefined()
        expect(result.current.fatal).toBeDefined()
        expect(result.current.logUserAction).toBeDefined()
        expect(result.current.logAPICall).toBeDefined()
    })

    it('logs with component context', () => {
        const { result } = renderHook(() => useLogger({ component: 'TestComponent' }))

        expect(() => {
            result.current.info('test message')
        }).not.toThrow()
    })

    it('logs user actions', () => {
        const { result } = renderHook(() => useLogger())

        expect(() => {
            result.current.logUserAction('button_click')
        }).not.toThrow()
    })

    it('logs API calls', () => {
        const { result } = renderHook(() => useLogger())

        expect(() => {
            result.current.logAPICall('GET', '/api/test', 200, 100)
        }).not.toThrow()
    })

    it('handles auto log mount', () => {
        expect(() => {
            renderHook(() => useLogger({ component: 'Test', autoLogMount: true }))
        }).not.toThrow()
    })

    it('handles auto log unmount', () => {
        const { unmount } = renderHook(() =>
            useLogger({ component: 'Test', autoLogUnmount: true })
        )

        expect(() => {
            unmount()
        }).not.toThrow()
    })
})
