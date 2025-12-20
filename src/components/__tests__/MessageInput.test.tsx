/**
 * Component Tests: MessageInput
 * Tests message input component
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MessageInput from '../chat/MessageInput'

// Mock sendTypingEvent
jest.mock('@/utils/chat/realtime', () => ({
  sendTypingEvent: jest.fn().mockResolvedValue(undefined),
}))

// Mock toast
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
  },
}))

describe('MessageInput Component', () => {
  const mockOnSend = jest.fn().mockResolvedValue(undefined)
  const mockOnTyping = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should render message input', () => {
    render(
      <MessageInput
        onSend={mockOnSend}
        currentUserId="user-1"
        otherUserId="user-2"
      />
    )

    expect(screen.getByPlaceholderText('Введите сообщение...')).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('should accept custom placeholder', () => {
    render(
      <MessageInput
        onSend={mockOnSend}
        placeholder="Custom placeholder"
        currentUserId="user-1"
        otherUserId="user-2"
      />
    )

    expect(screen.getByPlaceholderText('Custom placeholder')).toBeInTheDocument()
  })

  it('should disable send button when input is empty', () => {
    render(
      <MessageInput
        onSend={mockOnSend}
        currentUserId="user-1"
        otherUserId="user-2"
      />
    )

    const sendButton = screen.getByRole('button')
    expect(sendButton).toBeDisabled()
  })

  it('should enable send button when input has content', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <MessageInput
        onSend={mockOnSend}
        currentUserId="user-1"
        otherUserId="user-2"
      />
    )

    const textarea = screen.getByPlaceholderText('Введите сообщение...')
    await user.type(textarea, 'Test message')

    const sendButton = screen.getByRole('button')
    expect(sendButton).not.toBeDisabled()
  })

  it('should call onSend when send button is clicked', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <MessageInput
        onSend={mockOnSend}
        currentUserId="user-1"
        otherUserId="user-2"
      />
    )

    const textarea = screen.getByPlaceholderText('Введите сообщение...')
    await user.type(textarea, 'Test message')

    const sendButton = screen.getByRole('button')
    await user.click(sendButton)

    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith('Test message')
    })
  })

  it('should send message on Enter key press', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <MessageInput
        onSend={mockOnSend}
        currentUserId="user-1"
        otherUserId="user-2"
      />
    )

    const textarea = screen.getByPlaceholderText('Введите сообщение...')
    await user.type(textarea, 'Test message{Enter}')

    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith('Test message')
    })
  })

  it('should not send message on Shift+Enter', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <MessageInput
        onSend={mockOnSend}
        currentUserId="user-1"
        otherUserId="user-2"
      />
    )

    const textarea = screen.getByPlaceholderText('Введите сообщение...')
    await user.type(textarea, 'Test message')
    await user.keyboard('{Shift>}{Enter}{/Shift}')

    expect(mockOnSend).not.toHaveBeenCalled()
  })

  it('should clear input after sending', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <MessageInput
        onSend={mockOnSend}
        currentUserId="user-1"
        otherUserId="user-2"
      />
    )

    const textarea = screen.getByPlaceholderText('Введите сообщение...')
    await user.type(textarea, 'Test message')

    const sendButton = screen.getByRole('button')
    await user.click(sendButton)

    await waitFor(() => {
      expect(textarea).toHaveValue('')
    })
  })

  it('should be disabled when disabled prop is true', () => {
    render(
      <MessageInput
        onSend={mockOnSend}
        disabled={true}
        currentUserId="user-1"
        otherUserId="user-2"
      />
    )

    const textarea = screen.getByPlaceholderText('Введите сообщение...')
    const sendButton = screen.getByRole('button')

    expect(textarea).toBeDisabled()
    expect(sendButton).toBeDisabled()
  })

  it('should call onTyping when typing', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <MessageInput
        onSend={mockOnSend}
        onTyping={mockOnTyping}
        currentUserId="user-1"
        otherUserId="user-2"
      />
    )

    const textarea = screen.getByPlaceholderText('Введите сообщение...')
    await user.type(textarea, 'T')

    expect(mockOnTyping).toHaveBeenCalled()
  })

  it('should respect maxLength', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <MessageInput
        onSend={mockOnSend}
        currentUserId="user-1"
        otherUserId="user-2"
      />
    )

    const textarea = screen.getByPlaceholderText('Введите сообщение...')
    expect(textarea).toHaveAttribute('maxLength', '1000')
  })
})

