import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsPrivacy } from '../SettingsPrivacy'
import { accountApi, type DataExport, type DeletionStatus } from '../../api/account'
import { ApiError } from '@/shared/errors/apiErrors'
import { useCurrentUser } from '@/shared/hooks/useCurrentUser'

jest.mock('../../api/account', () => ({
    accountApi: {
        getDeletionStatus: jest.fn(),
        listExports: jest.fn(),
        requestDeletion: jest.fn(),
        requestDeletionCode: jest.fn(),
        cancelDeletion: jest.fn(),
        requestExport: jest.fn(),
        downloadExportUrl: (id: string) => `/api/v1/users/me/export/${id}`,
    },
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}))

jest.mock('@/shared/hooks/useCurrentUser', () => ({
    useCurrentUser: jest.fn(),
}))

const api = accountApi as jest.Mocked<typeof accountApi>
const currentUser = useCurrentUser as jest.Mock

function mockState(status: DeletionStatus, exports: DataExport[] = []) {
    ;(api.getDeletionStatus as jest.Mock).mockResolvedValue(status)
    ;(api.listExports as jest.Mock).mockResolvedValue({ exports })
}

// hasPassword defaults to true: an account the hook has not answered for yet
// must not be told it has no password and drop the password field — that
// would ask nobody for anything on the one screen deleting their account.
function mockUser(hasPassword = true) {
    currentUser.mockReturnValue({
        user: { id: '1', email: 'user@example.test', role: 'client', has_password: hasPassword },
        state: 'ready',
    })
}

describe('SettingsPrivacy', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockUser(true)
    })

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
        expect(api.requestDeletion).toHaveBeenCalledWith('wrong', '')
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
        ] as DataExport[])

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

    describe('an account with no password', () => {
        beforeEach(() => mockUser(false))

        // The old bug, one step later: RequestDeletion no longer 500s for
        // these accounts, but the button stayed disabled by `!password` —
        // a field that can never be filled in because there is no password
        // to type. The account was still unreachable, just with a different
        // symptom.
        it('has no password field, and confirms with a mailed code instead', async () => {
            mockState({ requested: false })
            ;(api.requestDeletionCode as jest.Mock).mockResolvedValue({ sent: true })

            render(<SettingsPrivacy />)
            await waitFor(() => expect(screen.getByRole('button', { name: 'Удалить аккаунт' })).toBeInTheDocument())
            await userEvent.click(screen.getByRole('button', { name: 'Удалить аккаунт' }))

            expect(screen.queryByLabelText(/Текущий пароль/)).not.toBeInTheDocument()

            const submit = screen.getAllByRole('button', { name: 'Удалить аккаунт' }).at(-1)!
            expect(submit).toBeDisabled()

            await userEvent.click(screen.getByRole('button', { name: 'Прислать код' }))
            await waitFor(() => expect(api.requestDeletionCode).toHaveBeenCalled())

            const codeField = await screen.findByLabelText(/Код из письма/)
            await userEvent.type(codeField, '123456')
            expect(submit).toBeDisabled()

            await userEvent.type(screen.getByLabelText(/УДАЛИТЬ/), 'УДАЛИТЬ')
            expect(submit).toBeEnabled()

            await userEvent.click(submit)
            await waitFor(() => expect(api.requestDeletion).toHaveBeenCalledWith('', '123456'))
        })

        it('reports a wrong code rather than a generic failure', async () => {
            mockState({ requested: false })
            ;(api.requestDeletionCode as jest.Mock).mockResolvedValue({ sent: true })
            ;(api.requestDeletion as jest.Mock).mockRejectedValue(new ApiError(401, {}))
            const toast = (await import('react-hot-toast')).default

            render(<SettingsPrivacy />)
            await waitFor(() => expect(screen.getByRole('button', { name: 'Удалить аккаунт' })).toBeInTheDocument())
            await userEvent.click(screen.getByRole('button', { name: 'Удалить аккаунт' }))
            await userEvent.click(screen.getByRole('button', { name: 'Прислать код' }))
            const codeField = await screen.findByLabelText(/Код из письма/)
            await userEvent.type(codeField, '000000')
            await userEvent.type(screen.getByLabelText(/УДАЛИТЬ/), 'УДАЛИТЬ')
            await userEvent.click(screen.getAllByRole('button', { name: 'Удалить аккаунт' }).at(-1)!)

            await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Неверный код'))
        })
    })
})
