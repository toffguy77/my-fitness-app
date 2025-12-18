/**
 * Unit тесты для email утилиты
 * 
 * Примечание: Эти тесты используют моки, так как Resend API требует реальный API ключ
 */

import { sendEmail, type EmailTemplate, type EmailData } from '../email'

// Мокаем Resend
jest.mock('resend', () => {
  return {
    Resend: jest.fn().mockImplementation(() => ({
      emails: {
        send: jest.fn().mockResolvedValue({
          data: { id: 'test-email-id' },
          error: null,
        }),
      },
    })),
  }
})

// Мокаем logger
jest.mock('../logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}))

describe('Email Utils', () => {
  beforeEach(() => {
    // Устанавливаем переменные окружения для тестов
    process.env.RESEND_API_KEY = 'test-api-key'
    process.env.RESEND_FROM_EMAIL = 'test@example.com'
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('sendEmail', () => {
    it('should send email successfully', async () => {
      const result = await sendEmail('test@example.com', 'reminder_data_entry', {
        userName: 'Test User',
      })
      expect(result).toBe(true)
    })

    it('should return false when RESEND_API_KEY is not set', async () => {
      delete process.env.RESEND_API_KEY
      const result = await sendEmail('test@example.com', 'reminder_data_entry')
      expect(result).toBe(false)
    })

    it('should handle different email templates', async () => {
      const templates: EmailTemplate[] = [
        'reminder_data_entry',
        'coach_note_notification',
        'subscription_expiring',
        'subscription_expired',
      ]

      for (const template of templates) {
        const result = await sendEmail('test@example.com', template, {
          userName: 'Test User',
          date: '2025-01-01',
        })
        expect(result).toBe(true)
      }
    })

    it('should include user data in email', async () => {
      const data: EmailData = {
        userName: 'John Doe',
        date: '2025-01-15',
        coachName: 'Coach Smith',
        daysRemaining: 3,
      }

      const result = await sendEmail('test@example.com', 'coach_note_notification', data)
      expect(result).toBe(true)
    })
  })
})

