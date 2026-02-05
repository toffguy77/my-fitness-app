/**
 * Tests for dashboard calculation utilities
 */

import {
    calculatePercentage,
    calculateCompletionStatus,
    calculateWeekSummary,
    formatTimestamp,
    isAllGoalsMet,
    calculateAdherence,
} from '../calculations'
import type { DailyMetrics, WeeklyReportSummary } from '../../types'

describe('Dashboard Calculation Utilities', () => {
    describe('calculatePercentage', () => {
        it('calculates percentage correctly', () => {
            expect(calculatePercentage(50, 100)).toBe(50)
            expect(calculatePercentage(75, 100)).toBe(75)
            expect(calculatePercentage(100, 100)).toBe(100)
        })

        it('handles values exceeding goal', () => {
            expect(calculatePercentage(150, 100)).toBe(150)
            expect(calculatePercentage(200, 100)).toBe(200)
        })

        it('handles zero current value', () => {
            expect(calculatePercentage(0, 100)).toBe(0)
        })

        it('handles zero goal', () => {
            expect(calculatePercentage(50, 0)).toBe(0)
        })

        it('rounds to 1 decimal place', () => {
            expect(calculatePercentage(33, 100)).toBe(33)
            expect(calculatePercentage(66.666, 100)).toBe(66.7)
            expect(calculatePercentage(33.333, 100)).toBe(33.3)
        })

        it('handles decimal values', () => {
            expect(calculatePercentage(50.5, 100)).toBe(50.5)
            expect(calculatePercentage(75.25, 100)).toBe(75.3)
        })

        it('handles NaN edge cases', () => {
            // NaN cases should return 0
            expect(calculatePercentage(NaN, 100)).toBe(0)
            expect(calculatePercentage(100, NaN)).toBe(0)
            expect(calculatePercentage(NaN, NaN)).toBe(0)
        })
    })

    describe('calculateCompletionStatus', () => {
        const createMetrics = (overrides?: Partial<DailyMetrics>): Pick<DailyMetrics, 'nutrition' | 'weight' | 'steps' | 'workout'> => ({
            nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
            weight: null,
            steps: 0,
            workout: { completed: false },
            ...overrides,
        })

        it('returns all false for empty metrics', () => {
            const metrics = createMetrics()
            const status = calculateCompletionStatus(metrics)

            expect(status.nutritionFilled).toBe(false)
            expect(status.weightLogged).toBe(false)
            expect(status.activityCompleted).toBe(false)
        })

        it('marks nutrition filled when calories > 0', () => {
            const metrics = createMetrics({
                nutrition: { calories: 2000, protein: 150, fat: 60, carbs: 200 },
            })
            const status = calculateCompletionStatus(metrics)

            expect(status.nutritionFilled).toBe(true)
        })

        it('marks weight logged when weight is not null', () => {
            const metrics = createMetrics({ weight: 75.5 })
            const status = calculateCompletionStatus(metrics)

            expect(status.weightLogged).toBe(true)
        })

        it('marks activity completed when steps >= goal', () => {
            const metrics = createMetrics({ steps: 10000 })
            const status = calculateCompletionStatus(metrics, 10000)

            expect(status.activityCompleted).toBe(true)
        })

        it('marks activity completed when workout is completed', () => {
            const metrics = createMetrics({
                workout: { completed: true, type: 'Strength', duration: 60 },
            })
            const status = calculateCompletionStatus(metrics)

            expect(status.activityCompleted).toBe(true)
        })

        it('marks activity completed when steps >= goal OR workout completed', () => {
            const metrics1 = createMetrics({ steps: 12000 })
            expect(calculateCompletionStatus(metrics1, 10000).activityCompleted).toBe(true)

            const metrics2 = createMetrics({ workout: { completed: true } })
            expect(calculateCompletionStatus(metrics2).activityCompleted).toBe(true)

            const metrics3 = createMetrics({ steps: 12000, workout: { completed: true } })
            expect(calculateCompletionStatus(metrics3, 10000).activityCompleted).toBe(true)
        })

        it('uses default steps goal of 10000', () => {
            const metrics = createMetrics({ steps: 9999 })
            expect(calculateCompletionStatus(metrics).activityCompleted).toBe(false)

            const metrics2 = createMetrics({ steps: 10000 })
            expect(calculateCompletionStatus(metrics2).activityCompleted).toBe(true)
        })

        it('accepts custom steps goal', () => {
            const metrics = createMetrics({ steps: 8000 })
            expect(calculateCompletionStatus(metrics, 8000).activityCompleted).toBe(true)
            expect(calculateCompletionStatus(metrics, 10000).activityCompleted).toBe(false)
        })

        it('returns all true when all goals met', () => {
            const metrics = createMetrics({
                nutrition: { calories: 2000, protein: 150, fat: 60, carbs: 200 },
                weight: 75.5,
                steps: 10000,
            })
            const status = calculateCompletionStatus(metrics)

            expect(status.nutritionFilled).toBe(true)
            expect(status.weightLogged).toBe(true)
            expect(status.activityCompleted).toBe(true)
        })
    })

    describe('calculateWeekSummary', () => {
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

        it('returns zero values for empty week', () => {
            const summary = calculateWeekSummary([])

            expect(summary.daysWithNutrition).toBe(0)
            expect(summary.daysWithWeight).toBe(0)
            expect(summary.daysWithActivity).toBe(0)
            expect(summary.averageCalories).toBe(0)
            expect(summary.averageWeight).toBe(0)
            expect(summary.totalSteps).toBe(0)
            expect(summary.workoutsCompleted).toBe(0)
        })

        it('counts days with nutrition (calories > 0)', () => {
            const weekMetrics = [
                createDailyMetrics({ nutrition: { calories: 2000, protein: 150, fat: 60, carbs: 200 } }),
                createDailyMetrics({ nutrition: { calories: 1800, protein: 140, fat: 55, carbs: 180 } }),
                createDailyMetrics({ nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 } }),
            ]
            const summary = calculateWeekSummary(weekMetrics)

            expect(summary.daysWithNutrition).toBe(2)
        })

        it('counts days with weight (weight is not null)', () => {
            const weekMetrics = [
                createDailyMetrics({ weight: 75.5 }),
                createDailyMetrics({ weight: 75.3 }),
                createDailyMetrics({ weight: null }),
            ]
            const summary = calculateWeekSummary(weekMetrics)

            expect(summary.daysWithWeight).toBe(2)
        })

        it('counts days with activity (steps > 0 OR workout completed)', () => {
            const weekMetrics = [
                createDailyMetrics({ steps: 10000 }),
                createDailyMetrics({ workout: { completed: true } }),
                createDailyMetrics({ steps: 0, workout: { completed: false } }),
            ]
            const summary = calculateWeekSummary(weekMetrics)

            expect(summary.daysWithActivity).toBe(2)
        })

        it('calculates average calories correctly', () => {
            const weekMetrics = [
                createDailyMetrics({ nutrition: { calories: 2000, protein: 150, fat: 60, carbs: 200 } }),
                createDailyMetrics({ nutrition: { calories: 1800, protein: 140, fat: 55, carbs: 180 } }),
                createDailyMetrics({ nutrition: { calories: 2200, protein: 160, fat: 65, carbs: 220 } }),
            ]
            const summary = calculateWeekSummary(weekMetrics)

            expect(summary.averageCalories).toBe(2000) // (2000 + 1800 + 2200) / 3 = 2000
        })

        it('calculates average weight correctly', () => {
            const weekMetrics = [
                createDailyMetrics({ weight: 75.5 }),
                createDailyMetrics({ weight: 75.3 }),
                createDailyMetrics({ weight: 75.7 }),
            ]
            const summary = calculateWeekSummary(weekMetrics)

            expect(summary.averageWeight).toBe(75.5) // (75.5 + 75.3 + 75.7) / 3 = 75.5
        })

        it('rounds average weight to 1 decimal place', () => {
            const weekMetrics = [
                createDailyMetrics({ weight: 75.5 }),
                createDailyMetrics({ weight: 75.6 }),
            ]
            const summary = calculateWeekSummary(weekMetrics)

            expect(summary.averageWeight).toBe(75.6) // (75.5 + 75.6) / 2 = 75.55 -> 75.6
        })

        it('sums total steps', () => {
            const weekMetrics = [
                createDailyMetrics({ steps: 10000 }),
                createDailyMetrics({ steps: 8000 }),
                createDailyMetrics({ steps: 12000 }),
            ]
            const summary = calculateWeekSummary(weekMetrics)

            expect(summary.totalSteps).toBe(30000)
        })

        it('counts workouts completed', () => {
            const weekMetrics = [
                createDailyMetrics({ workout: { completed: true } }),
                createDailyMetrics({ workout: { completed: true } }),
                createDailyMetrics({ workout: { completed: false } }),
            ]
            const summary = calculateWeekSummary(weekMetrics)

            expect(summary.workoutsCompleted).toBe(2)
        })

        it('handles full week with mixed data', () => {
            const weekMetrics = [
                createDailyMetrics({
                    nutrition: { calories: 2000, protein: 150, fat: 60, carbs: 200 },
                    weight: 75.5,
                    steps: 10000,
                    workout: { completed: true },
                }),
                createDailyMetrics({
                    nutrition: { calories: 1800, protein: 140, fat: 55, carbs: 180 },
                    weight: 75.3,
                    steps: 8000,
                    workout: { completed: false },
                }),
                createDailyMetrics({
                    nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
                    weight: null,
                    steps: 0,
                    workout: { completed: false },
                }),
            ]
            const summary = calculateWeekSummary(weekMetrics)

            expect(summary.daysWithNutrition).toBe(2)
            expect(summary.daysWithWeight).toBe(2)
            expect(summary.daysWithActivity).toBe(2)
            expect(summary.averageCalories).toBe(1900) // (2000 + 1800) / 2
            expect(summary.averageWeight).toBe(75.4) // (75.5 + 75.3) / 2
            expect(summary.totalSteps).toBe(18000)
            expect(summary.workoutsCompleted).toBe(1)
        })
    })

    describe('formatTimestamp', () => {
        // Mock current time for consistent testing
        const mockNow = new Date('2024-01-15T14:30:00Z')

        beforeEach(() => {
            jest.useFakeTimers()
            jest.setSystemTime(mockNow)
        })

        afterEach(() => {
            jest.useRealTimers()
        })

        it('formats today correctly (ru-RU)', () => {
            const today = new Date('2024-01-15T10:00:00Z')
            const result = formatTimestamp(today, 'ru-RU')
            expect(result).toMatch(/^Сегодня в \d{2}:\d{2}$/)
        })

        it('formats today correctly (en-US)', () => {
            const today = new Date('2024-01-15T10:00:00Z')
            const result = formatTimestamp(today, 'en-US')
            expect(result).toMatch(/^Today at \d{1,2}:\d{2}/)
        })

        it('formats yesterday correctly (ru-RU)', () => {
            const yesterday = new Date('2024-01-14T10:00:00Z')
            const result = formatTimestamp(yesterday, 'ru-RU')
            expect(result).toMatch(/^Вчера в \d{2}:\d{2}$/)
        })

        it('formats yesterday correctly (en-US)', () => {
            const yesterday = new Date('2024-01-14T10:00:00Z')
            const result = formatTimestamp(yesterday, 'en-US')
            expect(result).toMatch(/^Yesterday at \d{1,2}:\d{2}/)
        })

        it('formats this week correctly (ru-RU)', () => {
            const thisWeek = new Date('2024-01-10T10:00:00Z') // 5 days ago
            const result = formatTimestamp(thisWeek, 'ru-RU')
            expect(result).toMatch(/в \d{2}:\d{2}$/)
        })

        it('formats this week correctly (en-US)', () => {
            const thisWeek = new Date('2024-01-10T10:00:00Z') // 5 days ago
            const result = formatTimestamp(thisWeek, 'en-US')
            expect(result).toMatch(/at \d{1,2}:\d{2}/)
        })

        it('formats this year correctly (ru-RU)', () => {
            const thisYear = new Date('2024-01-01T10:00:00Z')
            const result = formatTimestamp(thisYear, 'ru-RU')
            expect(result).toMatch(/в \d{2}:\d{2}$/)
        })

        it('formats this year correctly (en-US)', () => {
            const thisYear = new Date('2024-01-01T10:00:00Z')
            const result = formatTimestamp(thisYear, 'en-US')
            expect(result).toMatch(/at \d{1,2}:\d{2}/)
        })

        it('formats previous years correctly (ru-RU)', () => {
            const previousYear = new Date('2023-06-15T10:00:00Z')
            const result = formatTimestamp(previousYear, 'ru-RU')
            expect(result).toMatch(/2023.*в \d{2}:\d{2}$/)
        })

        it('formats previous years correctly (en-US)', () => {
            const previousYear = new Date('2023-06-15T10:00:00Z')
            const result = formatTimestamp(previousYear, 'en-US')
            expect(result).toMatch(/2023.*at \d{1,2}:\d{2}/)
        })

        it('handles ISO string input', () => {
            const today = new Date('2024-01-15T10:00:00Z')
            const result = formatTimestamp(today.toISOString(), 'ru-RU')
            expect(result).toMatch(/^Сегодня в \d{2}:\d{2}$/)
        })

        it('defaults to ru-RU locale', () => {
            const today = new Date('2024-01-15T10:00:00Z')
            const result = formatTimestamp(today)
            expect(result).toMatch(/^Сегодня в \d{2}:\d{2}$/)
        })
    })

    describe('isAllGoalsMet', () => {
        it('returns true when all goals are met', () => {
            const status = {
                nutritionFilled: true,
                weightLogged: true,
                activityCompleted: true,
            }

            expect(isAllGoalsMet(status)).toBe(true)
        })

        it('returns false when nutrition is not filled', () => {
            const status = {
                nutritionFilled: false,
                weightLogged: true,
                activityCompleted: true,
            }

            expect(isAllGoalsMet(status)).toBe(false)
        })

        it('returns false when weight is not logged', () => {
            const status = {
                nutritionFilled: true,
                weightLogged: false,
                activityCompleted: true,
            }

            expect(isAllGoalsMet(status)).toBe(false)
        })

        it('returns false when activity is not completed', () => {
            const status = {
                nutritionFilled: true,
                weightLogged: true,
                activityCompleted: false,
            }

            expect(isAllGoalsMet(status)).toBe(false)
        })

        it('returns false when no goals are met', () => {
            const status = {
                nutritionFilled: false,
                weightLogged: false,
                activityCompleted: false,
            }

            expect(isAllGoalsMet(status)).toBe(false)
        })
    })

    describe('calculateAdherence', () => {
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

        it('returns 0 for empty week', () => {
            expect(calculateAdherence([])).toBe(0)
        })

        it('returns 100 when all days have all goals met', () => {
            const weekMetrics = [
                createDailyMetrics({
                    nutrition: { calories: 2000, protein: 150, fat: 60, carbs: 200 },
                    weight: 75.5,
                    steps: 10000,
                }),
                createDailyMetrics({
                    nutrition: { calories: 1800, protein: 140, fat: 55, carbs: 180 },
                    weight: 75.3,
                    steps: 8000,
                    workout: { completed: true },
                }),
            ]

            expect(calculateAdherence(weekMetrics)).toBe(100)
        })

        it('returns 0 when no days have all goals met', () => {
            const weekMetrics = [
                createDailyMetrics({ nutrition: { calories: 2000, protein: 150, fat: 60, carbs: 200 } }),
                createDailyMetrics({ weight: 75.5 }),
                createDailyMetrics({ steps: 10000 }),
            ]

            expect(calculateAdherence(weekMetrics)).toBe(0)
        })

        it('calculates percentage correctly for partial adherence', () => {
            const weekMetrics = [
                createDailyMetrics({
                    nutrition: { calories: 2000, protein: 150, fat: 60, carbs: 200 },
                    weight: 75.5,
                    steps: 10000,
                }), // All goals met
                createDailyMetrics({
                    nutrition: { calories: 1800, protein: 140, fat: 55, carbs: 180 },
                    weight: 75.3,
                    steps: 8000,
                }), // Missing activity
                createDailyMetrics({
                    nutrition: { calories: 2200, protein: 160, fat: 65, carbs: 220 },
                    weight: 75.7,
                    steps: 12000,
                }), // All goals met
                createDailyMetrics({ nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 } }), // No goals met
            ]

            expect(calculateAdherence(weekMetrics)).toBe(50) // 2 out of 4 days = 50%
        })

        it('uses custom steps goal', () => {
            const weekMetrics = [
                createDailyMetrics({
                    nutrition: { calories: 2000, protein: 150, fat: 60, carbs: 200 },
                    weight: 75.5,
                    steps: 8000,
                }),
            ]

            expect(calculateAdherence(weekMetrics, 8000)).toBe(100)
            expect(calculateAdherence(weekMetrics, 10000)).toBe(0)
        })

        it('rounds to nearest integer', () => {
            const weekMetrics = [
                createDailyMetrics({
                    nutrition: { calories: 2000, protein: 150, fat: 60, carbs: 200 },
                    weight: 75.5,
                    steps: 10000,
                }), // All goals met
                createDailyMetrics({ nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 } }), // No goals met
                createDailyMetrics({ nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 } }), // No goals met
            ]

            expect(calculateAdherence(weekMetrics)).toBe(33.3) // 1 out of 3 = 33.33% -> 33.3
        })
    })
})
