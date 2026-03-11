/**
 * Unit tests for WeeklyPlanSection component
 * Feature: dashboard
 *
 * Tests specific examples and edge cases for weekly plan display
 */

import { render, screen } from '@testing-library/react'
import { WeeklyPlanSection } from '../WeeklyPlanSection'
import { useDashboardStore } from '../../store/dashboardStore'
import type { WeeklyPlan, DailyMetrics } from '../../types'

// Mock the store
jest.mock('../../store/dashboardStore')
const mockUseDashboardStore = useDashboardStore as jest.MockedFunction<typeof useDashboardStore>

/**
 * Helper: Create mock weekly plan
 */
function createMockWeeklyPlan(overrides?: Partial<WeeklyPlan>): WeeklyPlan {
    const now = new Date()
    const startDate = new Date(now)
    startDate.setDate(now.getDate() - 3) // 3 days ago
    const endDate = new Date(now)
    endDate.setDate(now.getDate() + 4) // 4 days from now

    return {
        id: 'plan-123',
        userId: 'user-123',
        curatorId: 'coach-123',
        caloriesGoal: 2000,
        proteinGoal: 150,
        fatGoal: 70,
        carbsGoal: 200,
        stepsGoal: 10000,
        startDate,
        endDate,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'coach-123',
        ...overrides,
    }
}

/**
 * Helper: Create mock daily metrics
 */
