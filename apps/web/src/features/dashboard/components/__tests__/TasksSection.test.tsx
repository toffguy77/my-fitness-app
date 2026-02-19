/**
 * Unit tests for TasksSection component
 *
 * Tests specific examples and edge cases for tasks display
 */

import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
    status: TaskStatus = 'active',
    overrides?: Partial<Task>
): Task {
    const now = new Date()
    const dueDate = new Date(now)
    dueDate.setDate(now.getDate() + 7)

    return {
        id,
        userId: 'user-123',
        curatorId: 'coach-123',
        title: `Task ${id}`,
        description: `Description for task ${id}`,
        weekNumber,
        assignedAt: new Date(),
        dueDate,
        status,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    }
}

describe('TasksSection', () => {
    const mockUpdateTaskStatus = jest.fn()

    beforeEach(() => {
        jest.clearAllMocks()
        mockUseDashboardStore.mockReturnValue({
            tasks: [],
            updateTaskStatus: mockUpdateTaskStatus,
        } as any)
    })

    afterEach(() => {
        cleanup()
    })

    describe('Rendering', () => {
        it('renders section with heading', () => {
            render(<TasksSection />)
            expect(screen.getByRole('heading', { name: /задачи/i })).toBeInTheDocument()
        })

        it('renders empty state when no tasks', () => {
            render(<TasksSection />)
            expect(screen.getByText(/нет активных задач/i)).toBeInTheDocument()
            expect(screen.getByText(/твой тренер назначит задачи/i)).toBeInTheDocument()
        })

        it('renders tasks for current week', () => {
            const task = createMockTask('task-1', 5)
            mockUseDashboardStore.mockReturnValue({
                tasks: [task],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            expect(screen.getByText('Task task-1')).toBeInTheDocument()
            expect(screen.getByText('Description for task task-1')).toBeInTheDocument()
            expect(screen.getByText('Неделя 5')).toBeInTheDocument()
        })

        it('renders tasks for previous week', () => {
            const task = createMockTask('task-1', 4)
            mockUseDashboardStore.mockReturnValue({
                tasks: [task],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            expect(screen.getByText('Task task-1')).toBeInTheDocument()
            expect(screen.getByText('Неделя 4')).toBeInTheDocument()
        })

        it('renders both current and previous week tasks', () => {
            const currentTask = createMockTask('task-current', 5)
            const previousTask = createMockTask('task-previous', 4)
            mockUseDashboardStore.mockReturnValue({
                tasks: [currentTask, previousTask],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            expect(screen.getByText('Task task-current')).toBeInTheDocument()
            expect(screen.getByText('Task task-previous')).toBeInTheDocument()
            expect(screen.getByText('Неделя 5')).toBeInTheDocument()
            expect(screen.getByText('Неделя 4')).toBeInTheDocument()
        })

        it('renders task without description', () => {
            const task = createMockTask('task-1', 5, 'active', { description: undefined })
            mockUseDashboardStore.mockReturnValue({
                tasks: [task],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            expect(screen.getByText('Task task-1')).toBeInTheDocument()
            expect(screen.queryByText(/description/i)).not.toBeInTheDocument()
        })

        it('applies custom className', () => {
            const { container } = render(<TasksSection className="custom-class" />)
            const section = container.querySelector('.tasks-section')
            expect(section).toHaveClass('custom-class')
        })
    })

    describe('Task Status Display', () => {
        it('displays active task with default styling', () => {
            const task = createMockTask('task-1', 5, 'active')
            mockUseDashboardStore.mockReturnValue({
                tasks: [task],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            const title = screen.getByText('Task task-1')
            expect(title).not.toHaveClass('line-through')
        })

        it('displays completed task with line-through', () => {
            const task = createMockTask('task-1', 5, 'completed')
            mockUseDashboardStore.mockReturnValue({
                tasks: [task],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            const title = screen.getByText('Task task-1')
            expect(title).toHaveClass('line-through')
        })

        it('displays overdue indicator for overdue tasks', () => {
            const task = createMockTask('task-1', 5, 'overdue')
            mockUseDashboardStore.mockReturnValue({
                tasks: [task],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            expect(screen.getByText(/просрочено/i)).toBeInTheDocument()
        })

        it('displays due date for all tasks', () => {
            const dueDate = new Date('2024-02-15')
            const task = createMockTask('task-1', 5, 'active', { dueDate })
            mockUseDashboardStore.mockReturnValue({
                tasks: [task],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            expect(screen.getByText(/до/i)).toBeInTheDocument()
        })
    })

    describe('Task Completion', () => {
        it('calls updateTaskStatus when marking task as complete', async () => {
            const user = userEvent.setup()
            const task = createMockTask('task-1', 5, 'active')
            mockUpdateTaskStatus.mockResolvedValue(undefined)
            mockUseDashboardStore.mockReturnValue({
                tasks: [task],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            const checkbox = screen.getByLabelText(/отметить задачу как выполненную/i)
            await user.click(checkbox)

            expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-1', 'completed')
        })

        it('handles updateTaskStatus error gracefully', async () => {
            const user = userEvent.setup()
            const task = createMockTask('task-1', 5, 'active')
            mockUpdateTaskStatus.mockRejectedValue(new Error('Network error'))
            mockUseDashboardStore.mockReturnValue({
                tasks: [task],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            const checkbox = screen.getByLabelText(/отметить задачу как выполненную/i)
            await user.click(checkbox)

            // Should not throw error (error handled by store)
            expect(mockUpdateTaskStatus).toHaveBeenCalled()
        })

        it('disables checkbox for completed tasks', () => {
            const task = createMockTask('task-1', 5, 'completed')
            mockUseDashboardStore.mockReturnValue({
                tasks: [task],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            const checkbox = screen.getByLabelText(/задача выполнена/i)
            expect(checkbox).toBeDisabled()
        })

        it('does not disable checkbox for active tasks', () => {
            const task = createMockTask('task-1', 5, 'active')
            mockUseDashboardStore.mockReturnValue({
                tasks: [task],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            const checkbox = screen.getByLabelText(/отметить задачу как выполненную/i)
            expect(checkbox).not.toBeDisabled()
        })
    })

    describe('View Details', () => {
        it('renders view details button for all tasks', () => {
            const task = createMockTask('task-1', 5)
            mockUseDashboardStore.mockReturnValue({
                tasks: [task],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            expect(screen.getByLabelText(/подробнее о задаче/i)).toBeInTheDocument()
        })
    })

    describe('Show More Functionality', () => {
        it('shows "Еще" button when tasks exceed maxVisibleTasks', () => {
            const tasks = Array.from({ length: 7 }, (_, i) =>
                createMockTask(`task-${i}`, 5)
            )
            mockUseDashboardStore.mockReturnValue({
                tasks,
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection maxVisibleTasks={5} currentWeek={5} />)

            expect(screen.getByText('Еще (2)')).toBeInTheDocument()
        })

        it('does not show "Еще" button when tasks do not exceed maxVisibleTasks', () => {
            const tasks = Array.from({ length: 3 }, (_, i) =>
                createMockTask(`task-${i}`, 5)
            )
            mockUseDashboardStore.mockReturnValue({
                tasks,
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection maxVisibleTasks={5} currentWeek={5} />)

            expect(screen.queryByText(/еще/i)).not.toBeInTheDocument()
        })

        it('shows all tasks when "Еще" button is clicked', async () => {
            const user = userEvent.setup()
            const tasks = Array.from({ length: 7 }, (_, i) =>
                createMockTask(`task-${i}`, 5)
            )
            mockUseDashboardStore.mockReturnValue({
                tasks,
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection maxVisibleTasks={5} currentWeek={5} />)

            // Initially shows 5 tasks
            expect(screen.getByText('Task task-0')).toBeInTheDocument()
            expect(screen.getByText('Task task-4')).toBeInTheDocument()

            // Click "Еще" button
            const showMoreButton = screen.getByText('Еще (2)')
            await user.click(showMoreButton)

            // Now shows all 7 tasks
            expect(screen.getByText('Task task-5')).toBeInTheDocument()
            expect(screen.getByText('Task task-6')).toBeInTheDocument()

            // "Еще" button should be hidden
            expect(screen.queryByText(/еще/i)).not.toBeInTheDocument()
        })

        it('limits tasks correctly when split between current and previous week', () => {
            const currentWeekTasks = Array.from({ length: 3 }, (_, i) =>
                createMockTask(`current-${i}`, 5)
            )
            const previousWeekTasks = Array.from({ length: 4 }, (_, i) =>
                createMockTask(`previous-${i}`, 4)
            )
            mockUseDashboardStore.mockReturnValue({
                tasks: [...currentWeekTasks, ...previousWeekTasks],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection maxVisibleTasks={5} currentWeek={5} />)

            // Should show "Еще" button for remaining tasks
            expect(screen.getByText('Еще (2)')).toBeInTheDocument()
        })
    })

    describe('Week Grouping', () => {
        it('groups tasks by week correctly', () => {
            const week5Tasks = [
                createMockTask('task-1', 5),
                createMockTask('task-2', 5),
            ]
            const week4Tasks = [
                createMockTask('task-3', 4),
            ]
            mockUseDashboardStore.mockReturnValue({
                tasks: [...week5Tasks, ...week4Tasks],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            // Should display both week headers
            expect(screen.getByText('Неделя 5')).toBeInTheDocument()
            expect(screen.getByText('Неделя 4')).toBeInTheDocument()

            // Should display all tasks
            expect(screen.getByText('Task task-1')).toBeInTheDocument()
            expect(screen.getByText('Task task-2')).toBeInTheDocument()
            expect(screen.getByText('Task task-3')).toBeInTheDocument()
        })

        it('ignores tasks from other weeks', () => {
            const currentWeekTask = createMockTask('task-current', 5)
            const futureWeekTask = createMockTask('task-future', 6)
            const oldWeekTask = createMockTask('task-old', 3)
            mockUseDashboardStore.mockReturnValue({
                tasks: [currentWeekTask, futureWeekTask, oldWeekTask],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            // Should only show current week task
            expect(screen.getByText('Task task-current')).toBeInTheDocument()
            expect(screen.queryByText('Task task-future')).not.toBeInTheDocument()
            expect(screen.queryByText('Task task-old')).not.toBeInTheDocument()
        })
    })

    describe('Accessibility', () => {
        it('has proper ARIA labels for checkboxes', () => {
            const activeTask = createMockTask('task-1', 5, 'active')
            const completedTask = createMockTask('task-2', 5, 'completed')
            mockUseDashboardStore.mockReturnValue({
                tasks: [activeTask, completedTask],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            expect(screen.getByLabelText(/отметить задачу как выполненную/i)).toBeInTheDocument()
            expect(screen.getByLabelText(/задача выполнена/i)).toBeInTheDocument()
        })

        it('has proper ARIA label for view details button', () => {
            const task = createMockTask('task-1', 5)
            mockUseDashboardStore.mockReturnValue({
                tasks: [task],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            expect(screen.getByLabelText(/подробнее о задаче/i)).toBeInTheDocument()
        })

        it('has proper heading structure', () => {
            const task = createMockTask('task-1', 5)
            mockUseDashboardStore.mockReturnValue({
                tasks: [task],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            // Main heading
            expect(screen.getByRole('heading', { level: 2, name: /задачи/i })).toBeInTheDocument()

            // Week heading
            expect(screen.getByRole('heading', { level: 3, name: /неделя 5/i })).toBeInTheDocument()
        })

        it('uses semantic HTML for section', () => {
            const { container } = render(<TasksSection />)
            const section = container.querySelector('section')
            expect(section).toBeInTheDocument()
            expect(section).toHaveAttribute('aria-labelledby', 'tasks-heading')
        })
    })

    describe('Edge Cases', () => {
        it('handles empty task list for current week', () => {
            const previousWeekTask = createMockTask('task-1', 4)
            mockUseDashboardStore.mockReturnValue({
                tasks: [previousWeekTask],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            // Should only show previous week
            expect(screen.queryByText('Неделя 5')).not.toBeInTheDocument()
            expect(screen.getByText('Неделя 4')).toBeInTheDocument()
        })

        it('handles empty task list for previous week', () => {
            const currentWeekTask = createMockTask('task-1', 5)
            mockUseDashboardStore.mockReturnValue({
                tasks: [currentWeekTask],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            // Should only show current week
            expect(screen.getByText('Неделя 5')).toBeInTheDocument()
            expect(screen.queryByText('Неделя 4')).not.toBeInTheDocument()
        })

        it('handles maxVisibleTasks of 0', () => {
            const tasks = Array.from({ length: 3 }, (_, i) =>
                createMockTask(`task-${i}`, 5)
            )
            mockUseDashboardStore.mockReturnValue({
                tasks,
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection maxVisibleTasks={0} currentWeek={5} />)

            // Should show "Еще" button with all tasks
            expect(screen.getByText('Еще (3)')).toBeInTheDocument()
        })

        it('handles very long task titles', () => {
            const longTitle = 'A'.repeat(200)
            const task = createMockTask('task-1', 5, 'active', { title: longTitle })
            mockUseDashboardStore.mockReturnValue({
                tasks: [task],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            expect(screen.getByText(longTitle)).toBeInTheDocument()
        })

        it('handles very long task descriptions', () => {
            const longDescription = 'B'.repeat(500)
            const task = createMockTask('task-1', 5, 'active', { description: longDescription })
            mockUseDashboardStore.mockReturnValue({
                tasks: [task],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            expect(screen.getByText(longDescription)).toBeInTheDocument()
        })
    })

    describe('Attention Indicators (Requirement 15.6)', () => {
        it('shows attention badge when tasks due within 2 days', () => {
            const now = new Date()
            const tomorrow = new Date(now)
            tomorrow.setDate(now.getDate() + 1)

            const urgentTask = createMockTask('task-1', 5, 'active', { dueDate: tomorrow })
            mockUseDashboardStore.mockReturnValue({
                tasks: [urgentTask],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            // Should show attention badge with count
            expect(screen.getByRole('status')).toBeInTheDocument()
            expect(screen.getByText('1')).toBeInTheDocument()
        })

        it('shows correct count for multiple urgent tasks', () => {
            const now = new Date()
            const tomorrow = new Date(now)
            tomorrow.setDate(now.getDate() + 1)
            const dayAfter = new Date(now)
            dayAfter.setDate(now.getDate() + 2)

            const urgentTask1 = createMockTask('task-1', 5, 'active', { dueDate: tomorrow })
            const urgentTask2 = createMockTask('task-2', 5, 'active', { dueDate: dayAfter })
            mockUseDashboardStore.mockReturnValue({
                tasks: [urgentTask1, urgentTask2],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            expect(screen.getByText('2')).toBeInTheDocument()
        })

        it('does not show attention badge when no urgent tasks', () => {
            const now = new Date()
            const futureDate = new Date(now)
            futureDate.setDate(now.getDate() + 7)

            const task = createMockTask('task-1', 5, 'active', { dueDate: futureDate })
            mockUseDashboardStore.mockReturnValue({
                tasks: [task],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            expect(screen.queryByRole('status')).not.toBeInTheDocument()
        })

        it('does not show attention badge for completed tasks', () => {
            const now = new Date()
            const tomorrow = new Date(now)
            tomorrow.setDate(now.getDate() + 1)

            const completedTask = createMockTask('task-1', 5, 'completed', { dueDate: tomorrow })
            mockUseDashboardStore.mockReturnValue({
                tasks: [completedTask],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            expect(screen.queryByRole('status')).not.toBeInTheDocument()
        })

        it('has proper ARIA label for attention badge', () => {
            const now = new Date()
            const tomorrow = new Date(now)
            tomorrow.setDate(now.getDate() + 1)

            const urgentTask = createMockTask('task-1', 5, 'active', { dueDate: tomorrow })
            mockUseDashboardStore.mockReturnValue({
                tasks: [urgentTask],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            const badge = screen.getByRole('status')
            expect(badge).toHaveAttribute('aria-label', expect.stringContaining('требует внимания'))
        })

        it('shows high urgency level for attention badge', () => {
            const now = new Date()
            const tomorrow = new Date(now)
            tomorrow.setDate(now.getDate() + 1)

            const urgentTask = createMockTask('task-1', 5, 'active', { dueDate: tomorrow })
            mockUseDashboardStore.mockReturnValue({
                tasks: [urgentTask],
                updateTaskStatus: mockUpdateTaskStatus,
            } as any)

            render(<TasksSection currentWeek={5} />)

            const badge = screen.getByRole('status')
            expect(badge).toHaveAttribute('data-urgency', 'high')
        })
    })
})
