/**
 * Unit tests for ClientTasksSection component
 *
 * Tests:
 * - Renders tasks with correct icons and labels
 * - Handles task completion with optimistic update
 * - Renders nothing when empty
 * - Shows recurring task progress
 * - Highlights overdue tasks
 */

import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClientTasksSection } from '../ClientTasksSection'
import { dashboardApi } from '../../api/dashboardApi'
import type { ClientTaskView } from '../../types'

// Mock the dashboard API
jest.mock('../../api/dashboardApi')
const mockDashboardApi = dashboardApi as jest.Mocked<typeof dashboardApi>

/**
 * Helper: Create a mock client task
 */
function createMockTask(
    id: string,
    overrides?: Partial<ClientTaskView>
): ClientTaskView {
    const future = new Date()
    future.setDate(future.getDate() + 3)

    return {
        id,
        title: `Task ${id}`,
        type: 'nutrition',
        description: `Description for task ${id}`,
        deadline: future.toISOString(),
        recurrence: 'once',
        status: 'active',
        ...overrides,
    }
}

describe('ClientTasksSection', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    describe('Empty state', () => {
        it('renders nothing when API returns empty array', async () => {
            mockDashboardApi.getMyTasks.mockResolvedValue({ tasks: [], count: 0, week: 1 })

            const { container } = render(<ClientTasksSection />)

            await waitFor(() => {
                expect(mockDashboardApi.getMyTasks).toHaveBeenCalled()
            })

            // Should render nothing
            expect(container.querySelector('section')).toBeNull()
        })

        it('renders nothing when API fails', async () => {
            mockDashboardApi.getMyTasks.mockRejectedValue(new Error('Network error'))

            const { container } = render(<ClientTasksSection />)

            await waitFor(() => {
                expect(mockDashboardApi.getMyTasks).toHaveBeenCalled()
            })

            expect(container.querySelector('section')).toBeNull()
        })
    })

    describe('Rendering tasks', () => {
        it('renders tasks with heading', async () => {
            const tasks = [createMockTask('1'), createMockTask('2')]
            mockDashboardApi.getMyTasks.mockResolvedValue({ tasks, count: tasks.length, week: 1 })

            render(<ClientTasksSection />)

            await waitFor(() => {
                expect(
                    screen.getByRole('heading', { name: /задачи от куратора/i })
                ).toBeInTheDocument()
            })

            expect(screen.getByText('Task 1')).toBeInTheDocument()
            expect(screen.getByText('Task 2')).toBeInTheDocument()
        })

        it('renders task descriptions', async () => {
            const tasks = [createMockTask('1', { description: 'Test description' })]
            mockDashboardApi.getMyTasks.mockResolvedValue({ tasks, count: tasks.length, week: 1 })

            render(<ClientTasksSection />)

            await waitFor(() => {
                expect(screen.getByText('Test description')).toBeInTheDocument()
            })
        })

        it('highlights overdue tasks with red border', async () => {
            const pastDate = new Date()
            pastDate.setDate(pastDate.getDate() - 2)

            const tasks = [
                createMockTask('overdue', {
                    status: 'overdue',
                    deadline: pastDate.toISOString(),
                }),
            ]
            mockDashboardApi.getMyTasks.mockResolvedValue({ tasks, count: tasks.length, week: 1 })

            render(<ClientTasksSection />)

            await waitFor(() => {
                const taskItem = screen.getByRole('listitem')
                expect(taskItem.className).toContain('border-l-red-500')
            })
        })

        it('shows completed tasks with green styling', async () => {
            const tasks = [createMockTask('done', { status: 'completed' })]
            mockDashboardApi.getMyTasks.mockResolvedValue({ tasks, count: tasks.length, week: 1 })

            render(<ClientTasksSection />)

            await waitFor(() => {
                const taskItem = screen.getByRole('listitem')
                expect(taskItem.className).toContain('bg-green-50')
            })
        })

        it('shows recurring task as completed when today is in completions', async () => {
            const today = new Date().toISOString().slice(0, 10)
            const tasks = [
                createMockTask('recurring', {
                    recurrence: 'daily',
                    status: 'active',
                    completions: [today],
                }),
            ]
            mockDashboardApi.getMyTasks.mockResolvedValue({ tasks, count: tasks.length, week: 1 })

            render(<ClientTasksSection />)

            await waitFor(() => {
                const taskItem = screen.getByRole('listitem')
                expect(taskItem.className).toContain('bg-green-50')
            })

            // Checkbox should be disabled
            expect(
                screen.getByRole('button', { name: /задача выполнена/i })
            ).toBeDisabled()
        })

        it('shows mini calendar for recurring tasks', async () => {
            const tasks = [
                createMockTask('daily', {
                    recurrence: 'daily',
                    completions: ['2026-03-08', '2026-03-09', '2026-03-10'],
                }),
            ]
            mockDashboardApi.getMyTasks.mockResolvedValue({ tasks, count: tasks.length, week: 1 })

            render(<ClientTasksSection />)

            // MiniCalendar renders day labels (Пн, Вт, etc.)
            await waitFor(() => {
                expect(screen.getByText('Пн')).toBeInTheDocument()
            })

            expect(screen.getByText('Вт')).toBeInTheDocument()
            expect(screen.getByText('Ср')).toBeInTheDocument()
        })
    })

    describe('Task completion', () => {
        it('completes a task with optimistic update', async () => {
            const user = userEvent.setup()
            const tasks = [createMockTask('1')]
            mockDashboardApi.getMyTasks.mockResolvedValue({ tasks, count: tasks.length, week: 1 })
            mockDashboardApi.completeTask.mockResolvedValue(undefined)

            render(<ClientTasksSection />)

            await waitFor(() => {
                expect(screen.getByText('Task 1')).toBeInTheDocument()
            })

            const completeButton = screen.getByRole('button', {
                name: /отметить как выполненную/i,
            })
            await user.click(completeButton)

            // Should call API
            expect(mockDashboardApi.completeTask).toHaveBeenCalledWith('1')
        })

        it('re-fetches tasks on API failure', async () => {
            const user = userEvent.setup()
            const tasks = [createMockTask('1')]
            mockDashboardApi.getMyTasks.mockResolvedValue({ tasks, count: tasks.length, week: 1 })
            mockDashboardApi.completeTask.mockRejectedValue(
                new Error('Server error')
            )

            render(<ClientTasksSection />)

            await waitFor(() => {
                expect(screen.getByText('Task 1')).toBeInTheDocument()
            })

            const completeButton = screen.getByRole('button', {
                name: /отметить как выполненную/i,
            })
            await user.click(completeButton)

            // After failure, should re-fetch tasks to get authoritative state
            await waitFor(() => {
                // Initial load + re-fetch after error
                expect(mockDashboardApi.getMyTasks).toHaveBeenCalledTimes(2)
            })
        })
    })
})
