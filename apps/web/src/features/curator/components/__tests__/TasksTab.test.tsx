import { render, screen, waitFor, fireEvent } from '@testing-library/react'

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn() }),
    usePathname: () => '/curator/clients/1',
    useSearchParams: () => new URLSearchParams(),
}))

const mockGetTasks = jest.fn()
const mockDeleteTask = jest.fn()

jest.mock('@/features/curator/api/curatorApi', () => ({
    curatorApi: {
        getTasks: (...args: unknown[]) => mockGetTasks(...args),
        deleteTask: (...args: unknown[]) => mockDeleteTask(...args),
        createTask: jest.fn(),
    },
}))

import { TasksTab } from '../TasksTab'
import type { TaskView } from '../../types'

const mockTask: TaskView = {
    id: 't1',
    title: 'Выпить 8 стаканов воды',
    type: 'habit',
    deadline: '2026-03-15',
    recurrence: 'daily',
    status: 'active',
    completions: ['2026-03-09', '2026-03-10'],
    created_at: '2026-03-01T00:00:00Z',
}

describe('TasksTab', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('shows loading state', () => {
        mockGetTasks.mockReturnValue(new Promise(() => {}))
        render(<TasksTab clientId={1} />)
        expect(document.querySelector('.animate-spin')).toBeInTheDocument()
    })

    it('renders tasks list', async () => {
        mockGetTasks.mockResolvedValue([mockTask])
        render(<TasksTab clientId={1} />)

        await waitFor(() => {
            expect(screen.getByText('Выпить 8 стаканов воды')).toBeInTheDocument()
        })
    })

    it('shows empty state when no tasks', async () => {
        mockGetTasks.mockResolvedValue([])
        render(<TasksTab clientId={1} />)

        await waitFor(() => {
            expect(screen.getByText('Нет задач')).toBeInTheDocument()
        })
    })

    it('switches filter and refetches', async () => {
        mockGetTasks.mockResolvedValue([])
        render(<TasksTab clientId={1} />)

        await waitFor(() => {
            expect(mockGetTasks).toHaveBeenCalledWith(1, 'active')
        })

        fireEvent.click(screen.getByText('Завершённые'))

        await waitFor(() => {
            expect(mockGetTasks).toHaveBeenCalledWith(1, 'completed')
        })
    })

    it('shows error state', async () => {
        mockGetTasks.mockRejectedValue(new Error('fail'))
        render(<TasksTab clientId={1} />)

        await waitFor(() => {
            expect(screen.getByText('Не удалось загрузить задачи')).toBeInTheDocument()
        })
    })
})
