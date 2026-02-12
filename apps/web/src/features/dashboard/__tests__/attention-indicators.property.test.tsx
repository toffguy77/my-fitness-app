/**
 * Property-Based Tests for Daily Attention Indicators
 * 
 * Feature: dashboard
 * Property 39: Attention Indicator Display
 * Property 40: Attention Indicator Removal
 * 
 * Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.11
 */

import { render, screen, waitFor } from '@testing-library/react'
import fc from 'fast-check'
import { WeightBlock } from '../components/WeightBlock'
import { NutritionBlock } from '../components/NutritionBlock'
import { StepsBlock } from '../components/StepsBlock'
import { WorkoutBlock } from '../components/WorkoutBlock'
import { useDashboardStore } from '../store/dashboardStore'
import type { DailyMetrics } from '../types'

// Mock the store
jest.mock('../store/dashboardStore')

// Mock toast
jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: {
        success: jest.fn(),
        error: jest.fn(),
    },
}))

// Helper to create a date string
function toDateStr(date: Date): string {
    return date.toISOString().split('T')[0]
}

// Helper to check if date is today
function isToday(date: Date): boolean {
    const today = new Date()
    return toDateStr(date) === toDateStr(today)
}

// Generator for dates (today, past, future)
const dateArbitrary = fc.oneof(
    fc.constant(new Date()), // today
    fc.date({ min: new Date('2024-01-01'), max: new Date(Date.now() - 86400000) }), // past dates (yesterday and before)
    fc.date({ min: new Date(Date.now() + 86400000), max: new Date(Date.now() + 365 * 86400000) }) // future dates (tomorrow to 1 year from now)
).filter(date => !isNaN(date.getTime())) // Filter out invalid dates

// Generator for weight values (null or positive number)
const weightArbitrary = fc.oneof(
    fc.constant(null),
    fc.float({ min: 40, max: 200, noNaN: true })
)

// Generator for nutrition data
const nutritionArbitrary = fc.record({
    calories: fc.integer({ min: 0, max: 5000 }),
    protein: fc.integer({ min: 0, max: 300 }),
    fat: fc.integer({ min: 0, max: 200 }),
    carbs: fc.integer({ min: 0, max: 500 }),
})

// Generator for steps
const stepsArbitrary = fc.integer({ min: 0, max: 50000 })

// Generator for workout data
const workoutArbitrary = fc.record({
    completed: fc.boolean(),
    type: fc.option(fc.constantFrom('Силовая', 'Кардио', 'Йога', 'Растяжка'), { nil: undefined }),
    duration: fc.option(fc.integer({ min: 10, max: 180 }), { nil: undefined }),
})

// Generator for daily metrics
const dailyMetricsArbitrary = (date: Date) => fc.record({
    date: fc.constant(toDateStr(date)),
    weight: weightArbitrary,
    nutrition: nutritionArbitrary,
    steps: stepsArbitrary,
    workout: workoutArbitrary,
    completionStatus: fc.record({
        nutritionFilled: fc.boolean(),
        weightLogged: fc.boolean(),
        activityCompleted: fc.boolean(),
    }),
})

