import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { NotificationDeliverySettings } from '../NotificationDeliverySettings'
import * as deliveryApi from '../../api/deliveryApi'

jest.mock('../../api/deliveryApi', () => ({
    ...jest.requireActual('../../api/deliveryApi'),
    getDeliveryPreferences: jest.fn(),
    updateDeliveryPreferences: jest.fn(),
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: { error: jest.fn(), success: jest.fn() },
}))

const getPrefs = deliveryApi.getDeliveryPreferences as jest.Mock
const updatePrefs = deliveryApi.updateDeliveryPreferences as jest.Mock

const preferences = (overrides = {}) => ({
    types: [
        { type: 'trainer_feedback', app: true, email: true, push: true },
        { type: 'achievement', app: true, email: false, push: false },
    ],
    quietHoursStart: null,
    quietHoursEnd: null,
    timezone: 'Europe/Moscow',
    emailUnsubscribed: false,
    ...overrides,
})

beforeEach(() => {
    jest.clearAllMocks()
    updatePrefs.mockResolvedValue(undefined)
})

describe('NotificationDeliverySettings', () => {
    it('shows a row per event type once the settings arrive', async () => {
        getPrefs.mockResolvedValue(preferences())

        render(<NotificationDeliverySettings />)

        expect(await screen.findByText('Ответ куратора')).toBeInTheDocument()
        expect(screen.getByText('Достижения')).toBeInTheDocument()
    })

    it('never lets the application channel be turned off', async () => {
        getPrefs.mockResolvedValue(preferences())

        render(<NotificationDeliverySettings />)

        const appToggle = await screen.findByRole('switch', {
            name: 'Ответ куратора в приложении',
        })
        expect(appToggle).toBeDisabled()
        expect(appToggle).toBeChecked()
    })

    it('saves the matrix when an email switch is moved', async () => {
        getPrefs.mockResolvedValue(preferences())
        const user = userEvent.setup()

        render(<NotificationDeliverySettings />)

        await user.click(await screen.findByRole('switch', { name: 'Ответ куратора письмом' }))

        await waitFor(() => expect(updatePrefs).toHaveBeenCalled())
        expect(updatePrefs.mock.calls[0][0].types).toEqual([
            { type: 'trainer_feedback', app: true, email: false, push: true },
            { type: 'achievement', app: true, email: false, push: false },
        ])
    })

    it('closes the whole email column when somebody has unsubscribed', async () => {
        getPrefs.mockResolvedValue(preferences({ emailUnsubscribed: true }))

        render(<NotificationDeliverySettings />)

        const emailToggle = await screen.findByRole('switch', { name: 'Ответ куратора письмом' })
        expect(emailToggle).toBeDisabled()
        expect(emailToggle).not.toBeChecked()
    })

    it('sends both ends of quiet hours, never one', async () => {
        getPrefs.mockResolvedValue(preferences())
        const user = userEvent.setup()

        render(<NotificationDeliverySettings />)

        await user.selectOptions(await screen.findByLabelText('Начало тихого времени'), '23')

        await waitFor(() => expect(updatePrefs).toHaveBeenCalled())
        const sent = updatePrefs.mock.calls[0][0]
        expect(sent.quietHoursStart).toBe(23)
        expect(sent.quietHoursEnd).toBe(8)
    })

    it('turning quiet hours off clears both ends', async () => {
        getPrefs.mockResolvedValue(preferences({ quietHoursStart: 22, quietHoursEnd: 8 }))
        const user = userEvent.setup()

        render(<NotificationDeliverySettings />)

        await user.click(await screen.findByText('Выключить'))

        await waitFor(() => expect(updatePrefs).toHaveBeenCalled())
        expect(updatePrefs.mock.calls[0][0]).toMatchObject({
            quietHoursStart: null,
            quietHoursEnd: null,
        })
    })

    it('says so rather than showing an empty screen when loading fails', async () => {
        getPrefs.mockRejectedValue(new Error('nope'))
        const toast = jest.requireMock('react-hot-toast').default

        render(<NotificationDeliverySettings />)

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith('Не удалось загрузить настройки доставки')
        )
    })
})
