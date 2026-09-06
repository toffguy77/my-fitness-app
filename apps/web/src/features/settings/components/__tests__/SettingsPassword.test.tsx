import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SettingsPassword } from '../SettingsPassword'
import { ApiError } from '@/shared/errors/apiErrors'

const mockChangePassword = jest.fn()
const mockLinked = jest.fn()
const mockRequestReset = jest.fn()

jest.mock('../SettingsPageLayout', () => ({
    SettingsPageLayout: ({ children }: { children: (props: Record<string, unknown>) => React.ReactNode }) => (
        <div data-testid="settings-layout">
            {children({ profile: { email: 'guest@example.com' }, isLoading: false })}
        </div>
    ),
}))

jest.mock('@/features/auth/api/providers', () => ({
    providersApi: { linked: () => mockLinked() },
}))

jest.mock('@/features/auth/api/passwordReset', () => ({
    requestPasswordReset: (...args: unknown[]) => mockRequestReset(...args),
}))

jest.mock('../../api/settings', () => ({
    changePassword: (...args: unknown[]) => mockChangePassword(...args),
}))

const VALID_CURRENT = 'OldPass1!'
const VALID_NEW = 'NewPass2@'

function fillForm(current: string, newPw: string, confirm: string) {
    const allInputs = document.querySelectorAll('input')
    fireEvent.change(allInputs[0], { target: { value: current } })
    fireEvent.change(allInputs[1], { target: { value: newPw } })
    fireEvent.change(allInputs[2], { target: { value: confirm } })
}

describe('SettingsPassword', () => {
    beforeEach(async () => {
        jest.clearAllMocks()
        mockLinked.mockResolvedValue({ linked: [], has_password: true })
        render(<SettingsPassword />)
        await screen.findByText('Текущий пароль')
    })

    it('renders the password change form', () => {
        expect(screen.getByText('Текущий пароль')).toBeInTheDocument()
        expect(screen.getByText('Новый пароль')).toBeInTheDocument()
        expect(screen.getByText('Подтвердите новый пароль')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Изменить пароль' })).toBeInTheDocument()
    })

    it('shows validation error when new passwords do not match', async () => {
        fillForm(VALID_CURRENT, VALID_NEW, 'Different1!')

        fireEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }))

        await waitFor(() => {
            expect(screen.getByText('Пароли не совпадают')).toBeInTheDocument()
        })
        expect(mockChangePassword).not.toHaveBeenCalled()
    })

    it('shows validation error for weak new password', async () => {
        fillForm(VALID_CURRENT, 'weak', 'weak')

        fireEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }))

        await waitFor(() => {
            // Should show at least one password policy error
            const alerts = document.querySelectorAll('[role="alert"]')
            expect(alerts.length).toBeGreaterThan(0)
        })
        expect(mockChangePassword).not.toHaveBeenCalled()
    })

    it('calls changePassword with correct arguments on valid submit', async () => {
        mockChangePassword.mockResolvedValue(undefined)

        fillForm(VALID_CURRENT, VALID_NEW, VALID_NEW)
        fireEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }))

        await waitFor(() => {
            expect(mockChangePassword).toHaveBeenCalledWith(VALID_CURRENT, VALID_NEW)
        })
    })

    it('shows success state and clears fields after successful change', async () => {
        mockChangePassword.mockResolvedValue(undefined)

        fillForm(VALID_CURRENT, VALID_NEW, VALID_NEW)
        fireEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }))

        await waitFor(() => {
            expect(screen.getByText('Пароль успешно изменён')).toBeInTheDocument()
        })
        expect(screen.queryByRole('button', { name: 'Изменить пароль' })).not.toBeInTheDocument()
    })

    // The server names the failure; this screen says it in words. A wrong
    // confirmation password is its own code — not a failed sign-in, and not an
    // expired session, which is what it used to be treated as.
    it('shows the server’s reason for refusing', async () => {
        mockChangePassword.mockRejectedValue(new ApiError(401, { code: 'password_incorrect' }))

        fillForm(VALID_CURRENT, VALID_NEW, VALID_NEW)
        fireEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }))

        await waitFor(() => {
            expect(screen.getByText('Неверный текущий пароль')).toBeInTheDocument()
        })
    })

    it('falls back to something readable for an unnamed failure', async () => {
        mockChangePassword.mockRejectedValue(new Error('boom'))

        fillForm(VALID_CURRENT, VALID_NEW, VALID_NEW)
        fireEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }))

        await waitFor(() => {
            expect(screen.getByText(/Что-то пошло не так/)).toBeInTheDocument()
        })
    })
})

// An account created through a provider has no password, so the change form
// cannot be filled in. Before this, the only route to one was guessing that
// "forgot password" applies to a password you never had.
describe('SettingsPassword without a password', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockLinked.mockResolvedValue({ linked: [{ provider: 'yandex' }], has_password: false })
    })

    it('offers to set one instead of asking for the current password', async () => {
        render(<SettingsPassword />)

        expect(await screen.findByRole('button', { name: 'Отправить ссылку' })).toBeInTheDocument()
        expect(screen.queryByText('Текущий пароль')).not.toBeInTheDocument()
    })

    it('sends the link to the account address', async () => {
        mockRequestReset.mockResolvedValue({})
        render(<SettingsPassword />)

        fireEvent.click(await screen.findByRole('button', { name: 'Отправить ссылку' }))

        await waitFor(() => expect(mockRequestReset).toHaveBeenCalledWith('guest@example.com'))
        expect(await screen.findByText(/Ссылка отправлена на guest@example.com/)).toBeInTheDocument()
    })

    it('shows the change form when the provider state cannot be read', async () => {
        mockLinked.mockRejectedValue(new Error('offline'))
        render(<SettingsPassword />)

        expect(await screen.findByText('Текущий пароль')).toBeInTheDocument()
    })
})
