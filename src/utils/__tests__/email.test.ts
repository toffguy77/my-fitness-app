/**
 * Unit Tests: Email Utilities
 * Tests email sending and template functions
 *
 * Note: Email tests are skipped due to Resend mocking complexity.
 * In production, these would be tested with integration tests.
 */

import { sendEmail, type EmailTemplate, type EmailData } from '../email'

// Mock Resend
const mockSend = jest.fn()

jest.mock('resend', () => {
  const MockResend = jest.fn().mockImplementation(() => ({
    emails: {
      send: (...args: any[]) => mockSend(...args),
    },
  }))
  return { Resend: MockResend }
})

// Mock logger
jest.mock('../logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

describe('Email Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.RESEND_API_KEY = 'test-key'
    process.env.RESEND_FROM_EMAIL = 'test@example.com'
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com'
  })

  afterEach(() => {
    delete process.env.RESEND_API_KEY
    delete process.env.RESEND_FROM_EMAIL
    delete process.env.NEXT_PUBLIC_APP_URL
  })

  describe('sendEmail', () => {
    it('should send email successfully', async () => {
      mockSend.mockResolvedValue({
        data: { id: 'email-id' },
        error: null,
      })

      const result = await sendEmail('test@example.com', 'reminder_data_entry', {
        userName: 'Test User',
      })

      expect(result).toBe(true)
      expect(mockSend).toHaveBeenCalled()
    })

    it('should return false if API key is missing', async () => {
      delete process.env.RESEND_API_KEY

      const result = await sendEmail('test@example.com', 'reminder_data_entry')

      expect(result).toBe(false)
      expect(mockSend).not.toHaveBeenCalled()
    })

    it('should return false on send error', async () => {
      mockSend.mockResolvedValue({
        data: null,
        error: { message: 'Send failed' },
      })

      const result = await sendEmail('test@example.com', 'reminder_data_entry')

      expect(result).toBe(false)
    })

    it('should handle exceptions', async () => {
      mockSend.mockRejectedValue(new Error('Network error'))

      const result = await sendEmail('test@example.com', 'reminder_data_entry')

      expect(result).toBe(false)
    })

    it('should send reminder_data_entry email', async () => {
      mockSend.mockResolvedValue({
        data: { id: 'email-id' },
        error: null,
      })

      await sendEmail('test@example.com', 'reminder_data_entry', {
        userName: 'Test User',
      })

      const callArgs = mockSend.mock.calls[0][0]
      expect(callArgs.subject).toContain('Не забудьте')
      expect(callArgs.html).toContain('Test User')
    })

    it('should send curator_note_notification email', async () => {
      mockSend.mockResolvedValue({
        data: { id: 'email-id' },
        error: null,
      })

      await sendEmail('test@example.com', 'curator_note_notification', {
        userName: 'Test User',
        curatorName: 'Curator Name',
        date: '2024-01-15',
        noteContent: 'Test note',
      })

      const callArgs = mockSend.mock.calls[0][0]
      expect(callArgs.subject).toContain('заметка')
      expect(callArgs.html).toContain('Curator Name')
    })

    it('should send subscription_expiring email', async () => {
      mockSend.mockResolvedValue({
        data: { id: 'email-id' },
        error: null,
      })

      await sendEmail('test@example.com', 'subscription_expiring', {
        userName: 'Test User',
        daysRemaining: 3,
      })

      const callArgs = mockSend.mock.calls[0][0]
      expect(callArgs.subject).toContain('истекает')
      expect(callArgs.html).toContain('3')
    })

    it('should send subscription_expired email', async () => {
      mockSend.mockResolvedValue({
        data: { id: 'email-id' },
        error: null,
      })

      await sendEmail('test@example.com', 'subscription_expired', {
        userName: 'Test User',
      })

      const callArgs = mockSend.mock.calls[0][0]
      expect(callArgs.subject).toContain('истекла')
    })

    it('should handle missing userName in templates', async () => {
      mockSend.mockResolvedValue({
        data: { id: 'email-id' },
        error: null,
      })

      await sendEmail('test@example.com', 'reminder_data_entry', {})

      const callArgs = mockSend.mock.calls[0][0]
      expect(callArgs.html).not.toContain('undefined')
    })
  })
})
