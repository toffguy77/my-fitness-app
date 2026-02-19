/**
 * Property-based tests for WeeklyPlanSection component
 * Feature: dashboard
 *
 * These tests validate universal properties for weekly plan display
 */

import { render, screen, cleanup } from '@testing-library/react'
import fc from 'fast-check'
import { WeeklyPlanSection } from '../WeeklyPlanSection'
import { useDashboardStore } from '../../store/dashboardStore'
import type { WeeklyPlan } from '../../types'

// Mock the store
jest.mock('../../store/dashboardStore')
const mockUseDashboardStore = useDashboardStore as jest.MockedFunction<typeof useDashboardStore>

describe('WeeklyPlanSection - Property-Based Tests', () => {
    afterEach(() => {
        cleanup()
        jest.clearAllMocks()
    })

    /**
     * Property 16: Weekly Plan Data Display
     *
     * For any active weekly plan, the Weekly_Plan_Section should:
     * - Display all plan fields (calorie goal, protein goal, start date, end date)
     * - Display an active indicator
     *
     * Validates: Requirements 8.1, 8.2, 8.3, 8.4
     */
    describe('Property 16: Weekly Plan Data Display', () => {
        it('Feature: dashboard, Property 16: displays all required plan fields', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1000, max: 5000 }), // Calories goal
                    fc.integer({ min: 50, max: 300 }), // Protein goal
                    (caloriesGoal, proteinGoal) => {
                        const today = new Date()
                        const weekStart = new Date(today)
                        weekStart.setDate(today.getDate() - 3) // 3 days ago
                        const weekEnd = new Date(today)
                        weekEnd.setDate(today.getDate() + 3) // 3 days from now

                        const mockPlan: WeeklyPlan = {
                            id: 'plan-123',
                            userId: 'user-123',
                            curatorId: 'coach-123',
                            caloriesGoal,
                            proteinGoal,
                            startDate: weekStart,
                            endDate: weekEnd,
                            isActive: true,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                            createdBy: 'coach-123',
                        }

                        mockUseDashboardStore.mockReturnValue({
                            weeklyPlan: mockPlan,
                            dailyData: {}, // Add empty dailyData to prevent undefined access
                        } as any)

                        const { unmount } = render(<WeeklyPlanSection />)

                        try {
                            // Should display calorie goal
                            expect(screen.getByText(`${caloriesGoal} ккал`)).toBeInTheDocument()

                            // Should display protein goal
                            expect(screen.getByText(`${proteinGoal} г`)).toBeInTheDocument()

                            // Should display active indicator
                            expect(screen.getByText(/активна/i)).toBeInTheDocument()

                            // Should display period dates
                            expect(screen.getByText(/период действия/i)).toBeInTheDocument()

                            return true
                        } finally {
                            // Clean up after each iteration to prevent DOM pollution
                            unmount()
                            cleanup()
                        }
                    }
                ),
                { numRuns: 20 }
            )
        })

        it('Feature: dashboard, Property 16: displays optional fields when present', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1000, max: 5000 }), // Calories
                    fc.integer({ min: 50, max: 300 }), // Protein
                    fc.integer({ min: 30, max: 150 }), // Fat
                    fc.integer({ min: 100, max: 400 }), // Carbs
                    fc.integer({ min: 5000, max: 15000 }), // Steps
                    (caloriesGoal, proteinGoal, fatGoal, carbsGoal, stepsGoal) => {
                        const today = new Date()
                        const weekStart = new Date(today)
                        weekStart.setDate(today.getDate() - 3)
                        const weekEnd = new Date(today)
                        weekEnd.setDate(today.getDate() + 3)

                        const mockPlan: WeeklyPlan = {
                            id: 'plan-123',
                            userId: 'user-123',
                            curatorId: 'coach-123',
                            caloriesGoal,
                            proteinGoal,
                            fatGoal,
                            carbsGoal,
                            stepsGoal,
                            startDate: weekStart,
                            endDate: weekEnd,
                            isActive: true,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                            createdBy: 'coach-123',
                        }

                        mockUseDashboardStore.mockReturnValue({
                            weeklyPlan: mockPlan,
                            dailyData: {}, // Add empty dailyData to prevent undefined access
                        } as any)

                        const { unmount } = render(<WeeklyPlanSection />)

                        try {
                            // Should display all optional fields
                            // Use getAllByText for values that might be duplicated (e.g., same fat and carbs)
                            const fatElements = screen.queryAllByText(`${fatGoal} г`)
                            const carbsElements = screen.queryAllByText(`${carbsGoal} г`)

                            // Verify at least one element for each (could be same if values match)
                            expect(fatElements.length).toBeGreaterThanOrEqual(1)
                            expect(carbsElements.length).toBeGreaterThanOrEqual(1)

                            // Use flexible matcher for steps (toLocaleString uses non-breaking space)
                            expect(screen.getByText((content, element) => {
                                const hasText = (node: Element | null) => {
                                    if (!node) return false
                                    const text = node.textContent || ''
                                    // Remove all whitespace for comparison
                                    const normalized = text.replace(/\s/g, '')
                                    const expected = stepsGoal.toString()
                                    return normalized === expected
                                }
                                return hasText(element)
                            })).toBeInTheDocument()

                            return true
                        } finally {
                            // Clean up after each iteration to prevent DOM pollution
                            unmount()
                            cleanup()
                        }
                    }
                ),
                { numRuns: 20 }
            )
        })

        it('Feature: dashboard, Property 16: shows placeholder when no plan exists', () => {
            fc.assert(
                fc.property(
                    fc.constant(null),
                    () => {
                        mockUseDashboardStore.mockReturnValue({
                            weeklyPlan: null,
                        } as any)

                        const { unmount } = render(<WeeklyPlanSection />)

                        try {
                            // Should display placeholder message
                            expect(screen.getByText(/скоро тут будет твоя планка/i)).toBeInTheDocument()

                            // Should not display active indicator
                            expect(screen.queryByText(/активна/i)).not.toBeInTheDocument()

                            return true
                        } finally {
                            // Clean up after each iteration to prevent DOM pollution
                            unmount()
                            cleanup()
                        }
                    }
                ),
                { numRuns: 10 }
            )
        })

        it('Feature: dashboard, Property 16: shows placeholder when plan is expired', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1000, max: 5000 }),
                    fc.integer({ min: 50, max: 300 }),
                    (caloriesGoal, proteinGoal) => {
                        const today = new Date()
                        const weekStart = new Date(today)
                        weekStart.setDate(today.getDate() - 10) // 10 days ago
                        const weekEnd = new Date(today)
                        weekEnd.setDate(today.getDate() - 3) // 3 days ago (expired)

                        const mockPlan: WeeklyPlan = {
                            id: 'plan-123',
                            userId: 'user-123',
                            curatorId: 'coach-123',
                            caloriesGoal,
                            proteinGoal,
                            startDate: weekStart,
                            endDate: weekEnd,
                            isActive: true,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                            createdBy: 'coach-123',
                        }

                        mockUseDashboardStore.mockReturnValue({
                            weeklyPlan: mockPlan,
                        } as any)

                        const { unmount } = render(<WeeklyPlanSection />)

                        try {
                            // Should display placeholder for expired plan
                            expect(screen.getByText(/скоро тут будет твоя планка/i)).toBeInTheDocument()

                            // Should not display plan details
                            expect(screen.queryByText(/активна/i)).not.toBeInTheDocument()

                            return true
                        } finally {
                            // Clean up after each iteration to prevent DOM pollution
                            unmount()
                            cleanup()
                        }
                    }
                ),
                { numRuns: 20 }
            )
        })

        it('Feature: dashboard, Property 16: shows placeholder when plan is inactive', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1000, max: 5000 }),
                    fc.integer({ min: 50, max: 300 }),
                    (caloriesGoal, proteinGoal) => {
                        const today = new Date()
                        const weekStart = new Date(today)
                        weekStart.setDate(today.getDate() - 3)
                        const weekEnd = new Date(today)
                        weekEnd.setDate(today.getDate() + 3)

                        const mockPlan: WeeklyPlan = {
                            id: 'plan-123',
                            userId: 'user-123',
                            curatorId: 'coach-123',
                            caloriesGoal,
                            proteinGoal,
                            startDate: weekStart,
                            endDate: weekEnd,
                            isActive: false, // Inactive
                            createdAt: new Date(),
                            updatedAt: new Date(),
                            createdBy: 'coach-123',
                        }

                        mockUseDashboardStore.mockReturnValue({
                            weeklyPlan: mockPlan,
                        } as any)

                        const { unmount } = render(<WeeklyPlanSection />)

                        try {
                            // Should display placeholder for inactive plan
                            expect(screen.getByText(/скоро тут будет твоя планка/i)).toBeInTheDocument()

                            return true
                        } finally {
                            // Clean up after each iteration to prevent DOM pollution
                            unmount()
                            cleanup()
                        }
                    }
                ),
                { numRuns: 20 }
            )
        })
    })
})
