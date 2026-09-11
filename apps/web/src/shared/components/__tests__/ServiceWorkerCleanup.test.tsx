import { render } from '@testing-library/react'
import { ServiceWorkerCleanup, SW_CLEANUP_KEY } from '../ServiceWorkerCleanup'

const mockAddEventListener = jest.fn()
const mockRemoveEventListener = jest.fn()
const mockRegister = jest.fn().mockResolvedValue({})

function makeSwApi(controller: object | null = null, registrations: object[] = []) {
    return {
        controller,
        addEventListener: mockAddEventListener,
        removeEventListener: mockRemoveEventListener,
        getRegistrations: jest.fn().mockResolvedValue(registrations),
        register: mockRegister,
    }
}

beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    Object.defineProperty(navigator, 'serviceWorker', {
        value: makeSwApi(),
        writable: true,
        configurable: true,
    })
})

describe('ServiceWorkerCleanup', () => {
    it('renders null', () => {
        const { container } = render(<ServiceWorkerCleanup />)
        expect(container.firstChild).toBeNull()
    })

    it('registers controllerchange listener on mount', () => {
        render(<ServiceWorkerCleanup />)
        expect(mockAddEventListener).toHaveBeenCalledWith('controllerchange', expect.any(Function))
    })

    it('removes controllerchange listener on unmount', () => {
        const { unmount } = render(<ServiceWorkerCleanup />)
        unmount()
        expect(mockRemoveEventListener).toHaveBeenCalledWith('controllerchange', expect.any(Function))
    })

    it('handler is a no-op when there was no prior controller', () => {
        render(<ServiceWorkerCleanup />)
        // existingController is null → no reload
        const handler = mockAddEventListener.mock.calls.find(
            ([event]: [string]) => event === 'controllerchange'
        )?.[1]
        expect(() => handler?.()).not.toThrow()
    })

    it('handler triggers reload branch when a prior controller exists', () => {
        Object.defineProperty(navigator, 'serviceWorker', {
            value: makeSwApi({ scriptURL: 'sw.js' }),
            writable: true,
            configurable: true,
        })
        render(<ServiceWorkerCleanup />)
        // existingController !== null → handler enters the reload branch
        const handler = mockAddEventListener.mock.calls.find(
            ([event]: [string]) => event === 'controllerchange'
        )?.[1]
        expect(() => handler?.()).not.toThrow()
    })

    it('unregisters SWs on first render when localStorage flag is absent', async () => {
        const mockUnregister = jest.fn().mockResolvedValue(true)
        Object.defineProperty(navigator, 'serviceWorker', {
            value: makeSwApi(null, [{ unregister: mockUnregister }]),
            writable: true,
            configurable: true,
        })
        render(<ServiceWorkerCleanup />)
        await new Promise(r => setTimeout(r, 0))
        expect(mockUnregister).toHaveBeenCalled()
    })

    it('skips cleanup when localStorage flag is already set', async () => {
        localStorage.setItem(SW_CLEANUP_KEY, Date.now().toString())
        const mockUnregister = jest.fn()
        Object.defineProperty(navigator, 'serviceWorker', {
            value: makeSwApi(null, [{ unregister: mockUnregister }]),
            writable: true,
            configurable: true,
        })
        render(<ServiceWorkerCleanup />)
        await new Promise(r => setTimeout(r, 0))
        expect(mockUnregister).not.toHaveBeenCalled()
    })
})

describe('регистрация воркера', () => {
    const realEnv = process.env.NODE_ENV

    afterEach(() => {
        Object.defineProperty(process.env, 'NODE_ENV', { value: realEnv, configurable: true })
    })

    // Воркер собирался, отдавался по /sw.js и не был зарегистрирован ни у
    // одного посетителя: next-pwa вставлял регистрацию сам, Serwist в режиме
    // конфигуратора — нет. Файл на месте и корректен, а кэша, офлайн-экрана и
    // push нет. Проверка сборки такого не видит: спросить можно только браузер,
    // либо вот так — у компонента, который обязан это сделать.
    it('подключает /sw.js в проде', async () => {
        Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true })

        render(<ServiceWorkerCleanup />)
        await new Promise(r => setTimeout(r, 0))

        expect(mockRegister).toHaveBeenCalledWith('/sw.js')
    })

    // В режиме разработки воркер намеренно не собирается, и регистрация только
    // засоряла бы консоль отказом.
    it('не подключает в режиме разработки', async () => {
        Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', configurable: true })

        render(<ServiceWorkerCleanup />)
        await new Promise(r => setTimeout(r, 0))

        expect(mockRegister).not.toHaveBeenCalled()
    })
})
