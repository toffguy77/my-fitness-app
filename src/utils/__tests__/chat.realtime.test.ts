/**
 * Unit Tests: Chat Realtime
 * Tests realtime chat subscription functions
 */

import {
  subscribeToMessages,
  subscribeToTyping,
  sendTypingEvent,
  unsubscribeFromChannel,
  type Message,
  type ConnectionStatus,
} from '../chat/realtime'

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
          error: 'Ошибка подключения',
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
          error: 'Переподключение...',
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
        })
      )
    })

    it('should stop reconnecting after max attempts', () => {
      const onNewMessage = jest.fn()
      const onStatusChange = jest.fn()
      subscribeToMessages('user-1', 'user-2', onNewMessage, onStatusChange)

      const statusCallback = mockChannel.subscribe.mock.calls[0][0]
      
      // Simulate multiple errors to reach max attempts
      for (let i = 0; i < 6; i++) {
        statusCallback('CHANNEL_ERROR')
        jest.advanceTimersByTime(2000)
      }

      // Should eventually stop trying and show error
      expect(onStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Не удалось подключиться. Обновите страницу.',
        })
      )
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
      const onTyping = jest.fn()
      subscribeToTyping('user-1', 'user-2', onTyping)

      // Simulate typing event
      const typingCallback = mockChannel.on.mock.calls[0][2]
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
      mockChannel.subscribe.mockRejectedValueOnce(new Error('Connection error'))

      await sendTypingEvent('user-1', 'user-2', true)

      // Should not throw
      expect(mockChannel.send).not.toHaveBeenCalled()
    })
  })

  describe('unsubscribeFromChannel', () => {
    it('should unsubscribe from channel', () => {
      unsubscribeFromChannel(mockChannel as any)

      expect(mockSupabase.removeChannel).toHaveBeenCalledWith(mockChannel)
    })
  })
})

