/**
 * Property-based tests for WorkoutBlock component
 *
 * Property 11: Workout Data Display
 * Validates: Requirements 5.1, 5.3, 5.5
 */

import { render, screen } from '@testing-library/react'
import { WorkoutBlock } from '../WorkoutBlock'
import { useDashboardStore } from '../../store/dashboardStore'
import fc from 'fast-check'

// Mock dependencies
jest.mock('../../store/dashboardStore')
jest.mock('react-hot-toast')

const mockUseDashboardStore = useDashboardStore as jest.MockedFunction<typeof useDashboardStore>

describe('Property 11: Workout Data Display', () => {
    const mockUpdateMetric = jest.fn()

    beforeEach(() => {
        jest.clearAllMocks()
        mockUpdateMetric.mockResolvedValue(undefined)
    })

    it('Feature: dashboard, Property 11: displays workout type when completed', () => {
        fc.assert(
            fc.property(
                fc.constantFrom('Силовая', 'Кардио', 'Йога', 'HIIT', 'Растяжка', 'Плавание', 'Бег', 'Велосипед', 'Другое'),
                (workoutType) => {
                    mockUseDashboardStore.mockReturnValue({
                        dailyData: {
                            '2024-01-15': {
                                workout: {
                                    completed: true,
                                    type: workoutType,
                                },
                            },
                        },
                        updateMetric: mockUpdateMetric,
                    } as any)

                    const { unmount } = render(<WorkoutBlock date={new Date('2024-01-15')} />)

                    // Should display workout type
                    const typeElement = screen.getByText(workoutType)
                    expect(typeElement).toBeInTheDocument()

                    // Should show completion indicator
                    expect(screen.getByText('Тренировка выполнена')).toBeInTheDocument()

                    unmount()
                    return true
                }
            ),
            { numRuns: 50 }
        )
    })

    it('Feature: dashboard, Property 11: formats duration correctly for all valid values', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 600 }),
                (duration) => {
                    mockUseDashboardStore.mockReturnValue({
                        dailyData: {
                            '2024-01-15': {
                                workout: {
                                    completed: true,
                                    type: 'Кардио',
                                    duration,
                                },
                            },
                        },
                        updateMetric: mockUpdateMetric,
                    } as any)

                    const { unmount } = render(<WorkoutBlock date={new Date('2024-01-15')} />)

                    // Duration should be displayed - use getAllByText to handle multiple matches
                    const durationElements = screen.queryAllByText(/мин|ч/)
                    expect(durationElements.length).toBeGreaterThan(0)

                    // Find the element that contains the actual duration
                    const durationText = durationElements.find(el => {
                        const text = el.textContent || ''
                        return text.includes('мин') || text.includes('ч')
                    })
                    expect(durationText).toBeDefined()

                    // Verify format based on duration
                    if (durationText) {
                        if (duration < 60) {
                            expect(durationText.textContent).toContain(`${duration} мин`)
                        } else {
                            const hours = Math.floor(duration / 60)
                            const minutes = duration % 60
                            if (minutes > 0) {
                                expect(durationText.textContent).toContain(`${hours}ч ${minutes}м`)
                            } else {
                                expect(durationText.textContent).toContain(`${hours}ч`)
                            }
                        }
                    }

                    unmount()
                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    it('Feature: dashboard, Property 11: shows empty state when workout not completed', () => {
        fc.assert(
            fc.property(
                fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).filter(d => !isNaN(d.getTime())),
                (date) => {
                    mockUseDashboardStore.mockReturnValue({
                        dailyData: {},
                        updateMetric: mockUpdateMetric,
                    } as any)

                    const { unmount } = render(<WorkoutBlock date={date} />)

                    // Should show empty state
                    expect(screen.getByText('Не записано')).toBeInTheDocument()

                    unmount()
                    return true
                }
            ),
            { numRuns: 50 }
        )
    })

    it('Feature: dashboard, Property 11: completion indicator always present when workout completed', () => {
        fc.assert(
            fc.property(
                fc.record({
                    type: fc.constantFrom('Силовая', 'Кардио', 'Йога', 'HIIT'),
                    duration: fc.option(fc.integer({ min: 1, max: 600 }), { nil: undefined }),
                }),
                (workout) => {
                    mockUseDashboardStore.mockReturnValue({
                        dailyData: {
                            '2024-01-15': {
                                workout: {
                                    completed: true,
                                    ...workout,
                                },
                            },
                        },
                        updateMetric: mockUpdateMetric,
                    } as any)

                    const { unmount } = render(<WorkoutBlock date={new Date('2024-01-15')} />)

                    // Completion indicator should always be present
                    expect(screen.getByText('Тренировка выполнена')).toBeInTheDocument()

                    // Check icon is present
                    const checkIcon = document.querySelector('svg')
                    expect(checkIcon).toBeInTheDocument()

                    unmount()
                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    it('Feature: dashboard, Property 11: quick add button always accessible', () => {
        fc.assert(
            fc.property(
                fc.boolean(),
                fc.option(fc.constantFrom('Силовая', 'Кардио', 'Йога'), { nil: undefined }),
                (completed, workoutType) => {
                    const dailyData = completed && workoutType ? {
                        '2024-01-15': {
                            workout: {
                                completed: true,
                                type: workoutType,
                            },
                        },
                    } : {}

                    mockUseDashboardStore.mockReturnValue({
                        dailyData,
                        updateMetric: mockUpdateMetric,
                    } as any)

                    const { unmount } = render(<WorkoutBlock date={new Date('2024-01-15')} />)

                    // Quick add button should always be present (either in header or empty state)
                    const allButtons = screen.getAllByRole('button')
                    const hasQuickAddButton = allButtons.some(btn =>
                        btn.getAttribute('aria-label')?.includes('тренировку') ||
                        btn.textContent?.includes('Добавить тренировку') ||
                        btn.textContent?.includes('Изменить')
                    )
                    expect(hasQuickAddButton).toBe(true)

                    unmount()
                    return true
                }
            ),
            { numRuns: 50 }
        )
    })
})
