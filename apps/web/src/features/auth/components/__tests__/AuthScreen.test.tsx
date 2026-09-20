import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthScreen } from '../AuthScreen'
import { providersApi } from '@/features/auth/api/providers'

const mockLogin = jest.fn()
const mockRegister = jest.fn()

let mockIsLoading = false

// ProviderButtons fetches its own list of providers; the real endpoint has
// no MSW handler in this suite (an unmocked call just fails and the
// component renders nothing), so tests that need the buttons on screen
// control the list explicitly.
jest.mock('@/features/auth/api/providers', () => {
  const actual = jest.requireActual('@/features/auth/api/providers')
  return { ...actual, providersApi: { ...actual.providersApi, list: jest.fn() } }
})

const listProviders = providersApi.list as jest.Mock

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
        aria-label="Электронная почта"
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

// MagicLinkForm has its own dedicated suite (MagicLinkForm.test.tsx) that
// exercises its real behaviour — request/consent/error handling. Here it is
// a stand-in: AuthScreen's own job is just choosing which of the two forms
// is on screen and wiring the switch between them, so only that contract
// (rendered by default, calls onSwitchToPassword) needs to be real.
jest.mock('../MagicLinkForm', () => ({
  MagicLinkForm: ({
    onSwitchToPassword,
    intent,
  }: {
    onSwitchToPassword: () => void
    intent?: 'login' | 'register'
  }) => (
    <div data-testid="magic-link-form">
      <span data-testid="magic-link-intent">{intent}</span>
      <button onClick={onSwitchToPassword}>Войти по паролю</button>
    </div>
  ),
}))

/** Every password-mode assertion needs this first: link is what a fresh screen shows. */
async function switchToPasswordMode(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('Войти по паролю'))
}

