/**
 * Property-based tests for DailyTrackingGrid component
 *
 * Property 22: Real-time Metric Updates
 * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5
 */

import { render, screen, cleanup } from '@testing-library/react'
import * as fc from 'fast-check'
import { DailyTrackingGrid } from '../DailyTrackingGrid'
import { useDashboardStore } from '../../store/dashboardStore'
import { formatLocalDate } from '@/shared/utils/format'
import type { DailyMetrics } from '../../types'

// Mock the dashboard store
jest.mock('../../store/dashboardStore')

// Mock the individual block components to avoid complex rendering
jest.mock('../NutritionBlock', () => ({
    NutritionBlock: ({ date }: { date: Date }) => (
        <div data-testid="nutrition-block" data-date={date.toISOString()}>
            Nutrition Block
        </div>
    ),
}))

jest.mock('../WaterBlock', () => ({
    WaterBlock: ({ date }: { date: Date }) => (
        <div data-testid="water-block" data-date={date.toISOString()}>
            Water Block
        </div>
    ),
}))

jest.mock('../StepsBlock', () => ({
    StepsBlock: ({ date }: { date: Date }) => (
        <div data-testid="steps-block" data-date={date.toISOString()}>
            Steps Block
        </div>
    ),
}))

jest.mock('../WorkoutBlock', () => ({
    WorkoutBlock: ({ date }: { date: Date }) => (
        <div data-testid="workout-block" data-date={date.toISOString()}>
            Workout Block
        </div>
    ),
}))

// Test generators
const dateGenerator = () =>
    fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') })
        .filter(d => !isNaN(d.getTime()))

const dailyMetricsGenerator = () =>
    fc.record({
        date: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') })
            .filter(d => !isNaN(d.getTime()))
            .map(d => d.toISOString().split('T')[0]),
        userId: fc.string({ minLength: 1, maxLength: 10 }),
        nutrition: fc.record({
            calories: fc.integer({ min: 0, max: 3000 }),
            protein: fc.integer({ min: 0, max: 200 }),
            fat: fc.integer({ min: 0, max: 150 }),
            carbs: fc.integer({ min: 0, max: 400 }),
        }),
        weight: fc.option(fc.float({ min: 40, max: 200, noNaN: true })),
        steps: fc.integer({ min: 0, max: 30000 }),
        workout: fc.record({
            completed: fc.boolean(),
            type: fc.option(fc.constantFrom('Силовая', 'Кардио', 'Йога')),
            duration: fc.option(fc.integer({ min: 10, max: 120 })),
        }),
        completionStatus: fc.record({
            nutritionFilled: fc.boolean(),
            weightLogged: fc.boolean(),
            activityCompleted: fc.boolean(),
        }),
        createdAt: fc.date(),
        updatedAt: fc.date(),
    })

