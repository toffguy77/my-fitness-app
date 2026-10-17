/**
 * Отзыв куратора на дашборде — по ссылке из уведомления.
 *
 * Блок стоял на дашборде всегда и без `reportId`, то есть всегда пустым, а
 * уведомление вело на страницу, которой нет. Теперь уведомление ведёт на
 * `/dashboard?report=<id>`, и только тогда блок появляется.
 * Спека weekly-report-feedback, «Дашборд показывает отзыв по ссылке».
 */

import { render, screen, waitFor } from '@testing-library/react'
import { useRouter, useSearchParams } from 'next/navigation'
import DashboardPage from '../page'
import { apiClient } from '@/shared/utils/api-client'

jest.mock('next/navigation', () => ({
    useRouter: jest.fn(),
    useSearchParams: jest.fn(),
}))

const feedback = {
    nutrition: { rating: 'excellent', comment: '' },
    activity: { rating: 'needs_improvement', comment: '' },
    summary: 'Неделя ровная, белка хватало.',
    recommendations: 'Добавьте прогулку после ужина.',
}

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: { get: jest.fn() },
}))

// Mock DashboardLayout component
jest.mock('@/features/dashboard/components/DashboardLayout', () => ({
    DashboardLayout: ({ children, userName }: { children: React.ReactNode; userName: string }) => (
        <div data-testid="dashboard-layout">
            <div data-testid="user-name">{userName}</div>
            {children}
        </div>
    ),
}))

// Mock dashboard components
// Подмена отдаёт кнопку наружу: настоящая появляется только по воскресеньям,
// а проверять нужно обработчик страницы, а не расписание.
jest.mock('@/features/dashboard/components/CalendarNavigator', () => ({
    CalendarNavigator: ({ onSubmitReport }: { onSubmitReport?: () => void }) => (
        <div data-testid="calendar-navigator">
            Calendar Navigator
            <button onClick={() => onSubmitReport?.()}>Отправить недельный отчет</button>
        </div>
    ),
}))

jest.mock('@/features/dashboard/api/dashboardApi', () => ({
    dashboardApi: {
        // Настоящий запрос отзыва: проверяется адрес, который уходит в транспорт.
        getReportFeedback: jest.requireActual('@/features/dashboard/api/dashboardApi').dashboardApi.getReportFeedback,
        submitWeeklyReport: jest.fn().mockResolvedValue({ id: 'r1', week_number: 3 }),
        // Первый экран запрашивает состояние первой недели. Здесь оно пустое и
        // неактивное: эти тесты про заведённого человека, а не про новичка,
        // поэтому прогресс и график должны остаться на месте.
        getOnboardingState: jest.fn().mockResolvedValue({
            active: false,
            steps: [],
            curator: null,
        }),
    },
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: { success: jest.fn(), error: jest.fn() },
}))

jest.mock('@/features/dashboard/components/DailyTrackingGrid', () => ({
    DailyTrackingGrid: () => <div data-testid="daily-tracking-grid">Daily Tracking Grid</div>,
}))

// Note: ProgressSection, PhotoUploadSection, WeeklyPlanSection
// are now lazy-loaded via @/features/dashboard barrel export, mocked below

jest.mock('@/features/dashboard/components/WeightSection', () => ({
    WeightSection: () => <div data-testid="weight-section">Weight Section</div>,
}))

jest.mock('@/features/nutrition-calc/components/WeekCaloriesCard', () => ({
    WeekCaloriesCard: () => <div data-testid="kbju-weekly-chart">KBJU Weekly Chart</div>,
}))



jest.mock('@/features/settings/api/settings', () => ({
    getProfile: jest.fn().mockResolvedValue({ settings: {} }),
}))

jest.mock('@/features/nutrition-calc/api/nutritionCalc', () => ({
    getHistory: jest.fn().mockResolvedValue({ days: [] }),
}))

// Mock lazy-loaded components from features/dashboard barrel export
jest.mock('@/features/dashboard', () => ({
    LazyProgressSection: () => <div data-testid="progress-section">Progress Section</div>,
    LazyPhotoUploadSection: () => <div data-testid="photo-upload-section">Photo Upload Section</div>,
    LazyWeeklyPlanSection: () => <div data-testid="weekly-plan-section">Weekly Plan Section</div>,
    ProgressSectionSkeleton: () => <div>Loading Progress...</div>,
    PhotoUploadSectionSkeleton: () => <div>Loading Photo...</div>,
    WeeklyPlanSectionSkeleton: () => <div>Loading Plan...</div>,
}))

