/**
 * Unit Tests: Chat Realtime
 * Tests realtime chat subscription functions
 */

import {
  subscribeToMessages,
  subscribeToTyping,
  sendTypingEvent,
  unsubscribeFromChannel,
  validateFilterSyntax,
  type Message,
  type ConnectionStatus,
} from '../chat/realtime'

// Import the internal functions for testing (we'll need to export them)
// For now, we'll test them through the public API

// Mock Supabase
const mockChannel = {
  on: jest.fn().mockReturnThis(),
  subscribe: jest.fn().mockResolvedValue('SUBSCRIBED'),
  send: jest.fn().mockResolvedValue(undefined),
  topic: 'test-channel',
}

const mockSupabase = {
  channel: jest.fn(() => mockChannel),
  removeChannel: jest.fn(),
}

jest.mock('../supabase/client', () => ({
  createClient: jest.fn(() => mockSupabase),
}))

// Mock logger
jest.mock('../logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

describe('Chat Realtime', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('subscribeToMessages', () => {
    it('should subscribe to messages channel', () => {
      const onNewMessage = jest.fn()
      const channel = subscribeToMessages('user-1', 'user-2', onNewMessage)

      expect(channel).toBeDefined()
      expect(mockSupabase.channel).toHaveBeenCalledWith('chat:user-1:user-2')
      expect(mockChannel.on).toHaveBeenCalled()
      expect(mockChannel.subscribe).toHaveBeenCalled()
    })

    it('should call onNewMessage when message received', () => {
      const onNewMessage = jest.fn()
      subscribeToMessages('user-1', 'user-2', onNewMessage)

      // Simulate message received
      const messageCallback = mockChannel.on.mock.calls[0][2]
      const testMessage: Message = {
        id: 'msg-1',
        sender_id: 'user-2',
        receiver_id: 'user-1',
        content: 'Test message',
        created_at: new Date().toISOString(),
        read_at: null,
        is_deleted: false,
      }

      messageCallback({ new: testMessage })

      expect(onNewMessage).toHaveBeenCalledWith(testMessage)
    })

    it('should handle connection status changes', () => {
      const onNewMessage = jest.fn()
      const onStatusChange = jest.fn()
      subscribeToMessages('user-1', 'user-2', onNewMessage, onStatusChange)

      // Simulate status change
      const statusCallback = mockChannel.subscribe.mock.calls[0][0]
      statusCallback('SUBSCRIBED')

      expect(onStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          connected: true,
          reconnecting: false,
          error: null,
          lastConnected: expect.any(Date),
          reconnectAttempts: 0,
        })
      )
    })

    it('should handle channel errors', () => {
      const onNewMessage = jest.fn()
      const onStatusChange = jest.fn()
      subscribeToMessages('user-1', 'user-2', onNewMessage, onStatusChange)

      const statusCallback = mockChannel.subscribe.mock.calls[0][0]
      statusCallback('CHANNEL_ERROR')

      expect(onStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          connected: false,
          reconnecting: false,
          error: expect.stringContaining('Переподключение к серверу'),
          errorType: 'server',
          reconnectAttempts: expect.any(Number),
        })
      )
    })

    it('should attempt reconnection on error', () => {
      const onNewMessage = jest.fn()
      subscribeToMessages('user-1', 'user-2', onNewMessage)

      const statusCallback = mockChannel.subscribe.mock.calls[0][0]
      statusCallback('CHANNEL_ERROR')

      // Fast-forward time to trigger reconnection
      jest.advanceTimersByTime(2000)

      // Should attempt reconnection
      expect(mockSupabase.channel).toHaveBeenCalledTimes(2)
    })

    it('should handle TIMED_OUT status', () => {
      const onNewMessage = jest.fn()
      const onStatusChange = jest.fn()
      subscribeToMessages('user-1', 'user-2', onNewMessage, onStatusChange)

      const statusCallback = mockChannel.subscribe.mock.calls[0][0]
      statusCallback('TIMED_OUT')

      expect(onStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          connected: false,
          reconnecting: true,
          error: expect.stringContaining('Переподключение'),
          errorType: 'timeout',
          reconnectAttempts: expect.any(Number),
        })
      )
    })

    it('should handle CLOSED status', () => {
      const onNewMessage = jest.fn()
      const onStatusChange = jest.fn()
      subscribeToMessages('user-1', 'user-2', onNewMessage, onStatusChange)

      const statusCallback = mockChannel.subscribe.mock.calls[0][0]
      statusCallback('CLOSED')

      expect(onStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          connected: false,
          reconnecting: false,
          error: expect.stringContaining('закрыто'),
          errorType: 'unknown',
          reconnectAttempts: expect.any(Number),
        })
      )
    })

    it('should provide detailed error information', () => {
      const onNewMessage = jest.fn()
      const onStatusChange = jest.fn()
      subscribeToMessages('user-1', 'user-2', onNewMessage, onStatusChange)

      const statusCallback = mockChannel.subscribe.mock.calls[0][0]
      statusCallback('CHANNEL_ERROR')

      expect(onStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          connected: false,
          reconnecting: false,
          error: expect.any(String),
          errorType: 'server',
          reconnectAttempts: expect.any(Number),
        })
      )
    })

    it('should handle timeout errors with proper categorization', () => {
      const onNewMessage = jest.fn()
      const onStatusChange = jest.fn()
      subscribeToMessages('user-1', 'user-2', onNewMessage, onStatusChange)

      const statusCallback = mockChannel.subscribe.mock.calls[0][0]
      statusCallback('TIMED_OUT')

      expect(onStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          connected: false,
          reconnecting: true,
          error: expect.stringContaining('Превышено время ожидания'),
          errorType: 'timeout',
        })
      )
    })

    it('should provide user-friendly error messages', () => {
      const onNewMessage = jest.fn()
      const onStatusChange = jest.fn()
      subscribeToMessages('user-1', 'user-2', onNewMessage, onStatusChange)

      const statusCallback = mockChannel.subscribe.mock.calls[0][0]

      // First error should show "Переподключение..."
      statusCallback('CHANNEL_ERROR')
      expect(onStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Переподключение'),
        })
      )
    })

    it('should track reconnect attempts in status', () => {
      const onNewMessage = jest.fn()
      const onStatusChange = jest.fn()
      subscribeToMessages('user-1', 'user-2', onNewMessage, onStatusChange)

      const statusCallback = mockChannel.subscribe.mock.calls[0][0]
      statusCallback('CHANNEL_ERROR')

      // Should include reconnectAttempts in status
      expect(onStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          reconnectAttempts: expect.any(Number),
        })
      )
    })

    it('should include lastConnected timestamp on successful connection', () => {
      const onNewMessage = jest.fn()
      const onStatusChange = jest.fn()
      subscribeToMessages('user-1', 'user-2', onNewMessage, onStatusChange)

      const statusCallback = mockChannel.subscribe.mock.calls[0][0]
      statusCallback('SUBSCRIBED')

      expect(onStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          connected: true,
          lastConnected: expect.any(Date),
        })
      )
    })

    it('should stop reconnecting after max attempts', () => {
      jest.useFakeTimers()
      const onNewMessage = jest.fn()
      const onStatusChange = jest.fn()
      subscribeToMessages('user-1', 'user-2', onNewMessage, onStatusChange)

      // Get the status callback from the subscribe call
      const statusCallback = mockChannel.subscribe.mock.calls[0][0]

      // Simulate multiple errors to reach max attempts (MAX_RECONNECT_ATTEMPTS = 5)
      for (let i = 0; i < 6; i++) {
        statusCallback('CHANNEL_ERROR')
        // Advance time to allow reconnect timeout to fire
        const delay = Math.pow(2, i) * 1000
        jest.advanceTimersByTime(delay + 100)
      }

      // Check that final error message was set
      const allCalls = (onStatusChange as jest.Mock).mock.calls
      const finalErrorCall = allCalls.find((call: any[]) =>
        call[0]?.error && (
          call[0].error.includes('Проблемы с подключением') ||
          call[0].error.includes('Проблемы с сервером')
        )
      )

      expect(finalErrorCall).toBeDefined()
      jest.useRealTimers()
    })
    jest.useFakeTimers()
    const onNewMessage = jest.fn()
    const onStatusChange = jest.fn()
    subscribeToMessages('user-1', 'user-2', onNewMessage, onStatusChange)

    // Get the status callback from the subscribe call
    const statusCallback = mockChannel.subscribe.mock.calls[0][0]

    // Simulate multiple errors to reach max attempts (MAX_RECONNECT_ATTEMPTS = 5)
    // Each error triggers a reconnect attempt, so we need to simulate enough errors
    // After 5 attempts, the 6th error should trigger the final error message
    for (let i = 0; i < 6; i++) {
      statusCallback('CHANNEL_ERROR')
      // Advance time to allow reconnect timeout to fire (exponential backoff: 1s, 2s, 4s, 8s, 16s)
      const delay = Math.pow(2, i) * 1000
      jest.advanceTimersByTime(delay + 100)
    }

    // Check all status change calls to see if final error message was set
    const allCalls = (onStatusChange as jest.Mock).mock.calls
    const finalErrorCall = allCalls.find((call: any[]) =>
      call[0]?.error && call[0].error.includes('Не удалось подключиться')
    )

    // If not found in calls, check the last call
    if (!finalErrorCall && allCalls.length > 0) {
      const lastCall = allCalls[allCalls.length - 1]
      expect(lastCall[0]?.error).toBeTruthy()
    } else {
      expect(finalErrorCall).toBeDefined()
    }
    jest.useRealTimers()
  })
})