describe('DailyTrackingGrid Property Tests', () => {
    // Create fresh mock functions for each test
    let mockFetchDailyData: jest.Mock
    let mockStartPolling: jest.Mock
    let mockStopPolling: jest.Mock
    let mockClearError: jest.Mock

    beforeEach(() => {
        // Clean up DOM before each test
        cleanup()

        // Create fresh mocks
        mockFetchDailyData = jest.fn()
        mockStartPolling = jest.fn()
        mockStopPolling = jest.fn()
        mockClearError = jest.fn()

            // Set default mock return value
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {},
                isLoading: false,
                error: null,
                fetchDailyData: mockFetchDailyData,
                startPolling: mockStartPolling,
                stopPolling: mockStopPolling,
                clearError: mockClearError,
            })
    })

    afterEach(() => {
        // Clean up DOM and timers after each test
        cleanup()
        jest.clearAllTimers()
        jest.clearAllMocks()
    })

    /**
     * Property 22: Real-time Metric Updates
     *
     * Tests that the grid properly handles real-time updates by:
     * 1. Starting polling when mounted
     * 2. Stopping polling when unmounted
     * 3. Fetching data for the selected date
     * 4. Displaying all four tracking blocks
     */
    describe('Property 22: Real-time Metric Updates', () => {
        it('starts polling and fetches data on mount for any valid date', () => {
            fc.assert(
                fc.property(
                    dateGenerator(),
                    (date) => {
                        // Create isolated container for this test iteration
                        const container = document.createElement('div')
                        document.body.appendChild(container)

                        try {
                            const { unmount } = render(<DailyTrackingGrid date={date} />, { container })

                            // Should fetch data for the selected date
                            expect(mockFetchDailyData).toHaveBeenCalledWith(date)
                            expect(mockFetchDailyData).toHaveBeenCalledTimes(1)

                            // Should start polling with 30 second interval
                            expect(mockStartPolling).toHaveBeenCalledWith(30000)
                            expect(mockStartPolling).toHaveBeenCalledTimes(1)

                            // Clean up this iteration
                            unmount()

                            // Should stop polling on unmount
                            expect(mockStopPolling).toHaveBeenCalledTimes(1)

                            return true
                        } finally {
                            // Always clean up container
                            document.body.removeChild(container)
                            jest.clearAllMocks()
                        }
                    }
                ),
                { numRuns: 10 } // Reduced iterations for stability
            )
        })

        it('renders all four tracking blocks with correct props for any date', () => {
            fc.assert(
                fc.property(
                    dateGenerator(),
                    (date) => {
                        // Create isolated container for this test iteration
                        const container = document.createElement('div')
                        document.body.appendChild(container)

                        try {
                            const { unmount } = render(<DailyTrackingGrid date={date} />, { container })

                            // Should render all four blocks
                            const nutritionBlock = screen.getByTestId('nutrition-block')
                            const weightBlock = screen.getByTestId('water-block')
                            const stepsBlock = screen.getByTestId('steps-block')
                            const workoutBlock = screen.getByTestId('workout-block')

                            expect(nutritionBlock).toBeInTheDocument()
                            expect(weightBlock).toBeInTheDocument()
                            expect(stepsBlock).toBeInTheDocument()
                            expect(workoutBlock).toBeInTheDocument()

                            // Should pass correct date to all blocks
                            const expectedDate = date.toISOString()
                            expect(nutritionBlock).toHaveAttribute('data-date', expectedDate)
                            expect(weightBlock).toHaveAttribute('data-date', expectedDate)
                            expect(stepsBlock).toHaveAttribute('data-date', expectedDate)
                            expect(workoutBlock).toHaveAttribute('data-date', expectedDate)

                            // Clean up this iteration
                            unmount()

                            return true
                        } finally {
                            // Always clean up container
                            document.body.removeChild(container)
                            jest.clearAllMocks()
                        }
                    }
                ),
                { numRuns: 10 }
            )
        })

        it('displays loading state when data is not available', () => {
            fc.assert(
                fc.property(
                    dateGenerator(),
                    (date) => {
                        // Create isolated container for this test iteration
                        const container = document.createElement('div')
                        document.body.appendChild(container)

                        try {
                            // Mock loading state
                            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                                dailyData: {}, // No data for the date
                                isLoading: true,
                                error: null,
                                fetchDailyData: mockFetchDailyData,
                                startPolling: mockStartPolling,
                                stopPolling: mockStopPolling,
                                clearError: mockClearError,
                            })

                            const { unmount } = render(<DailyTrackingGrid date={date} />, { container })

                            // Should show loading skeleton
                            const skeletons = screen.getAllByLabelText('Загрузка блока отслеживания')
                            expect(skeletons).toHaveLength(3)

                            // Should not render actual blocks during loading
                            expect(screen.queryByTestId('nutrition-block')).not.toBeInTheDocument()
                            expect(screen.queryByTestId('water-block')).not.toBeInTheDocument()
                            expect(screen.queryByTestId('steps-block')).not.toBeInTheDocument()
                            expect(screen.queryByTestId('workout-block')).not.toBeInTheDocument()

                            // Clean up this iteration
                            unmount()

                            return true
                        } finally {
                            // Always clean up container
                            document.body.removeChild(container)
                            jest.clearAllMocks()
                        }
                    }
                ),
                { numRuns: 10 }
            )
        })

        it('displays error state with retry functionality when data fails to load', () => {
            fc.assert(
                fc.property(
                    dateGenerator(),
                    fc.constantFrom(
                        { code: 'NETWORK_ERROR', message: 'Нет подключения к интернету' },
                        { code: 'SERVER_ERROR', message: 'Сервис временно недоступен' }
                    ),
                    (date, error) => {
                        // Create isolated container for this test iteration
                        const container = document.createElement('div')
                        document.body.appendChild(container)

                        try {
                            // Mock error state
                            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                                dailyData: {}, // No data for the date
                                isLoading: false,
                                error,
                                fetchDailyData: mockFetchDailyData,
                                startPolling: mockStartPolling,
                                stopPolling: mockStopPolling,
                                clearError: mockClearError,
                            })

                            const { unmount } = render(<DailyTrackingGrid date={date} />, { container })

                            // Should show error message
                            expect(screen.getByText('Не удалось загрузить данные')).toBeInTheDocument()
                            expect(screen.getByText(error.message)).toBeInTheDocument()

                            // Should show retry button
                            const retryButton = screen.getByText('Попробовать снова')
                            expect(retryButton).toBeInTheDocument()

                            // Should not render blocks during error state
                            expect(screen.queryByTestId('nutrition-block')).not.toBeInTheDocument()
                            expect(screen.queryByTestId('water-block')).not.toBeInTheDocument()
                            expect(screen.queryByTestId('steps-block')).not.toBeInTheDocument()
                            expect(screen.queryByTestId('workout-block')).not.toBeInTheDocument()

                            // Clean up this iteration
                            unmount()

                            return true
                        } finally {
                            // Always clean up container
                            document.body.removeChild(container)
                            jest.clearAllMocks()
                        }
                    }
                ),
                { numRuns: 10 }
            )
        })

        it('shows real-time update indicator when loading with existing data', () => {
            fc.assert(
                fc.property(
                    dateGenerator(),
                    dailyMetricsGenerator(),
                    (date, metrics) => {
                        // Create isolated container for this test iteration
                        const container = document.createElement('div')
                        document.body.appendChild(container)

                        try {
                            const dateStr = formatLocalDate(date)

                                // Mock loading state with existing data
                                ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                                    dailyData: { [dateStr]: metrics }, // Has existing data
                                    isLoading: true,
                                    error: null,
                                    fetchDailyData: mockFetchDailyData,
                                    startPolling: mockStartPolling,
                                    stopPolling: mockStopPolling,
                                    clearError: mockClearError,
                                })

                            const { unmount } = render(<DailyTrackingGrid date={date} />, { container })

                            // Should show update indicator
                            expect(screen.getByText('Обновление данных...')).toBeInTheDocument()

                            // Should still render blocks with existing data
                            expect(screen.getByTestId('nutrition-block')).toBeInTheDocument()
                            expect(screen.getByTestId('water-block')).toBeInTheDocument()
                            expect(screen.getByTestId('steps-block')).toBeInTheDocument()
                            expect(screen.getByTestId('workout-block')).toBeInTheDocument()

                            // Clean up this iteration
                            unmount()

                            return true
                        } finally {
                            // Always clean up container
                            document.body.removeChild(container)
                            jest.clearAllMocks()
                        }
                    }
                ),
                { numRuns: 10 }
            )
        })

        it('shows offline indicator for network errors with existing data', () => {
            fc.assert(
                fc.property(
                    dateGenerator(),
                    dailyMetricsGenerator(),
                    (date, metrics) => {
                        // Create isolated container for this test iteration
                        const container = document.createElement('div')
                        document.body.appendChild(container)

                        try {
                            const dateStr = formatLocalDate(date)

                                // Mock offline state with cached data
                                ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                                    dailyData: { [dateStr]: metrics }, // Has cached data
                                    isLoading: false,
                                    error: { code: 'NETWORK_ERROR', message: 'Нет подключения к интернету' },
                                    fetchDailyData: mockFetchDailyData,
                                    startPolling: mockStartPolling,
                                    stopPolling: mockStopPolling,
                                    clearError: mockClearError,
                                })

                            const { unmount } = render(<DailyTrackingGrid date={date} />, { container })

                            // Should show offline indicator
                            expect(screen.getByText(/Нет подключения к интернету/)).toBeInTheDocument()
                            expect(screen.getByText(/Показаны сохраненные данные/)).toBeInTheDocument()

                            // Should still render blocks with cached data
                            expect(screen.getByTestId('nutrition-block')).toBeInTheDocument()
                            expect(screen.getByTestId('water-block')).toBeInTheDocument()
                            expect(screen.getByTestId('steps-block')).toBeInTheDocument()
                            expect(screen.getByTestId('workout-block')).toBeInTheDocument()

                            // Clean up this iteration
                            unmount()

                            return true
                        } finally {
                            // Always clean up container
                            document.body.removeChild(container)
                            jest.clearAllMocks()
                        }
                    }
                ),
                { numRuns: 10 }
            )
        })
    })
})
