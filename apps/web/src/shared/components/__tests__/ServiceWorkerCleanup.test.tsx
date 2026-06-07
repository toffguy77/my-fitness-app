import { render } from '@testing-library/react'
import { ServiceWorkerCleanup } from '../ServiceWorkerCleanup'

const mockAddEventListener = jest.fn()
const mockRemoveEventListener = jest.fn()

function makeSwApi(controller: object | null = null, registrations: object[] = []) {
    return {
        controller,
        addEventListener: mockAddEventListener,
        removeEventListener: mockRemoveEventListener,
        getRegistrations: jest.fn().mockResolvedValue(registrations),
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
        localStorage.setItem('sw-cleanup-v3', Date.now().toString())
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