// Mock dashboard store
const mockFetchDailyData = jest.fn()
const mockFetchWeekData = jest.fn()
const mockFetchWeeklyPlan = jest.fn()
const mockFetchTasks = jest.fn()
const mockStartPolling = jest.fn()
const mockStopPolling = jest.fn()
const mockSetOfflineStatus = jest.fn()
const mockLoadFromCache = jest.fn()

jest.mock('@/features/dashboard/store/dashboardStore', () => ({
    useDashboardStore: () => ({
        selectedDate: new Date('2024-01-15'),
        selectedWeek: {
            start: new Date('2024-01-15'),
            end: new Date('2024-01-21'),
        },
        dailyData: {},
        targetsVersion: 0,
        fetchDailyData: mockFetchDailyData,
        fetchWeekData: mockFetchWeekData,
        fetchWeeklyPlan: mockFetchWeeklyPlan,
        fetchTasks: mockFetchTasks,
        startPolling: mockStartPolling,
        stopPolling: mockStopPolling,
        setOfflineStatus: mockSetOfflineStatus,
        loadFromCache: mockLoadFromCache,
    }),
}))

const mockGet = apiClient.get as jest.Mock

function feedbackRequests() {
    return mockGet.mock.calls.filter(([url]) => String(url).includes('/feedback'))
}

describe('Дашборд: отзыв куратора по ?report=', () => {
    const scrollIntoView = jest.fn()

    beforeEach(() => {
        jest.clearAllMocks()
        localStorage.clear()
        ;(useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() })
        Element.prototype.scrollIntoView = scrollIntoView
        mockGet.mockImplementation((url: string) => {
            if (url.includes('/dashboard/weekly-reports/')) return Promise.resolve(feedback)
            if (url === '/api/v1/auth/me') {
                return Promise.resolve({ user: { id: '1', email: 'c@example.com', name: 'Клиент', role: 'client' } })
            }
            return Promise.resolve({})
        })
    })

    afterEach(() => {
        // jsdom его не определяет; не оставлять подмену другим файлам.
        delete (Element.prototype as Partial<Element>).scrollIntoView
    })

    // «Переход из уведомления»
    it('/dashboard?report=42 показывает отзыв отчёта 42 под карточками дня и прокручивает к нему', async () => {
        ;(useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('report=42'))

        render(<DashboardPage />)

        const heading = await screen.findByRole('heading', { name: 'Отзыв куратора' })
        expect(feedbackRequests()).toHaveLength(1)
        expect(feedbackRequests()[0][0]).toMatch(/\/dashboard\/weekly-reports\/42\/feedback$/)

        // Раскрыт сразу: человек пришёл его прочитать.
        expect(screen.getByText('Отлично')).toBeInTheDocument()
        expect(screen.getByText('Нужно улучшить')).toBeInTheDocument()
        expect(screen.getByText('Неделя ровная, белка хватало.')).toBeInTheDocument()
        expect(screen.getByText('Добавьте прогулку после ужина.')).toBeInTheDocument()

        // Под карточками дня.
        const section = heading.closest('section')!
        const weight = screen.getByTestId('weight-section')
        expect(weight.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

        await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
        expect(scrollIntoView.mock.contexts[0]).toBe(section)
    })

    // «Обычное открытие дашборда»
    it('/dashboard без параметра не показывает блок и не запрашивает …/feedback', async () => {
        ;(useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams())

        render(<DashboardPage />)

        await screen.findByTestId('weight-section')
        await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/v1/auth/me'))

        expect(screen.queryByRole('heading', { name: 'Отзыв куратора' })).not.toBeInTheDocument()
        expect(feedbackRequests()).toHaveLength(0)
    })

    // Id уходит в путь запроса: строка из адресной строки не дописывает к
    // нему ничего своего.
    it('не запрашивает отзыв по id, который не похож на id', async () => {
        ;(useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('report=../../users'))

        render(<DashboardPage />)

        await screen.findByTestId('weight-section')
        expect(screen.queryByRole('heading', { name: 'Отзыв куратора' })).not.toBeInTheDocument()
        expect(feedbackRequests()).toHaveLength(0)
    })
})
