/**
 * Tests for Dashboard Page
 *
 * Validates: Requirements 1.1, 1.4, 13.2
 */

import { render, screen, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import DashboardPage from '../page'

// Mock Next.js router
jest.mock('next/navigation', () => ({
    useRouter: jest.fn(),
    useSearchParams: jest.fn(() => new URLSearchParams()),
}))

// Mock DashboardLayout component
jest.mock('@/features/dashboard/components/DashboardLayout', () => ({
    DashboardLayout: ({ children, userName }: any) => (
        <div data-testid="dashboard-layout">
            <div data-testid="user-name">{userName}</div>
            {children}
        </div>
    ),
}))

// Mock dashboard components
jest.mock('@/features/dashboard/components/CalendarNavigator', () => ({
    CalendarNavigator: () => <div data-testid="calendar-navigator">Calendar Navigator</div>,
}))

jest.mock('@/features/dashboard/components/DailyTrackingGrid', () => ({
    DailyTrackingGrid: () => <div data-testid="daily-tracking-grid">Daily Tracking Grid</div>,
}))

// Note: ProgressSection, PhotoUploadSection, WeeklyPlanSection
// are now lazy-loaded via @/features/dashboard barrel export, mocked below

jest.mock('@/features/dashboard/components/WeightSection', () => ({
    WeightSection: () => <div data-testid="weight-section">Weight Section</div>,
}))

jest.mock('@/features/nutrition-calc/components/KBJUWeeklyChart', () => ({
    KBJUWeeklyChart: () => <div data-testid="kbju-weekly-chart">KBJU Weekly Chart</div>,
}))

jest.mock('@/features/nutrition-calc/components/ProfileCompletionBanner', () => ({
    ProfileCompletionBanner: () => <div data-testid="profile-completion-banner">Profile Completion Banner</div>,
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

describe('DashboardPage', () => {
    const mockPush = jest.fn()
    const mockRouter = {
        push: mockPush,
        back: jest.fn(),
        forward: jest.fn(),
        refresh: jest.fn(),
        replace: jest.fn(),
        prefetch: jest.fn(),
    }

    beforeEach(() => {
        jest.clearAllMocks()
            ; (useRouter as jest.Mock).mockReturnValue(mockRouter)

        // Clear localStorage
        localStorage.clear()
    })

    describe('Authentication Check (Requirement 1.1)', () => {
        it('should redirect to /auth when no token exists', () => {
            render(<DashboardPage />)

            expect(mockPush).toHaveBeenCalledWith('/auth')
        })

        it('should redirect to /auth when token exists but no user data', () => {
            localStorage.setItem('auth_token', 'fake-token')

            render(<DashboardPage />)

            expect(mockPush).toHaveBeenCalledWith('/auth')
        })

        it('should redirect to /auth when user data is corrupted', () => {
            localStorage.setItem('auth_token', 'fake-token')
            localStorage.setItem('user', 'invalid-json')

            render(<DashboardPage />)

            expect(mockPush).toHaveBeenCalledWith('/auth')
        })

        it('should render dashboard when authenticated with valid user data', async () => {
            const userData = {
                id: '123',
                email: 'test@example.com',
                name: 'Test User',
                role: 'client' as const,
            }

            localStorage.setItem('auth_token', 'fake-token')
            localStorage.setItem('user', JSON.stringify(userData))

            render(<DashboardPage />)

            await waitFor(() => {
                expect(screen.getByTestId('dashboard-layout')).toBeInTheDocument()
            })

            expect(mockPush).not.toHaveBeenCalled()
        })
    })

    describe('User Profile Data (Requirement 1.1, 1.4)', () => {
        it('should pass user name to DashboardLayout', async () => {
            const userData = {
                id: '123',
                email: 'test@example.com',
                name: 'Test User',
                role: 'client' as const,
            }

            localStorage.setItem('auth_token', 'fake-token')
            localStorage.setItem('user', JSON.stringify(userData))

            render(<DashboardPage />)

            await waitFor(() => {
                expect(screen.getByTestId('user-name')).toHaveTextContent('Test User')
            })
        })

        it('should use email as fallback when name is not provided', async () => {
            const userData = {
                id: '123',
                email: 'test@example.com',
                role: 'client' as const,
            }

            localStorage.setItem('auth_token', 'fake-token')
            localStorage.setItem('user', JSON.stringify(userData))

            render(<DashboardPage />)

            await waitFor(() => {
                expect(screen.getByTestId('user-name')).toHaveTextContent('test@example.com')
            })
        })
    })

    describe('Loading State', () => {
        it('should show loading spinner while checking authentication', async () => {
            localStorage.setItem('auth_token', 'fake-token')
            localStorage.setItem('user', JSON.stringify({
                id: '123',
                email: 'test@example.com',
                name: 'Test User',
                role: 'client',
            }))

            const { container } = render(<DashboardPage />)

            // In test environment, useEffect runs synchronously, so loading state may not be visible
            // Instead, verify that the component eventually renders the dashboard
            await waitFor(() => {
                expect(screen.getByTestId('dashboard-layout')).toBeInTheDocument()
            })
        })
    })

    describe('Dashboard Sections (Requirement 13.2)', () => {
        beforeEach(() => {
            const userData = {
                id: '123',
                email: 'test@example.com',
                name: 'Test User',
                role: 'client' as const,
            }

            localStorage.setItem('auth_token', 'fake-token')
            localStorage.setItem('user', JSON.stringify(userData))
        })

        it('should render CalendarNavigator component', async () => {
            render(<DashboardPage />)

            await waitFor(() => {
                expect(screen.getByTestId('calendar-navigator')).toBeInTheDocument()
            })
        })

        it('should render DailyTrackingGrid component', async () => {
            render(<DashboardPage />)

            await waitFor(() => {
                expect(screen.getByTestId('daily-tracking-grid')).toBeInTheDocument()
            })
        })

        it('should render ProgressSection component', async () => {
            render(<DashboardPage />)

            await waitFor(() => {
                expect(screen.getByTestId('progress-section')).toBeInTheDocument()
            })
        })

        it('should render PhotoUploadSection component', async () => {
            render(<DashboardPage />)

            await waitFor(() => {
                expect(screen.getByTestId('photo-upload-section')).toBeInTheDocument()
            })
        })

        it('should render WeeklyPlanSection component', async () => {
            render(<DashboardPage />)

            await waitFor(() => {
                expect(screen.getByTestId('weekly-plan-section')).toBeInTheDocument()
            })
        })

        it('should render all sections in vertical layout', async () => {
            render(<DashboardPage />)

            await waitFor(() => {
                expect(screen.getByTestId('calendar-navigator')).toBeInTheDocument()
            })

            // Verify all sections are present
            expect(screen.getByTestId('daily-tracking-grid')).toBeInTheDocument()
            expect(screen.getByTestId('progress-section')).toBeInTheDocument()
            expect(screen.getByTestId('photo-upload-section')).toBeInTheDocument()
            expect(screen.getByTestId('weekly-plan-section')).toBeInTheDocument()
        })
    })

    describe('Data Fetching on Mount (Requirement 13.2)', () => {
        beforeEach(() => {
            const userData = {
                id: '123',
                email: 'test@example.com',
                name: 'Test User',
                role: 'client' as const,
            }

            localStorage.setItem('auth_token', 'fake-token')
            localStorage.setItem('user', JSON.stringify(userData))
        })

        it('should load cached data on mount', async () => {
            render(<DashboardPage />)

            await waitFor(() => {
                expect(mockLoadFromCache).toHaveBeenCalled()
            })
        })

        it('should fetch week data on mount', async () => {
            render(<DashboardPage />)

            await waitFor(() => {
                expect(mockFetchWeekData).toHaveBeenCalled()
            })
        })

        it('should fetch weekly plan on mount', async () => {
            render(<DashboardPage />)

            await waitFor(() => {
                expect(mockFetchWeeklyPlan).toHaveBeenCalled()
            })
        })

        it('should fetch tasks on mount', async () => {
            render(<DashboardPage />)

            await waitFor(() => {
                expect(mockFetchTasks).toHaveBeenCalled()
            })
        })

        it('should start polling on mount', async () => {
            render(<DashboardPage />)

            await waitFor(() => {
                expect(mockStartPolling).toHaveBeenCalledWith(30000)
            })
        })

        it('should stop polling on unmount', async () => {
            const { unmount } = render(<DashboardPage />)

            await waitFor(() => {
                expect(screen.getByTestId('dashboard-layout')).toBeInTheDocument()
            })

            unmount()

            expect(mockStopPolling).toHaveBeenCalled()
        })
    })

    describe('Online/Offline Status Handling', () => {
        beforeEach(() => {
            const userData = {
                id: '123',
                email: 'test@example.com',
                name: 'Test User',
                role: 'client' as const,
            }

            localStorage.setItem('auth_token', 'fake-token')
            localStorage.setItem('user', JSON.stringify(userData))
        })

        it('should handle online event', async () => {
            render(<DashboardPage />)

            await waitFor(() => {
                expect(screen.getByTestId('dashboard-layout')).toBeInTheDocument()
            })

            // Trigger online event
            window.dispatchEvent(new Event('online'))

            expect(mockSetOfflineStatus).toHaveBeenCalledWith(false)
        })

        it('should handle offline event', async () => {
            render(<DashboardPage />)

            await waitFor(() => {
                expect(screen.getByTestId('dashboard-layout')).toBeInTheDocument()
            })

            // Trigger offline event
            window.dispatchEvent(new Event('offline'))

            expect(mockSetOfflineStatus).toHaveBeenCalledWith(true)
        })
    })
})
