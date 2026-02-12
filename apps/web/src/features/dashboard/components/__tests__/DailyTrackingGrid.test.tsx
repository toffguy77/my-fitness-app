/**
 * Unit tests for DailyTrackingGrid component
 *
 * Tests specific examples and edge cases for the daily tracking grid container.
 * Complements the property-based tests with focused unit test scenarios.
 */

import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { DailyTrackingGrid } from '../DailyTrackingGrid'
import { useDashboardStore } from '../../store/dashboardStore'
import type { DailyMetrics } from '../../types'

// Mock the dashboard store
jest.mock('../../store/dashboardStore')

// Mock the individual block components to avoid complex rendering
jest.mock('../NutritionBlock', () => ({
    NutritionBlock: ({ date, className }: { date: Date; className?: string }) => (
        <div
            data-testid="nutrition-block"
            data-date={date.toISOString()}
            className={className}
        >
            Nutrition Block
        </div>
    ),
}))

jest.mock('../WeightBlock', () => ({
    WeightBlock: ({ date, className }: { date: Date; className?: string }) => (
        <div
            data-testid="weight-block"
            data-date={date.toISOString()}
            className={className}
        >
            Weight Block
        </div>
    ),
}))

jest.mock('../StepsBlock', () => ({
    StepsBlock: ({ date, className }: { date: Date; className?: string }) => (
        <div
            data-testid="steps-block"
            data-date={date.toISOString()}
            className={className}
        >
            Steps Block
        </div>
    ),
}))

jest.mock('../WorkoutBlock', () => ({
    WorkoutBlock: ({ date, className }: { date: Date; className?: string }) => (
        <div
            data-testid="workout-block"
            data-date={date.toISOString()}
            className={className}
        >
            Workout Block
        </div>
    ),
}))

