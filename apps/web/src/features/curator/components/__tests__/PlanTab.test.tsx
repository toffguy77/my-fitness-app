import { render, screen, waitFor } from '@testing-library/react'

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn() }),
    usePathname: () => '/curator/clients/1',
    useSearchParams: () => new URLSearchParams(),
}))

const mockGetWeeklyPlans = jest.fn()

jest.mock('@/features/curator/api/curatorApi', () => ({
    curatorApi: {
        getWeeklyPlans: (...args: unknown[]) => mockGetWeeklyPlans(...args),
    },
}))

import { PlanTab } from '../PlanTab'

describe('PlanTab', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('shows loading state', () => {
        mockGetWeeklyPlans.mockReturnValue(new Promise(() => {}))
        render(<PlanTab clientId={1} />)
        expect(document.querySelector('.animate-spin')).toBeInTheDocument()
    })

    it('shows active plan when available', async () => {
        mockGetWeeklyPlans.mockResolvedValue([
            {
                id: 'p1',
                calories: 2000,
                protein: 150,
                fat: 70,
                carbs: 250,
                start_date: '2026-03-09',
                end_date: '2026-03-15',
                is_active: true,
                created_at: '2026-03-09T00:00:00Z',
            },
        ])
        render(<PlanTab clientId={1} />)

        await waitFor(() => {
            expect(screen.getByText('Текущий план')).toBeInTheDocument()
        })
        expect(screen.getByText('2000')).toBeInTheDocument()
        expect(screen.getByText('150')).toBeInTheDocument()
        expect(screen.getByText('70')).toBeInTheDocument()
        expect(screen.getByText('250')).toBeInTheDocument()
    })

    it('shows empty state when no plans', async () => {
        mockGetWeeklyPlans.mockResolvedValue([])
        render(<PlanTab clientId={1} />)

        await waitFor(() => {
            expect(screen.getByText('Активный план не задан')).toBeInTheDocument()
        })
        expect(screen.getByText('Создать план')).toBeInTheDocument()
    })

    it('shows error state', async () => {
        mockGetWeeklyPlans.mockRejectedValue(new Error('fail'))
        render(<PlanTab clientId={1} />)

        await waitFor(() => {
            expect(screen.getByText('Не удалось загрузить планы')).toBeInTheDocument()
        })
    })
})
