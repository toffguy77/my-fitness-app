import { act, renderHook, waitFor } from '@testing-library/react'
import { useResource } from '../useResource'

describe('useResource', () => {
    it('без загрузчика ничего не грузит', () => {
        const { result } = renderHook(() => useResource<number>(null))
        expect(result.current.loading).toBe(false)
        expect(result.current.data).toBeUndefined()
    })

    it('загружает, повторяет и подменяет данные', async () => {
        const load = jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2)
        const { result } = renderHook(() => useResource(load))
        expect(result.current.loading).toBe(true)
        await waitFor(() => expect(result.current.data).toBe(1))
        expect(result.current.loading).toBe(false)

        act(() => result.current.reload())
        // Прежние данные остаются на экране, пока идёт повтор.
        expect(result.current.data).toBe(1)
        expect(result.current.loading).toBe(true)
        await waitFor(() => expect(result.current.data).toBe(2))

        act(() => result.current.replace(3))
        expect(result.current.data).toBe(3)
        expect(load).toHaveBeenCalledTimes(2)
    })

    it('ошибка доступна как error', async () => {
        const failure = new Error('boom')
        const load = () => Promise.reject(failure)
        const { result } = renderHook(() => useResource(load))
        await waitFor(() => expect(result.current.error).toBe(failure))
    })

    it('ответ для прежнего загрузчика не попадает к новому', async () => {
        let resolveFirst: (value: string) => void = () => {}
        const first = () => new Promise<string>((resolve) => (resolveFirst = resolve))
        const second = () => Promise.resolve('second')
        const { result, rerender } = renderHook(({ load }) => useResource(load), { initialProps: { load: first } })
        rerender({ load: second })
        await waitFor(() => expect(result.current.data).toBe('second'))
        act(() => resolveFirst('first'))
        expect(result.current.data).toBe('second')
    })

    it('replace без загрузчика ничего не делает', () => {
        const { result } = renderHook(() => useResource<number>(null))
        act(() => result.current.replace(1))
        expect(result.current.data).toBeUndefined()
    })
})