describe('AuthScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIsLoading = false
    // Default: no provider credentials configured, so ProviderButtons
    // renders nothing unless a test opts in with its own list.
    listProviders.mockResolvedValue([])
  })

  it('shows the magic-link form by default, not the password form', () => {
    render(<AuthScreen />)

    expect(screen.getByTestId('logo')).toBeInTheDocument()
    expect(screen.getByTestId('auth-footer')).toBeInTheDocument()
    expect(screen.getByTestId('magic-link-form')).toBeInTheDocument()
    expect(screen.queryByTestId('auth-form')).not.toBeInTheDocument()
  })

  it('reveals the password form via "Войти по паролю", without unmounting for a reload', async () => {
    const user = userEvent.setup()
    render(<AuthScreen />)

    await switchToPasswordMode(user)

    expect(screen.getByTestId('auth-form')).toBeInTheDocument()
    // Hidden, not unmounted: MagicLinkForm keeps its own state (typed email,
    // consents, a completed "sent") across the switch, so it stays in the
    // tree — see AuthScreen.tsx for why.
    expect(screen.getByTestId('magic-link-form')).not.toBeVisible()
    expect(screen.getByLabelText('Войти')).toBeInTheDocument()
    expect(screen.getByLabelText('Зарегистрироваться')).toBeInTheDocument()
  })

  it('offers a way back from the password form to the magic-link form', async () => {
    const user = userEvent.setup()
    render(<AuthScreen />)

    await switchToPasswordMode(user)
    await user.click(screen.getByText('Войти по ссылке'))

    expect(screen.getByTestId('magic-link-form')).toBeInTheDocument()
    expect(screen.queryByTestId('auth-form')).not.toBeInTheDocument()
  })

  it('does not show consent section in login mode', async () => {
    const user = userEvent.setup()
    render(<AuthScreen />)
    await switchToPasswordMode(user)

    expect(screen.queryByTestId('consent-section')).not.toBeInTheDocument()
  })

  it('switches to register mode when clicking register button', async () => {
    const user = userEvent.setup()
    render(<AuthScreen />)
    await switchToPasswordMode(user)

    const registerBtn = screen.getByLabelText('Зарегистрироваться')
    expect(registerBtn).toHaveTextContent('Создать аккаунт')

    await user.click(registerBtn)

    expect(screen.getByTestId('consent-section')).toBeInTheDocument()
    expect(registerBtn).toHaveTextContent('Зарегистрироваться')
  })

  it('shows "back to login" link in register mode', async () => {
    const user = userEvent.setup()
    render(<AuthScreen />)
    await switchToPasswordMode(user)

    await user.click(screen.getByLabelText('Зарегистрироваться'))

    const backLink = screen.getByText('Уже есть аккаунт? Войти')
    expect(backLink).toBeInTheDocument()
  })

  it('switches back to login mode from register mode', async () => {
    const user = userEvent.setup()
    render(<AuthScreen />)
    await switchToPasswordMode(user)

    await user.click(screen.getByLabelText('Зарегистрироваться'))
    expect(screen.getByTestId('consent-section')).toBeInTheDocument()

    await user.click(screen.getByText('Уже есть аккаунт? Войти'))
    expect(screen.queryByTestId('consent-section')).not.toBeInTheDocument()
  })

  it('disables login button when form is empty', async () => {
    const user = userEvent.setup()
    render(<AuthScreen />)
    await switchToPasswordMode(user)

    expect(screen.getByLabelText('Войти')).toBeDisabled()
  })

  it('enables login button when email and password are filled', async () => {
    const user = userEvent.setup()
    render(<AuthScreen />)
    await switchToPasswordMode(user)

    await user.type(screen.getByLabelText('Электронная почта'), 'test@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')

    expect(screen.getByLabelText('Войти')).toBeEnabled()
  })

  it('calls login with trimmed email on login button click', async () => {
    const user = userEvent.setup()
    render(<AuthScreen />)
    await switchToPasswordMode(user)

    await user.type(screen.getByLabelText('Электронная почта'), '  test@example.com  ')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByLabelText('Войти'))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@example.com' })
      )
    })
  })

  it('calls register with form data and consents in register mode', async () => {
    const user = userEvent.setup()
    render(<AuthScreen />)
    await switchToPasswordMode(user)

    // Fill form
    await user.type(screen.getByLabelText('Электронная почта'), 'new@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')

    // Switch to register mode
    await user.click(screen.getByLabelText('Зарегистрироваться'))

    // Check required consents
    const checkboxes = screen.getAllByRole('checkbox')
    // terms_of_service, privacy_policy, data_processing
    await user.click(checkboxes[0])
    await user.click(checkboxes[1])
    await user.click(checkboxes[2])

    // Click register
    await user.click(screen.getByLabelText('Зарегистрироваться'))

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
    await switchToPasswordMode(user)

    await user.type(screen.getByLabelText('Электронная почта'), 'new@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')

    // Switch to register mode
    await user.click(screen.getByLabelText('Зарегистрироваться'))

    // Register button should be disabled without consents
    expect(screen.getByLabelText('Зарегистрироваться')).toBeDisabled()
  })

  it('shows remember me checkbox only in login mode', async () => {
    const user = userEvent.setup()
    render(<AuthScreen />)
    await switchToPasswordMode(user)

    expect(screen.getByText('Запомнить меня на 30 дней')).toBeInTheDocument()

    // Switch to register mode
    await user.click(screen.getByLabelText('Зарегистрироваться'))

    expect(screen.queryByText('Запомнить меня на 30 дней')).not.toBeInTheDocument()
  })

  it('disables buttons when loading', async () => {
    mockIsLoading = true
    const user = userEvent.setup()
    render(<AuthScreen />)
    await switchToPasswordMode(user)

    expect(screen.getByLabelText('Войти')).toBeDisabled()
    expect(screen.getByLabelText('Зарегистрироваться')).toBeDisabled()
  })

  // Задача 9, ruling по второму обзору: регистрация по ссылке — тот же
  // экран, что вход, а не форма пароля. MagicLinkForm не различает вход и
  // регистрацию поведением, только текстом — initialMode='register' обязан
  // передать это дальше как `intent`, а не подменить форму целиком.
  it('opens the link form for initialMode=register too, passing intent through — not the password form', () => {
    render(<AuthScreen initialMode="register" />)

    expect(screen.getByTestId('magic-link-form')).toBeVisible()
    expect(screen.getByTestId('magic-link-intent')).toHaveTextContent('register')
    expect(screen.queryByTestId('auth-form')).not.toBeInTheDocument()
  })

  it('still opens into the link form when initialMode is login (default, unchanged), with login intent', () => {
    render(<AuthScreen initialMode="login" />)

    expect(screen.getByTestId('magic-link-form')).toBeVisible()
    expect(screen.getByTestId('magic-link-intent')).toHaveTextContent('login')
    expect(screen.queryByTestId('auth-form')).not.toBeInTheDocument()
  })

  // Иерархия кнопок в варианте пароля, когда до него всё же дошли из
  // register-намерения (по «Войти по паролю»): раньше здесь первой оживала
  // чужая кнопка («Войти»), и нажавший её получал ошибку входа. Теперь она
  // не рендерится вовсе, пока mode остаётся 'register'.
  it('hides the login button in the password form when arriving with register intent', async () => {
    const user = userEvent.setup()
    render(<AuthScreen initialMode="register" />)

    await user.click(screen.getByRole('button', { name: 'Войти по паролю' }))

    expect(screen.queryByLabelText('Войти')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Зарегистрироваться')).toBeInTheDocument()
  })

  // Regression: sign-in via an external provider is a third, independent
  // entry method — not a sub-case of the password form. It must render (and
  // be visible, not merely present under a `hidden` ancestor) no matter
  // which entryMethod is on screen and in both login/register mode.
  describe('provider sign-in (third entry method, independent of link/password)', () => {
    it('is visible on the default magic-link screen', async () => {
      listProviders.mockResolvedValue(['yandex'])
      render(<AuthScreen />)

      expect(await screen.findByTestId('oauth-yandex')).toBeVisible()
    })

    it('is visible after switching to the password entry method', async () => {
      listProviders.mockResolvedValue(['yandex'])
      const user = userEvent.setup()
      render(<AuthScreen />)
      await switchToPasswordMode(user)

      expect(await screen.findByTestId('oauth-yandex')).toBeVisible()
    })

    it('is visible on the link screen opened with ?mode=register', async () => {
      listProviders.mockResolvedValue(['yandex'])
      render(<AuthScreen initialMode="register" />)

      expect(await screen.findByTestId('oauth-yandex')).toBeVisible()
    })

    it('labels itself for signing in on the login-mode link screen', async () => {
      listProviders.mockResolvedValue(['yandex'])
      render(<AuthScreen />)

      expect(await screen.findByText('или войдите через')).toBeVisible()
    })

    it('labels itself for registering on the register-mode link screen', async () => {
      listProviders.mockResolvedValue(['yandex'])
      render(<AuthScreen initialMode="register" />)

      expect(await screen.findByText('или зарегистрируйтесь через')).toBeVisible()
    })
  })
})
