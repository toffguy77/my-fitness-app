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

// Mock the dashboard store
jest.mock('../../store/dashboardStore', () => ({
    useDashboardStore: (selector: any) => selector({ tasksVersion: 0 }),
}))

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
            mockDashboardApi.completeTask.mockResolvedValue({ task: tasks[0], metric_synced: false } as any)

            render(<ClientTasksSection />)

            await waitFor(() => {
                expect(screen.getByText('Task 1')).toBeInTheDocument()
            })

            const completeButton = screen.getByRole('button', {
                name: /отметить как выполненную/i,
            })
            await user.click(completeButton)

            // Should call API
            expect(mockDashboardApi.completeTask).toHaveBeenCalledWith('1', undefined)
        })

        it('opens workout dialog for workout tasks instead of completing', async () => {
            const user = userEvent.setup()
            const tasks = [createMockTask('w1', { type: 'workout', title: 'Morning workout' })]
            mockDashboardApi.getMyTasks.mockResolvedValue({ tasks, count: tasks.length, week: 1 })

            render(<ClientTasksSection />)

            await waitFor(() => {
                expect(screen.getByText('Morning workout')).toBeInTheDocument()
            })

            const completeButton = screen.getByRole('button', {
                name: /отметить как выполненную/i,
            })
            await user.click(completeButton)

            // Workout dialog should appear (workout type buttons visible)
            expect(screen.getByText('Силовая')).toBeInTheDocument()
            expect(screen.getByText('Кардио')).toBeInTheDocument()
            expect(screen.getByText('Йога')).toBeInTheDocument()
            expect(screen.getByText('HIIT')).toBeInTheDocument()

            // API should NOT have been called yet
            expect(mockDashboardApi.completeTask).not.toHaveBeenCalled()
        })

        it('sends workout data when completing workout task via dialog', async () => {
            const user = userEvent.setup()
            const tasks = [createMockTask('w2', { type: 'workout', title: 'Workout' })]
            mockDashboardApi.getMyTasks.mockResolvedValue({ tasks, count: tasks.length, week: 1 })
            mockDashboardApi.completeTask.mockResolvedValue({ task: tasks[0], metric_synced: true } as any)

            render(<ClientTasksSection />)

            await waitFor(() => {
                expect(screen.getByText('Workout')).toBeInTheDocument()
            })

            // Click checkbox to open dialog
            await user.click(screen.getByRole('button', { name: /отметить как выполненную/i }))

            // Select workout type
            await user.click(screen.getByText('HIIT'))

            // Enter duration
            const durationInput = screen.getByPlaceholderText('45')
            await user.type(durationInput, '30')

            // Click save
            await user.click(screen.getByRole('button', { name: /сохранить/i }))

            // Should call API with workout data
            await waitFor(() => {
                expect(mockDashboardApi.completeTask).toHaveBeenCalledWith('w2', {
                    workout_type: 'HIIT',
                    workout_duration: 30,
                })
            })
        })

        it('closes workout dialog on cancel without calling API', async () => {
            const user = userEvent.setup()
            const tasks = [createMockTask('w3', { type: 'workout', title: 'Gym' })]
            mockDashboardApi.getMyTasks.mockResolvedValue({ tasks, count: tasks.length, week: 1 })

            render(<ClientTasksSection />)

            await waitFor(() => {
                expect(screen.getByText('Gym')).toBeInTheDocument()
            })

            // Open dialog
            await user.click(screen.getByRole('button', { name: /отметить как выполненную/i }))
            expect(screen.getByText('Силовая')).toBeInTheDocument()

            // Cancel
            await user.click(screen.getByRole('button', { name: /отмена/i }))

            // Dialog should close, API should not be called
            expect(screen.queryByText('Тип тренировки')).not.toBeInTheDocument()
            expect(mockDashboardApi.completeTask).not.toHaveBeenCalled()
        })

        it('disables save button when no workout type selected', async () => {
            const user = userEvent.setup()
            const tasks = [createMockTask('w4', { type: 'workout', title: 'Run' })]
            mockDashboardApi.getMyTasks.mockResolvedValue({ tasks, count: tasks.length, week: 1 })

            render(<ClientTasksSection />)

            await waitFor(() => {
                expect(screen.getByText('Run')).toBeInTheDocument()
            })

            // Open dialog
            await user.click(screen.getByRole('button', { name: /отметить как выполненную/i }))

            // Save button should be disabled
            const saveButton = screen.getByRole('button', { name: /сохранить/i })
            expect(saveButton).toBeDisabled()
        })

        it('completes non-workout task immediately without dialog', async () => {
            const user = userEvent.setup()
            const tasks = [createMockTask('m1', { type: 'measurement', title: 'Measure weight' })]
            mockDashboardApi.getMyTasks.mockResolvedValue({ tasks, count: tasks.length, week: 1 })
            mockDashboardApi.completeTask.mockResolvedValue({ task: tasks[0], metric_synced: false } as any)

            render(<ClientTasksSection />)

            await waitFor(() => {
                expect(screen.getByText('Measure weight')).toBeInTheDocument()
            })

            await user.click(screen.getByRole('button', { name: /отметить как выполненную/i }))

            // Should call API immediately (no dialog)
            expect(mockDashboardApi.completeTask).toHaveBeenCalledWith('m1', undefined)
            // Workout dialog should NOT appear
            expect(screen.queryByText('Силовая')).not.toBeInTheDocument()
        })

        it('sends workout data without duration if not provided', async () => {
            const user = userEvent.setup()
            const tasks = [createMockTask('w5', { type: 'workout', title: 'Quick workout' })]
            mockDashboardApi.getMyTasks.mockResolvedValue({ tasks, count: tasks.length, week: 1 })
            mockDashboardApi.completeTask.mockResolvedValue({ task: tasks[0], metric_synced: true } as any)

            render(<ClientTasksSection />)

            await waitFor(() => {
                expect(screen.getByText('Quick workout')).toBeInTheDocument()
            })

            await user.click(screen.getByRole('button', { name: /отметить как выполненную/i }))
            await user.click(screen.getByText('Бег'))
            await user.click(screen.getByRole('button', { name: /сохранить/i }))

            await waitFor(() => {
                expect(mockDashboardApi.completeTask).toHaveBeenCalledWith('w5', {
                    workout_type: 'Бег',
                    workout_duration: undefined,
                })
            })
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
