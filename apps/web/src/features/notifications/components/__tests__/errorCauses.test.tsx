/**
 * Уведомления: причина отказа доезжает до человека.
 *
 * Push — единственное место, где отказ вообще не показывали: человек нажимал
 * «Включить push», кнопка возвращалась на место, и экран молчал. Со стороны
 * это неотличимо от «кнопка не работает».
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/shared/errors/apiErrors'

import { NotificationDeliverySettings } from '../NotificationDeliverySettings'
import { PushSection } from '../PushSection'
import * as deliveryApi from '../../api/deliveryApi'

jest.mock('../../api/deliveryApi', () => ({
    ...jest.requireActual('../../api/deliveryApi'),
    getDeliveryPreferences: jest.fn(),
    updateDeliveryPreferences: jest.fn(),
    getPushKey: jest.fn(),
    subscribeToPush: jest.fn(),
    unsubscribeFromPush: jest.fn(),
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }),
}))

import toast from 'react-hot-toast'

const getPrefs = deliveryApi.getDeliveryPreferences as jest.Mock
const updatePrefs = deliveryApi.updateDeliveryPreferences as jest.Mock
const getPushKey = deliveryApi.getPushKey as jest.Mock
const subscribeToPush = deliveryApi.subscribeToPush as jest.Mock
const unsubscribeFromPush = deliveryApi.unsubscribeFromPush as jest.Mock

const requestPermission = jest.fn()
const subscribe = jest.fn()
const getSubscription = jest.fn()

/** Отказ, который сервер объяснил кодом. */
function refusal(status: number, code: string) {
    return new ApiError(status, { code, message: 'серверная проза' })
}

const WAIT = { timeout: 1500 }

function preferences() {
    return {
        types: [{ type: 'trainer_feedback', app: true, email: true, push: true }],
        quietHoursStart: null,
        quietHoursEnd: null,
        timezone: 'Europe/Moscow',
        emailUnsubscribed: false,
    }
}

function setUpBrowser({ permission = 'default', existing = null }: { permission?: string; existing?: unknown } = {}) {
    Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Macintosh)',
        configurable: true,
    })
    getSubscription.mockResolvedValue(existing)
    const registration = { pushManager: { getSubscription, subscribe } }
    Object.defineProperty(window.navigator, 'serviceWorker', {
        value: {
            getRegistration: jest.fn().mockResolvedValue({ ...registration, active: {} }),
            register: jest.fn().mockResolvedValue(registration),
            ready: Promise.resolve(registration),
        },
        configurable: true,
    })
    ;(window as unknown as { PushManager: unknown }).PushManager = function () {}
    ;(window as unknown as { Notification: unknown }).Notification = { permission, requestPermission }
}

beforeEach(() => {
    jest.clearAllMocks()
    getPushKey.mockResolvedValue('QkpMb25nRW5vdWdoS2V5VmFsdWVGb3JUZXN0aW5n')
    subscribeToPush.mockResolvedValue(undefined)
    unsubscribeFromPush.mockResolvedValue(undefined)
})

describe('Куда присылать уведомления', () => {
    it('показывает причину, по которой настройки не прочитались', async () => {
        getPrefs.mockRejectedValue(refusal(401, 'session_ended'))

        render(<NotificationDeliverySettings />)

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Сессия завершена, войдите заново'), WAIT)
    })

    it('показывает причину, по которой переключатель не сохранился', async () => {
        getPrefs.mockResolvedValue(preferences())
        updatePrefs.mockRejectedValue(refusal(400, 'validation'))

        render(<NotificationDeliverySettings />)
        await userEvent.click(await screen.findByRole('switch', { name: 'Ответ куратора письмом' }))

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Проверьте введённые данные'), WAIT)
    })
})

describe('Push на это устройство', () => {
    // Кнопка возвращалась на место и ничего не говорила — неотличимо от
    // «кнопка не работает».
    it('говорит, почему push не включился', async () => {
        setUpBrowser()
        requestPermission.mockResolvedValue('granted')
        subscribe.mockResolvedValue({
            endpoint: 'https://push.example/1',
            getKey: (name: string) => new Uint8Array(name === 'auth' ? [1, 2, 3] : [4, 5, 6]).buffer,
        })
        subscribeToPush.mockRejectedValue(refusal(503, 'feature_unavailable'))

        render(<PushSection />)
        await userEvent.click(await screen.findByText('Включить push'))

        expect(await screen.findByText('Возможность отключена в этой среде')).toBeInTheDocument()
    })

    it('говорит, почему push не выключился', async () => {
        setUpBrowser({ permission: 'granted', existing: { endpoint: 'https://push.example/1', unsubscribe: jest.fn() } })
        unsubscribeFromPush.mockRejectedValue(refusal(403, 'forbidden'))

        render(<PushSection />)
        await userEvent.click(await screen.findByText('Выключить'))

        expect(await screen.findByText('Нет доступа')).toBeInTheDocument()
    })

    it('не показывает ничего, пока ничего не отказало', async () => {
        setUpBrowser()

        render(<PushSection />)

        expect(await screen.findByText('Включить push')).toBeInTheDocument()
        expect(screen.queryByText('Нет доступа')).not.toBeInTheDocument()
    })
})
