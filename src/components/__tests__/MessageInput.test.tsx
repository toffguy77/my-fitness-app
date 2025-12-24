/**
 * Component Tests: MessageInput
 * Tests message input component
 */

import { render, screen, waitFor, act } from '@testing-library/react'
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

  it.skip('should enforce rate limiting (10 messages per minute)', async () => {
    jest.useFakeTimers()
    const toast = require('react-hot-toast').default
    
    // Mock Date.now() to return controlled timestamps
    let currentTime = 1000000
    const dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => currentTime)
    
    // Make onSend resolve immediately
    mockOnSend.mockResolvedValue(undefined)
    
    const user = userEvent.setup({ delay: null, advanceTimers: jest.advanceTimersByTime })
    render(
      <MessageInput
        onSend={mockOnSend}
        currentUserId="user-1"
        otherUserId="user-2"
      />
    )

    const textarea = screen.getByPlaceholderText('Введите сообщение...')
    const sendButton = screen.getByRole('button')

    // Send 10 messages quickly (within same minute)
    for (let i = 0; i < 10; i++) {
      // Clear textarea by selecting all and typing new content
      await user.click(textarea)
      await user.keyboard('{Control>}a{/Control}')
      await user.type(textarea, `Message ${i}`)
      await user.click(sendButton)
      
      // Wait a bit for the async operation
      await act(async () => {
        await Promise.resolve()
      })
      
      // Advance time slightly but stay within 1 minute window (60000ms)
      currentTime += 100
      dateNowSpy.mockReturnValue(currentTime)
      jest.advanceTimersByTime(100)
    }

    // Wait for all 10 messages to be sent
    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledTimes(10)
    }, { timeout: 3000 })

    // Try to send 11th message - should be rate limited
    await user.click(textarea)
    await user.keyboard('{Control>}a{/Control}')
    await user.type(textarea, 'Message 11')
    await user.click(sendButton)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Слишком много сообщений')
      )
    }, { timeout: 2000 })

    // Should not have sent the 11th message
    expect(mockOnSend).toHaveBeenCalledTimes(10)
    
    dateNowSpy.mockRestore()
    jest.useRealTimers()
  })

  it('should restore message content on send error', async () => {
    const user = userEvent.setup({ delay: null })
    const failingOnSend = jest.fn().mockRejectedValue(new Error('Send failed'))
    
    render(
      <MessageInput
        onSend={failingOnSend}
        currentUserId="user-1"
        otherUserId="user-2"
      />
    )

    const textarea = screen.getByPlaceholderText('Введите сообщение...')
    await user.type(textarea, 'Test message')
    
    const sendButton = screen.getByRole('button')
    await user.click(sendButton)

    await waitFor(() => {
      expect(failingOnSend).toHaveBeenCalled()
      // Message should be restored in textarea
      expect(textarea).toHaveValue('Test message')
    })
  })
})

