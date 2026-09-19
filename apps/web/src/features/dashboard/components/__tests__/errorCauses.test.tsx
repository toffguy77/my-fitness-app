/**
 * Дневник: причина отказа доезжает до человека.
 *
 * Самый дорогой случай здесь — «Недостаточно данных» на разделе прогресса.
 * Эту фразу показывали и тогда, когда запрос упал: человек читал, что он мало
 * записывал, хотя записывал он достаточно, а не прочитался ответ сервера.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/shared/errors/apiErrors'

jest.mock('recharts', () => ({
    LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    ReferenceLine: () => null,
}))

jest.mock('@/shared/utils/format', () => ({
    formatLocalDate: (d: Date) => d.toISOString().slice(0, 10),
}))

jest.mock('../AttentionBadge', () => ({
    AttentionBadge: ({ ariaLabel }: { ariaLabel: string }) => (
        <span data-testid="attention-badge" aria-label={ariaLabel} />
    ),
}))

jest.mock('../../utils/validation', () => ({
    validateWeight: () => ({ isValid: true }),
}))

jest.mock('@/shared/hooks/useDebounce', () => ({
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    useDebouncedCallback: (fn: Function) => fn,
}))

const mockUpdateMetric = jest.fn()
jest.mock('../../store/dashboardStore', () => ({
    useDashboardStore: (selector?: (s: unknown) => unknown) =>
        selector ? selector({ tasksVersion: 0 }) : { dailyData: {}, updateMetric: mockUpdateMetric },
}))

const mockGetProfile = jest.fn()
jest.mock('@/features/settings/api/settings', () => ({
    getProfile: () => mockGetProfile(),
}))

const mockApiGet = jest.fn()
const mockApiPost = jest.fn()
jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        get: (...args: unknown[]) => mockApiGet(...args),
        post: (...args: unknown[]) => mockApiPost(...args),
    },
}))

jest.mock('../../api/dashboardApi')

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}))

import toast from 'react-hot-toast'
import { WaterBlock } from '../WaterBlock'
import { WeightSection } from '../WeightSection'
import { ProgressSection } from '../ProgressSection'
import { ClientTasksSection } from '../ClientTasksSection'
import { dashboardApi } from '../../api/dashboardApi'

const tasksApi = dashboardApi as jest.Mocked<typeof dashboardApi>

/** Отказ, который сервер объяснил кодом. */
function refusal(status: number, code: string) {
    return new ApiError(status, { code, message: 'серверная проза' })
}

const WAIT = { timeout: 1500 }

function createDate(dateStr: string): Date {
    return new Date(`${dateStr}T12:00:00`)
}

beforeEach(() => {
    jest.clearAllMocks()
    mockGetProfile.mockResolvedValue({ settings: {} })
    mockApiGet.mockResolvedValue({ glasses: 0, goal: 8, glass_size: 250, enabled: true, weight_trend: [], target_weight: null })
})

describe('Вода', () => {
    it('показывает причину, по которой стакан не записался', async () => {
        mockApiPost.mockRejectedValue(refusal(409, 'gone'))

        render(<WaterBlock date={createDate('2026-03-07')} />)
        const buttons = await screen.findAllByRole('button', { name: 'Добавить стакан воды' })
        await userEvent.click(buttons[0])

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Больше недоступно'), WAIT)
    })
})

describe('Вес', () => {
    it('показывает причину, по которой вес не сохранился', async () => {
        mockUpdateMetric.mockRejectedValue(refusal(400, 'validation'))

        render(<WeightSection date={createDate('2026-03-07')} />)
        await userEvent.click(screen.getByLabelText('Добавить вес'))
        await userEvent.type(screen.getByLabelText('Вес в килограммах'), '70')
        await userEvent.click(screen.getByText('Сохранить'))

        expect(await screen.findByText('Проверьте введённые данные')).toBeInTheDocument()
    })
})

describe('Прогресс', () => {
    // «Недостаточно данных» — это утверждение о том, как человек вёл дневник.
    // Говорить его, когда запрос упал, — врать ему про его же записи.
    it('не выдаёт отказ сервера за нехватку записей', async () => {
        mockApiGet.mockRejectedValue(refusal(503, 'feature_unavailable'))

        render(<ProgressSection />)

        expect(await screen.findByText('Возможность отключена в этой среде')).toBeInTheDocument()
        expect(screen.queryByText('Недостаточно данных')).not.toBeInTheDocument()
    })

    it('по-прежнему говорит о нехватке записей, когда записей действительно мало', async () => {
        mockApiGet.mockResolvedValue({ weight_trend: [], nutrition_adherence: 0, target_weight: null })

        render(<ProgressSection />)

        expect(await screen.findByText('Недостаточно данных')).toBeInTheDocument()
    })
})

describe('Задачи от куратора', () => {
    function task(id: string) {
        const future = new Date()
        future.setDate(future.getDate() + 3)
        return {
            id,
            title: `Task ${id}`,
            type: 'nutrition' as const,
            deadline: future.toISOString().slice(0, 10),
            recurrence: 'once' as const,
            status: 'active' as const,
            completions: [],
            created_at: '2026-03-01T00:00:00Z',
        }
    }

    it('показывает причину, по которой отметка не прошла', async () => {
        const tasks = [task('1')]
        tasksApi.getMyTasks.mockResolvedValue({ tasks, count: 1, week: 1 } as never)
        tasksApi.completeTask.mockRejectedValue(refusal(403, 'forbidden'))

        render(<ClientTasksSection />)
        await screen.findByText('Task 1')
        await userEvent.click(screen.getByRole('button', { name: /отметить как выполненную/i }))

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Нет доступа'), WAIT)
    })
})
