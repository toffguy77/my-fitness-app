/**
 * Component Tests: Register Page
 * Tests registration form, validation, and user creation
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RegisterPage from '../page'

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
const mockSignUp = jest.fn()
const mockFrom = jest.fn()
const mockRpc = jest.fn()

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      signUp: mockSignUp,
    },
    from: mockFrom,
    rpc: mockRpc,
  })),
}))

describe('Register Page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRpc.mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue({
      insert: jest.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    })
  })

  it('should render registration form', () => {
    render(<RegisterPage />)
    
    expect(screen.getByText(/Регистрация/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Имя/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Пароль/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Создать аккаунт/i })).toBeInTheDocument()
  })

  it('should show validation error on empty required fields', async () => {
    const user = userEvent.setup()
    render(<RegisterPage />)
    
    const submitButton = screen.getByRole('button', { name: /Создать аккаунт/i })
    await user.click(submitButton)
    
    // HTML5 validation should prevent submission
    const emailInput = screen.getByLabelText(/Email/i) as HTMLInputElement
    expect(emailInput.validity.valueMissing).toBe(true)
  })

  it('should handle form input', async () => {
    const user = userEvent.setup()
    render(<RegisterPage />)
    
    await user.type(screen.getByLabelText(/Имя/i), 'John Doe')
    await user.type(screen.getByLabelText(/Email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/Пароль/i), 'password123')
    
    expect(screen.getByLabelText(/Имя/i)).toHaveValue('John Doe')
    expect(screen.getByLabelText(/Email/i)).toHaveValue('test@example.com')
    expect(screen.getByLabelText(/Пароль/i)).toHaveValue('password123')
  })

  it('should show error message on registration failure', async () => {
    const user = userEvent.setup()
    mockSignUp.mockResolvedValue({
      data: { user: null },
      error: { message: 'Email already exists' },
    })
    
    render(<RegisterPage />)
    
    await user.type(screen.getByLabelText(/Email/i), 'existing@example.com')
    await user.type(screen.getByLabelText(/Пароль/i), 'password123')
    await user.click(screen.getByRole('button', { name: /Создать аккаунт/i }))
    
    await waitFor(() => {
      expect(screen.getByText(/Email already exists/i)).toBeInTheDocument()
    })
  })

  it('should show success message on successful registration', async () => {
    const user = userEvent.setup()
    mockSignUp.mockResolvedValue({
      data: {
        user: { id: 'user-123', email: 'test@example.com' },
      },
      error: null,
    })
    
    render(<RegisterPage />)
    
    await user.type(screen.getByLabelText(/Email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/Пароль/i), 'password123')
    await user.click(screen.getByRole('button', { name: /Создать аккаунт/i }))
    
    await waitFor(() => {
      expect(screen.getByText(/Регистрация успешна/i)).toBeInTheDocument()
    })
  })

  it('should have link to login page', () => {
    render(<RegisterPage />)
    
    const loginLink = screen.getByRole('link', { name: /Войти/i })
    expect(loginLink).toHaveAttribute('href', '/login')
  })

  it('should disable submit button while loading', async () => {
    const user = userEvent.setup()
    mockSignUp.mockImplementation(() => new Promise(() => {})) // Never resolves
    
    render(<RegisterPage />)
    
    await user.type(screen.getByLabelText(/Email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/Пароль/i), 'password123')
    await user.click(screen.getByRole('button', { name: /Создать аккаунт/i }))
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Регистрация.../i })).toBeDisabled()
    })
  })

  it('should validate password minimum length', () => {
    render(<RegisterPage />)
    
    const passwordInput = screen.getByLabelText(/Пароль/i) as HTMLInputElement
    expect(passwordInput).toHaveAttribute('minLength', '6')
  })
})

