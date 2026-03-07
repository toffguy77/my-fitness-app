import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthScreen } from '../AuthScreen'

const mockLogin = jest.fn()
const mockRegister = jest.fn()

let mockIsLoading = false

jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({
    login: mockLogin,
    register: mockRegister,
    isLoading: mockIsLoading,
  }),
}))

jest.mock('@/features/auth/hooks/useFormValidation', () => ({
  useFormValidation: () => ({
    errors: {},
    validateEmail: jest.fn().mockReturnValue(true),
    validatePassword: jest.fn().mockReturnValue(true),
    validateLogin: jest.fn().mockReturnValue(true),
    validateRegister: jest.fn().mockReturnValue(true),
  }),
}))

jest.mock('@/shared/components/ui', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    isLoading: loading,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    isLoading?: boolean
    variant?: string
    className?: string
    'aria-label'?: string
  }) => (
    <button onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {loading ? 'loading...' : children}
    </button>
  ),
  Logo: () => <div data-testid="logo">Logo</div>,
}))

jest.mock('../AuthForm', () => ({
  AuthForm: ({
    formData,
    setFormData,
    onEmailBlur,
    onPasswordBlur,
  }: {
    formData: { email: string; password: string }
    setFormData: (data: { email: string; password: string }) => void
    errors: Record<string, string>
    onEmailBlur: () => void
    onPasswordBlur: () => void
  }) => (
    <div data-testid="auth-form">
      <input
        aria-label="Email address"
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        onBlur={onEmailBlur}
      />
      <input
        aria-label="Password"
        type="password"
        value={formData.password}
        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
        onBlur={onPasswordBlur}
      />
    </div>
  ),
}))

jest.mock('../ConsentSection', () => ({
  ConsentSection: ({
    consents,
    setConsents,
  }: {
    consents: Record<string, boolean>
    setConsents: (c: Record<string, boolean>) => void
    error?: string
  }) => (
    <div data-testid="consent-section">
      <label>
        <input
          type="checkbox"
          checked={consents.terms_of_service}
          onChange={(e) =>
            setConsents({ ...consents, terms_of_service: e.target.checked })
          }
        />
        Terms
      </label>
      <label>
        <input
          type="checkbox"
          checked={consents.privacy_policy}
          onChange={(e) =>
            setConsents({ ...consents, privacy_policy: e.target.checked })
          }
        />
        Privacy
      </label>
      <label>
        <input
          type="checkbox"
          checked={consents.data_processing}
          onChange={(e) =>
            setConsents({ ...consents, data_processing: e.target.checked })
          }
        />
        Data Processing
      </label>
    </div>
  ),
}))

jest.mock('../AuthFooter', () => ({
  AuthFooter: () => <div data-testid="auth-footer">Footer</div>,
}))

describe('AuthScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIsLoading = false
  })

  it('renders in login mode by default', () => {
    render(<AuthScreen />)

    expect(screen.getByTestId('logo')).toBeInTheDocument()
    expect(screen.getByTestId('auth-form')).toBeInTheDocument()
    expect(screen.getByTestId('auth-footer')).toBeInTheDocument()
    expect(screen.getByLabelText('Log in to your account')).toBeInTheDocument()
    expect(screen.getByLabelText('Register a new account')).toBeInTheDocument()
  })

  it('does not show consent section in login mode', () => {
    render(<AuthScreen />)

    expect(screen.queryByTestId('consent-section')).not.toBeInTheDocument()
  })

  it('switches to register mode when clicking register button', async () => {
    const user = userEvent.setup()
    render(<AuthScreen />)

    const registerBtn = screen.getByLabelText('Register a new account')
    expect(registerBtn).toHaveTextContent('Создать аккаунт')

    await user.click(registerBtn)

    expect(screen.getByTestId('consent-section')).toBeInTheDocument()
    expect(registerBtn).toHaveTextContent('Зарегистрироваться')
  })

  it('shows "back to login" link in register mode', async () => {
    const user = userEvent.setup()
    render(<AuthScreen />)

    await user.click(screen.getByLabelText('Register a new account'))

    const backLink = screen.getByText('Уже есть аккаунт? Войти')
    expect(backLink).toBeInTheDocument()
  })

  it('switches back to login mode from register mode', async () => {
    const user = userEvent.setup()
    render(<AuthScreen />)

    await user.click(screen.getByLabelText('Register a new account'))
    expect(screen.getByTestId('consent-section')).toBeInTheDocument()

    await user.click(screen.getByText('Уже есть аккаунт? Войти'))
    expect(screen.queryByTestId('consent-section')).not.toBeInTheDocument()
  })

  it('disables login button when form is empty', () => {
    render(<AuthScreen />)

    expect(screen.getByLabelText('Log in to your account')).toBeDisabled()
  })

  it('enables login button when email and password are filled', async () => {
    const user = userEvent.setup()
    render(<AuthScreen />)

    await user.type(screen.getByLabelText('Email address'), 'test@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')

    expect(screen.getByLabelText('Log in to your account')).toBeEnabled()
  })

  it('calls login with trimmed email on login button click', async () => {
    const user = userEvent.setup()
    render(<AuthScreen />)

    await user.type(screen.getByLabelText('Email address'), '  test@example.com  ')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByLabelText('Log in to your account'))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@example.com' })
      )
    })
  })

  it('calls register with form data and consents in register mode', async () => {
    const user = userEvent.setup()
    render(<AuthScreen />)

    // Fill form
    await user.type(screen.getByLabelText('Email address'), 'new@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')

    // Switch to register mode
    await user.click(screen.getByLabelText('Register a new account'))

    // Check required consents
    const checkboxes = screen.getAllByRole('checkbox')
    // terms_of_service, privacy_policy, data_processing
    await user.click(checkboxes[0])
    await user.click(checkboxes[1])
    await user.click(checkboxes[2])

    // Click register
    await user.click(screen.getByLabelText('Register a new account'))

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@example.com', password: 'password123' }),
        expect.objectContaining({
          terms_of_service: true,
          privacy_policy: true,
          data_processing: true,
        })
      )
    })
  })

  it('disables register button when required consents are not checked', async () => {
    const user = userEvent.setup()
    render(<AuthScreen />)

    await user.type(screen.getByLabelText('Email address'), 'new@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')

    // Switch to register mode
    await user.click(screen.getByLabelText('Register a new account'))

    // Register button should be disabled without consents
    expect(screen.getByLabelText('Register a new account')).toBeDisabled()
  })

  it('shows remember me checkbox only in login mode', async () => {
    const user = userEvent.setup()
    render(<AuthScreen />)

    expect(screen.getByText('Запомнить меня на 30 дней')).toBeInTheDocument()

    // Switch to register mode
    await user.click(screen.getByLabelText('Register a new account'))

    expect(screen.queryByText('Запомнить меня на 30 дней')).not.toBeInTheDocument()
  })

  it('disables buttons when loading', () => {
    mockIsLoading = true
    render(<AuthScreen />)

    expect(screen.getByLabelText('Log in to your account')).toBeDisabled()
    expect(screen.getByLabelText('Register a new account')).toBeDisabled()
  })
})