function createMockDailyMetrics(
    date: string,
    calories: number,
    protein: number,
    steps: number
): DailyMetrics {
    return {
        date,
        userId: 'user-123',
        nutrition: {
            calories,
            protein,
            fat: 50,
            carbs: 150,
        },
        weight: null,
        steps,
        workout: {
            completed: false,
        },
        completionStatus: {
            nutritionFilled: calories > 0,
            weightLogged: false,
            activityCompleted: steps >= 10000,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
    }
}

describe('WeeklyPlanSection', () => {
    beforeEach(() => {
        jest.clearAllMocks()

        // Default mock implementation
        mockUseDashboardStore.mockReturnValue({
            weeklyPlan: null,
            dailyData: {},
        } as any)
    })

    describe('Rendering', () => {
        it('renders section with heading', () => {
            render(<WeeklyPlanSection />)
            expect(screen.getByRole('heading', { name: /недельная планка/i })).toBeInTheDocument()
        })

        it('renders placeholder when no plan', () => {
            render(<WeeklyPlanSection />)
            expect(screen.getByText(/скоро тут будет твоя планка/i)).toBeInTheDocument()
            expect(screen.getByText(/твой тренер назначит план питания/i)).toBeInTheDocument()
        })

        it('renders active plan with targets', () => {
            const plan = createMockWeeklyPlan()
            mockUseDashboardStore.mockReturnValue({
                weeklyPlan: plan,
                dailyData: {},
            } as any)

            render(<WeeklyPlanSection />)

            expect(screen.getByText(/активна/i)).toBeInTheDocument()
            expect(screen.getByText(/2000 ккал/i)).toBeInTheDocument()
            expect(screen.getByText(/150 г/i)).toBeInTheDocument()
        })

        it('applies custom className', () => {
            const { container } = render(<WeeklyPlanSection className="custom-class" />)
            const section = container.querySelector('.weekly-plan-section')
            expect(section).toHaveClass('custom-class')
        })
    })

    describe('Plan Display', () => {
        it('displays calorie goal', () => {
            const plan = createMockWeeklyPlan({ caloriesGoal: 2500 })
            mockUseDashboardStore.mockReturnValue({
                weeklyPlan: plan,
                dailyData: {},
            } as any)

            render(<WeeklyPlanSection />)
            expect(screen.getByText(/2500 ккал/i)).toBeInTheDocument()
        })

        it('displays protein goal', () => {
            const plan = createMockWeeklyPlan({ proteinGoal: 180 })
            mockUseDashboardStore.mockReturnValue({
                weeklyPlan: plan,
                dailyData: {},
            } as any)

            render(<WeeklyPlanSection />)
            expect(screen.getByText(/180 г/i)).toBeInTheDocument()
        })

        it('displays fat goal when present', () => {
            const plan = createMockWeeklyPlan({ fatGoal: 80 })
            mockUseDashboardStore.mockReturnValue({
                weeklyPlan: plan,
                dailyData: {},
            } as any)

            render(<WeeklyPlanSection />)
            expect(screen.getByText(/80 г/i)).toBeInTheDocument()
        })

        it('displays carbs goal when present', () => {
            const plan = createMockWeeklyPlan({ carbsGoal: 250 })
            mockUseDashboardStore.mockReturnValue({
                weeklyPlan: plan,
                dailyData: {},
            } as any)

            render(<WeeklyPlanSection />)
            expect(screen.getByText(/250 г/i)).toBeInTheDocument()
        })

        it('displays steps goal when present', () => {
            const plan = createMockWeeklyPlan({ stepsGoal: 12000 })
            mockUseDashboardStore.mockReturnValue({
                weeklyPlan: plan,
                dailyData: {},
            } as any)

            render(<WeeklyPlanSection />)
            expect(screen.getByText(/12[,\s]?000/)).toBeInTheDocument()
        })

        it('displays plan dates', () => {
            const plan = createMockWeeklyPlan()
            mockUseDashboardStore.mockReturnValue({
                weeklyPlan: plan,
                dailyData: {},
            } as any)

            render(<WeeklyPlanSection />)
            expect(screen.getByText(/период действия/i)).toBeInTheDocument()
        })

        it('displays active indicator', () => {
            const plan = createMockWeeklyPlan()
            mockUseDashboardStore.mockReturnValue({
                weeklyPlan: plan,
                dailyData: {},
            } as any)

            render(<WeeklyPlanSection />)
            expect(screen.getByText(/активна/i)).toBeInTheDocument()
        })
    })

    describe('Attention Indicators (Requirement 15.7)', () => {
        it('shows attention icon when adherence < 80% for 2+ consecutive days', () => {
            const plan = createMockWeeklyPlan({
                caloriesGoal: 2000,
                proteinGoal: 150,
                stepsGoal: 10000,
            })

            const today = new Date()
            const yesterday = new Date(today)
            yesterday.setDate(today.getDate() - 1)
            const twoDaysAgo = new Date(today)
            twoDaysAgo.setDate(today.getDate() - 2)

            // Low adherence for 2 consecutive days
            const dailyData = {
                [today.toISOString().split('T')[0]]: createMockDailyMetrics(
                    today.toISOString().split('T')[0],
                    1000, // 50% of calorie goal
                    75, // 50% of protein goal
                    5000 // 50% of steps goal
                ),
                [yesterday.toISOString().split('T')[0]]: createMockDailyMetrics(
                    yesterday.toISOString().split('T')[0],
                    1000,
                    75,
                    5000
                ),
            }

            mockUseDashboardStore.mockReturnValue({
                weeklyPlan: plan,
                dailyData,
            } as any)

            render(<WeeklyPlanSection />)

            const icon = screen.getByRole('img', { name: /низкая приверженность плану/i })
            expect(icon).toBeInTheDocument()
            expect(icon).toHaveAttribute('data-urgency', 'high')
        })

        it('does not show attention icon when adherence >= 80%', () => {
            const plan = createMockWeeklyPlan({
                caloriesGoal: 2000,
                proteinGoal: 150,
                stepsGoal: 10000,
            })

            const today = new Date()
            const yesterday = new Date(today)
            yesterday.setDate(today.getDate() - 1)

            // Good adherence
            const dailyData = {
                [today.toISOString().split('T')[0]]: createMockDailyMetrics(
                    today.toISOString().split('T')[0],
                    1900, // 95% of calorie goal
                    145, // 97% of protein goal
                    9500 // 95% of steps goal
                ),
                [yesterday.toISOString().split('T')[0]]: createMockDailyMetrics(
                    yesterday.toISOString().split('T')[0],
                    1900,
                    145,
                    9500
                ),
            }

            mockUseDashboardStore.mockReturnValue({
                weeklyPlan: plan,
                dailyData,
            } as any)

            render(<WeeklyPlanSection />)

            expect(screen.queryByRole('img', { name: /низкая приверженность плану/i })).not.toBeInTheDocument()
        })

        it('does not show attention icon when only 1 day of low adherence', () => {
            const plan = createMockWeeklyPlan({
                caloriesGoal: 2000,
                proteinGoal: 150,
                stepsGoal: 10000,
            })

            const today = new Date()
            const yesterday = new Date(today)
            yesterday.setDate(today.getDate() - 1)

            // Only 1 day of low adherence
            const dailyData = {
                [today.toISOString().split('T')[0]]: createMockDailyMetrics(
                    today.toISOString().split('T')[0],
                    1000, // Low
                    75,
                    5000
                ),
                [yesterday.toISOString().split('T')[0]]: createMockDailyMetrics(
                    yesterday.toISOString().split('T')[0],
                    1900, // Good
                    145,
                    9500
                ),
            }

            mockUseDashboardStore.mockReturnValue({
                weeklyPlan: plan,
                dailyData,
            } as any)

            render(<WeeklyPlanSection />)

            expect(screen.queryByRole('img', { name: /низкая приверженность плану/i })).not.toBeInTheDocument()
        })

        it('resets consecutive count when adherence improves', () => {
            const plan = createMockWeeklyPlan({
                caloriesGoal: 2000,
                proteinGoal: 150,
                stepsGoal: 10000,
            })

            const today = new Date()
            const dates = []
            for (let i = 0; i < 4; i++) {
                const date = new Date(today)
                date.setDate(today.getDate() - i)
                dates.push(date)
            }

            // Pattern: low, good, low, good (should not trigger - no 2 consecutive)
            const dailyData = {
                [dates[0].toISOString().split('T')[0]]: createMockDailyMetrics(
                    dates[0].toISOString().split('T')[0],
                    1000, // Low
                    75,
                    5000
                ),
                [dates[1].toISOString().split('T')[0]]: createMockDailyMetrics(
                    dates[1].toISOString().split('T')[0],
                    1900, // Good
                    145,
                    9500
                ),
                [dates[2].toISOString().split('T')[0]]: createMockDailyMetrics(
                    dates[2].toISOString().split('T')[0],
                    1000, // Low
                    75,
                    5000
                ),
                [dates[3].toISOString().split('T')[0]]: createMockDailyMetrics(
                    dates[3].toISOString().split('T')[0],
                    1900, // Good
                    145,
                    9500
                ),
            }

            mockUseDashboardStore.mockReturnValue({
                weeklyPlan: plan,
                dailyData,
            } as any)

            render(<WeeklyPlanSection />)

            // Should not show indicator because no 2 consecutive low days
            expect(screen.queryByRole('img', { name: /низкая приверженность плану/i })).not.toBeInTheDocument()
        })

        it('has proper ARIA label for attention icon', () => {
            const plan = createMockWeeklyPlan({
                caloriesGoal: 2000,
                proteinGoal: 150,
                stepsGoal: 10000,
            })

            const today = new Date()
            const yesterday = new Date(today)
            yesterday.setDate(today.getDate() - 1)

            const dailyData = {
                [today.toISOString().split('T')[0]]: createMockDailyMetrics(
                    today.toISOString().split('T')[0],
                    1000,
                    75,
                    5000
                ),
                [yesterday.toISOString().split('T')[0]]: createMockDailyMetrics(
                    yesterday.toISOString().split('T')[0],
                    1000,
                    75,
                    5000
                ),
            }

            mockUseDashboardStore.mockReturnValue({
                weeklyPlan: plan,
                dailyData,
            } as any)

            render(<WeeklyPlanSection />)

            const icon = screen.getByRole('img', { name: /низкая приверженность плану \(менее 80% в течение 2\+ дней\)/i })
            expect(icon).toBeInTheDocument()
        })
    })

    describe('Accessibility', () => {
        it('has proper ARIA labels', () => {
            const plan = createMockWeeklyPlan()
            mockUseDashboardStore.mockReturnValue({
                weeklyPlan: plan,
                dailyData: {},
            } as any)

            render(<WeeklyPlanSection />)

            expect(screen.getByRole('heading', { name: /недельная планка/i })).toBeInTheDocument()
            expect(screen.getByRole('status', { name: /план активен/i })).toBeInTheDocument()
        })

        it('has proper heading structure', () => {
            render(<WeeklyPlanSection />)

            const heading = screen.getByRole('heading', { name: /недельная планка/i })
            expect(heading).toHaveAttribute('id', 'weekly-plan-heading')
        })

        it('uses aria-labelledby for section', () => {
            const { container } = render(<WeeklyPlanSection />)
            const section = container.querySelector('[aria-labelledby="weekly-plan-heading"]')
            expect(section).toBeInTheDocument()
        })
    })

    describe('Edge Cases', () => {
        it('handles plan without optional goals', () => {
            const plan = createMockWeeklyPlan({
                fatGoal: undefined,
                carbsGoal: undefined,
                stepsGoal: undefined,
            })
            mockUseDashboardStore.mockReturnValue({
                weeklyPlan: plan,
                dailyData: {},
            } as any)

            render(<WeeklyPlanSection />)

            // Should only show calorie and protein goals
            expect(screen.getByText(/2000 ккал/i)).toBeInTheDocument()
            expect(screen.getByText(/150 г/i)).toBeInTheDocument()
        })

        it('handles inactive plan', () => {
            const plan = createMockWeeklyPlan({ isActive: false })
            mockUseDashboardStore.mockReturnValue({
                weeklyPlan: plan,
                dailyData: {},
            } as any)

            render(<WeeklyPlanSection />)

            // Should show placeholder
            expect(screen.getByText(/скоро тут будет твоя планка/i)).toBeInTheDocument()
        })

        it('handles expired plan', () => {
            const plan = createMockWeeklyPlan({
                startDate: new Date('2024-01-01'),
                endDate: new Date('2024-01-07'),
            })
            mockUseDashboardStore.mockReturnValue({
                weeklyPlan: plan,
                dailyData: {},
            } as any)

            render(<WeeklyPlanSection />)

            // Should show placeholder (plan is expired)
            expect(screen.getByText(/скоро тут будет твоя планка/i)).toBeInTheDocument()
        })

        it('handles missing daily data gracefully', () => {
            const plan = createMockWeeklyPlan()
            mockUseDashboardStore.mockReturnValue({
                weeklyPlan: plan,
                dailyData: {},
            } as any)

            render(<WeeklyPlanSection />)

            // Should not crash and should not show attention indicator
            expect(screen.queryByRole('img', { name: /низкая приверженность плану/i })).not.toBeInTheDocument()
        })

        it('handles undefined daily data gracefully', () => {
            const plan = createMockWeeklyPlan()
            mockUseDashboardStore.mockReturnValue({
                weeklyPlan: plan,
                dailyData: undefined,
            } as any)

            render(<WeeklyPlanSection />)

            // Should not crash and should render active plan
            expect(screen.getByText(/активна/i)).toBeInTheDocument()
            // Should not show attention indicator when dailyData is undefined
            expect(screen.queryByRole('img', { name: /низкая приверженность плану/i })).not.toBeInTheDocument()
        })
    })
})
