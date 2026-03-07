import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WeightSection } from '../WeightSection'

// Mock recharts to avoid rendering issues in jsdom
jest.mock('recharts', () => ({
    LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
    Line: () => <div data-testid="chart-line" />,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    ReferenceLine: () => null,
}))

const mockUpdateMetric = jest.fn()
const mockDailyData: Record<string, { weight?: number | null }> = {}

jest.mock('../../store/dashboardStore', () => ({
    useDashboardStore: () => ({
        dailyData: mockDailyData,
        updateMetric: mockUpdateMetric,
    }),
}))

jest.mock('@/shared/utils/format', () => ({
    formatLocalDate: (d: Date) => d.toISOString().slice(0, 10),
}))

jest.mock('../../utils/validation', () => ({
    validateWeight: (n: number) => {
        if (isNaN(n) || n <= 0 || n > 500) {
            return { isValid: false, error: 'Неверное значение' }
        }
        return { isValid: true }
    },
}))

jest.mock('@/shared/hooks/useDebounce', () => ({
    useDebouncedCallback: (fn: Function) => fn,
}))

jest.mock('../AttentionBadge', () => ({
    AttentionBadge: ({ ariaLabel }: { ariaLabel: string }) => (
        <span data-testid="attention-badge" aria-label={ariaLabel} />
    ),
}))

const mockGetProfile = jest.fn().mockResolvedValue({ settings: {} })
jest.mock('@/features/settings/api/settings', () => ({
    getProfile: () => mockGetProfile(),
}))

const mockApiGet = jest.fn().mockResolvedValue({ weight_trend: [], target_weight: null })
jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        get: (...args: unknown[]) => mockApiGet(...args),
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

