import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WaterBlock } from '../WaterBlock'

jest.mock('@/shared/utils/format', () => ({
    formatLocalDate: (d: Date) => d.toISOString().slice(0, 10),
}))

jest.mock('../AttentionBadge', () => ({
    AttentionBadge: ({ ariaLabel }: { ariaLabel: string }) => (
        <span data-testid="attention-badge" aria-label={ariaLabel} />
    ),
}))

const mockApiGet = jest.fn()
const mockApiPost = jest.fn()

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        get: (...args: unknown[]) => mockApiGet(...args),
        post: (...args: unknown[]) => mockApiPost(...args),
    },
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: {
        success: jest.fn(),
        error: jest.fn(),
    },
}))

function createDate(dateStr: string): Date {
    return new Date(`${dateStr}T12:00:00`)
}

describe('WaterBlock', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockApiGet.mockResolvedValue({
            glasses: 0,
            goal: 8,
            glass_size: 250,
            enabled: true,
        })
        mockApiPost.mockResolvedValue({
            glasses: 1,
            goal: 8,
            glass_size: 250,
        })
    })

    it('returns null when water tracking is disabled', async () => {
        mockApiGet.mockResolvedValue({
            glasses: 0,
            goal: 8,
            glass_size: 250,
            enabled: false,
        })

        const { container } = render(<WaterBlock date={createDate('2026-03-07')} />)

        await waitFor(() => {
            expect(container.firstChild).toBeNull()
        })
    })

    it('returns null while loading (enabled is null)', () => {
        mockApiGet.mockReturnValue(new Promise(() => {})) // never resolves

        const { container } = render(<WaterBlock date={createDate('2026-03-07')} />)
        expect(container.firstChild).toBeNull()
    })

    it('renders water card with title when enabled', async () => {
        render(<WaterBlock date={createDate('2026-03-07')} />)

        await waitFor(() => {
            expect(screen.getByText('Вода')).toBeInTheDocument()
        })
    })

    it('shows "Не записано" when no glasses are logged', async () => {
        render(<WaterBlock date={createDate('2026-03-07')} />)

        await waitFor(() => {
            expect(screen.getByText('Не записано')).toBeInTheDocument()
        })
    })

    it('shows attention badge today when no water logged', async () => {
        const today = new Date()
        render(<WaterBlock date={today} />)

        await waitFor(() => {
            expect(screen.getByTestId('attention-badge')).toBeInTheDocument()
        })
    })

    it('shows progress ring when glasses are logged', async () => {
        mockApiGet.mockResolvedValue({
            glasses: 3,
            goal: 8,
            glass_size: 250,
            enabled: true,
        })

        render(<WaterBlock date={createDate('2026-03-07')} />)

        await waitFor(() => {
            expect(screen.getByText('3/8')).toBeInTheDocument()
            expect(screen.getByText('38%')).toBeInTheDocument()
        })
    })

    it('displays glass size info', async () => {
        mockApiGet.mockResolvedValue({
            glasses: 2,
            goal: 8,
            glass_size: 300,
            enabled: true,
        })

        render(<WaterBlock date={createDate('2026-03-07')} />)

        await waitFor(() => {
            expect(screen.getByText('стаканов (300 мл)')).toBeInTheDocument()
        })
    })

    it('shows goal reached message when glasses >= goal', async () => {
        mockApiGet.mockResolvedValue({
            glasses: 8,
            goal: 8,
            glass_size: 250,
            enabled: true,
        })

        render(<WaterBlock date={createDate('2026-03-07')} />)

        await waitFor(() => {
            expect(screen.getByText('Цель достигнута!')).toBeInTheDocument()
        })
    })

    it('displays daily goal text', async () => {
        mockApiGet.mockResolvedValue({
            glasses: 0,
            goal: 10,
            glass_size: 250,
            enabled: true,
        })

        render(<WaterBlock date={createDate('2026-03-07')} />)

        await waitFor(() => {
            expect(screen.getByText('Цель: 10 стаканов в день')).toBeInTheDocument()
        })
    })

    it('adds a glass when add button is clicked', async () => {
        const user = userEvent.setup()
        render(<WaterBlock date={createDate('2026-03-07')} />)

        await waitFor(() => {
            expect(screen.getByText('Не записано')).toBeInTheDocument()
        })

        const addButtons = screen.getAllByLabelText('Добавить стакан воды')
        await user.click(addButtons[0])

        await waitFor(() => {
            expect(mockApiPost).toHaveBeenCalledWith(
                '/backend-api/v1/food-tracker/water',
                { date: '2026-03-07', glasses: 1 },
            )
        })
    })

    it('reverts glass count on API error', async () => {
        const user = userEvent.setup()
        const toast = jest.requireMock('react-hot-toast').default
        mockApiPost.mockRejectedValue(new Error('Network error'))

        render(<WaterBlock date={createDate('2026-03-07')} />)

        await waitFor(() => {
            expect(screen.getByText('Не записано')).toBeInTheDocument()
        })

        const addButtons = screen.getAllByLabelText('Добавить стакан воды')
        await user.click(addButtons[0])

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('Не удалось сохранить')
        })
    })

    it('has progressbar role on the water ring', async () => {
        mockApiGet.mockResolvedValue({
            glasses: 4,
            goal: 8,
            glass_size: 250,
            enabled: true,
        })

        render(<WaterBlock date={createDate('2026-03-07')} />)

        await waitFor(() => {
            const progressbar = screen.getByRole('progressbar')
            expect(progressbar).toHaveAttribute('aria-valuenow', '50')
            expect(progressbar).toHaveAttribute('aria-label', 'Прогресс воды: 50%')
        })
    })

    it('applies custom className', async () => {
        const { container } = render(
            <WaterBlock date={createDate('2026-03-07')} className="my-class" />
        )

        await waitFor(() => {
            expect(screen.getByText('Вода')).toBeInTheDocument()
        })

        expect(container.firstChild).toHaveClass('my-class')
    })

    it('shows "Добавить" button when glasses logged but goal not reached', async () => {
        mockApiGet.mockResolvedValue({
            glasses: 3,
            goal: 8,
            glass_size: 250,
            enabled: true,
        })

        render(<WaterBlock date={createDate('2026-03-07')} />)

        await waitFor(() => {
            expect(screen.getByText('Добавить')).toBeInTheDocument()
        })
    })
})
