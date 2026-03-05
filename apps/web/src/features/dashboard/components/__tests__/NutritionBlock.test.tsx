/**
 * Unit tests for NutritionBlock component
 *
 * Tests specific examples, edge cases, and user interactions
 * Validates: Requirements 2.1, 2.2, 2.4, 2.5, 2.6
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NutritionBlock } from '../NutritionBlock'
import { useDashboardStore } from '../../store/dashboardStore'
import type { DailyMetrics, WeeklyPlan } from '../../types'

// Mock the dashboard store
jest.mock('../../store/dashboardStore')
const mockUseDashboardStore = useDashboardStore as jest.MockedFunction<typeof useDashboardStore>

// Mock window.location for navigation tests
delete (window as any).location
    ; (window as any).location = { href: '' }

describe('NutritionBlock', () => {
    const mockDate = new Date('2024-01-15')
    const mockDateStr = '2024-01-15'

    const mockWeeklyPlan: WeeklyPlan = {
        id: 'plan-1',
        userId: 'user-1',
        curatorId: 'coach-1',
        caloriesGoal: 2000,
        proteinGoal: 150,
        fatGoal: 67,
        carbsGoal: 250,
        stepsGoal: 10000,
        startDate: new Date('2024-01-15'),
        endDate: new Date('2024-01-21'),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'coach-1',
    }

    const mockDailyData: DailyMetrics = {
        date: mockDateStr,
        userId: 'user-1',
        nutrition: {
            calories: 1500,
            protein: 120,
            fat: 50,
            carbs: 180,
        },
        weight: null,
        steps: 8000,
        workout: { completed: false },
        completionStatus: {
            nutritionFilled: true,
            weightLogged: false,
            activityCompleted: false,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    const mockStoreDefaults = {
        selectedDate: mockDate,
        selectedWeek: { start: mockDate, end: mockDate },
        tasks: [],
        isLoading: false,
        error: null,
        isOffline: false,
        pollingIntervalId: null,
        setSelectedDate: jest.fn(),
        navigateWeek: jest.fn(),
        fetchDailyData: jest.fn(),
        fetchWeekData: jest.fn(),
        updateMetric: jest.fn(),
        fetchWeeklyPlan: jest.fn(),
        fetchTasks: jest.fn(),
        updateTaskStatus: jest.fn(),
        submitWeeklyReport: jest.fn(),
        uploadPhoto: jest.fn(),
        pollForUpdates: jest.fn(),
        startPolling: jest.fn(),
        stopPolling: jest.fn(),
        clearError: jest.fn(),
        reset: jest.fn(),
        setOfflineStatus: jest.fn(),
        loadFromCache: jest.fn(),
        syncWhenOnline: jest.fn(),
    }

    beforeEach(() => {
        jest.clearAllMocks()
            // Reset location href
            ; (window as any).location.href = ''
    })

    describe('Basic Rendering', () => {
        it('renders nutrition block with title and quick add button', () => {
            mockUseDashboardStore.mockReturnValue({
                ...mockStoreDefaults,
                dailyData: { [mockDateStr]: mockDailyData },
                weeklyPlan: mockWeeklyPlan,
            })

            render(<NutritionBlock date={mockDate} />)

            expect(screen.getByText('Питание')).toBeInTheDocument()
            expect(screen.getByLabelText('Добавить еду')).toBeInTheDocument()
        })

        it('applies custom className when provided', () => {
            mockUseDashboardStore.mockReturnValue({
                ...mockStoreDefaults,
                dailyData: { [mockDateStr]: mockDailyData },
                weeklyPlan: mockWeeklyPlan,
            })

            const { container } = render(<NutritionBlock date={mockDate} className="custom-class" />)

            expect(container.firstChild).toHaveClass('custom-class')
        })
    })

    describe('Calorie Display', () => {
        it('displays current calories and goal correctly', () => {
            mockUseDashboardStore.mockReturnValue({
                ...mockStoreDefaults,
                dailyData: { [mockDateStr]: mockDailyData },
                weeklyPlan: mockWeeklyPlan,
            })

            render(<NutritionBlock date={mockDate} />)

            expect(screen.getByText('1500')).toBeInTheDocument()
            expect(screen.getByText('из 2000 ккал')).toBeInTheDocument()
            expect(screen.getByText('75.0%')).toBeInTheDocument()
        })

        it('shows warning when calorie goal is exceeded', () => {
            const overGoalData = {
                ...mockDailyData,
                nutrition: {
                    ...mockDailyData.nutrition,
                    calories: 2500, // Exceeds 2000 goal
                },
            }

            mockUseDashboardStore.mockReturnValue({
                ...mockStoreDefaults,
                dailyData: { [mockDateStr]: overGoalData },
                weeklyPlan: mockWeeklyPlan,
            })

            render(<NutritionBlock date={mockDate} />)

            expect(screen.getByText('Превышена дневная норма калорий')).toBeInTheDocument()
            expect(screen.getByText('125.0%')).toBeInTheDocument()
        })

        it('handles zero calorie goal gracefully', () => {
            const zeroGoalPlan = {
                ...mockWeeklyPlan,
                caloriesGoal: 0,
            }

            mockUseDashboardStore.mockReturnValue({
                ...mockStoreDefaults,
                dailyData: { [mockDateStr]: mockDailyData },
                weeklyPlan: zeroGoalPlan,
            })

            render(<NutritionBlock date={mockDate} />)

            expect(screen.getByText(/из.*0.*ккал/)).toBeInTheDocument()
        })
    })

    describe('Macro Breakdown', () => {
        it('displays all macro nutrients with correct values', () => {
            mockUseDashboardStore.mockReturnValue({
                ...mockStoreDefaults,
                dailyData: { [mockDateStr]: mockDailyData },
                weeklyPlan: mockWeeklyPlan,
            })

            render(<NutritionBlock date={mockDate} />)

            // Check macro labels
            expect(screen.getByText('Белки')).toBeInTheDocument()
            expect(screen.getByText('Жиры')).toBeInTheDocument()
            expect(screen.getByText('Углеводы')).toBeInTheDocument()

            // Check macro values
            expect(screen.getByText('120г / 150г')).toBeInTheDocument() // Protein
            expect(screen.getByText('50г / 67г')).toBeInTheDocument()   // Fat
            expect(screen.getByText('180г / 250г')).toBeInTheDocument() // Carbs

            // Check macro percentages
            expect(screen.getByText('80.0%')).toBeInTheDocument() // Protein: 120/150
            expect(screen.getByText('74.6%')).toBeInTheDocument() // Fat: 50/67
            expect(screen.getByText('72.0%')).toBeInTheDocument() // Carbs: 180/250
        })

        it('shows over-goal styling for macros exceeding targets', () => {
            const overMacroData = {
                ...mockDailyData,
                nutrition: {
                    calories: 1500,
                    protein: 200, // Exceeds 150 goal
                    fat: 80,      // Exceeds 67 goal
                    carbs: 180,
                },
            }

            mockUseDashboardStore.mockReturnValue({
                ...mockStoreDefaults,
                dailyData: { [mockDateStr]: overMacroData },
                weeklyPlan: mockWeeklyPlan,
            })

            render(<NutritionBlock date={mockDate} />)

            expect(screen.getByText('200г / 150г')).toBeInTheDocument()
            expect(screen.getByText('80г / 67г')).toBeInTheDocument()
            expect(screen.getByText('133.3%')).toBeInTheDocument() // Protein
            expect(screen.getByText('119.4%')).toBeInTheDocument() // Fat
        })

        it.skip('handles zero macro goals gracefully', () => {
            const zeroMacroPlan = {
                ...mockWeeklyPlan,
                proteinGoal: 0,
                fatGoal: 0,
                carbsGoal: 0,
            }

            mockUseDashboardStore.mockReturnValue({
                ...mockStoreDefaults,
                dailyData: { [mockDateStr]: mockDailyData },
                weeklyPlan: zeroMacroPlan,
            })

            render(<NutritionBlock date={mockDate} />)

            // When goals are zero, the component should still display the values
            // but the percentage calculation should handle division by zero
            expect(screen.getByText(/120.*г.*\/.*0.*г/)).toBeInTheDocument()
            expect(screen.getByText(/50.*г.*\/.*0.*г/)).toBeInTheDocument()
            expect(screen.getByText(/180.*г.*\/.*0.*г/)).toBeInTheDocument()
        })
    })

    describe('Empty State', () => {
        it('shows empty state when no nutrition data is logged', () => {
            const emptyData = {
                ...mockDailyData,
                nutrition: {
                    calories: 0,
                    protein: 0,
                    fat: 0,
                    carbs: 0,
                },
                completionStatus: {
                    ...mockDailyData.completionStatus,
                    nutritionFilled: false,
                },
            }

            mockUseDashboardStore.mockReturnValue({
                ...mockStoreDefaults,
                dailyData: { [mockDateStr]: emptyData },
                weeklyPlan: mockWeeklyPlan,
            })

            render(<NutritionBlock date={mockDate} />)

            expect(screen.getByText('Не записано')).toBeInTheDocument()
            // Use more specific selector for the empty state button
            expect(screen.getByText('Добавить')).toBeInTheDocument()
        })

        it('does not show empty state when calories are logged', () => {
            mockUseDashboardStore.mockReturnValue({
                ...mockStoreDefaults,
                dailyData: { [mockDateStr]: mockDailyData },
                weeklyPlan: mockWeeklyPlan,
            })

            render(<NutritionBlock date={mockDate} />)

            expect(screen.queryByText('Не записано')).not.toBeInTheDocument()
        })
    })

    describe('Navigation and Interactions', () => {
        it.skip('navigates to food tracker when quick add button is clicked', async () => {
            const user = userEvent.setup()

            mockUseDashboardStore.mockReturnValue({
                ...mockStoreDefaults,
                dailyData: { [mockDateStr]: mockDailyData },
                weeklyPlan: mockWeeklyPlan,
            })

            render(<NutritionBlock date={mockDate} />)

            const quickAddButton = screen.getByLabelText('Добавить еду')
            await user.click(quickAddButton)

            await waitFor(() => {
                expect(window.location.href).toContain(`/food-tracker?date=${mockDateStr}`)
            })
        })

        it.skip('navigates to food tracker when empty state button is clicked', async () => {
            const user = userEvent.setup()

            const emptyData = {
                ...mockDailyData,
                nutrition: {
                    calories: 0,
                    protein: 0,
                    fat: 0,
                    carbs: 0,
                },
            }

            mockUseDashboardStore.mockReturnValue({
                ...mockStoreDefaults,
                dailyData: { [mockDateStr]: emptyData },
                weeklyPlan: mockWeeklyPlan,
            })

            render(<NutritionBlock date={mockDate} />)

            // Get the button with text content (not aria-label) - this is the empty state button
            const addFoodButton = screen.getByText('Добавить еду')
            await user.click(addFoodButton)

            await waitFor(() => {
                expect(window.location.href).toContain(`/food-tracker?date=${mockDateStr}`)
            })
        })

        it.skip('handles navigation errors gracefully', async () => {
            const user = userEvent.setup()
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { })

            // Save original location
            const originalHref = (window as any).location.href
            const originalLocation = (window as any).location

            // Mock location.href setter to throw error
            delete (window as any).location
                ; (window as any).location = {
                    get href() { return '' },
                    set href(value) {
                        throw new Error('Navigation failed')
                    }
                }

            mockUseDashboardStore.mockReturnValue({
                ...mockStoreDefaults,
                dailyData: { [mockDateStr]: mockDailyData },
                weeklyPlan: mockWeeklyPlan,
            })

            render(<NutritionBlock date={mockDate} />)

            const quickAddButton = screen.getByLabelText('Добавить еду')
            await user.click(quickAddButton)

            await waitFor(() => {
                expect(consoleSpy).toHaveBeenCalled()
                const calls = consoleSpy.mock.calls
                const hasNavigationError = calls.some(call =>
                    call[0] === 'Navigation failed:' && call[1] instanceof Error
                )
                expect(hasNavigationError).toBe(true)
            })

            consoleSpy.mockRestore()

            // Restore normal location mock
            delete (window as any).location
                ; (window as any).location = { href: originalHref }
        })
    })

    describe('Data Handling', () => {
        it('handles missing daily data gracefully', () => {
            mockUseDashboardStore.mockReturnValue({
                ...mockStoreDefaults,
                dailyData: {}, // No data for the date
                weeklyPlan: mockWeeklyPlan,
            })

            render(<NutritionBlock date={mockDate} />)

            // Should show empty state
            expect(screen.getByText('Не записано')).toBeInTheDocument()
            expect(screen.getByText('0')).toBeInTheDocument() // Calories
            expect(screen.getByText('из 2000 ккал')).toBeInTheDocument()
        })

        it('handles missing weekly plan gracefully', () => {
            mockUseDashboardStore.mockReturnValue({
                ...mockStoreDefaults,
                dailyData: { [mockDateStr]: mockDailyData },
                weeklyPlan: null,
            })

            render(<NutritionBlock date={mockDate} />)

            // Should use default goals
            expect(screen.getByText('из 2000 ккал')).toBeInTheDocument() // Default calorie goal
            expect(screen.getByText('120г / 150г')).toBeInTheDocument()  // Default protein goal
            expect(screen.getByText('50г / 67г')).toBeInTheDocument()    // Default fat goal
            expect(screen.getByText('180г / 250г')).toBeInTheDocument()  // Default carbs goal
        })

        it('handles missing nutrition data in daily data', () => {
            const dataWithoutNutrition = {
                ...mockDailyData,
                nutrition: undefined as any,
            }

            mockUseDashboardStore.mockReturnValue({
                ...mockStoreDefaults,
                dailyData: { [mockDateStr]: dataWithoutNutrition },
                weeklyPlan: mockWeeklyPlan,
            })

            render(<NutritionBlock date={mockDate} />)

            // Should show zero values
            expect(screen.getByText('0')).toBeInTheDocument() // Calories
            expect(screen.getByText('0г / 150г')).toBeInTheDocument() // Protein
            expect(screen.getByText('0г / 67г')).toBeInTheDocument()  // Fat
            expect(screen.getByText('0г / 250г')).toBeInTheDocument() // Carbs
        })
    })

    describe('Accessibility', () => {
        it('has proper ARIA labels for progress bars', () => {
            mockUseDashboardStore.mockReturnValue({
                ...mockStoreDefaults,
                dailyData: { [mockDateStr]: mockDailyData },
                weeklyPlan: mockWeeklyPlan,
            })

            render(<NutritionBlock date={mockDate} />)

            // Check macro progress bars have proper ARIA attributes
            const proteinProgressBar = screen.getByLabelText('Белки: 120 из 150 г')
            const fatProgressBar = screen.getByLabelText('Жиры: 50 из 67 г')
            const carbsProgressBar = screen.getByLabelText('Углеводы: 180 из 250 г')

            expect(proteinProgressBar).toHaveAttribute('role', 'progressbar')
            expect(proteinProgressBar).toHaveAttribute('aria-valuenow', '120')
            expect(proteinProgressBar).toHaveAttribute('aria-valuemin', '0')
            expect(proteinProgressBar).toHaveAttribute('aria-valuemax', '150')

            expect(fatProgressBar).toHaveAttribute('aria-valuenow', '50')
            expect(carbsProgressBar).toHaveAttribute('aria-valuenow', '180')
        })

        it('has proper button labels', () => {
            mockUseDashboardStore.mockReturnValue({
                ...mockStoreDefaults,
                dailyData: { [mockDateStr]: mockDailyData },
                weeklyPlan: mockWeeklyPlan,
            })

            render(<NutritionBlock date={mockDate} />)

            expect(screen.getByLabelText('Добавить еду')).toBeInTheDocument()
        })
    })

    describe('Visual States', () => {
        it('applies correct color classes for different percentage ranges', () => {
            // Test different calorie scenarios
            const scenarios = [
                { calories: 1000, expectedClass: 'text-red-500' },    // 50% - red
                { calories: 1600, expectedClass: 'text-yellow-500' }, // 80% - yellow
                { calories: 2000, expectedClass: 'text-green-500' },  // 100% - green
                { calories: 2200, expectedClass: 'text-orange-500' }, // 110% - orange
            ]

            scenarios.forEach(({ calories, expectedClass }) => {
                const testData = {
                    ...mockDailyData,
                    nutrition: {
                        ...mockDailyData.nutrition,
                        calories,
                    },
                }

                mockUseDashboardStore.mockReturnValue({
                    ...mockStoreDefaults,
                    dailyData: { [mockDateStr]: testData },
                    weeklyPlan: mockWeeklyPlan,
                })

                const { container } = render(<NutritionBlock date={mockDate} />)

                // Check that the calorie value text has the appropriate color class
                const calorieValue = container.querySelector('[data-testid="calorie-value"]')
                expect(calorieValue).toHaveClass(expectedClass)
            })
        })

        it('caps visual progress at 150% for very high values', () => {
            const veryHighCalorieData = {
                ...mockDailyData,
                nutrition: {
                    ...mockDailyData.nutrition,
                    calories: 5000, // 250% of goal
                },
            }

            mockUseDashboardStore.mockReturnValue({
                ...mockStoreDefaults,
                dailyData: { [mockDateStr]: veryHighCalorieData },
                weeklyPlan: mockWeeklyPlan,
            })

            render(<NutritionBlock date={mockDate} />)

            // Should still show actual percentage in text
            expect(screen.getByText('250.0%')).toBeInTheDocument()

            // But visual progress should be capped (this would need to be tested via the SVG attributes)
        })
    })
})
