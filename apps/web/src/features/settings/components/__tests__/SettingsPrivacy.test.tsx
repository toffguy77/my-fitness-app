import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsPrivacy } from '../SettingsPrivacy'
import { accountApi } from '../../api/account'
import { ApiError } from '@/shared/errors/apiErrors'

jest.mock('../../api/account', () => ({
    accountApi: {
        getDeletionStatus: jest.fn(),
        listExports: jest.fn(),
        requestDeletion: jest.fn(),
        cancelDeletion: jest.fn(),
        requestExport: jest.fn(),
        downloadExportUrl: (id: string) => `/api/v1/users/me/export/${id}`,
    },
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}))

const api = accountApi as jest.Mocked<typeof accountApi>

function mockState(status: Parameters<typeof api.getDeletionStatus>[0] extends never ? never : unknown, exports: unknown[] = []) {
    ;(api.getDeletionStatus as jest.Mock).mockResolvedValue(status)
    ;(api.listExports as jest.Mock).mockResolvedValue({ exports })
}

describe('SettingsPrivacy', () => {
    beforeEach(() => jest.clearAllMocks())

    it('explains what deletion removes and what survives', async () => {
        mockState({ requested: false })

        render(<SettingsPrivacy />)

        await waitFor(() => expect(screen.getByText('Удалить аккаунт', { selector: 'h2' })).toBeInTheDocument())
        expect(screen.getByText(/фотографии прогресса/)).toBeInTheDocument()
        // The user must know the conversation stays with the curator.
        expect(screen.getByText(/Переписка с куратором сохранится/)).toBeInTheDocument()
        expect(screen.getByText(/30 дней/)).toBeInTheDocument()
    })

    // Deleting a year of data must not be one click away.
    it('requires both the password and a typed confirmation', async () => {
        mockState({ requested: false })
        render(<SettingsPrivacy />)
        await waitFor(() => expect(screen.getByRole('button', { name: 'Удалить аккаунт' })).toBeInTheDocument())

        await userEvent.click(screen.getByRole('button', { name: 'Удалить аккаунт' }))

        const submit = screen.getAllByRole('button', { name: 'Удалить аккаунт' }).at(-1)!
        expect(submit).toBeDisabled()

        await userEvent.type(screen.getByLabelText(/Текущий пароль/), 'secret')
        expect(submit).toBeDisabled()

        await userEvent.type(screen.getByLabelText(/УДАЛИТЬ/), 'УДАЛИТЬ')
        expect(submit).toBeEnabled()
    })

    it('reports a wrong password rather than a generic failure', async () => {
        mockState({ requested: false })
        ;(api.requestDeletion as jest.Mock).mockRejectedValue(new ApiError(401, {}))
        const toast = (await import('react-hot-toast')).default

        render(<SettingsPrivacy />)
        await waitFor(() => expect(screen.getByRole('button', { name: 'Удалить аккаунт' })).toBeInTheDocument())
        await userEvent.click(screen.getByRole('button', { name: 'Удалить аккаунт' }))
        await userEvent.type(screen.getByLabelText(/Текущий пароль/), 'wrong')
        await userEvent.type(screen.getByLabelText(/УДАЛИТЬ/), 'УДАЛИТЬ')
        await userEvent.click(screen.getAllByRole('button', { name: 'Удалить аккаунт' }).at(-1)!)

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Неверный пароль'))
    })

    // While the window is open the way back must be obvious.
    it('offers cancellation with the deadline while deletion is pending', async () => {
        mockState({
            requested: true,
            requested_at: '2026-03-01T00:00:00Z',
            scheduled_for: '2026-03-31T00:00:00Z',
        })

        render(<SettingsPrivacy />)

        await waitFor(() => expect(screen.getByRole('button', { name: 'Отменить удаление' })).toBeInTheDocument())
        expect(screen.getByText(/31 марта 2026/)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Удалить аккаунт' })).not.toBeInTheDocument()
    })

    it('cancels a pending deletion', async () => {
        mockState({ requested: true, scheduled_for: '2026-03-31T00:00:00Z' })
        ;(api.cancelDeletion as jest.Mock).mockResolvedValue({ cancelled: true })

        render(<SettingsPrivacy />)
        await waitFor(() => expect(screen.getByRole('button', { name: 'Отменить удаление' })).toBeInTheDocument())
        await userEvent.click(screen.getByRole('button', { name: 'Отменить удаление' }))

        await waitFor(() => expect(api.cancelDeletion).toHaveBeenCalled())
    })

    it('offers a download only for a ready, unclaimed archive', async () => {
        mockState({ requested: false }, [
            { id: 'a', status: 'ready', requested_at: '2026-03-01T10:00:00Z', downloaded: false },
            { id: 'b', status: 'ready', requested_at: '2026-02-01T10:00:00Z', downloaded: true },
            { id: 'c', status: 'building', requested_at: '2026-01-01T10:00:00Z', downloaded: false },
        ])

        render(<SettingsPrivacy />)

        await waitFor(() => expect(screen.getByText(/готова/)).toBeInTheDocument())
        expect(screen.getAllByRole('link', { name: 'Скачать' })).toHaveLength(1)
        expect(screen.getByText(/уже скачана/)).toBeInTheDocument()
        expect(screen.getByText(/готовится/)).toBeInTheDocument()
    })

    it('requests an export', async () => {
        mockState({ requested: false })
        ;(api.requestExport as jest.Mock).mockResolvedValue({ id: 'x', status: 'pending' })

        render(<SettingsPrivacy />)
        await waitFor(() => expect(screen.getByRole('button', { name: 'Запросить выгрузку' })).toBeInTheDocument())
        await userEvent.click(screen.getByRole('button', { name: 'Запросить выгрузку' }))

        await waitFor(() => expect(api.requestExport).toHaveBeenCalled())
    })
})
