import React from 'react'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VerifyEmailScreen } from '../VerifyEmailScreen'

const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const mockVerifyEmail = jest.fn()
const mockResendVerificationCode = jest.fn()

jest.mock('@/features/auth/api/verification', () => ({
  verifyEmail: (...args: unknown[]) => mockVerifyEmail(...args),
  resendVerificationCode: (...args: unknown[]) => mockResendVerificationCode(...args),
}))

const mockToastSuccess = jest.fn()
const mockToastError = jest.fn()

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  }),
}))

jest.mock('../CodeInput', () => ({
  CodeInput: ({
    value,
    onChange,
    disabled,
  }: {
    value: string[]
    onChange: (v: string[]) => void
    disabled?: boolean
    error?: boolean
  }) => (
    <div data-testid="code-input">
      {value.map((digit, i) => (
        <input
          key={i}
          aria-label={`Digit ${i + 1}`}
          value={digit}
          disabled={disabled}
          onChange={(e) => {
            const next = [...value]
            next[i] = e.target.value
            onChange(next)
          }}
        />
      ))}
    </div>
  ),
}))

function setLocalStorageUser(user: Record<string, unknown>) {
  localStorage.setItem('user', JSON.stringify(user))
}

describe('VerifyEmailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    localStorage.clear()
    setLocalStorageUser({
      email: 'test@example.com',
      email_verified: false,
      onboarding_completed: false,
    })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders the verification heading and user email', () => {
    render(<VerifyEmailScreen />)

    expect(screen.getByText('Подтверждение email')).toBeInTheDocument()
    expect(screen.getByText(/test@example.com/)).toBeInTheDocument()
  })

  it('renders 6 digit inputs', () => {
    render(<VerifyEmailScreen />)

    expect(screen.getByTestId('code-input')).toBeInTheDocument()
    expect(screen.getAllByRole('textbox')).toHaveLength(6)
  })

  it('shows resend button with cooldown timer', () => {
    render(<VerifyEmailScreen />)

    expect(screen.getByText(/Отправить повторно \(60с\)/)).toBeInTheDocument()
  })

  it('counts down the resend cooldown', () => {
    render(<VerifyEmailScreen />)

    // Each tick requires a separate act() because setTimeout is recursive:
    // the next timeout is scheduled only after the state update re-renders.
    for (let i = 0; i < 5; i++) {
      act(() => {
        jest.advanceTimersByTime(1000)
      })
    }

    expect(screen.getByText(/Отправить повторно \(55с\)/)).toBeInTheDocument()
  })

  it('enables resend button after cooldown expires', () => {
    render(<VerifyEmailScreen />)

    for (let i = 0; i < 60; i++) {
      act(() => {
        jest.advanceTimersByTime(1000)
      })
    }

    const resendBtn = screen.getByText('Отправить повторно')
    expect(resendBtn).toBeEnabled()
  })

  it('disables resend button during cooldown', () => {
    render(<VerifyEmailScreen />)

    const resendBtn = screen.getByText(/Отправить повторно/)
    expect(resendBtn).toBeDisabled()
  })

  it('auto-submits when all 6 digits are entered', async () => {
    mockVerifyEmail.mockResolvedValueOnce(undefined)
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(<VerifyEmailScreen />)

    const inputs = screen.getAllByRole('textbox')
    const digits = ['1', '2', '3', '4', '5', '6']

    for (let i = 0; i < 6; i++) {
      await user.clear(inputs[i])
      await user.type(inputs[i], digits[i])
    }

    await waitFor(() => {
      expect(mockVerifyEmail).toHaveBeenCalledWith('123456')
    })
  })

  it('navigates to onboarding when onboarding is not completed', async () => {
    mockVerifyEmail.mockResolvedValueOnce(undefined)
    setLocalStorageUser({
      email: 'test@example.com',
      email_verified: false,
      onboarding_completed: false,
    })

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(<VerifyEmailScreen />)

    const inputs = screen.getAllByRole('textbox')
    for (let i = 0; i < 6; i++) {
      await user.clear(inputs[i])
      await user.type(inputs[i], String(i + 1))
    }

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/onboarding')
    })
  })

  it('navigates to dashboard when onboarding is completed', async () => {
    mockVerifyEmail.mockResolvedValueOnce(undefined)
    setLocalStorageUser({
      email: 'test@example.com',
      email_verified: false,
      onboarding_completed: true,
    })

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(<VerifyEmailScreen />)

    const inputs = screen.getAllByRole('textbox')
    for (let i = 0; i < 6; i++) {
      await user.clear(inputs[i])
      await user.type(inputs[i], String(i + 1))
    }

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('shows error message on verification failure', async () => {
    mockVerifyEmail.mockRejectedValueOnce({ message: 'Invalid code' })
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(<VerifyEmailScreen />)

    const inputs = screen.getAllByRole('textbox')
    for (let i = 0; i < 6; i++) {
      await user.clear(inputs[i])
      await user.type(inputs[i], String(i + 1))
    }

    await waitFor(() => {
      expect(screen.getByText('Invalid code')).toBeInTheDocument()
    })
  })

  it('shows toast success on email verification', async () => {
    mockVerifyEmail.mockResolvedValueOnce(undefined)
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(<VerifyEmailScreen />)

    const inputs = screen.getAllByRole('textbox')
    for (let i = 0; i < 6; i++) {
      await user.clear(inputs[i])
      await user.type(inputs[i], String(i + 1))
    }

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('Email подтверждён')
    })
  })

  it('blocks input after 5 failed attempts', async () => {
    mockVerifyEmail.mockRejectedValue({ message: 'Wrong code' })
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(<VerifyEmailScreen />)

    for (let attempt = 0; attempt < 5; attempt++) {
      // Wait for code to be reset (empty inputs) before entering next attempt
      await waitFor(() => {
        const inputs = screen.getAllByRole('textbox')
        expect(inputs[0]).toHaveValue('')
      })

      const inputs = screen.getAllByRole('textbox')
      for (let i = 0; i < 6; i++) {
        await user.clear(inputs[i])
        await user.type(inputs[i], String(i + 1))
      }

      await waitFor(() => {
        expect(mockVerifyEmail).toHaveBeenCalledTimes(attempt + 1)
      })
    }

    await waitFor(() => {
      expect(
        screen.getByText('Слишком много попыток. Запросите новый код.')
      ).toBeInTheDocument()
    })
  })

  it('calls resend and resets cooldown', async () => {
    mockResendVerificationCode.mockResolvedValueOnce(undefined)
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(<VerifyEmailScreen />)

    // Wait for cooldown to expire
    for (let i = 0; i < 60; i++) {
      act(() => {
        jest.advanceTimersByTime(1000)
      })
    }

    const resendBtn = screen.getByText('Отправить повторно')
    await user.click(resendBtn)

    await waitFor(() => {
      expect(mockResendVerificationCode).toHaveBeenCalled()
      expect(mockToastSuccess).toHaveBeenCalledWith('Код отправлен повторно')
    })

    // Cooldown resets to 60
    await waitFor(() => {
      expect(screen.getByText(/Отправить повторно \(60с\)/)).toBeInTheDocument()
    })
  })

  it('shows toast error when resend fails', async () => {
    mockResendVerificationCode.mockRejectedValueOnce({
      response: { data: { message: 'Rate limited' } },
    })
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(<VerifyEmailScreen />)

    for (let i = 0; i < 60; i++) {
      act(() => {
        jest.advanceTimersByTime(1000)
      })
    }

    await user.click(screen.getByText('Отправить повторно'))

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Rate limited')
    })
  })

  it('updates localStorage after successful verification', async () => {
    mockVerifyEmail.mockResolvedValueOnce(undefined)
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(<VerifyEmailScreen />)

    const inputs = screen.getAllByRole('textbox')
    for (let i = 0; i < 6; i++) {
      await user.clear(inputs[i])
      await user.type(inputs[i], String(i + 1))
    }

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('user') || '{}')
      expect(stored.email_verified).toBe(true)
    })
  })
})