describe('Property 39: Attention Indicator Display', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('Feature: dashboard, Property 39: For any incomplete daily metric on the current day, the corresponding block should display a visual attention indicator', () => {
        fc.assert(
            fc.property(
                weightArbitrary,
                nutritionArbitrary,
                stepsArbitrary,
                workoutArbitrary,
                (weight, nutrition, steps, workout) => {
                    const today = new Date()
                    const todayStr = toDateStr(today)

                    // Create daily metrics
                    const dailyMetrics: DailyMetrics = {
                        date: todayStr,
                        userId: 'test-user',
                        weight,
                        nutrition,
                        steps,
                        workout,
                        completionStatus: {
                            nutritionFilled: nutrition.calories > 0,
                            weightLogged: weight !== null,
                            activityCompleted: steps > 0 || workout.completed,
                        },
                        createdAt: today,
                        updatedAt: today,
                    }

                        // Mock store
                        ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                            dailyData: {
                                [todayStr]: dailyMetrics,
                            },
                            weeklyPlan: {
                                caloriesGoal: 2000,
                                proteinGoal: 150,
                                fatGoal: 67,
                                carbsGoal: 250,
                                stepsGoal: 10000,
                            },
                            updateMetric: jest.fn(),
                        })

                    // Test WeightBlock
                    const { unmount: unmountWeight } = render(<WeightBlock date={today} />)
                    const weightIndicator = screen.queryByRole('status', { name: /вес не записан сегодня/i })

                    if (weight === null) {
                        // Should show attention indicator when weight is not logged
                        expect(weightIndicator).toBeInTheDocument()
                        expect(weightIndicator).toHaveAttribute('data-urgency', 'normal')
                    } else {
                        // Should not show attention indicator when weight is logged
                        expect(weightIndicator).not.toBeInTheDocument()
                    }
                    unmountWeight()

                    // Test NutritionBlock
                    const { unmount: unmountNutrition } = render(<NutritionBlock date={today} />)
                    const nutritionIndicator = screen.queryByRole('status', { name: /питание не записано сегодня/i })

                    if (nutrition.calories === 0) {
                        // Should show attention indicator when nutrition is not logged
                        expect(nutritionIndicator).toBeInTheDocument()
                        expect(nutritionIndicator).toHaveAttribute('data-urgency', 'normal')
                    } else {
                        // Should not show attention indicator when nutrition is logged
                        expect(nutritionIndicator).not.toBeInTheDocument()
                    }
                    unmountNutrition()

                    // Test StepsBlock
                    const { unmount: unmountSteps } = render(<StepsBlock date={today} />)
                    const stepsIndicator = screen.queryByRole('status', { name: /шаги не записаны сегодня/i })

                    if (steps === 0) {
                        // Should show attention indicator when steps are not logged
                        expect(stepsIndicator).toBeInTheDocument()
                        expect(stepsIndicator).toHaveAttribute('data-urgency', 'normal')
                    } else {
                        // Should not show attention indicator when steps are logged
                        expect(stepsIndicator).not.toBeInTheDocument()
                    }
                    unmountSteps()

                    // Test WorkoutBlock
                    const { unmount: unmountWorkout } = render(<WorkoutBlock date={today} />)
                    const workoutIndicator = screen.queryByRole('status', { name: /тренировка не записана сегодня/i })

                    if (!workout.completed) {
                        // Should show attention indicator when workout is not logged
                        expect(workoutIndicator).toBeInTheDocument()
                        expect(workoutIndicator).toHaveAttribute('data-urgency', 'normal')
                    } else {
                        // Should not show attention indicator when workout is logged
                        expect(workoutIndicator).not.toBeInTheDocument()
                    }
                    unmountWorkout()
                }
            ),
            { numRuns: 100 }
        )
    })

    it('Feature: dashboard, Property 39: Attention indicators should only appear for the current day, not past or future dates', () => {
        fc.assert(
            fc.property(
                dateArbitrary,
                (date) => {
                    const dateStr = toDateStr(date)
                    const today = isToday(date)

                    // Create daily metrics with incomplete data
                    const dailyMetrics: DailyMetrics = {
                        date: dateStr,
                        userId: 'test-user',
                        weight: null,
                        nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
                        steps: 0,
                        workout: { completed: false },
                        completionStatus: {
                            nutritionFilled: false,
                            weightLogged: false,
                            activityCompleted: false,
                        },
                        createdAt: date,
                        updatedAt: date,
                    }

                        // Mock store
                        ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                            dailyData: {
                                [dateStr]: dailyMetrics,
                            },
                            weeklyPlan: {
                                caloriesGoal: 2000,
                                proteinGoal: 150,
                                stepsGoal: 10000,
                            },
                            updateMetric: jest.fn(),
                        })

                    // Test WeightBlock
                    const { unmount: unmountWeight } = render(<WeightBlock date={date} />)
                    const weightIndicator = screen.queryByRole('status', { name: /вес не записан сегодня/i })

                    if (today) {
                        expect(weightIndicator).toBeInTheDocument()
                    } else {
                        expect(weightIndicator).not.toBeInTheDocument()
                    }
                    unmountWeight()

                    // Test NutritionBlock
                    const { unmount: unmountNutrition } = render(<NutritionBlock date={date} />)
                    const nutritionIndicator = screen.queryByRole('status', { name: /питание не записано сегодня/i })

                    if (today) {
                        expect(nutritionIndicator).toBeInTheDocument()
                    } else {
                        expect(nutritionIndicator).not.toBeInTheDocument()
                    }
                    unmountNutrition()

                    // Test StepsBlock
                    const { unmount: unmountSteps } = render(<StepsBlock date={date} />)
                    const stepsIndicator = screen.queryByRole('status', { name: /шаги не записаны сегодня/i })

                    if (today) {
                        expect(stepsIndicator).toBeInTheDocument()
                    } else {
                        expect(stepsIndicator).not.toBeInTheDocument()
                    }
                    unmountSteps()

                    // Test WorkoutBlock
                    const { unmount: unmountWorkout } = render(<WorkoutBlock date={date} />)
                    const workoutIndicator = screen.queryByRole('status', { name: /тренировка не записана сегодня/i })

                    if (today) {
                        expect(workoutIndicator).toBeInTheDocument()
                    } else {
                        expect(workoutIndicator).not.toBeInTheDocument()
                    }
                    unmountWorkout()
                }
            ),
            { numRuns: 100 }
        )
    })
})

