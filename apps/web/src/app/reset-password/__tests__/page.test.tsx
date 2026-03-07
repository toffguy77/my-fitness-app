import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ResetPasswordPage from '../page'
import toast from 'react-hot-toast'

// --- Mocks ---

const mockPush = jest.fn()
let mockSearchParams = new URLSearchParams()

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
    useSearchParams: () => mockSearchParams,
}))

jest.mock('@/shared/components/ui', () => ({
    Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
        <div data-testid="card" className={className}>{children}</div>
    ),
    Logo: () => <div data-testid="logo">Logo</div>,
}))

jest.mock('@/shared/components/ui/Button', () => ({
    Button: ({ children, isLoading, ...props }: any) => (
        <button {...props}>{children}</button>
    ),
}))

jest.mock('@/shared/components/forms/PasswordInput', () => ({
    PasswordInput: ({ id, value, onChange, error, disabled, ...rest }: any) => (
        <div>
            <input id={id} value={value} onChange={onChange} data-testid={`password-${id}`} disabled={disabled} />
            {error && <span role="alert">{error}</span>}
        </div>
    ),
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }),
}))

describe('ResetPasswordPage', () => {
    const user = userEvent.setup()

    beforeEach(() => {
        jest.clearAllMocks()
        jest.useFakeTimers({ advanceTimers: true })
        global.fetch = jest.fn()
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    // Branch: no token in URL (line 26-29)
    it('shows invalid link error when no token provided', async () => {
        mockSearchParams = new URLSearchParams()
        render(<ResetPasswordPage />)

        await waitFor(() => {
            expect(screen.getByText('Неверная ссылка')).toBeInTheDocument()
            expect(screen.getByText('Неверная ссылка для сброса. Токен не указан.')).toBeInTheDocument()
        })
    })

    // Branch: isValidating true -> loading state (line 118-129)
    it('shows loading spinner while validating token', () => {
        mockSearchParams = new URLSearchParams('token=valid-token')
        ;(global.fetch as jest.Mock).mockImplementation(
            () => new Promise(() => {}) // never resolves
        )
        render(<ResetPasswordPage />)
        expect(screen.getByText('Проверка ссылки...')).toBeInTheDocument()
    })

    // Branch: token validation fails - response not ok (line 46-48)
    it('shows invalid link when token validation returns error', async () => {
        mockSearchParams = new URLSearchParams('token=bad-token')
        ;(global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            json: () => Promise.resolve({ error: 'Token expired' }),
        })

        render(<ResetPasswordPage />)

        await waitFor(() => {
            expect(screen.getByText('Неверная ссылка')).toBeInTheDocument()
            expect(screen.getByText('Token expired')).toBeInTheDocument()
        })
    })

    // Branch: token validation fails - no error message (line 47 fallback)
    it('shows default error when token validation returns no error message', async () => {
        mockSearchParams = new URLSearchParams('token=bad-token')
        ;(global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            json: () => Promise.resolve({}),
        })

        render(<ResetPasswordPage />)

        await waitFor(() => {
            expect(screen.getByText('Неверная ссылка')).toBeInTheDocument()
            expect(screen.getByText('Неверная или истекшая ссылка')).toBeInTheDocument()
        })
    })

    // Branch: token validation throws non-Error (line 52)
    it('shows default error when token validation throws non-Error', async () => {
        mockSearchParams = new URLSearchParams('token=bad-token')
        ;(global.fetch as jest.Mock).mockRejectedValue('not-an-error')

        render(<ResetPasswordPage />)

        await waitFor(() => {
            expect(screen.getAllByText('Неверная ссылка').length).toBeGreaterThanOrEqual(1)
        })
    })

    // Branch: token is valid -> shows reset form (line 50)
    it('shows reset password form when token is valid', async () => {
        mockSearchParams = new URLSearchParams('token=valid-token')
        ;(global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ valid: true }),
        })

        render(<ResetPasswordPage />)

        await waitFor(() => {
            expect(screen.getByText('Сброс пароля')).toBeInTheDocument()
            expect(screen.getByText('Введите новый пароль.')).toBeInTheDocument()
        })
    })

    // Branch: submit with empty password (line 65-68)
    it('shows error when password is empty on submit', async () => {
        mockSearchParams = new URLSearchParams('token=valid-token')
        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ valid: true }),
        })

        render(<ResetPasswordPage />)

        await waitFor(() => {
            expect(screen.getByText('Сброс пароля')).toBeInTheDocument()
        })

        // Use fireEvent.submit to bypass HTML required validation
        const form = screen.getByText('Сбросить пароль').closest('form')!
        fireEvent.submit(form)

        await waitFor(() => {
            expect(screen.getByText('Введите пароль')).toBeInTheDocument()
        })
    })

    // Branch: submit with short password (line 70-73)
    it('shows error when password is too short', async () => {
        mockSearchParams = new URLSearchParams('token=valid-token')
        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ valid: true }),
        })

        render(<ResetPasswordPage />)

        await waitFor(() => {
            expect(screen.getByText('Сброс пароля')).toBeInTheDocument()
        })

        await user.type(screen.getByTestId('password-password'), 'short')
        // Use fireEvent.submit to bypass HTML required validation
        const form = screen.getByText('Сбросить пароль').closest('form')!
        fireEvent.submit(form)

        await waitFor(() => {
            expect(screen.getByText('Пароль должен содержать минимум 8 символов')).toBeInTheDocument()
        })
    })

    // Branch: passwords don't match (line 75-78)
    it('shows error when passwords do not match', async () => {
        mockSearchParams = new URLSearchParams('token=valid-token')
        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ valid: true }),
        })

        render(<ResetPasswordPage />)

        await waitFor(() => {
            expect(screen.getByText('Сброс пароля')).toBeInTheDocument()
        })

        await user.type(screen.getByTestId('password-password'), 'password123')
        await user.type(screen.getByTestId('password-confirmPassword'), 'password456')
        await user.click(screen.getByText('Сбросить пароль'))

        await waitFor(() => {
            expect(screen.getByText('Пароли не совпадают')).toBeInTheDocument()
        })
    })

    // Branch: successful password reset (line 101-107)
    it('shows success state after successful password reset', async () => {
        mockSearchParams = new URLSearchParams('token=valid-token')
        ;(global.fetch as jest.Mock)
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ valid: true }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ message: 'Password reset' }),
            })

        render(<ResetPasswordPage />)

        await waitFor(() => {
            expect(screen.getByText('Сброс пароля')).toBeInTheDocument()
        })

        await user.type(screen.getByTestId('password-password'), 'newpassword123')
        await user.type(screen.getByTestId('password-confirmPassword'), 'newpassword123')
        await user.click(screen.getByText('Сбросить пароль'))

        await waitFor(() => {
            expect(screen.getByText('Пароль успешно изменен!')).toBeInTheDocument()
            expect(toast.success).toHaveBeenCalledWith('Пароль успешно изменен!')
        })

        // Branch: auto-redirect after timeout (line 105-107)
        jest.advanceTimersByTime(2000)
        expect(mockPush).toHaveBeenCalledWith('/auth')
    })

    // Branch: reset API returns error (line 97-99)
    it('shows error when reset API fails', async () => {
        mockSearchParams = new URLSearchParams('token=valid-token')
        ;(global.fetch as jest.Mock)
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ valid: true }),
            })
            .mockResolvedValueOnce({
                ok: false,
                json: () => Promise.resolve({ error: 'Token used already' }),
            })

        render(<ResetPasswordPage />)

        await waitFor(() => {
            expect(screen.getByText('Сброс пароля')).toBeInTheDocument()
        })

        await user.type(screen.getByTestId('password-password'), 'newpassword123')
        await user.type(screen.getByTestId('password-confirmPassword'), 'newpassword123')
        await user.click(screen.getByText('Сбросить пароль'))

        await waitFor(() => {
            expect(screen.getByText('Token used already')).toBeInTheDocument()
            expect(toast.error).toHaveBeenCalledWith('Token used already')
        })
    })

    // Branch: reset API error without message (line 98 fallback)
    it('shows default error when reset API returns no error field', async () => {
        mockSearchParams = new URLSearchParams('token=valid-token')
        ;(global.fetch as jest.Mock)
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ valid: true }),
            })
            .mockResolvedValueOnce({
                ok: false,
                json: () => Promise.resolve({}),
            })

        render(<ResetPasswordPage />)

        await waitFor(() => {
            expect(screen.getByText('Сброс пароля')).toBeInTheDocument()
        })

        await user.type(screen.getByTestId('password-password'), 'newpassword123')
        await user.type(screen.getByTestId('password-confirmPassword'), 'newpassword123')
        await user.click(screen.getByText('Сбросить пароль'))

        await waitFor(() => {
            expect(screen.getByText('Не удалось сбросить пароль')).toBeInTheDocument()
        })
    })

    // Branch: reset throws non-Error (line 109)
    it('shows generic error when reset throws non-Error', async () => {
        mockSearchParams = new URLSearchParams('token=valid-token')
        ;(global.fetch as jest.Mock)
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ valid: true }),
            })
            .mockRejectedValueOnce('network failure')

        render(<ResetPasswordPage />)

        await waitFor(() => {
            expect(screen.getByText('Сброс пароля')).toBeInTheDocument()
        })

        await user.type(screen.getByTestId('password-password'), 'newpassword123')
        await user.type(screen.getByTestId('password-confirmPassword'), 'newpassword123')
        await user.click(screen.getByText('Сбросить пароль'))

        await waitFor(() => {
            expect(screen.getByText('Произошла ошибка')).toBeInTheDocument()
        })
    })

    // Branch: isLoading text (line 267)
    it('shows loading text during password reset', async () => {
        mockSearchParams = new URLSearchParams('token=valid-token')
        let resolveReset: (v: any) => void
        ;(global.fetch as jest.Mock)
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ valid: true }),
            })
            .mockImplementationOnce(
                () => new Promise((resolve) => { resolveReset = resolve })
            )

        render(<ResetPasswordPage />)

        await waitFor(() => {
            expect(screen.getByText('Сброс пароля')).toBeInTheDocument()
        })

        await user.type(screen.getByTestId('password-password'), 'newpassword123')
        await user.type(screen.getByTestId('password-confirmPassword'), 'newpassword123')
        await user.click(screen.getByText('Сбросить пароль'))

        expect(screen.getByText('Сброс пароля...')).toBeInTheDocument()

        // Clean up
        resolveReset!({ ok: true, json: () => Promise.resolve({}) })
        await waitFor(() => {
            expect(screen.queryByText('Сброс пароля...')).not.toBeInTheDocument()
        })
    })

    // Branch: "Request new link" and "Back to login" links on invalid token page
    it('shows action links on invalid token page', async () => {
        mockSearchParams = new URLSearchParams()
        render(<ResetPasswordPage />)

        await waitFor(() => {
            expect(screen.getByText('Запросить новую ссылку')).toBeInTheDocument()
            expect(screen.getByText('Вернуться к входу')).toBeInTheDocument()
        })
    })

    // Branch: clearing error on password input change (line 233-235)
    it('clears error when password input changes', async () => {
        mockSearchParams = new URLSearchParams('token=valid-token')
        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ valid: true }),
        })

        render(<ResetPasswordPage />)

        await waitFor(() => {
            expect(screen.getByText('Сброс пароля')).toBeInTheDocument()
        })

        // Trigger error via form submit to bypass HTML required
        const form = screen.getByText('Сбросить пароль').closest('form')!
        fireEvent.submit(form)
        await waitFor(() => {
            expect(screen.getByText('Введите пароль')).toBeInTheDocument()
        })

        // Type to clear error
        await user.type(screen.getByTestId('password-password'), 'a')
        await waitFor(() => {
            expect(screen.queryByText('Введите пароль')).not.toBeInTheDocument()
        })
    })

    // Branch: clearing error on confirm password input change (line 255-258)
    it('clears error when confirm password input changes', async () => {
        mockSearchParams = new URLSearchParams('token=valid-token')
        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ valid: true }),
        })

        render(<ResetPasswordPage />)

        await waitFor(() => {
            expect(screen.getByText('Сброс пароля')).toBeInTheDocument()
        })

        // Enter password but mismatching confirm
        await user.type(screen.getByTestId('password-password'), 'password123')
        await user.type(screen.getByTestId('password-confirmPassword'), 'password456')
        await user.click(screen.getByText('Сбросить пароль'))

        await waitFor(() => {
            expect(screen.getByText('Пароли не совпадают')).toBeInTheDocument()
        })

        // Type in confirm to clear error
        await user.type(screen.getByTestId('password-confirmPassword'), 'a')
        await waitFor(() => {
            expect(screen.queryByText('Пароли не совпадают')).not.toBeInTheDocument()
        })
    })

    // Branch: back to login link on form page
    it('shows back to login link on the form page', async () => {
        mockSearchParams = new URLSearchParams('token=valid-token')
        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ valid: true }),
        })

        render(<ResetPasswordPage />)

        await waitFor(() => {
            expect(screen.getByText('Сброс пароля')).toBeInTheDocument()
        })

        const backLink = screen.getByText(/Вернуться к входу/)
        expect(backLink.closest('a')).toHaveAttribute('href', '/auth')
    })
})
