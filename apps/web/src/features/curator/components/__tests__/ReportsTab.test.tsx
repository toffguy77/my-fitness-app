import { render, screen, waitFor } from '@testing-library/react'

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn() }),
    usePathname: () => '/curator/clients/1',
    useSearchParams: () => new URLSearchParams(),
}))

const mockGetWeeklyReports = jest.fn()

jest.mock('@/features/curator/api/curatorApi', () => ({
    curatorApi: {
        getWeeklyReports: (...args: unknown[]) => mockGetWeeklyReports(...args),
        submitFeedback: jest.fn(),
    },
}))

import { ReportsTab } from '../ReportsTab'
import type { WeeklyReportView } from '../../types'

const mockReport: WeeklyReportView = {
    id: 'r1',
    week_start: '2026-03-02',
    week_end: '2026-03-08',
    week_number: 10,
    summary: { avg_calories: 1950 },
    submitted_at: '2026-03-09T00:00:00Z',
    has_feedback: false,
}

describe('ReportsTab', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('shows loading state', () => {
        mockGetWeeklyReports.mockReturnValue(new Promise(() => {}))
        render(<ReportsTab clientId={1} />)
        expect(document.querySelector('.animate-spin')).toBeInTheDocument()
    })

    it('renders reports list', async () => {
        mockGetWeeklyReports.mockResolvedValue([mockReport])
        render(<ReportsTab clientId={1} />)

        await waitFor(() => {
            expect(screen.getByText(/2 мар./)).toBeInTheDocument()
        })
        expect(screen.getByText('Ожидает обратной связи')).toBeInTheDocument()
    })

    it('shows empty state when no reports', async () => {
        mockGetWeeklyReports.mockResolvedValue([])
        render(<ReportsTab clientId={1} />)

        await waitFor(() => {
            expect(screen.getByText('Отчётов пока нет')).toBeInTheDocument()
        })
    })

    it('shows error state', async () => {
        mockGetWeeklyReports.mockRejectedValue(new Error('fail'))
        render(<ReportsTab clientId={1} />)

        await waitFor(() => {
            expect(screen.getByText('Не удалось загрузить отчёты')).toBeInTheDocument()
        })
    })
})
