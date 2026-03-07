/**
 * Unit tests for the dashboard page component
 * Tests that the dashboard page renders within its layout
 */

import React from 'react'
import { render, screen } from '@testing-library/react'

// Stable router mock to prevent infinite re-render loops from useEffect dependencies
const mockRouter = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
}

jest.mock('next/navigation', () => ({
    useRouter: () => mockRouter,
}))

// Mock dashboard feature components
jest.mock('@/features/dashboard/components/DashboardLayout', () => ({
    DashboardLayout: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="dashboard-layout">{children}</div>
    ),
}))

jest.mock('@/features/settings/api/settings', () => ({
    getProfile: jest.fn().mockResolvedValue({
        name: 'Test User',
        avatar_url: null,
    }),
}))

jest.mock('@/features/dashboard/components/CalendarNavigator', () => ({
    CalendarNavigator: () => <div data-testid="calendar-navigator">CalendarNavigator</div>,
}))

jest.mock('@/features/dashboard/components/DailyTrackingGrid', () => ({
    DailyTrackingGrid: () => <div data-testid="daily-tracking-grid">DailyTrackingGrid</div>,
}))

jest.mock('@/features/dashboard/components/WeightSection', () => ({
    WeightSection: () => <div data-testid="weight-section">WeightSection</div>,
}))

jest.mock('@/features/dashboard', () => ({
    LazyProgressSection: () => <div data-testid="progress-section">ProgressSection</div>,
    LazyPhotoUploadSection: () => <div data-testid="photo-upload-section">PhotoUploadSection</div>,
    LazyWeeklyPlanSection: () => <div data-testid="weekly-plan-section">WeeklyPlanSection</div>,
    LazyTasksSection: () => <div data-testid="tasks-section">TasksSection</div>,
    ProgressSectionSkeleton: () => <div>Loading progress...</div>,
    PhotoUploadSectionSkeleton: () => <div>Loading photos...</div>,
    WeeklyPlanSectionSkeleton: () => <div>Loading plan...</div>,
    TasksSectionSkeleton: () => <div>Loading tasks...</div>,
}))

// Stable references for store functions to prevent infinite re-render loops
const stableSelectedWeek = { start: '2026-03-02', end: '2026-03-08' }
const stableFetchDailyData = jest.fn()
const stableFetchWeekData = jest.fn().mockResolvedValue(undefined)
const stableFetchWeeklyPlan = jest.fn().mockResolvedValue(undefined)
const stableFetchTasks = jest.fn().mockResolvedValue(undefined)
const stableStartPolling = jest.fn()
const stableStopPolling = jest.fn()
const stableSetOfflineStatus = jest.fn()
const stableLoadFromCache = jest.fn()

jest.mock('@/features/dashboard/store/dashboardStore', () => ({
    useDashboardStore: () => ({
        selectedDate: '2026-03-06',
        selectedWeek: stableSelectedWeek,
        targetsVersion: 0,
        fetchDailyData: stableFetchDailyData,
        fetchWeekData: stableFetchWeekData,
        fetchWeeklyPlan: stableFetchWeeklyPlan,
        fetchTasks: stableFetchTasks,
        startPolling: stableStartPolling,
        stopPolling: stableStopPolling,
        setOfflineStatus: stableSetOfflineStatus,
        loadFromCache: stableLoadFromCache,
    }),
}))

jest.mock('@/features/nutrition-calc/components/KBJUWeeklyChart', () => ({
    KBJUWeeklyChart: () => <div data-testid="kbju-chart">KBJUWeeklyChart</div>,
}))

jest.mock('@/features/nutrition-calc/components/ProfileCompletionBanner', () => ({
    ProfileCompletionBanner: () => <div data-testid="profile-banner">ProfileCompletionBanner</div>,
}))

jest.mock('@/features/nutrition-calc/api/nutritionCalc', () => ({
    getHistory: jest.fn().mockResolvedValue({ days: [] }),
}))

import DashboardPage from '../dashboard/page'

describe('DashboardPage', () => {
    beforeEach(() => {
        Storage.prototype.getItem = jest.fn((key: string) => {
            if (key === 'auth_token') return 'mock-token'
            if (key === 'user') return JSON.stringify({
                id: '1',
                email: 'test@example.com',
                name: 'Test User',
                role: 'client',
            })
            return null
        })
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('renders within DashboardLayout when authenticated', () => {
        render(<DashboardPage />)
        expect(screen.getByTestId('dashboard-layout')).toBeInTheDocument()
    })

    it('renders dashboard sections', () => {
        render(<DashboardPage />)
        expect(screen.getByTestId('calendar-navigator')).toBeInTheDocument()
        expect(screen.getByTestId('daily-tracking-grid')).toBeInTheDocument()
        expect(screen.getByTestId('weight-section')).toBeInTheDocument()
    })
})
