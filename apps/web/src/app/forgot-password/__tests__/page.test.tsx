import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import ForgotPasswordPage from '../page'
import toast from 'react-hot-toast'

// Mock next/navigation
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
    useRouter: () => ({
        push: mockPush,
    }),
}))

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: {
        success: jest.fn(),
        error: jest.fn(),
    },
}))

// Mock fetch
global.fetch = jest.fn()

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

describe('ForgotPasswordPage', () => {
    beforeEach(() => {
        jest.clearAllMocks()
            ; (global.fetch as jest.Mock).mockClear()
    })

    describe('Initial Render', () => {
        it('renders the page title', () => {
            render(<ForgotPasswordPage />)
            expect(screen.getByText('Забыли пароль?')).toBeInTheDocument()
        })

        it('renders the description text', () => {
            render(<ForgotPasswordPage />)
            expect(
                screen.getByText('Введите ваш email и мы отправим инструкции по сбросу пароля.')
            ).toBeInTheDocument()
        })

        it('renders email input field', () => {
            render(<ForgotPasswordPage />)
            const emailInput = screen.getByLabelText('Email адрес')
            expect(emailInput).toBeInTheDocument()
            expect(emailInput).toHaveAttribute('type', 'email')
        })

        it('renders submit button', () => {
            render(<ForgotPasswordPage />)
            expect(screen.getByRole('button', { name: /Отправить инструкции/i })).toBeInTheDocument()
        })

        it('renders back to login link', () => {
            render(<ForgotPasswordPage />)
            const backLink = screen.getByText('← Вернуться к входу')
            expect(backLink).toBeInTheDocument()
            expect(backLink.closest('a')).toHaveAttribute('href', '/auth')
        })

        it('email input has required attribute', () => {
            render(<ForgotPasswordPage />)
            const emailInput = screen.getByLabelText('Email адрес')
            expect(emailInput).toHaveAttribute('required')
        })
    })

    describe('Form Validation', () => {
        it('shows error when email is empty', async () => {
            render(<ForgotPasswordPage />)
            const form = screen.getByRole('button', { name: /Отправить инструкции/i }).closest('form')!

            // Prevent default form submission to trigger custom validation
            fireEvent.submit(form)

            await waitFor(() => {
                expect(screen.getByRole('alert')).toHaveTextContent('Введите email')
            })
        })

        it('shows error for invalid email format', async () => {
            render(<ForgotPasswordPage />)
            const emailInput = screen.getByLabelText('Email адрес')
            const form = screen.getByRole('button', { name: /Отправить инструкции/i }).closest('form')!

            fireEvent.change(emailInput, { target: { value: 'invalid-email' } })
            fireEvent.submit(form)

            await waitFor(() => {
                expect(screen.getByRole('alert')).toHaveTextContent('Введите корректный email адрес')
            })
        })

        it('clears error when user types in email field', async () => {
            render(<ForgotPasswordPage />)
            const emailInput = screen.getByLabelText('Email адрес')
            const form = screen.getByRole('button', { name: /Отправить инструкции/i }).closest('form')!

            // Trigger error
            fireEvent.submit(form)
            await waitFor(() => {
                expect(screen.getByRole('alert')).toHaveTextContent('Введите email')
            })

            // Type in email field
            fireEvent.change(emailInput, { target: { value: 'test@example.com' } })

            // Error should be cleared
            await waitFor(() => {
                expect(screen.queryByRole('alert')).not.toBeInTheDocument()
            })
        })

        it('accepts valid email format', async () => {
            render(<ForgotPasswordPage />)
            const emailInput = screen.getByLabelText('Email адрес')

            const validEmails = [
                'test@example.com',
                'user.name@domain.co.uk',
                'user+tag@example.com',
            ]

            for (const email of validEmails) {
                fireEvent.change(emailInput, { target: { value: email } })
                const submitButton = screen.getByRole('button', { name: /Отправить инструкции/i })
                fireEvent.click(submitButton)

                // Should not show validation error
                await waitFor(() => {
                    expect(screen.queryByText('Введите корректный email адрес')).not.toBeInTheDocument()
                })
            }
        })
    })

    describe('Form Submission', () => {
        it('submits form with valid email', async () => {
            ; (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ message: 'Reset email sent' }),
            })

            render(<ForgotPasswordPage />)
            const emailInput = screen.getByLabelText('Email адрес')
            const submitButton = screen.getByRole('button', { name: /Отправить инструкции/i })

            fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
            fireEvent.click(submitButton)

            await waitFor(() => {
                expect(toast.success).toHaveBeenCalledWith('Проверьте почту для инструкций по сбросу пароля')
            })
        })

        it('shows loading state during submission', async () => {
            ; (global.fetch as jest.Mock).mockImplementationOnce(
                () => new Promise((resolve) => setTimeout(() => resolve({
                    ok: true,
                    json: async () => ({ message: 'Reset email sent' }),
                }), 100))
            )

            render(<ForgotPasswordPage />)
            const emailInput = screen.getByLabelText('Email адрес')
            const submitButton = screen.getByRole('button', { name: /Отправить инструкции/i })

            fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
            fireEvent.click(submitButton)

            // Check loading state
            await waitFor(() => {
                expect(screen.getByText('Отправка...')).toBeInTheDocument()
            })

            // Wait for completion
            await waitFor(() => {
                expect(screen.queryByText('Отправка...')).not.toBeInTheDocument()
            })
        })

        it('disables input and button during submission', async () => {
            ; (global.fetch as jest.Mock).mockImplementationOnce(
                () => new Promise((resolve) => setTimeout(() => resolve({
                    ok: true,
                    json: async () => ({ message: 'Reset email sent' }),
                }), 100))
            )

            render(<ForgotPasswordPage />)
            const emailInput = screen.getByLabelText('Email адрес') as HTMLInputElement
            const submitButton = screen.getByRole('button', { name: /Отправить инструкции/i }) as HTMLButtonElement

            fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
            fireEvent.click(submitButton)

            await waitFor(() => {
                expect(emailInput.disabled).toBe(true)
                expect(submitButton.disabled).toBe(true)
            })
        })
    })

    describe('Success State', () => {
        it('shows success message after submission', async () => {
            ; (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ message: 'Reset email sent' }),
            })

            render(<ForgotPasswordPage />)
            const emailInput = screen.getByLabelText('Email адрес')
            const submitButton = screen.getByRole('button', { name: /Отправить инструкции/i })

            fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
            fireEvent.click(submitButton)

            await waitFor(() => {
                expect(screen.getByText('Проверьте почту')).toBeInTheDocument()
            })
        })

        it('displays submitted email in success message', async () => {
            ; (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ message: 'Reset email sent' }),
            })

            render(<ForgotPasswordPage />)
            const emailInput = screen.getByLabelText('Email адрес')
            const submitButton = screen.getByRole('button', { name: /Отправить инструкции/i })

            fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
            fireEvent.click(submitButton)

            await waitFor(() => {
                expect(screen.getByText(/test@example.com/)).toBeInTheDocument()
            })
        })

        it('shows try another email button in success state', async () => {
            ; (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ message: 'Reset email sent' }),
            })

            render(<ForgotPasswordPage />)
            const emailInput = screen.getByLabelText('Email адрес')
            const submitButton = screen.getByRole('button', { name: /Отправить инструкции/i })

            fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
            fireEvent.click(submitButton)

            await waitFor(() => {
                expect(screen.getByText('Попробовать другой email')).toBeInTheDocument()
            })
        })

        it('resets form when clicking try another email', async () => {
            ; (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ message: 'Reset email sent' }),
            })

            render(<ForgotPasswordPage />)
            const emailInput = screen.getByLabelText('Email адрес')
            const submitButton = screen.getByRole('button', { name: /Отправить инструкции/i })

            fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
            fireEvent.click(submitButton)

            await waitFor(() => {
                expect(screen.getByText('Проверьте почту')).toBeInTheDocument()
            })

            const tryAnotherButton = screen.getByText('Попробовать другой email')
            fireEvent.click(tryAnotherButton)

            await waitFor(() => {
                expect(screen.getByText('Забыли пароль?')).toBeInTheDocument()
                const newEmailInput = screen.getByLabelText('Email адрес') as HTMLInputElement
                expect(newEmailInput.value).toBe('')
            })
        })

        it('shows back to login button in success state', async () => {
            ; (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ message: 'Reset email sent' }),
            })

            render(<ForgotPasswordPage />)
            const emailInput = screen.getByLabelText('Email адрес')
            const submitButton = screen.getByRole('button', { name: /Отправить инструкции/i })

            fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
            fireEvent.click(submitButton)

            await waitFor(() => {
                const backLink = screen.getByText('Вернуться к входу')
                expect(backLink).toBeInTheDocument()
                expect(backLink.closest('a')).toHaveAttribute('href', '/auth')
            })
        })
    })

    describe('Error Handling', () => {
        it('handles rate limit error (429)', async () => {
            ; (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 429,
                json: async () => ({ error: 'Too many requests' }),
            })

            render(<ForgotPasswordPage />)
            const emailInput = screen.getByLabelText('Email адрес')
            const submitButton = screen.getByRole('button', { name: /Отправить инструкции/i })

            fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
            fireEvent.click(submitButton)

            await waitFor(() => {
                expect(screen.getByText('Слишком много запросов. Попробуйте позже.')).toBeInTheDocument()
                expect(toast.error).toHaveBeenCalledWith('Слишком много запросов. Попробуйте позже.')
            })
        })

        it('handles server error', async () => {
            ; (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: async () => ({ error: 'Internal server error' }),
            })

            render(<ForgotPasswordPage />)
            const emailInput = screen.getByLabelText('Email адрес')
            const submitButton = screen.getByRole('button', { name: /Отправить инструкции/i })

            fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
            fireEvent.click(submitButton)

            await waitFor(() => {
                expect(screen.getByText('Internal server error')).toBeInTheDocument()
                expect(toast.error).toHaveBeenCalled()
            })
        })

        it('handles network error', async () => {
            ; (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'))

            render(<ForgotPasswordPage />)
            const emailInput = screen.getByLabelText('Email адрес')
            const submitButton = screen.getByRole('button', { name: /Отправить инструкции/i })

            fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
            fireEvent.click(submitButton)

            await waitFor(() => {
                expect(toast.error).toHaveBeenCalled()
            })
        })

        it('handles generic error without specific message', async () => {
            ; (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: async () => ({}),
            })

            render(<ForgotPasswordPage />)
            const emailInput = screen.getByLabelText('Email адрес')
            const submitButton = screen.getByRole('button', { name: /Отправить инструкции/i })

            fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
            fireEvent.click(submitButton)

            await waitFor(() => {
                expect(screen.getByText('Не удалось отправить письмо')).toBeInTheDocument()
            })
        })

        it('re-enables form after error', async () => {
            ; (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: async () => ({ error: 'Server error' }),
            })

            render(<ForgotPasswordPage />)
            const emailInput = screen.getByLabelText('Email адрес') as HTMLInputElement
            const submitButton = screen.getByRole('button', { name: /Отправить инструкции/i }) as HTMLButtonElement

            fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
            fireEvent.click(submitButton)

            await waitFor(() => {
                expect(screen.getByText('Server error')).toBeInTheDocument()
            })

            // Form should be re-enabled
            expect(emailInput.disabled).toBe(false)
            expect(submitButton.disabled).toBe(false)
        })
    })

    describe('Accessibility', () => {
        it('has proper form structure', () => {
            render(<ForgotPasswordPage />)
            const form = screen.getByRole('button', { name: /Отправить инструкции/i }).closest('form')
            expect(form).toBeInTheDocument()
        })

        it('has proper label association', () => {
            render(<ForgotPasswordPage />)
            const emailInput = screen.getByLabelText('Email адрес')
            expect(emailInput).toHaveAttribute('id', 'email')
        })

        it('has proper button roles', () => {
            render(<ForgotPasswordPage />)
            const submitButton = screen.getByRole('button', { name: /Отправить инструкции/i })
            expect(submitButton).toHaveAttribute('type', 'submit')
        })
    })
})
