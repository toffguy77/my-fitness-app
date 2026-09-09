import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { JobList } from '../JobList'
import { adminApi } from '../../api/adminApi'

jest.mock('../../api/adminApi', () => ({
    adminApi: {
        getJobs: jest.fn(),
        runJob: jest.fn(),
    },
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: { success: jest.fn(), error: jest.fn() },
}))

const mockedApi = adminApi as jest.Mocked<typeof adminApi>

const jobs = [
    {
        name: 'curator.daily-snapshot',
        schedule: 'daily at 04:00',
        last_run: {
            started_at: '2026-09-09T04:00:00Z',
            finished_at: '2026-09-09T04:00:12Z',
            status: 'succeeded',
            items_processed: 17,
        },
    },
    {
        name: 'account.purge-orphaned-files',
        schedule: 'manual only',
        last_run: null,
    },
    {
        name: 'leads.send-reminders',
        schedule: 'daily at 10:00',
        last_run: {
            started_at: '2026-09-09T10:00:00Z',
            finished_at: '2026-09-09T10:00:03Z',
            status: 'failed',
            error: 'smtp: connection refused',
            items_processed: 0,
        },
    },
]

beforeEach(() => {
    jest.clearAllMocks()
    mockedApi.getJobs.mockResolvedValue({ jobs })
})

describe('JobList', () => {
    it('показывает каждую задачу и её расписание', async () => {
        render(<JobList />)

        await waitFor(() => {
            expect(screen.getByText('curator.daily-snapshot')).toBeInTheDocument()
        })
        expect(screen.getByText('account.purge-orphaned-files')).toBeInTheDocument()
        expect(screen.getByText('manual only')).toBeInTheDocument()
    })

    // Задача, ни разу не запускавшаяся, и задача, отработавшая успешно, — это
    // разные состояния. Показывать их одинаково значит скрывать, что задача не
    // вызывается вовсе: именно так сборщик снимков молчал сколько угодно долго.
    it('отличает «ни разу не запускалась» от успешного запуска', async () => {
        render(<JobList />)

        await waitFor(() => {
            expect(screen.getByText(/Ни разу не запускалась/)).toBeInTheDocument()
        })
        expect(screen.getByText(/обработано: 17/)).toBeInTheDocument()
    })

    // Ошибка должна читаться как ошибка. Задача, чей текст ошибки спрятан во
    // всплывающей подсказке, — это задача, о поломке которой никто не знает.
    it('показывает текст ошибки прямо в списке', async () => {
        render(<JobList />)

        await waitFor(() => {
            expect(screen.getByText('smtp: connection refused')).toBeInTheDocument()
        })
        expect(screen.getByText('Ошибка')).toBeInTheDocument()
    })

    it('запускает задачу по нажатию', async () => {
        mockedApi.runJob.mockResolvedValue({ job: 'account.purge-orphaned-files', started: true })
        render(<JobList />)

        await waitFor(() => {
            expect(screen.getByText('account.purge-orphaned-files')).toBeInTheDocument()
        })

        const buttons = screen.getAllByRole('button', { name: 'Запустить' })
        await userEvent.click(buttons[1])

        await waitFor(() => {
            expect(mockedApi.runJob).toHaveBeenCalledWith('account.purge-orphaned-files')
        })
    })

    it('не молчит, когда запуск не удался', async () => {
        const toast = jest.requireMock('react-hot-toast').default
        mockedApi.runJob.mockRejectedValue(new Error('нет'))
        render(<JobList />)

        await waitFor(() => {
            expect(screen.getByText('curator.daily-snapshot')).toBeInTheDocument()
        })

        await userEvent.click(screen.getAllByRole('button', { name: 'Запустить' })[0])

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalled()
        })
    })
})
