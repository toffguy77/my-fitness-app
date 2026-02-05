/**
 * Property-based tests for dashboard calculation utilities
 * Feature: dashboard
 *
 * These tests validate universal properties that should hold for all inputs
 */

import fc from 'fast-check'
import {
    calculatePercentage,
    calculateCompletionStatus,
    calculateWeekSummary,
    formatTimestamp,
    isAllGoalsMet,
    calculateAdherence,
} from '../calculations'
import type { DailyMetrics } from '../../types'

describe('Dashboard Calculations - Property-Based Tests', () => {
    /**
     * Property 4: Nutrition Data Display Completeness
     *
     * For any nutrition data (calories, protein, fat, carbs with goals),
     * the calculation should display all values and calculate the correct
     * percentage of goal achieved for each metric.
     *
     * Validates: Requirements 2.1, 2.2, 2.5
     */
    describe('Property 4: Nutrition Data Display Completeness', () => {
        it('Feature: dashboard, Property 4: calculates correct percentage for any valid nutrition values', () => {
            fc.assert(
                fc.property(
                    fc.double({ min: 0, max: 10000, noNaN: true }), // current
                    fc.double({ min: 1, max: 10000, noNaN: true }), // goal (non-zero)
                    (current, goal) => {
                        const percentage = calculatePercentage(current, goal)

                        // Percentage should be non-negative
                        expect(percentage).toBeGreaterThanOrEqual(0)

                        // Percentage should match manual calculation (within rounding)
                        const expected = Math.round((current / goal) * 100 * 10) / 10
                        expect(percentage).toBe(expected)

                        // If current equals goal, percentage should be 100
                        if (current === goal) {
                            expect(percentage).toBe(100)
                        }

                        // If current is 0, percentage should be 0
                        if (current === 0) {
                            expect(percentage).toBe(0)
                        }

                        return true
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('Feature: dashboard, Property 4: handles zero goal gracefully', () => {
            fc.assert(
                fc.property(
                    fc.double({ min: 0, max: 10000, noNaN: true }),
                    (current) => {
                        const percentage = calculatePercentage(current, 0)
                        expect(percentage).toBe(0)
                        return true
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('Feature: dashboard, Property 4: percentage is always a valid number', () => {
            fc.assert(
                fc.property(
                    fc.double({ min: 0, max: 10000, noNaN: true }),
                    fc.double({ min: 0, max: 10000, noNaN: true }),
                    (current, goal) => {
                        const percentage = calculatePercentage(current, goal)

                        // Result should always be a valid number (not NaN, and finite)
                        expect(typeof percentage).toBe('number')
                        expect(isNaN(percentage)).toBe(false)
                        expect(isFinite(percentage)).toBe(true)

                        // When goal is 0, percentage should be 0
                        if (goal === 0) {
                            expect(percentage).toBe(0)
                        }

                        return true
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    /**
     * Property 9: Steps Data Display and Calculation
     *
     * For any steps data (goal and current count), the calculation should
     * display both values and calculate the correct percentage of goal achieved.
     *
     * Validates: Requirements 4.1, 4.7
     */
    describe('Property 9: Steps Data Display and Calculation', () => {
        const createMetrics = (steps: number, stepsGoal: number): Pick<DailyMetrics, 'nutrition' | 'weight' | 'steps' | 'workout'> => ({
            nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
            weight: null,
            steps,
            workout: { completed: false },
        })

        it('Feature: dashboard, Property 9: correctly identifies activity completion based on steps', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 100000 }), // steps
                    fc.integer({ min: 1, max: 100000 }), // stepsGoal
                    (steps, stepsGoal) => {
                        const metrics = createMetrics(steps, stepsGoal)
                        const status = calculateCompletionStatus(metrics, stepsGoal)

                        // Activity should be completed if steps >= goal
                        if (steps >= stepsGoal) {
                            expect(status.activityCompleted).toBe(true)
                        } else {
                            expect(status.activityCompleted).toBe(false)
                        }

                        return true
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('Feature: dashboard, Property 9: calculates correct steps percentage', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 100000 }),
                    fc.integer({ min: 1, max: 100000 }),
                    (steps, stepsGoal) => {
                        const percentage = calculatePercentage(steps, stepsGoal)

                        // Percentage should match expected value
                        const expected = Math.round((steps / stepsGoal) * 100 * 10) / 10
                        expect(percentage).toBe(expected)

                        // If steps equal goal, percentage should be 100
                        if (steps === stepsGoal) {
                            expect(percentage).toBe(100)
                        }

                        return true
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('Feature: dashboard, Property 9: activity completion is consistent with percentage', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 100000 }),
                    fc.integer({ min: 1, max: 100000 }),
                    (steps, stepsGoal) => {
                        const metrics = createMetrics(steps, stepsGoal)
                        const status = calculateCompletionStatus(metrics, stepsGoal)
                        const percentage = calculatePercentage(steps, stepsGoal)

                        // If activity is completed, percentage should be >= 100
                        if (status.activityCompleted) {
                            expect(percentage).toBeGreaterThanOrEqual(100)
                        }

                        return true
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    /**
     * Additional property tests for completion status
     */
    describe('Completion Status Properties', () => {
        const createMetrics = (overrides?: Partial<DailyMetrics>): Pick<DailyMetrics, 'nutrition' | 'weight' | 'steps' | 'workout'> => ({
            nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
            weight: null,
            steps: 0,
            workout: { completed: false },
            ...overrides,
        })

        it('nutrition filled is true if and only if calories > 0', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 10000 }),
                    (calories) => {
                        const metrics = createMetrics({
                            nutrition: { calories, protein: 0, fat: 0, carbs: 0 },
                        })
                        const status = calculateCompletionStatus(metrics)

                        expect(status.nutritionFilled).toBe(calories > 0)
                        return true
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('weight logged is true if and only if weight is not null', () => {
            fc.assert(
                fc.property(
                    fc.option(fc.double({ min: 0.1, max: 500, noNaN: true }), { nil: null }),
                    (weight) => {
                        const metrics = createMetrics({ weight })
                        const status = calculateCompletionStatus(metrics)

                        expect(status.weightLogged).toBe(weight !== null)
                        return true
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('activity completed is true if steps >= goal OR workout completed', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 100000 }),
                    fc.integer({ min: 1, max: 100000 }),
                    fc.boolean(),
                    (steps, stepsGoal, workoutCompleted) => {
                        const metrics = createMetrics({
                            steps,
                            workout: { completed: workoutCompleted },
                        })
                        const status = calculateCompletionStatus(metrics, stepsGoal)

                        const expected = steps >= stepsGoal || workoutCompleted
                        expect(status.activityCompleted).toBe(expected)
                        return true
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    /**
     * Week summary calculation properties
     */
    describe('Week Summary Calculation Properties', () => {
        const createDailyMetrics = (overrides?: Partial<DailyMetrics>): DailyMetrics => ({
            date: '2024-01-01',
            userId: 'user-1',
            nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
            weight: null,
            steps: 0,
            workout: { completed: false },
            completionStatus: { nutritionFilled: false, weightLogged: false, activityCompleted: false },
            createdAt: new Date(),
            updatedAt: new Date(),
            ...overrides,
        })

        it('days with nutrition count matches days where calories > 0', () => {
            fc.assert(
                fc.property(
                    fc.array(
                        fc.integer({ min: 0, max: 10000 }),
                        { minLength: 1, maxLength: 7 }
                    ),
                    (caloriesArray) => {
                        const weekMetrics = caloriesArray.map(calories =>
                            createDailyMetrics({
                                nutrition: { calories, protein: 0, fat: 0, carbs: 0 },
                            })
                        )
                        const summary = calculateWeekSummary(weekMetrics)

                        const expected = caloriesArray.filter(c => c > 0).length
                        expect(summary.daysWithNutrition).toBe(expected)
                        return true
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('days with weight count matches days where weight is not null', () => {
            fc.assert(
                fc.property(
                    fc.array(
                        fc.option(fc.double({ min: 0.1, max: 500, noNaN: true }), { nil: null }),
                        { minLength: 1, maxLength: 7 }
                    ),
                    (weightsArray) => {
                        const weekMetrics = weightsArray.map(weight =>
                            createDailyMetrics({ weight })
                        )
                        const summary = calculateWeekSummary(weekMetrics)

                        const expected = weightsArray.filter(w => w !== null).length
                        expect(summary.daysWithWeight).toBe(expected)
                        return true
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('total steps equals sum of all daily steps', () => {
            fc.assert(
                fc.property(
                    fc.array(
                        fc.integer({ min: 0, max: 100000 }),
                        { minLength: 1, maxLength: 7 }
                    ),
                    (stepsArray) => {
                        const weekMetrics = stepsArray.map(steps =>
                            createDailyMetrics({ steps })
                        )
                        const summary = calculateWeekSummary(weekMetrics)

                        const expected = stepsArray.reduce((sum, steps) => sum + steps, 0)
                        expect(summary.totalSteps).toBe(expected)
                        return true
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('workouts completed count matches days where workout.completed is true', () => {
            fc.assert(
                fc.property(
                    fc.array(
                        fc.boolean(),
                        { minLength: 1, maxLength: 7 }
                    ),
                    (workoutsArray) => {
                        const weekMetrics = workoutsArray.map(completed =>
                            createDailyMetrics({ workout: { completed } })
                        )
                        const summary = calculateWeekSummary(weekMetrics)

                        const expected = workoutsArray.filter(w => w).length
                        expect(summary.workoutsCompleted).toBe(expected)
                        return true
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('average calories is correct for any week data', () => {
            fc.assert(
                fc.property(
                    fc.array(
                        fc.integer({ min: 0, max: 10000 }),
                        { minLength: 1, maxLength: 7 }
                    ),
                    (caloriesArray) => {
                        const weekMetrics = caloriesArray.map(calories =>
                            createDailyMetrics({
                                nutrition: { calories, protein: 0, fat: 0, carbs: 0 },
                            })
                        )
                        const summary = calculateWeekSummary(weekMetrics)

                        const daysWithCalories = caloriesArray.filter(c => c > 0)
                        if (daysWithCalories.length > 0) {
                            const sum = daysWithCalories.reduce((s, c) => s + c, 0)
                            const expected = Math.round(sum / daysWithCalories.length)
                            expect(summary.averageCalories).toBe(expected)
                        } else {
                            expect(summary.averageCalories).toBe(0)
                        }
                        return true
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    /**
     * Timestamp formatting properties
     */
    describe('Timestamp Formatting Properties', () => {
        it('always returns a non-empty string for valid dates', () => {
            fc.assert(
                fc.property(
                    fc.date({ min: new Date('2020-01-01'), max: new Date() }),
                    (date) => {
                        const result = formatTimestamp(date)

                        expect(typeof result).toBe('string')
                        expect(result.length).toBeGreaterThan(0)
                        return true
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('handles both Date objects and ISO strings', () => {
            fc.assert(
                fc.property(
                    fc.date({ min: new Date('2020-01-01'), max: new Date() })
                        .filter(d => !isNaN(d.getTime())), // Filter out invalid dates
                    (date) => {
                        const resultFromDate = formatTimestamp(date)
                        const resultFromString = formatTimestamp(date.toISOString())

                        expect(resultFromDate).toBe(resultFromString)
                        return true
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    /**
     * Adherence calculation properties
     */
    describe('Adherence Calculation Properties', () => {
        const createDailyMetrics = (overrides?: Partial<DailyMetrics>): DailyMetrics => ({
            date: '2024-01-01',
            userId: 'user-1',
            nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
            weight: null,
            steps: 0,
            workout: { completed: false },
            completionStatus: { nutritionFilled: false, weightLogged: false, activityCompleted: false },
            createdAt: new Date(),
            updatedAt: new Date(),
            ...overrides,
        })

        it('adherence is always between 0 and 100', () => {
            fc.assert(
                fc.property(
                    fc.array(
                        fc.record({
                            calories: fc.integer({ min: 0, max: 10000 }),
                            weight: fc.option(fc.double({ min: 0.1, max: 500, noNaN: true }), { nil: null }),
                            steps: fc.integer({ min: 0, max: 100000 }),
                            workoutCompleted: fc.boolean(),
                        }),
                        { minLength: 1, maxLength: 7 }
                    ),
                    fc.integer({ min: 1, max: 100000 }),
                    (daysData, stepsGoal) => {
                        const weekMetrics = daysData.map(day =>
                            createDailyMetrics({
                                nutrition: { calories: day.calories, protein: 0, fat: 0, carbs: 0 },
                                weight: day.weight,
                                steps: day.steps,
                                workout: { completed: day.workoutCompleted },
                            })
                        )
                        const adherence = calculateAdherence(weekMetrics, stepsGoal)

                        expect(adherence).toBeGreaterThanOrEqual(0)
                        expect(adherence).toBeLessThanOrEqual(100)
                        return true
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('adherence is 100 when all days have all goals met', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 7 }),
                    fc.integer({ min: 1, max: 100000 }),
                    (numDays, stepsGoal) => {
                        const weekMetrics = Array.from({ length: numDays }, () =>
                            createDailyMetrics({
                                nutrition: { calories: 2000, protein: 150, fat: 60, carbs: 200 },
                                weight: 75.5,
                                steps: stepsGoal,
                            })
                        )
                        const adherence = calculateAdherence(weekMetrics, stepsGoal)

                        expect(adherence).toBe(100)
                        return true
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('adherence is 0 when no days have all goals met', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 7 }),
                    (numDays) => {
                        const weekMetrics = Array.from({ length: numDays }, () =>
                            createDailyMetrics() // All goals not met
                        )
                        const adherence = calculateAdherence(weekMetrics)

                        expect(adherence).toBe(0)
                        return true
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    /**
     * isAllGoalsMet properties
     */
    describe('isAllGoalsMet Properties', () => {
        it('returns true if and only if all three goals are met', () => {
            fc.assert(
                fc.property(
                    fc.boolean(),
                    fc.boolean(),
                    fc.boolean(),
                    (nutritionFilled, weightLogged, activityCompleted) => {
                        const status = {
                            nutritionFilled,
                            weightLogged,
                            activityCompleted,
                        }
                        const result = isAllGoalsMet(status)

                        const expected = nutritionFilled && weightLogged && activityCompleted
                        expect(result).toBe(expected)
                        return true
                    }
                ),
                { numRuns: 100 }
            )
        })
    })
})
