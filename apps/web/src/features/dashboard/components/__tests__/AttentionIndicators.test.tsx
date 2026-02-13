/**
 * Tests for attention indicators in daily tracking blocks
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.11
 */

import { render, screen } from '@testing-library/react'
import { WeightBlock } from '../WeightBlock'
import { NutritionBlock } from '../NutritionBlock'
import { StepsBlock } from '../StepsBlock'
import { WorkoutBlock } from '../WorkoutBlock'
import { useDashboardStore } from '../../store/dashboardStore'

// Mock the store
jest.mock('../../store/dashboardStore')

// Mock toast
jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: {
        success: jest.fn(),
        error: jest.fn(),
    },
}))

describe('Attention Indicators', () => {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]

    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('WeightBlock', () => {
        it('shows attention indicator when weight is not logged today', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {
                    [todayStr]: {
                        date: todayStr,
                        weight: null,
                        nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
                        steps: 0,
                        workout: { completed: false },
                        completionStatus: {
                            nutritionFilled: false,
                            weightLogged: false,
                            activityCompleted: false,
                        },
                    },
                },
                updateMetric: jest.fn(),
            })

            render(<WeightBlock date={today} />)

            const indicator = screen.getByRole('status', { name: /вес не записан сегодня/i })
            expect(indicator).toBeInTheDocument()
        })

        it('does not show attention indicator when weight is logged today', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {
                    [todayStr]: {
                        date: todayStr,
                        weight: 75.5,
                        nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
                        steps: 0,
                        workout: { completed: false },
                        completionStatus: {
                            nutritionFilled: false,
                            weightLogged: true,
                            activityCompleted: false,
                        },
                    },
                },
                updateMetric: jest.fn(),
            })

            render(<WeightBlock date={today} />)

            const indicator = screen.queryByRole('status', { name: /вес не записан сегодня/i })
            expect(indicator).not.toBeInTheDocument()
        })

        it('does not show attention indicator for past dates', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {
                    [yesterdayStr]: {
                        date: yesterdayStr,
                        weight: null,
                        nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
                        steps: 0,
                        workout: { completed: false },
                        completionStatus: {
                            nutritionFilled: false,
                            weightLogged: false,
                            activityCompleted: false,
                        },
                    },
                },
                updateMetric: jest.fn(),
            })

            render(<WeightBlock date={yesterday} />)

            const indicator = screen.queryByRole('status', { name: /вес не записан сегодня/i })
            expect(indicator).not.toBeInTheDocument()
        })
    })

    describe('NutritionBlock', () => {
        it('shows attention indicator when nutrition is not filled today', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {
                    [todayStr]: {
                        date: todayStr,
                        weight: null,
                        nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
                        steps: 0,
                        workout: { completed: false },
                        completionStatus: {
                            nutritionFilled: false,
                            weightLogged: false,
                            activityCompleted: false,
                        },
                    },
                },
                weeklyPlan: {
                    caloriesGoal: 2000,
                    proteinGoal: 150,
                    fatGoal: 70,
                    carbsGoal: 250,
                },
                updateMetric: jest.fn(),
            })

            render(<NutritionBlock date={today} />)

            const indicator = screen.getByRole('status', { name: /питание не записано сегодня/i })
            expect(indicator).toBeInTheDocument()
        })

        it('does not show attention indicator when nutrition is filled today', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {
                    [todayStr]: {
                        date: todayStr,
                        weight: null,
                        nutrition: { calories: 1500, protein: 100, fat: 50, carbs: 200 },
                        steps: 0,
                        workout: { completed: false },
                        completionStatus: {
                            nutritionFilled: true,
                            weightLogged: false,
                            activityCompleted: false,
                        },
                    },
                },
                weeklyPlan: {
                    caloriesGoal: 2000,
                    proteinGoal: 150,
                    fatGoal: 70,
                    carbsGoal: 250,
                },
                updateMetric: jest.fn(),
            })

            render(<NutritionBlock date={today} />)

            const indicator = screen.queryByRole('status', { name: /питание не записано сегодня/i })
            expect(indicator).not.toBeInTheDocument()
        })
    })

    describe('StepsBlock', () => {
        it('shows attention indicator when steps are not logged today', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {
                    [todayStr]: {
                        date: todayStr,
                        weight: null,
                        nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
                        steps: 0,
                        workout: { completed: false },
                        completionStatus: {
                            nutritionFilled: false,
                            weightLogged: false,
                            activityCompleted: false,
                        },
                    },
                },
                weeklyPlan: {
                    stepsGoal: 10000,
                },
                updateMetric: jest.fn(),
            })

            render(<StepsBlock date={today} />)

            const indicator = screen.getByRole('status', { name: /шаги не записаны сегодня/i })
            expect(indicator).toBeInTheDocument()
        })

        it('does not show attention indicator when steps are logged today', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {
                    [todayStr]: {
                        date: todayStr,
                        weight: null,
                        nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
                        steps: 5000,
                        workout: { completed: false },
                        completionStatus: {
                            nutritionFilled: false,
                            weightLogged: false,
                            activityCompleted: false,
                        },
                    },
                },
                weeklyPlan: {
                    stepsGoal: 10000,
                },
                updateMetric: jest.fn(),
            })

            render(<StepsBlock date={today} />)

            const indicator = screen.queryByRole('status', { name: /шаги не записаны сегодня/i })
            expect(indicator).not.toBeInTheDocument()
        })
    })

    describe('WorkoutBlock', () => {
        it('shows attention indicator when workout is not completed today', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {
                    [todayStr]: {
                        date: todayStr,
                        weight: null,
                        nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
                        steps: 0,
                        workout: { completed: false },
                        completionStatus: {
                            nutritionFilled: false,
                            weightLogged: false,
                            activityCompleted: false,
                        },
                    },
                },
                updateMetric: jest.fn(),
            })

            render(<WorkoutBlock date={today} />)

            const indicator = screen.getByRole('status', { name: /тренировка не записана сегодня/i })
            expect(indicator).toBeInTheDocument()
        })

        it('does not show attention indicator when workout is completed today', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {
                    [todayStr]: {
                        date: todayStr,
                        weight: null,
                        nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
                        steps: 0,
                        workout: { completed: true, type: 'Силовая', duration: 60 },
                        completionStatus: {
                            nutritionFilled: false,
                            weightLogged: false,
                            activityCompleted: true,
                        },
                    },
                },
                updateMetric: jest.fn(),
            })

            render(<WorkoutBlock date={today} />)

            const indicator = screen.queryByRole('status', { name: /тренировка не записана сегодня/i })
            expect(indicator).not.toBeInTheDocument()
        })
    })

    describe('Attention Indicator Removal (Requirement 15.11)', () => {
        it('shows attention indicator when weight is not logged', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {
                    [todayStr]: {
                        date: todayStr,
                        weight: null,
                        nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
                        steps: 0,
                        workout: { completed: false },
                        completionStatus: {
                            nutritionFilled: false,
                            weightLogged: false,
                            activityCompleted: false,
                        },
                    },
                },
                updateMetric: jest.fn(),
            })

            render(<WeightBlock date={today} />)

            expect(screen.getByRole('status', { name: /вес не записан сегодня/i })).toBeInTheDocument()
        })

        it('does not show attention indicator when weight is logged', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {
                    [todayStr]: {
                        date: todayStr,
                        weight: 75.5,
                        nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
                        steps: 0,
                        workout: { completed: false },
                        completionStatus: {
                            nutritionFilled: false,
                            weightLogged: true,
                            activityCompleted: false,
                        },
                    },
                },
                updateMetric: jest.fn(),
            })

            render(<WeightBlock date={today} />)

            expect(screen.getByText('75.5')).toBeInTheDocument()
            expect(screen.queryByRole('status', { name: /вес не записан сегодня/i })).not.toBeInTheDocument()
        })
    })
})
