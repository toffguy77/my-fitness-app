import { renderHook, act } from '@testing-library/react'
import { useThrottle, useThrottledCallback } from '../useThrottle'

describe('useThrottle', () => {
    beforeEach(() => {
        jest.useFakeTimers()
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    it('should return the initial value immediately', () => {
        const { result } = renderHook(() => useThrottle('initial', 200))

        expect(result.current).toBe('initial')
    })

    it('should update after the interval when value changes', () => {
        const { result, rerender } = renderHook(
            ({ value, interval }) => useThrottle(value, interval),
            { initialProps: { value: 'first', interval: 200 } }
        )

        expect(result.current).toBe('first')

        rerender({ value: 'second', interval: 200 })

        // Value should not update synchronously
        expect(result.current).toBe('first')

        // Advance past the throttle interval
        act(() => {
            jest.advanceTimersByTime(250)
        })

        expect(result.current).toBe('second')
    })

    it('should throttle rapid updates and only apply the latest', () => {
        const { result, rerender } = renderHook(
            ({ value }) => useThrottle(value, 300),
            { initialProps: { value: 0 } }
        )

        // Immediately update via setTimeout(0) for first change
        rerender({ value: 1 })

        act(() => {
            jest.advanceTimersByTime(0)
        })

        expect(result.current).toBe(1)

        // Now rapidly change values within the throttle window
        rerender({ value: 2 })
        rerender({ value: 3 })
        rerender({ value: 4 })

        // Still throttled, should not have updated yet
        expect(result.current).toBe(1)

        // Advance past the throttle interval
        act(() => {
            jest.advanceTimersByTime(350)
        })

        expect(result.current).toBe(4)
    })

    it('should handle the default interval of 100ms', () => {
        const { result, rerender } = renderHook(
            ({ value }) => useThrottle(value),
            { initialProps: { value: 'a' } }
        )

        // First update fires via setTimeout(0)
        rerender({ value: 'b' })

        act(() => {
            jest.advanceTimersByTime(0)
        })

        expect(result.current).toBe('b')

        rerender({ value: 'c' })

        // Before 100ms, still previous value
        act(() => {
            jest.advanceTimersByTime(50)
        })

        expect(result.current).toBe('b')

        act(() => {
            jest.advanceTimersByTime(60)
        })

        expect(result.current).toBe('c')
    })

    it('should clean up timers on unmount', () => {
        const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout')

        const { unmount } = renderHook(
            ({ value }) => useThrottle(value, 200),
            { initialProps: { value: 'test' } }
        )

        unmount()

        expect(clearTimeoutSpy).toHaveBeenCalled()

        clearTimeoutSpy.mockRestore()
    })
})

describe('useThrottledCallback', () => {
    beforeEach(() => {
        jest.useFakeTimers()
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    it('should execute immediately on first call', () => {
        const callback = jest.fn()

        const { result } = renderHook(() => useThrottledCallback(callback, 200))

        act(() => {
            result.current('arg1')
        })

        expect(callback).toHaveBeenCalledTimes(1)
        expect(callback).toHaveBeenCalledWith('arg1')
    })

    it('should throttle subsequent calls within the interval', () => {
        const callback = jest.fn()

        const { result } = renderHook(() => useThrottledCallback(callback, 200))

        // First call executes immediately
        act(() => {
            result.current('first')
        })

        expect(callback).toHaveBeenCalledTimes(1)

        // Second call within interval is scheduled
        act(() => {
            result.current('second')
        })

        expect(callback).toHaveBeenCalledTimes(1)

        // After interval, trailing call executes
        act(() => {
            jest.advanceTimersByTime(250)
        })

        expect(callback).toHaveBeenCalledTimes(2)
        expect(callback).toHaveBeenLastCalledWith('second')
    })

    it('should use the latest arguments for the trailing call', () => {
        const callback = jest.fn()

        const { result } = renderHook(() => useThrottledCallback(callback, 200))

        act(() => {
            result.current('first')
        })

        // Multiple rapid calls
        act(() => {
            result.current('second')
            result.current('third')
            result.current('fourth')
        })

        // Only the trailing call should fire with the last arguments
        act(() => {
            jest.advanceTimersByTime(250)
        })

        expect(callback).toHaveBeenCalledTimes(2)
        expect(callback).toHaveBeenLastCalledWith('fourth')
    })

    it('should allow execution again after the interval passes', () => {
        const callback = jest.fn()

        const { result } = renderHook(() => useThrottledCallback(callback, 100))

        // First call
        act(() => {
            result.current('a')
        })

        expect(callback).toHaveBeenCalledTimes(1)

        // Wait past the interval
        act(() => {
            jest.advanceTimersByTime(150)
        })

        // Second call should execute immediately
        act(() => {
            result.current('b')
        })

        expect(callback).toHaveBeenCalledTimes(2)
        expect(callback).toHaveBeenLastCalledWith('b')
    })

    it('should clean up timer on unmount', () => {
        const callback = jest.fn()
        const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout')

        const { result, unmount } = renderHook(() => useThrottledCallback(callback, 200))

        // Trigger a trailing call
        act(() => {
            result.current('first')
            result.current('second')
        })

        unmount()

        expect(clearTimeoutSpy).toHaveBeenCalled()

        // Advancing time should not trigger the callback after unmount
        act(() => {
            jest.advanceTimersByTime(300)
        })

        // Only the initial immediate call should have fired
        expect(callback).toHaveBeenCalledTimes(1)

        clearTimeoutSpy.mockRestore()
    })

    it('should use updated callback reference', () => {
        const callback1 = jest.fn()
        const callback2 = jest.fn()

        const { result, rerender } = renderHook(
            ({ cb }) => useThrottledCallback(cb, 200),
            { initialProps: { cb: callback1 as (...args: unknown[]) => unknown } }
        )

        // First call uses callback1
        act(() => {
            result.current('a')
        })

        expect(callback1).toHaveBeenCalledTimes(1)

        // Switch to callback2
        rerender({ cb: callback2 as (...args: unknown[]) => unknown })

        // Wait past the interval
        act(() => {
            jest.advanceTimersByTime(250)
        })

        // New call should use callback2
        act(() => {
            result.current('b')
        })

        expect(callback2).toHaveBeenCalledTimes(1)
        expect(callback2).toHaveBeenCalledWith('b')
    })

    it('should use the default interval of 100ms', () => {
        const callback = jest.fn()

        const { result } = renderHook(() => useThrottledCallback(callback))

        act(() => {
            result.current('first')
        })

        act(() => {
            result.current('second')
        })

        // Before 100ms
        act(() => {
            jest.advanceTimersByTime(50)
        })

        expect(callback).toHaveBeenCalledTimes(1)

        // After 100ms
        act(() => {
            jest.advanceTimersByTime(60)
        })

        expect(callback).toHaveBeenCalledTimes(2)
    })

    it('should return a stable function reference', () => {
        const callback = jest.fn()

        const { result, rerender } = renderHook(
            ({ interval }) => useThrottledCallback(callback, interval),
            { initialProps: { interval: 200 } }
        )

        const firstRef = result.current

        // Rerender with same interval
        rerender({ interval: 200 })

        expect(result.current).toBe(firstRef)
    })
})
