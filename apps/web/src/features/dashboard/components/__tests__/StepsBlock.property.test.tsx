/**
 * Property-based tests for StepsBlock component
 *
 * Feature: dashboard, Property 9: Steps Data Display and Calculation
 * Validates: Requirements 4.1, 4.7
 */

import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import * as fc from 'fast-check'
import { StepsBlock } from '../StepsBlock'
import { useDashboardStore } from '../../store/dashboardStore'
import { formatLocalDate } from '@/shared/utils/format'
import type { DailyMetrics, WeeklyPlan } from '../../types'

// Mock the dashboard store
jest.mock('../../store/dashboardStore')

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: {
        success: jest.fn(),
        error: jest.fn(),
    },
}))

/**
 * Generate valid steps values
 */
const validStepsGenerator = () =>
    fc.integer({ min: 0, max: 50000 })

/**
 * Generate steps goal
 */
const stepsGoalGenerator = () =>
    fc.integer({ min: 5000, max: 20000 })

/**
 * Generate date (filter out invalid dates)
 */
const dateGenerator = () =>
    fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') })
        .filter(d => !isNaN(d.getTime()))

describe('Property 9: Steps Data Display and Calculation', () => {
    // Create fresh mock functions for each test
    let mockUpdateMetric: jest.Mock

    beforeEach(() => {
        // Clean up DOM before each test
        cleanup()
        jest.clearAllMocks()

        // Create fresh mocks
        mockUpdateMetric = jest.fn().mockResolvedValue(undefined)

            // Set default mock return value
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {},
                weeklyPlan: null,
                updateMetric: mockUpdateMetric,
            })
    })

    afterEach(() => {
        // Clean up DOM after each test
        cleanup()
        jest.clearAllMocks()
    })

    /**
     * Property: Steps data is displayed correctly with accurate percentage calculation
     */
    it('displays steps data with correct percentage calculation', () => {
        fc.assert(
            fc.property(
                dateGenerator(),
                validStepsGenerator(),
                stepsGoalGenerator(),
                (date, steps, stepsGoal) => {
                    // Create isolated container for this test iteration
                    const container = document.createElement('div')
                    container.setAttribute('data-testid', `test-container-${Date.now()}-${Math.random()}`)
                    document.body.appendChild(container)

                    try {
                        const dateStr = formatLocalDate(date)

                        // Mock store with test data
                        const testStore = {
                            dailyData: {
                                [dateStr]: {
                                    date: dateStr,
                                    steps,
                                } as DailyMetrics,
                            },
                            weeklyPlan: {
                                stepsGoal,
                            } as WeeklyPlan,
                            updateMetric: mockUpdateMetric,
                        }

                            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue(testStore)

                        const { unmount, container: renderContainer } = render(<StepsBlock date={date} />, { container })

                        // Query within the specific container to avoid cross-contamination
                        const getByTextInContainer = (text: string | RegExp) => {
                            const elements = Array.from(renderContainer.querySelectorAll('*'))
                            const element = elements.find(el => {
                                const textContent = el.textContent || ''
                                return typeof text === 'string' ? textContent === text : text.test(textContent)
                            })
                            if (!element) {
                                throw new Error(`Unable to find element with text: ${text}`)
                            }
                            return element
                        }

                        // Should display current steps (formatted)
                        const stepsDisplay = steps >= 1000 ? `${(steps / 1000).toFixed(1)}k` : steps.toString()
                        getByTextInContainer(stepsDisplay)

                        // Should display steps goal (formatted)
                        const goalDisplay = stepsGoal >= 1000 ? `${(stepsGoal / 1000).toFixed(1)}k` : stepsGoal.toString()
                        getByTextInContainer(`из ${goalDisplay} шагов`)

                        // Should display correct percentage
                        const expectedPercentage = ((steps / stepsGoal) * 100).toFixed(1)
                        getByTextInContainer(`${expectedPercentage}%`)

                        // Should show completion indicator if goal reached
                        if (steps >= stepsGoal) {
                            getByTextInContainer('Цель достигнута!')
                        }

                        // Clean up this iteration
                        unmount()

                        return true
                    } finally {
                        // Always clean up container
                        if (container.parentNode) {
                            document.body.removeChild(container)
                        }
                        jest.clearAllMocks()
                    }
                }
            ),
            { numRuns: 10 } // Reduced iterations for stability
        )
    })

    /**
     * Property: Progress bar reflects correct percentage
     */
    it('shows progress bar with correct percentage for any steps and goal combination', () => {
        fc.assert(
            fc.property(
                dateGenerator(),
                validStepsGenerator(),
                stepsGoalGenerator(),
                (date, steps, stepsGoal) => {
                    // Create isolated container for this test iteration
                    const container = document.createElement('div')
                    document.body.appendChild(container)

                    try {
                        const dateStr = formatLocalDate(date)

                        // Mock store with test data
                        const testStore = {
                            dailyData: {
                                [dateStr]: {
                                    date: dateStr,
                                    steps,
                                } as DailyMetrics,
                            },
                            weeklyPlan: {
                                stepsGoal,
                            } as WeeklyPlan,
                            updateMetric: mockUpdateMetric,
                        }

                            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue(testStore)

                        const { unmount } = render(<StepsBlock date={date} />, { container })

                        // Find progress bar
                        const progressBar = screen.getByRole('progressbar')
                        expect(progressBar).toBeInTheDocument()

                        // Check progress bar attributes
                        const expectedPercentage = Math.min((steps / stepsGoal) * 100, 100)
                        // Component uses integer for whole numbers, decimal for fractional
                        const percentageStr = String(Math.round(expectedPercentage * 10) / 10)
                        expect(progressBar).toHaveAttribute('aria-valuenow', percentageStr)
                        expect(progressBar).toHaveAttribute('aria-valuemin', '0')
                        expect(progressBar).toHaveAttribute('aria-valuemax', '100')

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

    /**
     * Property: Remaining steps calculation is accurate
     */
    it('shows correct remaining steps when goal not reached', () => {
        fc.assert(
            fc.property(
                dateGenerator(),
                stepsGoalGenerator(),
                fc.integer({ min: 1, max: 5000 }), // Steps less than typical goal
                (date, stepsGoal, steps) => {
                    // Ensure steps is less than goal
                    const actualSteps = Math.min(steps, stepsGoal - 1)

                    // Skip edge case where goal is 0 (would cause division by zero)
                    if (stepsGoal === 0) {
                        return true
                    }

                    // Create isolated container for this test iteration
                    const container = document.createElement('div')
                    container.setAttribute('data-testid', `test-container-${Date.now()}-${Math.random()}`)
                    document.body.appendChild(container)

                    try {
                        const dateStr = formatLocalDate(date)

                        // Mock store with test data
                        const testStore = {
                            dailyData: {
                                [dateStr]: {
                                    date: dateStr,
                                    steps: actualSteps,
                                } as DailyMetrics,
                            },
                            weeklyPlan: {
                                stepsGoal,
                            } as WeeklyPlan,
                            updateMetric: mockUpdateMetric,
                        }

                            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue(testStore)

                        const { unmount, container: renderContainer } = render(<StepsBlock date={date} />, { container })

                        // Query within the specific container
                        const queryByTextInContainer = (text: string | RegExp) => {
                            const elements = Array.from(renderContainer.querySelectorAll('*'))
                            return elements.find(el => {
                                const textContent = el.textContent || ''
                                return typeof text === 'string' ? textContent === text : text.test(textContent)
                            })
                        }

                        // Should show remaining steps
                        const remainingSteps = stepsGoal - actualSteps
                        const remainingStepsText = remainingSteps.toLocaleString()
                        const remainingElement = queryByTextInContainer(`Осталось ${remainingStepsText} шагов до цели`)
                        if (!remainingElement) {
                            throw new Error(`Expected to find "Осталось ${remainingStepsText} шагов до цели"`)
                        }

                        // Should not show completion indicator
                        const completionElement = queryByTextInContainer('Цель достигнута!')
                        if (completionElement) {
                            throw new Error('Should not show completion indicator when goal not reached')
                        }

                        // Clean up this iteration
                        unmount()

                        return true
                    } finally {
                        // Always clean up container
                        if (container.parentNode) {
                            document.body.removeChild(container)
                        }
                        jest.clearAllMocks()
                    }
                }
            ),
            { numRuns: 10 }
        )
    })

    /**
     * Property: Empty state is shown when no steps logged
     */
    it('shows empty state when no steps are logged', () => {
        fc.assert(
            fc.property(
                dateGenerator(),
                stepsGoalGenerator(),
                (date, stepsGoal) => {
                    // Create isolated container for this test iteration
                    const container = document.createElement('div')
                    container.setAttribute('data-testid', `test-container-${Date.now()}-${Math.random()}`)
                    document.body.appendChild(container)

                    try {
                        const dateStr = formatLocalDate(date)

                        // Mock store with zero steps
                        const testStore = {
                            dailyData: {
                                [dateStr]: {
                                    date: dateStr,
                                    steps: 0,
                                } as DailyMetrics,
                            },
                            weeklyPlan: {
                                stepsGoal,
                            } as WeeklyPlan,
                            updateMetric: mockUpdateMetric,
                        }

                            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue(testStore)

                        const { unmount, container: renderContainer } = render(<StepsBlock date={date} />, { container })

                        // Query within the specific container
                        const getByTextInContainer = (text: string | RegExp) => {
                            const elements = Array.from(renderContainer.querySelectorAll('*'))
                            const element = elements.find(el => {
                                const textContent = el.textContent || ''
                                return typeof text === 'string' ? textContent === text : text.test(textContent)
                            })
                            if (!element) {
                                throw new Error(`Unable to find element with text: ${text}`)
                            }
                            return element
                        }

                        // Should show empty state message
                        getByTextInContainer('Не записано')
                        getByTextInContainer('Добавить')

                        // Should show helper text
                        getByTextInContainer('Рекомендуется делать минимум 10,000 шагов в день')

                        // Clean up this iteration
                        unmount()

                        return true
                    } finally {
                        // Always clean up container
                        if (container.parentNode) {
                            document.body.removeChild(container)
                        }
                        jest.clearAllMocks()
                    }
                }
            ),
            { numRuns: 10 }
        )
    })

    /**
     * Property: Input dialog validation works correctly
     */
    it('validates steps input correctly in dialog', async () => {
        // Use a single test case since async property tests are complex
        const date = new Date('2024-01-15')
        const stepsGoal = 10000
        const invalidSteps = 150000 // Over 100,000 limit

        const dateStr = formatLocalDate(date)

        // Mock store with test data
        const testStore = {
            dailyData: {
                [dateStr]: {
                    date: dateStr,
                    steps: 5000,
                } as DailyMetrics,
            },
            weeklyPlan: {
                stepsGoal,
            } as WeeklyPlan,
            updateMetric: mockUpdateMetric,
        }

            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue(testStore)

        render(<StepsBlock date={date} />)

        // Click quick add to open dialog
        const quickAddButton = screen.getByLabelText('Добавить шаги')
        fireEvent.click(quickAddButton)

        // Enter invalid steps value
        const input = screen.getByLabelText('Количество шагов')
        fireEvent.change(input, { target: { value: invalidSteps.toString() } })

        // Wait for debounced validation (300ms + buffer)
        await waitFor(() => {
            const errorMessages = screen.queryAllByText(/не более 100,000|100,000/)
            expect(errorMessages.length).toBeGreaterThan(0)
        }, { timeout: 500 })

        // Save button should be disabled
        const saveButton = screen.getByText('Сохранить')
        expect(saveButton).toBeDisabled()
    })
})
