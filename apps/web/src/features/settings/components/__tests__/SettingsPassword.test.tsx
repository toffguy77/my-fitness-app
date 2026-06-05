import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SettingsPassword } from '../SettingsPassword'

const mockChangePassword = jest.fn()

jest.mock('../SettingsPageLayout', () => ({
    SettingsPageLayout: ({ children }: { children: (props: Record<string, unknown>) => React.ReactNode }) => (
        <div data-testid="settings-layout">{children({ profile: null, isLoading: false })}</div>
    ),
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
    beforeEach(() => {
        jest.clearAllMocks()
        render(<SettingsPassword />)
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

    it('shows server error on wrong current password', async () => {
        mockChangePassword.mockRejectedValue(new Error('неверный текущий пароль'))

        fillForm(VALID_CURRENT, VALID_NEW, VALID_NEW)
        fireEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }))

        await waitFor(() => {
            expect(screen.getByText('неверный текущий пароль')).toBeInTheDocument()
        })
    })
})
