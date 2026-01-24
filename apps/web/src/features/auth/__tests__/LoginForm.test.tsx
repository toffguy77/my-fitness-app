import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginForm } from '../components/LoginForm'

describe('LoginForm', () => {
    it('renders login form', () => {
        render(<LoginForm />)

        expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /войти/i })).toBeInTheDocument()
    })

    it('validates email format', async () => {
        const user = userEvent.setup()
        render(<LoginForm />)

        const emailInput = screen.getByLabelText(/email/i)
        await user.type(emailInput, 'invalid-email')
        await user.tab()

        await waitFor(() => {
            expect(screen.getByText(/некорректный email/i)).toBeInTheDocument()
        })
    })

    it('validates required fields', async () => {
        const user = userEvent.setup()
        render(<LoginForm />)

        const submitButton = screen.getByRole('button', { name: /войти/i })
        await user.click(submitButton)

        await waitFor(() => {
            expect(screen.getByText(/обязательное поле/i)).toBeInTheDocument()
        })
    })

    it('submits form with valid data', async () => {
        const user = userEvent.setup()
        const onSubmit = jest.fn()
        render(<LoginForm onSubmit={onSubmit} />)

        await user.type(screen.getByLabelText(/email/i), 'test@example.com')
        await user.type(screen.getByLabelText(/password/i), 'password123')
        await user.click(screen.getByRole('button', { name: /войти/i }))

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith({
                email: 'test@example.com',
                password: 'password123',
            })
        })
    })

    it('shows loading state during submission', async () => {
        const user = userEvent.setup()
        render(<LoginForm />)

        await user.type(screen.getByLabelText(/email/i), 'test@example.com')
        await user.type(screen.getByLabelText(/password/i), 'password123')

        const submitButton = screen.getByRole('button', { name: /войти/i })
        await user.click(submitButton)

        expect(submitButton).toBeDisabled()
    })
})
