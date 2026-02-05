/**
 * Property-based tests for TasksSection component
 * Feature: dashboard
 *
 * These tests validate universal properties for tasks display and status updates
 */

import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import fc from 'fast-check'
import { TasksSection } from '../TasksSection'
import { useDashboardStore } from '../../store/dashboardStore'
import type { Task, TaskStatus } from '../../types'

// Mock the store
jest.mock('../../store/dashboardStore')
const mockUseDashboardStore = useDashboardStore as jest.MockedFunction<typeof useDashboardStore>

/**
 * Helper: Create mock task
 */
function createMockTask(
    id: string,
    weekNumber: number,
    status: TaskStatus = 'active'
): Task {
    const now = new Date()
    const dueDate = new Date(now)
    dueDate.setDate(now.getDate() + 7)

    return {
        id,
        userId: 'user-123',
        coachId: 'coach-123',
        title: `Task ${id}`,
        description: `Description for task ${id}`,
        weekNumber,
        assignedAt: new Date(),
        dueDate,
        status,
        createdAt: new Date(),
        updatedAt: new Date(),
    }
}

describe('TasksSection - Property-Based Tests', () => {
    afterEach(() => {
        cleanup()
        jest.clearAllMocks()
    })

    /**
     * Property 18: Tasks Data Display
     *
     * For any task, the Tasks_Section should display:
     * - Task title, description, assigned date, status, week number
     *
     * Validates: Requirements 9.1, 9.2, 9.3, 9.8
     */
    describe('Property 18: Tasks Data Display', () => {
        it('Feature: dashboard, Property 18: displays all task fields', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 52 }), // Week number
                    fc.constantFrom('active', 'completed', 'overdue'),
                    (weekNumber, status) => {
                        const task = createMockTask('task-1', weekNumber, status as TaskStatus)

                        mockUseDashboardStore.mockReturnValue({
                            tasks: [task],
                            updateTaskStatus: jest.fn(),
                        } as any)

                        const { unmount } = render(<TasksSection currentWeek={weekNumber} />)

                        try {
                            // Should display task title
                            expect(screen.getByText(task.title)).toBeInTheDocument()

                            // Should display task description
                            expect(screen.getByText(task.description)).toBeInTheDocument()

                            // Should display week indicator
                            expect(screen.getByText(`Неделя ${weekNumber}`)).toBeInTheDocument()

                            return true
                        } finally {
                            unmount()
                            cleanup()
                        }
                    }
                ),
                { numRuns: 20 }
            )
        })

        it('Feature: dashboard, Property 18: displays current and previous week tasks', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 2, max: 52 }), // Current week (min 2 to have previous week)
                    (currentWeek) => {
                        const currentWeekTask = createMockTask('task-current', currentWeek)
                        const previousWeekTask = createMockTask('task-previous', currentWeek - 1)

                        mockUseDashboardStore.mockReturnValue({
                            tasks: [currentWeekTask, previousWeekTask],
                            updateTaskStatus: jest.fn(),
                        } as any)

                        const { unmount } = render(<TasksSection currentWeek={currentWeek} />)

                        try {
                            // Should display both week indicators
                            expect(screen.getByText(`Неделя ${currentWeek}`)).toBeInTheDocument()
                            expect(screen.getByText(`Неделя ${currentWeek - 1}`)).toBeInTheDocument()

                            return true
                        } finally {
                            unmount()
                            cleanup()
                        }
                    }
                ),
                { numRuns: 20 }
            )
        })

        it('Feature: dashboard, Property 18: shows empty state when no tasks', () => {
            fc.assert(
                fc.property(
                    fc.constant([]),
                    () => {
                        mockUseDashboardStore.mockReturnValue({
                            tasks: [],
                            updateTaskStatus: jest.fn(),
                        } as any)

                        const { unmount } = render(<TasksSection />)

                        try {
                            // Should display empty state message
                            expect(screen.getByText(/нет активных задач/i)).toBeInTheDocument()

                            return true
                        } finally {
                            unmount()
                            cleanup()
                        }
                    }
                ),
                { numRuns: 10 }
            )
        })

        it('Feature: dashboard, Property 18: limits visible tasks to maxVisibleTasks', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 6, max: 10 }), // Number of tasks (> 5)
                    fc.integer({ min: 1, max: 52 }), // Current week
                    (taskCount, currentWeek) => {
                        // Create tasks for current week
                        const tasks = Array.from({ length: taskCount }, (_, i) =>
                            createMockTask(`task-${i}`, currentWeek)
                        )

                        mockUseDashboardStore.mockReturnValue({
                            tasks,
                            updateTaskStatus: jest.fn(),
                        } as any)

                        const { unmount } = render(<TasksSection maxVisibleTasks={5} currentWeek={currentWeek} />)

                        try {
                            // Should show "Еще" button with count
                            const expectedText = `Еще (${taskCount - 5})`
                            expect(screen.getByText(expectedText)).toBeInTheDocument()

                            return true
                        } finally {
                            unmount()
                            cleanup()
                        }
                    }
                ),
                { numRuns: 10 }
            )
        })
    })

    /**
     * Property 19: Task Status Update
     *
     * For any task marked as complete, the system should:
     * - Update the task status to 'completed'
     * - Set the completed_at timestamp
     * - Display a completion indicator
     *
     * Validates: Requirements 9.5
     */
    describe('Property 19: Task Status Update', () => {
        it('Feature: dashboard, Property 19: calls updateTaskStatus when task is marked complete', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 1, max: 52 }),
                    async (weekNumber) => {
                        const user = userEvent.setup()
                        const mockUpdateTaskStatus = jest.fn().mockResolvedValue(undefined)
                        const task = createMockTask('task-1', weekNumber, 'active')

                        mockUseDashboardStore.mockReturnValue({
                            tasks: [task],
                            updateTaskStatus: mockUpdateTaskStatus,
                        } as any)

                        const { unmount } = render(<TasksSection currentWeek={weekNumber} />)

                        try {
                            // Find and click the completion checkbox
                            const checkbox = screen.getByLabelText(/отметить как выполненную/i)
                            await user.click(checkbox)

                            // Should call updateTaskStatus with correct arguments
                            expect(mockUpdateTaskStatus).toHaveBeenCalledWith(task.id, 'completed')

                            return true
                        } finally {
                            unmount()
                            cleanup()
                        }
                    }
                ),
                { numRuns: 10 }
            )
        })

        it('Feature: dashboard, Property 19: displays completion indicator for completed tasks', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 52 }),
                    (weekNumber) => {
                        const task = createMockTask('task-1', weekNumber, 'completed')

                        mockUseDashboardStore.mockReturnValue({
                            tasks: [task],
                            updateTaskStatus: jest.fn(),
                        } as any)

                        const { unmount } = render(<TasksSection currentWeek={weekNumber} />)

                        try {
                            // Should display completion indicator
                            expect(screen.getByLabelText(/задача выполнена/i)).toBeInTheDocument()

                            // Task title should have line-through
                            const title = screen.getByText(task.title)
                            expect(title).toHaveClass('line-through')

                            return true
                        } finally {
                            unmount()
                            cleanup()
                        }
                    }
                ),
                { numRuns: 20 }
            )
        })

        it('Feature: dashboard, Property 19: disables checkbox for completed tasks', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 52 }),
                    (weekNumber) => {
                        const task = createMockTask('task-1', weekNumber, 'completed')

                        mockUseDashboardStore.mockReturnValue({
                            tasks: [task],
                            updateTaskStatus: jest.fn(),
                        } as any)

                        const { unmount } = render(<TasksSection currentWeek={weekNumber} />)

                        try {
                            // Checkbox should be disabled
                            const checkbox = screen.getByLabelText(/задача выполнена/i)
                            expect(checkbox).toBeDisabled()

                            return true
                        } finally {
                            unmount()
                            cleanup()
                        }
                    }
                ),
                { numRuns: 20 }
            )
        })

        it('Feature: dashboard, Property 19: displays overdue indicator for overdue tasks', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 52 }),
                    (weekNumber) => {
                        const task = createMockTask('task-1', weekNumber, 'overdue')

                        mockUseDashboardStore.mockReturnValue({
                            tasks: [task],
                            updateTaskStatus: jest.fn(),
                        } as any)

                        const { unmount } = render(<TasksSection currentWeek={weekNumber} />)

                        try {
                            // Should display overdue indicator
                            expect(screen.getByText(/просрочено/i)).toBeInTheDocument()

                            return true
                        } finally {
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