describe('Property 40: Attention Indicator Removal', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('Feature: dashboard, Property 40: For any attention indicator displayed, when the user completes the corresponding action, the indicator should disappear within 500ms', async () => {
        fc.assert(
            fc.asyncProperty(
                fc.float({ min: 40, max: 200, noNaN: true }),
                fc.record({
                    calories: fc.integer({ min: 1, max: 5000 }),
                    protein: fc.integer({ min: 0, max: 300 }),
                    fat: fc.integer({ min: 0, max: 200 }),
                    carbs: fc.integer({ min: 0, max: 500 }),
                }),
                fc.integer({ min: 1, max: 50000 }),
                fc.record({
                    completed: fc.constant(true),
                    type: fc.constantFrom('Силовая', 'Кардио', 'Йога'),
                    duration: fc.integer({ min: 10, max: 180 }),
                }),
                async (weight, nutrition, steps, workout) => {
                    const today = new Date()
                    const todayStr = toDateStr(today)

                    // Start with incomplete data
                    const incompleteMetrics: DailyMetrics = {
                        date: todayStr,
                        userId: 'test-user',
                        weight: null,
                        nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
                        steps: 0,
                        workout: { completed: false },
                        completionStatus: {
                            nutritionFilled: false,
                            weightLogged: false,
                            activityCompleted: false,
                        },
                        createdAt: today,
                        updatedAt: today,
                    }

                        // Test WeightBlock
                        ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                            dailyData: { [todayStr]: incompleteMetrics },
                            updateMetric: jest.fn(),
                        })

                    const { rerender: rerenderWeight, unmount: unmountWeight } = render(<WeightBlock date={today} />)
                    expect(screen.getByRole('status', { name: /вес не записан сегодня/i })).toBeInTheDocument()

                    // Complete the action
                    const startTime = Date.now()
                        ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                            dailyData: {
                                [todayStr]: {
                                    ...incompleteMetrics,
                                    weight,
                                    completionStatus: { ...incompleteMetrics.completionStatus, weightLogged: true },
                                },
                            },
                            updateMetric: jest.fn(),
                        })

                    rerenderWeight(<WeightBlock date={today} />)

                    await waitFor(() => {
                        expect(screen.queryByRole('status', { name: /вес не записан сегодня/i })).not.toBeInTheDocument()
                    }, { timeout: 500 })

                    const elapsedTime = Date.now() - startTime
                    expect(elapsedTime).toBeLessThan(500)
                    unmountWeight()

                        // Test NutritionBlock
                        ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                            dailyData: { [todayStr]: incompleteMetrics },
                            weeklyPlan: { caloriesGoal: 2000, proteinGoal: 150, fatGoal: 67, carbsGoal: 250 },
                            updateMetric: jest.fn(),
                        })

                    const { rerender: rerenderNutrition, unmount: unmountNutrition } = render(<NutritionBlock date={today} />)
                    expect(screen.getByRole('status', { name: /питание не записано сегодня/i })).toBeInTheDocument()

                    // Complete the action
                    const startTime2 = Date.now()
                        ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                            dailyData: {
                                [todayStr]: {
                                    ...incompleteMetrics,
                                    nutrition,
                                    completionStatus: { ...incompleteMetrics.completionStatus, nutritionFilled: true },
                                },
                            },
                            weeklyPlan: { caloriesGoal: 2000, proteinGoal: 150, fatGoal: 67, carbsGoal: 250 },
                            updateMetric: jest.fn(),
                        })

                    rerenderNutrition(<NutritionBlock date={today} />)

                    await waitFor(() => {
                        expect(screen.queryByRole('status', { name: /питание не записано сегодня/i })).not.toBeInTheDocument()
                    }, { timeout: 500 })

                    const elapsedTime2 = Date.now() - startTime2
                    expect(elapsedTime2).toBeLessThan(500)
                    unmountNutrition()

                        // Test StepsBlock
                        ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                            dailyData: { [todayStr]: incompleteMetrics },
                            weeklyPlan: { stepsGoal: 10000 },
                            updateMetric: jest.fn(),
                        })

                    const { rerender: rerenderSteps, unmount: unmountSteps } = render(<StepsBlock date={today} />)
                    expect(screen.getByRole('status', { name: /шаги не записаны сегодня/i })).toBeInTheDocument()

                    // Complete the action
                    const startTime3 = Date.now()
                        ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                            dailyData: {
                                [todayStr]: {
                                    ...incompleteMetrics,
                                    steps,
                                    completionStatus: { ...incompleteMetrics.completionStatus, activityCompleted: true },
                                },
                            },
                            weeklyPlan: { stepsGoal: 10000 },
                            updateMetric: jest.fn(),
                        })

                    rerenderSteps(<StepsBlock date={today} />)

                    await waitFor(() => {
                        expect(screen.queryByRole('status', { name: /шаги не записаны сегодня/i })).not.toBeInTheDocument()
                    }, { timeout: 500 })

                    const elapsedTime3 = Date.now() - startTime3
                    expect(elapsedTime3).toBeLessThan(500)
                    unmountSteps()

                        // Test WorkoutBlock
                        ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                            dailyData: { [todayStr]: incompleteMetrics },
                            updateMetric: jest.fn(),
                        })

                    const { rerender: rerenderWorkout, unmount: unmountWorkout } = render(<WorkoutBlock date={today} />)
                    expect(screen.getByRole('status', { name: /тренировка не записана сегодня/i })).toBeInTheDocument()

                    // Complete the action
                    const startTime4 = Date.now()
                        ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                            dailyData: {
                                [todayStr]: {
                                    ...incompleteMetrics,
                                    workout,
                                    completionStatus: { ...incompleteMetrics.completionStatus, activityCompleted: true },
                                },
                            },
                            updateMetric: jest.fn(),
                        })

                    rerenderWorkout(<WorkoutBlock date={today} />)

                    await waitFor(() => {
                        expect(screen.queryByRole('status', { name: /тренировка не записана сегодня/i })).not.toBeInTheDocument()
                    }, { timeout: 500 })

                    const elapsedTime4 = Date.now() - startTime4
                    expect(elapsedTime4).toBeLessThan(500)
                    unmountWorkout()
                }
            ),
            { numRuns: 100 }
        )
    })

    it('Feature: dashboard, Property 40: Attention indicators should remain visible until the action is completed', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 10 }),
                (iterations) => {
                    const today = new Date()
                    const todayStr = toDateStr(today)

                    // Create incomplete metrics
                    const incompleteMetrics: DailyMetrics = {
                        date: todayStr,
                        userId: 'test-user',
                        weight: null,
                        nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
                        steps: 0,
                        workout: { completed: false },
                        completionStatus: {
                            nutritionFilled: false,
                            weightLogged: false,
                            activityCompleted: false,
                        },
                        createdAt: today,
                        updatedAt: today,
                    }

                        // Mock store
                        ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                            dailyData: { [todayStr]: incompleteMetrics },
                            weeklyPlan: {
                                caloriesGoal: 2000,
                                proteinGoal: 150,
                                stepsGoal: 10000,
                            },
                            updateMetric: jest.fn(),
                        })

                    // Render and rerender multiple times - indicator should persist
                    const { rerender: rerenderWeight, unmount: unmountWeight } = render(<WeightBlock date={today} />)

                    for (let i = 0; i < iterations; i++) {
                        rerenderWeight(<WeightBlock date={today} />)
                        expect(screen.getByRole('status', { name: /вес не записан сегодня/i })).toBeInTheDocument()
                    }
                    unmountWeight()

                    const { rerender: rerenderNutrition, unmount: unmountNutrition } = render(<NutritionBlock date={today} />)

                    for (let i = 0; i < iterations; i++) {
                        rerenderNutrition(<NutritionBlock date={today} />)
                        expect(screen.getByRole('status', { name: /питание не записано сегодня/i })).toBeInTheDocument()
                    }
                    unmountNutrition()

                    const { rerender: rerenderSteps, unmount: unmountSteps } = render(<StepsBlock date={today} />)

                    for (let i = 0; i < iterations; i++) {
                        rerenderSteps(<StepsBlock date={today} />)
                        expect(screen.getByRole('status', { name: /шаги не записаны сегодня/i })).toBeInTheDocument()
                    }
                    unmountSteps()

                    const { rerender: rerenderWorkout, unmount: unmountWorkout } = render(<WorkoutBlock date={today} />)

                    for (let i = 0; i < iterations; i++) {
                        rerenderWorkout(<WorkoutBlock date={today} />)
                        expect(screen.getByRole('status', { name: /тренировка не записана сегодня/i })).toBeInTheDocument()
                    }
                    unmountWorkout()
                }
            ),
            { numRuns: 100 }
        )
    })
})