describe('WeightSection', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        Object.keys(mockDailyData).forEach((k) => delete mockDailyData[k])
        mockGetProfile.mockResolvedValue({ settings: {} })
        mockApiGet.mockResolvedValue({ weight_trend: [], target_weight: null })
    })

    it('renders the weight card title', () => {
        render(<WeightSection date={createDate('2026-03-07')} />)
        expect(screen.getByText('Вес')).toBeInTheDocument()
    })

    it('shows "Не записано" when no weight is logged', () => {
        render(<WeightSection date={createDate('2026-03-07')} />)
        expect(screen.getByText('Не записано')).toBeInTheDocument()
    })

    it('shows attention badge when date is today and no weight logged', () => {
        const today = new Date()
        render(<WeightSection date={today} />)
        expect(screen.getByTestId('attention-badge')).toBeInTheDocument()
    })

    it('does not show attention badge when weight is logged for today', () => {
        const today = new Date()
        const dateStr = today.toISOString().slice(0, 10)
        mockDailyData[dateStr] = { weight: 75.5 }

        render(<WeightSection date={today} />)
        expect(screen.queryByTestId('attention-badge')).not.toBeInTheDocument()
    })

    it('displays current weight when logged', () => {
        const dateStr = '2026-03-07'
        mockDailyData[dateStr] = { weight: 80 }

        render(<WeightSection date={createDate(dateStr)} />)
        expect(screen.getByText('80')).toBeInTheDocument()
        expect(screen.getByText('Записан')).toBeInTheDocument()
    })

    it('shows weight with decimal formatting', () => {
        const dateStr = '2026-03-07'
        mockDailyData[dateStr] = { weight: 80.5 }

        render(<WeightSection date={createDate(dateStr)} />)
        expect(screen.getByText('80.5')).toBeInTheDocument()
    })

    it('shows "Добавить вес" button when no weight is logged', () => {
        render(<WeightSection date={createDate('2026-03-07')} />)
        expect(screen.getByLabelText('Добавить вес')).toBeInTheDocument()
    })

    it('shows "Изменить вес" button when weight is logged', () => {
        const dateStr = '2026-03-07'
        mockDailyData[dateStr] = { weight: 75 }

        render(<WeightSection date={createDate(dateStr)} />)
        expect(screen.getByLabelText('Изменить вес')).toBeInTheDocument()
    })

    it('opens edit mode when add button is clicked', async () => {
        const user = userEvent.setup()
        render(<WeightSection date={createDate('2026-03-07')} />)

        await user.click(screen.getByLabelText('Добавить вес'))
        expect(screen.getByLabelText('Вес в килограммах')).toBeInTheDocument()
        expect(screen.getByText('Сохранить')).toBeInTheDocument()
        expect(screen.getByText('Отмена')).toBeInTheDocument()
    })

    it('pre-fills input with current weight when editing an existing value', async () => {
        const user = userEvent.setup()
        const dateStr = '2026-03-07'
        mockDailyData[dateStr] = { weight: 82 }

        render(<WeightSection date={createDate(dateStr)} />)

        await user.click(screen.getByLabelText('Изменить вес'))
        const input = screen.getByLabelText('Вес в килограммах') as HTMLInputElement
        expect(input.value).toBe('82')
    })

    it('cancels editing and clears input', async () => {
        const user = userEvent.setup()
        render(<WeightSection date={createDate('2026-03-07')} />)

        await user.click(screen.getByLabelText('Добавить вес'))
        expect(screen.getByText('Сохранить')).toBeInTheDocument()

        await user.click(screen.getByText('Отмена'))
        expect(screen.queryByText('Сохранить')).not.toBeInTheDocument()
        expect(screen.getByText('Не записано')).toBeInTheDocument()
    })

    it('saves weight on button click', async () => {
        const user = userEvent.setup()
        mockUpdateMetric.mockResolvedValue(undefined)

        render(<WeightSection date={createDate('2026-03-07')} />)

        await user.click(screen.getByLabelText('Добавить вес'))
        const input = screen.getByLabelText('Вес в килограммах')
        await user.type(input, '78.5')
        await user.click(screen.getByText('Сохранить'))

        await waitFor(() => {
            expect(mockUpdateMetric).toHaveBeenCalledWith('2026-03-07', {
                type: 'weight',
                data: { weight: 78.5 },
            })
        })
    })

    it('saves weight on Enter key press', async () => {
        const user = userEvent.setup()
        mockUpdateMetric.mockResolvedValue(undefined)

        render(<WeightSection date={createDate('2026-03-07')} />)

        await user.click(screen.getByLabelText('Добавить вес'))
        const input = screen.getByLabelText('Вес в килограммах')
        await user.type(input, '80')
        fireEvent.keyDown(input, { key: 'Enter' })

        await waitFor(() => {
            expect(mockUpdateMetric).toHaveBeenCalled()
        })
    })

    it('cancels editing on Escape key press', async () => {
        const user = userEvent.setup()
        render(<WeightSection date={createDate('2026-03-07')} />)

        await user.click(screen.getByLabelText('Добавить вес'))
        const input = screen.getByLabelText('Вес в килограммах')
        fireEvent.keyDown(input, { key: 'Escape' })

        expect(screen.queryByText('Сохранить')).not.toBeInTheDocument()
    })

    it('disables save button when input is empty', async () => {
        const user = userEvent.setup()
        render(<WeightSection date={createDate('2026-03-07')} />)

        await user.click(screen.getByLabelText('Добавить вес'))
        const saveButton = screen.getByText('Сохранить').closest('button')
        expect(saveButton).toBeDisabled()
    })

    it('shows save error when updateMetric fails', async () => {
        const user = userEvent.setup()
        mockUpdateMetric.mockRejectedValue(new Error('Network error'))

        render(<WeightSection date={createDate('2026-03-07')} />)

        await user.click(screen.getByLabelText('Добавить вес'))
        const input = screen.getByLabelText('Вес в килограммах')
        await user.type(input, '80')
        await user.click(screen.getByText('Сохранить'))

        await waitFor(() => {
            expect(screen.getByText('Не удалось сохранить вес')).toBeInTheDocument()
        })
    })

    it('shows weight change from previous day (increase)', () => {
        const dateStr = '2026-03-07'
        const prevDateStr = '2026-03-06'
        mockDailyData[dateStr] = { weight: 81 }
        mockDailyData[prevDateStr] = { weight: 80 }

        render(<WeightSection date={createDate(dateStr)} />)
        expect(screen.getByText('+1 кг с вчера')).toBeInTheDocument()
    })

    it('shows weight change from previous day (decrease)', () => {
        const dateStr = '2026-03-07'
        const prevDateStr = '2026-03-06'
        mockDailyData[dateStr] = { weight: 79 }
        mockDailyData[prevDateStr] = { weight: 80 }

        render(<WeightSection date={createDate(dateStr)} />)
        // The decrease is shown as the absolute value with "кг с вчера" text
        expect(screen.getByText(/1 кг с вчера/)).toBeInTheDocument()
    })

    it('shows yesterday weight when no weight logged today', () => {
        const dateStr = '2026-03-07'
        const prevDateStr = '2026-03-06'
        mockDailyData[prevDateStr] = { weight: 80 }

        render(<WeightSection date={createDate(dateStr)} />)
        expect(screen.getByText('Вчера: 80 кг')).toBeInTheDocument()
    })

    it('displays target weight from profile', async () => {
        mockGetProfile.mockResolvedValue({ settings: { target_weight: 70 } })

        render(<WeightSection date={createDate('2026-03-07')} />)

        await waitFor(() => {
            expect(screen.getByText(/Цель: 70 кг/)).toBeInTheDocument()
        })
    })

    it('shows distance to target when weight is logged and target exists', async () => {
        const dateStr = '2026-03-07'
        mockDailyData[dateStr] = { weight: 75 }
        mockGetProfile.mockResolvedValue({ settings: { target_weight: 70 } })

        render(<WeightSection date={createDate(dateStr)} />)

        await waitFor(() => {
            expect(screen.getByText(/\(-5 кг\)/)).toBeInTheDocument()
        })
    })

    it('shows "Достигнута!" when weight matches target', async () => {
        const dateStr = '2026-03-07'
        mockDailyData[dateStr] = { weight: 70 }
        mockGetProfile.mockResolvedValue({ settings: { target_weight: 70 } })

        render(<WeightSection date={createDate(dateStr)} />)

        await waitFor(() => {
            expect(screen.getByText('Достигнута!')).toBeInTheDocument()
        })
    })

    it('fetches weight trend and renders chart when enough data', async () => {
        mockApiGet.mockResolvedValue({
            weight_trend: [
                { date: '2026-02-07', weight: 82 },
                { date: '2026-02-14', weight: 81 },
                { date: '2026-02-21', weight: 80 },
            ],
            target_weight: null,
        })

        render(<WeightSection date={createDate('2026-03-07')} />)

        await waitFor(() => {
            expect(screen.getByTestId('line-chart')).toBeInTheDocument()
        })
    })

    it('shows 4-week trend change', async () => {
        mockApiGet.mockResolvedValue({
            weight_trend: [
                { date: '2026-02-07', weight: 82 },
                { date: '2026-03-07', weight: 80 },
            ],
            target_weight: null,
        })

        render(<WeightSection date={createDate('2026-03-07')} />)

        await waitFor(() => {
            expect(screen.getByText('-2.0 кг за 4 недели')).toBeInTheDocument()
        })
    })

    it('applies custom className', () => {
        const { container } = render(
            <WeightSection date={createDate('2026-03-07')} className="custom-class" />
        )
        expect(container.firstChild).toHaveClass('custom-class')
    })

    it('shows "Добавить" button in not-logged state', () => {
        render(<WeightSection date={createDate('2026-03-07')} />)
        expect(screen.getByText('Добавить')).toBeInTheDocument()
    })
})
