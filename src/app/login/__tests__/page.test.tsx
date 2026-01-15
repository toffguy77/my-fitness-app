/**
 * Component Tests: Login Page
 * Tests login form, validation, and authentication flow
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginPage from '../page'

// Mock Next.js modules
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
  useSearchParams: () => ({
    get: jest.fn(() => null),
  }),
}))

jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => {
    return <a href={href}>{children}</a>
  }
})

// Mock Supabase
const mockSignIn = jest.fn()
const mockGetUser = jest.fn()
const mockFrom = jest.fn()

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      signInWithPassword: mockSignIn,
      getUser: mockGetUser,
    },
    from: mockFrom,
  })),
}))

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    userFlow: jest.fn(),
    registration: jest.fn(),
    authentication: jest.fn(),
    userAction: jest.fn(),
    isDebugEnabled: jest.fn(() => false),
    isUserFlowLoggingEnabled: jest.fn(() => false),
  },
}))

describe('Login Page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { role: 'client' },
        error: null,
      }),
    })
  })

  it('should render login form', () => {
    render(<LoginPage />)

    expect(screen.getByText(/Вход в систему/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Пароль/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Войти/i })).toBeInTheDocument()
  })

  it('should show validation error on empty form submission', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)

    const submitButton = screen.getByRole('button', { name: /Войти/i })
    await user.click(submitButton)

    // HTML5 validation should prevent submission
    const emailInput = screen.getByLabelText(/Email/i) as HTMLInputElement
    expect(emailInput.validity.valueMissing).toBe(true)
  })

  it('should handle login form input', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)

    const emailInput = screen.getByLabelText(/Email/i)
    const passwordInput = screen.getByLabelText(/Пароль/i)

    await user.type(emailInput, 'test@example.com')
    await user.type(passwordInput, 'password123')

    expect(emailInput).toHaveValue('test@example.com')
    expect(passwordInput).toHaveValue('password123')
  })

  it('should show error message on login failure', async () => {
    const user = userEvent.setup()
    mockSignIn.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid credentials' },
    })

    render(<LoginPage />)

    await user.type(screen.getByLabelText(/Email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/Пароль/i), 'wrongpassword')
    await user.click(screen.getByRole('button', { name: /Войти/i }))

    await waitFor(() => {
      expect(screen.getByText(/Invalid credentials/i)).toBeInTheDocument()
    })
  })

  it('should show success message on login success', async () => {
    const user = userEvent.setup()
    mockSignIn.mockResolvedValue({
      data: {
        user: { id: 'user-123', email: 'test@example.com' },
      },
      error: null,
    })

    render(<LoginPage />)

    await user.type(screen.getByLabelText(/Email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/Пароль/i), 'password123')
    await user.click(screen.getByRole('button', { name: /Войти/i }))

    await waitFor(() => {
      expect(screen.getByText(/Успешный вход/i)).toBeInTheDocument()
    })
  })

  it('should have link to registration page', () => {
    render(<LoginPage />)

    const registerLink = screen.getByRole('link', { name: /Зарегистрироваться/i })
    expect(registerLink).toHaveAttribute('href', '/register')
  })

  it('should disable submit button while loading', async () => {
    const user = userEvent.setup()
    mockSignIn.mockImplementation(() => new Promise(() => {})) // Never resolves

    render(<LoginPage />)

    await user.type(screen.getByLabelText(/Email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/Пароль/i), 'password123')
    await user.click(screen.getByRole('button', { name: /Войти/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Вход.../i })).toBeDisabled()
    })
  })
})