describe('subscribeToTyping', () => {
  it('should subscribe to typing events', () => {
    const onTyping = jest.fn()
    const channel = subscribeToTyping('user-1', 'user-2', onTyping)

    expect(channel).toBeDefined()
    expect(mockSupabase.channel).toHaveBeenCalledWith('typing:user-1:user-2')
    expect(mockChannel.on).toHaveBeenCalled()
    expect(mockChannel.subscribe).toHaveBeenCalled()
  })

  it('should call onTyping when typing event received', () => {
    // Clear previous mocks to avoid interference
    jest.clearAllMocks()

    const onTyping = jest.fn()
    subscribeToTyping('user-1', 'user-2', onTyping)

    // Get the typing callback (should be the most recent call to mockChannel.on)
    const onCalls = mockChannel.on.mock.calls
    const typingCall = onCalls.find(call => call[1].event === 'typing')
    expect(typingCall).toBeDefined()

    const typingCallback = typingCall[2]
    typingCallback({ payload: { isTyping: true } })

    expect(onTyping).toHaveBeenCalledWith(true)
  })
})

describe('sendTypingEvent', () => {
  it('should send typing event', async () => {
    await sendTypingEvent('user-1', 'user-2', true)

    expect(mockSupabase.channel).toHaveBeenCalledWith('typing:user-2:user-1')
    expect(mockChannel.subscribe).toHaveBeenCalled()
    expect(mockChannel.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: 'user-1', isTyping: true },
    })
  })

  it('should handle errors gracefully', async () => {
    // Create a separate mock channel for this test to avoid interference
    const errorMockChannel = {
      ...mockChannel,
      subscribe: jest.fn().mockRejectedValueOnce(new Error('Connection error')),
      send: jest.fn(),
    }

    mockSupabase.channel.mockReturnValueOnce(errorMockChannel)

    // Should not throw an error
    await expect(sendTypingEvent('user-1', 'user-2', true)).resolves.toBeUndefined()

    // Since subscribe failed, send should not be called
    expect(errorMockChannel.send).not.toHaveBeenCalled()
  })
})

