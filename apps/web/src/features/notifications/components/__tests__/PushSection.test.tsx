import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PushSection } from '../PushSection'
import * as deliveryApi from '../../api/deliveryApi'

jest.mock('../../api/deliveryApi', () => ({
    getPushKey: jest.fn(),
    subscribeToPush: jest.fn(),
    unsubscribeFromPush: jest.fn(),
}))

const getPushKey = deliveryApi.getPushKey as jest.Mock
const subscribeToPush = deliveryApi.subscribeToPush as jest.Mock

const requestPermission = jest.fn()
const subscribe = jest.fn()
const getSubscription = jest.fn()

function setUpBrowser({
    permission = 'default',
    supported = true,
    userAgent = 'Mozilla/5.0 (Macintosh)',
    existing = null,
}: {
    permission?: string
    supported?: boolean
    userAgent?: string
    existing?: unknown
} = {}) {
    Object.defineProperty(window.navigator, 'userAgent', {
        value: userAgent,
        configurable: true,
    })

    getSubscription.mockResolvedValue(existing)

    if (supported) {
        const registration = { pushManager: { getSubscription, subscribe } }
        Object.defineProperty(window.navigator, 'serviceWorker', {
            value: {
                // The application registers its own worker: nothing else in it
                // produces one, and `ready` never resolves without one.
                getRegistration: jest.fn().mockResolvedValue({ ...registration, active: {} }),
                register: jest.fn().mockResolvedValue(registration),
                ready: Promise.resolve(registration),
            },
            configurable: true,
        })
        ;(window as unknown as { PushManager: unknown }).PushManager = function () {}
    } else {
        // @ts-expect-error deliberately removing the API to model a browser without it
        delete window.navigator.serviceWorker
        // @ts-expect-error same
        delete window.PushManager
    }

    ;(window as unknown as { Notification: unknown }).Notification = {
        permission,
        requestPermission,
    }
}

beforeEach(() => {
    jest.clearAllMocks()
    getPushKey.mockResolvedValue('QkpMb25nRW5vdWdoS2V5VmFsdWVGb3JUZXN0aW5n')
    subscribeToPush.mockResolvedValue(undefined)
})

describe('PushSection', () => {
    it('never asks the browser for permission on its own', async () => {
        setUpBrowser()

        render(<PushSection />)

        expect(await screen.findByText('Включить push')).toBeInTheDocument()
        // The browser remembers a refusal, and there is no second chance to ask.
        expect(requestPermission).not.toHaveBeenCalled()
    })

    it('explains what push is for before asking', async () => {
        setUpBrowser()

        render(<PushSection />)

        expect(await screen.findByText(/Push приходит сразу/)).toBeInTheDocument()
    })

    it('asks, then registers the browser, when the button is pressed', async () => {
        setUpBrowser()
        requestPermission.mockResolvedValue('granted')
        subscribe.mockResolvedValue({
            endpoint: 'https://push.example/1',
            getKey: (name: string) =>
                new Uint8Array(name === 'auth' ? [1, 2, 3] : [4, 5, 6]).buffer,
        })
        const user = userEvent.setup()

        render(<PushSection />)
        await user.click(await screen.findByText('Включить push'))

        await waitFor(() => expect(subscribeToPush).toHaveBeenCalled())
        expect(subscribeToPush.mock.calls[0][0].endpoint).toBe('https://push.example/1')
        expect(await screen.findByText(/Push включён на этом устройстве/)).toBeInTheDocument()
    })

    it('says plainly that a refusal can only be undone in the browser', async () => {
        setUpBrowser({ permission: 'denied' })

        render(<PushSection />)

        expect(await screen.findByText(/настройках сайта/)).toBeInTheDocument()
        expect(screen.queryByText('Включить push')).not.toBeInTheDocument()
    })

    it('tells an iOS visitor to install the app instead of failing silently', async () => {
        setUpBrowser({ supported: false, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)' })

        render(<PushSection />)

        expect(await screen.findByText(/на домашний\s+экран/)).toBeInTheDocument()
    })

    it('says so when the browser has no push at all', async () => {
        setUpBrowser({ supported: false })

        render(<PushSection />)

        expect(await screen.findByText(/не умеет присылать push/)).toBeInTheDocument()
    })

    it('shows the state as subscribed when this browser already is', async () => {
        setUpBrowser({ permission: 'granted', existing: { endpoint: 'https://push.example/1' } })

        render(<PushSection />)

        expect(await screen.findByText(/Push включён на этом устройстве/)).toBeInTheDocument()
    })
})