describe('DailyTrackingGrid', () => {
    // Mock functions
    let mockFetchDailyData: jest.Mock
    let mockStartPolling: jest.Mock
    let mockStopPolling: jest.Mock
    let mockClearError: jest.Mock

    // Test data
    const testDate = new Date('2024-01-15T10:00:00Z')
    const testDateStr = '2024-01-15'

    const mockDailyMetrics: DailyMetrics = {
        date: testDateStr,
        userId: 'user-123',
        nutrition: {
            calories: 1800,
            protein: 120,
            fat: 60,
            carbs: 200,
        },
        weight: 75.5,
        steps: 8500,
        workout: {
            completed: true,
            type: 'Силовая',
            duration: 45,
        },
        completionStatus: {
            nutritionFilled: true,
            weightLogged: true,
            activityCompleted: true,
        },
        createdAt: new Date('2024-01-15T08:00:00Z'),
        updatedAt: new Date('2024-01-15T10:00:00Z'),
    }

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
        cleanup()
        jest.clearAllMocks()
    })

    describe('Component Mounting and Unmounting', () => {
        it('fetches data and starts polling on mount', () => {
            const { unmount } = render(<DailyTrackingGrid date={testDate} />)

            expect(mockFetchDailyData).toHaveBeenCalledWith(testDate)
            expect(mockFetchDailyData).toHaveBeenCalledTimes(1)
            expect(mockStartPolling).toHaveBeenCalledWith(30000)
            expect(mockStartPolling).toHaveBeenCalledTimes(1)

            unmount()
            expect(mockStopPolling).toHaveBeenCalledTimes(1)
        })

        it('refetches data when date changes', () => {
            const newDate = new Date('2024-01-16T10:00:00Z')
            const { rerender } = render(<DailyTrackingGrid date={testDate} />)

            expect(mockFetchDailyData).toHaveBeenCalledWith(testDate)

            rerender(<DailyTrackingGrid date={newDate} />)
            expect(mockFetchDailyData).toHaveBeenCalledWith(newDate)
            expect(mockFetchDailyData).toHaveBeenCalledTimes(2)
        })

        it('clears error when date changes and error exists', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {},
                isLoading: false,
                error: { code: 'SERVER_ERROR', message: 'Server error' },
                fetchDailyData: mockFetchDailyData,
                startPolling: mockStartPolling,
                stopPolling: mockStopPolling,
                clearError: mockClearError,
            })

            const newDate = new Date('2024-01-16T10:00:00Z')
            const { rerender } = render(<DailyTrackingGrid date={testDate} />)

            expect(mockClearError).toHaveBeenCalledTimes(1)

            rerender(<DailyTrackingGrid date={newDate} />)
            expect(mockClearError).toHaveBeenCalledTimes(2)
        })

        it('does not clear error when date changes and no error exists', () => {
            const newDate = new Date('2024-01-16T10:00:00Z')
            const { rerender } = render(<DailyTrackingGrid date={testDate} />)

            expect(mockClearError).not.toHaveBeenCalled()

            rerender(<DailyTrackingGrid date={newDate} />)
            expect(mockClearError).not.toHaveBeenCalled()
        })
    })

    describe('Loading States', () => {
        it('shows loading skeleton when loading and no data', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {},
                isLoading: true,
                error: null,
                fetchDailyData: mockFetchDailyData,
                startPolling: mockStartPolling,
                stopPolling: mockStopPolling,
                clearError: mockClearError,
            })

            render(<DailyTrackingGrid date={testDate} />)

            const skeletons = screen.getAllByLabelText('Загрузка блока отслеживания')
            expect(skeletons).toHaveLength(4)
            expect(skeletons[0]).toHaveClass('animate-pulse')

            // Should not render actual blocks
            expect(screen.queryByTestId('nutrition-block')).not.toBeInTheDocument()
            expect(screen.queryByTestId('weight-block')).not.toBeInTheDocument()
            expect(screen.queryByTestId('steps-block')).not.toBeInTheDocument()
            expect(screen.queryByTestId('workout-block')).not.toBeInTheDocument()
        })

        it('shows update indicator when loading with existing data', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: { [testDateStr]: mockDailyMetrics },
                isLoading: true,
                error: null,
                fetchDailyData: mockFetchDailyData,
                startPolling: mockStartPolling,
                stopPolling: mockStopPolling,
                clearError: mockClearError,
            })

            render(<DailyTrackingGrid date={testDate} />)

            expect(screen.getByText('Обновление данных...')).toBeInTheDocument()

            // Should show loading spinner (it has aria-hidden="true")
            const spinner = screen.getByText('Обновление данных...').previousElementSibling
            expect(spinner).toHaveClass('animate-spin')

            // Should still render blocks with existing data
            expect(screen.getByTestId('nutrition-block')).toBeInTheDocument()
            expect(screen.getByTestId('weight-block')).toBeInTheDocument()
            expect(screen.getByTestId('steps-block')).toBeInTheDocument()
            expect(screen.getByTestId('workout-block')).toBeInTheDocument()
        })
    })

    describe('Error States', () => {
        it('shows error message with retry button when error and no data', () => {
            const error = { code: 'SERVER_ERROR', message: 'Сервис временно недоступен' }
                ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                    dailyData: {},
                    isLoading: false,
                    error,
                    fetchDailyData: mockFetchDailyData,
                    startPolling: mockStartPolling,
                    stopPolling: mockStopPolling,
                    clearError: mockClearError,
                })

            render(<DailyTrackingGrid date={testDate} />)

            expect(screen.getByText('Не удалось загрузить данные')).toBeInTheDocument()
            expect(screen.getByText('Сервис временно недоступен')).toBeInTheDocument()

            const retryButton = screen.getByText('Попробовать снова')
            expect(retryButton).toBeInTheDocument()

            // Should not render blocks
            expect(screen.queryByTestId('nutrition-block')).not.toBeInTheDocument()
            expect(screen.queryByTestId('weight-block')).not.toBeInTheDocument()
            expect(screen.queryByTestId('steps-block')).not.toBeInTheDocument()
            expect(screen.queryByTestId('workout-block')).not.toBeInTheDocument()
        })

        it('calls fetchDailyData when retry button is clicked', () => {
            const error = { code: 'SERVER_ERROR', message: 'Server error' }
                ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                    dailyData: {},
                    isLoading: false,
                    error,
                    fetchDailyData: mockFetchDailyData,
                    startPolling: mockStartPolling,
                    stopPolling: mockStopPolling,
                    clearError: mockClearError,
                })

            render(<DailyTrackingGrid date={testDate} />)

            const retryButton = screen.getByText('Попробовать снова')
            fireEvent.click(retryButton)

            expect(mockFetchDailyData).toHaveBeenCalledWith(testDate)
            expect(mockFetchDailyData).toHaveBeenCalledTimes(2) // Once on mount, once on retry
        })

        it('shows offline indicator for network errors with existing data', () => {
            const error = { code: 'NETWORK_ERROR', message: 'Нет подключения к интернету' }
                ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                    dailyData: { [testDateStr]: mockDailyMetrics },
                    isLoading: false,
                    error,
                    fetchDailyData: mockFetchDailyData,
                    startPolling: mockStartPolling,
                    stopPolling: mockStopPolling,
                    clearError: mockClearError,
                })

            render(<DailyTrackingGrid date={testDate} />)

            expect(screen.getByText(/Нет подключения к интернету/)).toBeInTheDocument()
            expect(screen.getByText(/Показаны сохраненные данные/)).toBeInTheDocument()

            // Should still render blocks with cached data
            expect(screen.getByTestId('nutrition-block')).toBeInTheDocument()
            expect(screen.getByTestId('weight-block')).toBeInTheDocument()
            expect(screen.getByTestId('steps-block')).toBeInTheDocument()
            expect(screen.getByTestId('workout-block')).toBeInTheDocument()
        })

        it('does not show offline indicator for non-network errors', () => {
            const error = { code: 'SERVER_ERROR', message: 'Server error' }
                ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                    dailyData: { [testDateStr]: mockDailyMetrics },
                    isLoading: false,
                    error,
                    fetchDailyData: mockFetchDailyData,
                    startPolling: mockStartPolling,
                    stopPolling: mockStopPolling,
                    clearError: mockClearError,
                })

            render(<DailyTrackingGrid date={testDate} />)

            expect(screen.queryByText(/Нет подключения к интернету/)).not.toBeInTheDocument()
            expect(screen.queryByText(/Показаны сохраненные данные/)).not.toBeInTheDocument()
        })
    })

    describe('Success State', () => {
        it('renders all four tracking blocks with correct props', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: { [testDateStr]: mockDailyMetrics },
                isLoading: false,
                error: null,
                fetchDailyData: mockFetchDailyData,
                startPolling: mockStartPolling,
                stopPolling: mockStopPolling,
                clearError: mockClearError,
            })

            render(<DailyTrackingGrid date={testDate} />)

            // Should render all four blocks
            const nutritionBlock = screen.getByTestId('nutrition-block')
            const weightBlock = screen.getByTestId('weight-block')
            const stepsBlock = screen.getByTestId('steps-block')
            const workoutBlock = screen.getByTestId('workout-block')

            expect(nutritionBlock).toBeInTheDocument()
            expect(weightBlock).toBeInTheDocument()
            expect(stepsBlock).toBeInTheDocument()
            expect(workoutBlock).toBeInTheDocument()

            // Should pass correct date to all blocks
            const expectedDate = testDate.toISOString()
            expect(nutritionBlock).toHaveAttribute('data-date', expectedDate)
            expect(weightBlock).toHaveAttribute('data-date', expectedDate)
            expect(stepsBlock).toHaveAttribute('data-date', expectedDate)
            expect(workoutBlock).toHaveAttribute('data-date', expectedDate)

            // Should pass h-full className to all blocks
            expect(nutritionBlock).toHaveClass('h-full')
            expect(weightBlock).toHaveClass('h-full')
            expect(stepsBlock).toHaveClass('h-full')
            expect(workoutBlock).toHaveClass('h-full')
        })

        it('applies custom className when provided', () => {
            const customClass = 'custom-grid-class'
                ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                    dailyData: { [testDateStr]: mockDailyMetrics },
                    isLoading: false,
                    error: null,
                    fetchDailyData: mockFetchDailyData,
                    startPolling: mockStartPolling,
                    stopPolling: mockStopPolling,
                    clearError: mockClearError,
                })

            const { container } = render(
                <DailyTrackingGrid date={testDate} className={customClass} />
            )

            expect(container.firstChild).toHaveClass(customClass)
            expect(container.firstChild).toHaveClass('space-y-3')
            expect(container.firstChild).toHaveClass('sm:space-y-4')
        })

        it('uses responsive grid layout', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: { [testDateStr]: mockDailyMetrics },
                isLoading: false,
                error: null,
                fetchDailyData: mockFetchDailyData,
                startPolling: mockStartPolling,
                stopPolling: mockStopPolling,
                clearError: mockClearError,
            })

            render(<DailyTrackingGrid date={testDate} />)

            const gridContainer = screen.getByTestId('nutrition-block').parentElement?.parentElement
            expect(gridContainer).toHaveClass(
                'grid',
                'grid-cols-1',
                'sm:grid-cols-2',
                'lg:grid-cols-4',
                'gap-3'
            )
        })
    })

    describe('Accessibility', () => {
        it('provides proper ARIA labels for loading skeletons', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {},
                isLoading: true,
                error: null,
                fetchDailyData: mockFetchDailyData,
                startPolling: mockStartPolling,
                stopPolling: mockStopPolling,
                clearError: mockClearError,
            })

            render(<DailyTrackingGrid date={testDate} />)

            const skeletons = screen.getAllByLabelText('Загрузка блока отслеживания')
            expect(skeletons).toHaveLength(4)
        })

        it('hides decorative icons from screen readers', () => {
            const error = { code: 'SERVER_ERROR', message: 'Server error' }
                ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                    dailyData: {},
                    isLoading: false,
                    error,
                    fetchDailyData: mockFetchDailyData,
                    startPolling: mockStartPolling,
                    stopPolling: mockStopPolling,
                    clearError: mockClearError,
                })

            render(<DailyTrackingGrid date={testDate} />)

            // SVG icons should have aria-hidden="true"
            const svgElements = screen.getByText('Не удалось загрузить данные').parentElement?.parentElement?.querySelector('svg')
            expect(svgElements).toHaveAttribute('aria-hidden', 'true')
        })

        it('provides accessible loading spinner', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: { [testDateStr]: mockDailyMetrics },
                isLoading: true,
                error: null,
                fetchDailyData: mockFetchDailyData,
                startPolling: mockStartPolling,
                stopPolling: mockStopPolling,
                clearError: mockClearError,
            })

            render(<DailyTrackingGrid date={testDate} />)

            // Loading spinner should have aria-hidden="true"
            const spinner = screen.getByText('Обновление данных...').previousElementSibling
            expect(spinner).toHaveAttribute('aria-hidden', 'true')
            expect(spinner).toHaveClass('animate-spin')
        })
    })

    describe('Edge Cases', () => {
        it('handles missing data gracefully', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: { 'other-date': mockDailyMetrics }, // Data for different date
                isLoading: false,
                error: null,
                fetchDailyData: mockFetchDailyData,
                startPolling: mockStartPolling,
                stopPolling: mockStopPolling,
                clearError: mockClearError,
            })

            render(<DailyTrackingGrid date={testDate} />)

            // Should render blocks even without specific date data
            expect(screen.getByTestId('nutrition-block')).toBeInTheDocument()
            expect(screen.getByTestId('weight-block')).toBeInTheDocument()
            expect(screen.getByTestId('steps-block')).toBeInTheDocument()
            expect(screen.getByTestId('workout-block')).toBeInTheDocument()
        })

        it('handles date at midnight correctly', () => {
            const midnightDate = new Date('2024-01-15T00:00:00Z')
            const expectedDateStr = '2024-01-15'

            render(<DailyTrackingGrid date={midnightDate} />)

            expect(mockFetchDailyData).toHaveBeenCalledWith(midnightDate)
        })

        it('handles date at end of day correctly', () => {
            const endOfDayDate = new Date('2024-01-15T23:59:59Z')

            render(<DailyTrackingGrid date={endOfDayDate} />)

            expect(mockFetchDailyData).toHaveBeenCalledWith(endOfDayDate)
        })
    })
})