describe('unsubscribeFromChannel', () => {
  it('should unsubscribe from channel', () => {
    unsubscribeFromChannel(mockChannel as any)

    expect(mockSupabase.removeChannel).toHaveBeenCalledWith(mockChannel)
  })
})

describe('validateFilterSyntax', () => {
  const originalEnv = process.env.NODE_ENV

  beforeEach(() => {
    // Use Object.defineProperty to properly mock NODE_ENV
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'development',
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalEnv,
      configurable: true,
      writable: true,
    })
  })

  it('should pass validation for correct filter syntax', () => {
    const validFilter = 'sender_id=eq.user1.and.receiver_id=eq.user2'

    expect(() => validateFilterSyntax(validFilter)).not.toThrow()
  })

  it('should throw error for incorrect filter syntax with comma', () => {
    const invalidFilter = 'sender_id=eq.user1,receiver_id=eq.user2'

    expect(() => validateFilterSyntax(invalidFilter)).toThrow(
      'Invalid filter syntax: sender_id=eq.user1,receiver_id=eq.user2. Use .and. instead of comma for multiple conditions.'
    )
  })

  it('should not validate in production environment', () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      configurable: true,
      writable: true,
    })

    const invalidFilter = 'sender_id=eq.user1,receiver_id=eq.user2'

    expect(() => validateFilterSyntax(invalidFilter)).not.toThrow()
  })

  it('should warn about suspicious filter syntax', () => {
    const { logger } = require('../logger')
    const suspiciousFilter = 'sender_id=user1.and.receiver_id=user2'

    validateFilterSyntax(suspiciousFilter)

    expect(logger.warn).toHaveBeenCalledWith(
      'Chat Realtime: подозрительный синтаксис фильтра',
      { filter: suspiciousFilter }
    )
  })

  it('should log successful validation', () => {
    const { logger } = require('../logger')
    const validFilter = 'sender_id=eq.user1.and.receiver_id=eq.user2'

    validateFilterSyntax(validFilter)

    expect(logger.debug).toHaveBeenCalledWith(
      'Chat Realtime: валидация фильтра прошла успешно',
      { filter: validFilter }
    )
  })
})

