import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UnsavedDataNotification } from '../UnsavedDataNotification'

const mockUpdateMetric = jest.fn()

jest.mock('../../store/dashboardStore', () => ({
    useDashboardStore: () => ({
        updateMetric: mockUpdateMetric,
    }),
}))

const mockRemoveUnsavedData = jest.fn()
const mockClearUnsavedData = jest.fn()
const mockCanRetry = jest.fn()

let mockUnsavedData: Array<{
    date: string
    metric: { type: string; data: Record<string, unknown> }
    timestamp: number
    attempts: number
}> = []

jest.mock('../../hooks/useUnsavedData', () => ({
    useUnsavedData: () => ({
        unsavedData: mockUnsavedData,
        unsavedCount: mockUnsavedData.length,
        removeUnsavedData: mockRemoveUnsavedData,
        clearUnsavedData: mockClearUnsavedData,
        canRetry: mockCanRetry,
    }),
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: {
        success: jest.fn(),
        error: jest.fn(),
    },
}))

describe('UnsavedDataNotification', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockUnsavedData = []
        mockCanRetry.mockReturnValue(true)
        mockUpdateMetric.mockResolvedValue(undefined)
        window.confirm = jest.fn().mockReturnValue(true)
    })

    it('renders nothing when there is no unsaved data', () => {
        const { container } = render(<UnsavedDataNotification />)
        expect(container.firstChild).toBeNull()
    })

    it('renders notification when unsaved data exists', () => {
        mockUnsavedData = [
            {
                date: '2026-03-07',
                metric: { type: 'weight', data: { weight: 80 } },
                timestamp: Date.now(),
                attempts: 1,
            },
        ]

        render(<UnsavedDataNotification />)
        expect(screen.getByText('Несохраненные данные')).toBeInTheDocument()
        expect(screen.getByText('Есть 1 несохраненная запись')).toBeInTheDocument()
    })

    it('shows plural form for multiple entries', () => {
        mockUnsavedData = [
            {
                date: '2026-03-07',
                metric: { type: 'weight', data: { weight: 80 } },
                timestamp: Date.now(),
                attempts: 1,
            },
            {
                date: '2026-03-06',
                metric: { type: 'steps', data: { steps: 5000 } },
                timestamp: Date.now(),
                attempts: 1,
            },
        ]

        render(<UnsavedDataNotification />)
        expect(screen.getByText('Есть 2 несохраненных записей')).toBeInTheDocument()
    })

    it('shows entry list for 3 or fewer entries', () => {
        mockUnsavedData = [
            {
                date: '2026-03-07',
                metric: { type: 'weight', data: { weight: 80 } },
                timestamp: Date.now(),
                attempts: 1,
            },
        ]

        render(<UnsavedDataNotification />)
        expect(screen.getByText(/Вес/)).toBeInTheDocument()
    })

    it('shows correct metric type labels', () => {
        mockUnsavedData = [
            {
                date: '2026-03-07',
                metric: { type: 'weight', data: { weight: 80 } },
                timestamp: Date.now(),
                attempts: 1,
            },
            {
                date: '2026-03-06',
                metric: { type: 'steps', data: { steps: 5000 } },
                timestamp: Date.now(),
                attempts: 1,
            },
            {
                date: '2026-03-05',
                metric: { type: 'nutrition', data: {} },
                timestamp: Date.now(),
                attempts: 1,
            },
        ]

        render(<UnsavedDataNotification />)
        expect(screen.getByText(/Вес/)).toBeInTheDocument()
        expect(screen.getByText(/Шаги/)).toBeInTheDocument()
        expect(screen.getByText(/Питание/)).toBeInTheDocument()
    })

    it('retries a single entry when retry button is clicked', async () => {
        const user = userEvent.setup()
        mockUnsavedData = [
            {
                date: '2026-03-07',
                metric: { type: 'weight', data: { weight: 80 } },
                timestamp: Date.now(),
                attempts: 1,
            },
        ]

        render(<UnsavedDataNotification />)

        await user.click(screen.getByLabelText('Повторить'))

        await waitFor(() => {
            expect(mockUpdateMetric).toHaveBeenCalledWith('2026-03-07', {
                type: 'weight',
                data: { weight: 80 },
            })
            expect(mockRemoveUnsavedData).toHaveBeenCalledWith('2026-03-07')
        })
    })

    it('does not retry when canRetry returns false', async () => {
        const user = userEvent.setup()
        mockCanRetry.mockReturnValue(false)
        mockUnsavedData = [
            {
                date: '2026-03-07',
                metric: { type: 'weight', data: { weight: 80 } },
                timestamp: Date.now(),
                attempts: 5,
            },
        ]

        render(<UnsavedDataNotification />)

        // Retry button should not be visible when canRetry is false
        expect(screen.queryByLabelText('Повторить')).not.toBeInTheDocument()
    })

    it('retries all entries when "Повторить" main button is clicked', async () => {
        const user = userEvent.setup()
        mockUnsavedData = [
            {
                date: '2026-03-07',
                metric: { type: 'weight', data: { weight: 80 } },
                timestamp: Date.now(),
                attempts: 1,
            },
            {
                date: '2026-03-06',
                metric: { type: 'steps', data: { steps: 5000 } },
                timestamp: Date.now(),
                attempts: 1,
            },
        ]

        render(<UnsavedDataNotification />)

        // Click the main retry button (not the individual one)
        const retryButtons = screen.getAllByText('Повторить')
        const mainRetryButton = retryButtons.find((btn) =>
            btn.closest('button[class*="bg-yellow-600"]')
        )
        await user.click(mainRetryButton!)

        await waitFor(() => {
            expect(mockUpdateMetric).toHaveBeenCalledTimes(2)
        })
    })

    it('shows error toast when retry fails', async () => {
        const user = userEvent.setup()
        const toast = jest.requireMock('react-hot-toast').default
        mockUpdateMetric.mockRejectedValue(new Error('Network error'))
        mockUnsavedData = [
            {
                date: '2026-03-07',
                metric: { type: 'weight', data: { weight: 80 } },
                timestamp: Date.now(),
                attempts: 1,
            },
        ]

        render(<UnsavedDataNotification />)

        await user.click(screen.getByLabelText('Повторить'))

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('Не удалось сохранить данные')
        })
    })

    it('dismisses notification after confirmation', async () => {
        const user = userEvent.setup()
        mockUnsavedData = [
            {
                date: '2026-03-07',
                metric: { type: 'weight', data: { weight: 80 } },
                timestamp: Date.now(),
                attempts: 1,
            },
        ]

        render(<UnsavedDataNotification />)

        await user.click(screen.getByText('Отменить'))

        expect(window.confirm).toHaveBeenCalled()
        expect(mockClearUnsavedData).toHaveBeenCalled()
    })

    it('does not dismiss when confirm is cancelled', async () => {
        const user = userEvent.setup();
        (window.confirm as jest.Mock).mockReturnValue(false)
        mockUnsavedData = [
            {
                date: '2026-03-07',
                metric: { type: 'weight', data: { weight: 80 } },
                timestamp: Date.now(),
                attempts: 1,
            },
        ]

        render(<UnsavedDataNotification />)

        await user.click(screen.getByText('Отменить'))

        expect(window.confirm).toHaveBeenCalled()
        expect(mockClearUnsavedData).not.toHaveBeenCalled()
    })

    it('close button also triggers dismiss with confirmation', async () => {
        const user = userEvent.setup()
        mockUnsavedData = [
            {
                date: '2026-03-07',
                metric: { type: 'weight', data: { weight: 80 } },
                timestamp: Date.now(),
                attempts: 1,
            },
        ]

        render(<UnsavedDataNotification />)

        await user.click(screen.getByLabelText('Закрыть'))

        expect(window.confirm).toHaveBeenCalled()
        expect(mockClearUnsavedData).toHaveBeenCalled()
    })

    it('shows retry all success and failure counts', async () => {
        const user = userEvent.setup()
        const toast = jest.requireMock('react-hot-toast').default
        mockUpdateMetric
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('fail'))
        mockUnsavedData = [
            {
                date: '2026-03-07',
                metric: { type: 'weight', data: { weight: 80 } },
                timestamp: Date.now(),
                attempts: 1,
            },
            {
                date: '2026-03-06',
                metric: { type: 'steps', data: { steps: 5000 } },
                timestamp: Date.now(),
                attempts: 1,
            },
        ]

        render(<UnsavedDataNotification />)

        const retryButtons = screen.getAllByText('Повторить')
        const mainRetryButton = retryButtons.find((btn) =>
            btn.closest('button[class*="bg-yellow-600"]')
        )
        await user.click(mainRetryButton!)

        await waitFor(() => {
            expect(toast.success).toHaveBeenCalledWith('Сохранено записей: 1')
            expect(toast.error).toHaveBeenCalledWith('Не удалось сохранить: 1')
        })
    })
})
