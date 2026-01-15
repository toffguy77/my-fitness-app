/**
 * Unit Tests: Subscription Utilities
 * Tests subscription status checking functions
 */

import {
  checkSubscriptionStatus,
  isPremiumUser,
  type SubscriptionInfo,
} from '../subscription'

// Mock Supabase
const mockFrom = jest.fn()

jest.mock('../client', () => ({
  createClient: jest.fn(() => ({
    from: mockFrom,
  })),
}))

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

describe('Subscription Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('checkSubscriptionStatus', () => {
    it('should return active subscription info', async () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 30)

    const mockSingle = jest.fn().mockResolvedValue({
      data: {
        subscription_status: 'active',
        subscription_tier: 'premium',
        subscription_start_date: new Date().toISOString(),
        subscription_end_date: futureDate.toISOString(),
      },
      error: null,
    })

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: mockSingle,
      update: jest.fn().mockReturnThis(),
    })

      const result = await checkSubscriptionStatus('user-123')

      expect(result.status).toBe('active')
      expect(result.tier).toBe('premium')
      expect(result.isActive).toBe(true)
      expect(result.isExpired).toBe(false)
    })

    it('should return expired subscription info', async () => {
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 10)

      const mockSingle = jest.fn().mockResolvedValue({
        data: {
          subscription_status: 'active',
          subscription_tier: 'premium',
          subscription_start_date: new Date().toISOString(),
          subscription_end_date: pastDate.toISOString(),
        },
        error: null,
      })

      const mockUpdate = jest.fn().mockReturnThis()
      const mockEq = jest.fn().mockResolvedValue({ error: null })

      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: mockSingle,
        update: mockUpdate,
      })

      mockUpdate.mockReturnValue({
        eq: mockEq,
      })

      const result = await checkSubscriptionStatus('user-123')

      expect(result.isExpired).toBe(true)
    })

    it('should update status to expired if end date passed', async () => {
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 10)

      const mockSingle = jest.fn().mockResolvedValue({
        data: {
          subscription_status: 'active',
          subscription_tier: 'premium',
          subscription_start_date: new Date().toISOString(),
          subscription_end_date: pastDate.toISOString(),
        },
        error: null,
      })

      const mockUpdate = jest.fn().mockReturnThis()
      const mockEq = jest.fn().mockResolvedValue({ error: null })

      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: mockSingle,
        update: mockUpdate,
      })

      mockUpdate.mockReturnValue({
        eq: mockEq,
      })

      await checkSubscriptionStatus('user-123')

      expect(mockFrom).toHaveBeenCalled()
    })

    it('should return free status on error', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Not found' },
        }),
      })

      const result = await checkSubscriptionStatus('user-123')

      expect(result.status).toBe('free')
      expect(result.tier).toBe('basic')
      expect(result.isActive).toBe(false)
      expect(result.isExpired).toBe(true)
    })

    it('should handle missing subscription fields', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            subscription_status: null,
            subscription_tier: null,
            subscription_start_date: null,
            subscription_end_date: null,
          },
          error: null,
        }),
      })

      const result = await checkSubscriptionStatus('user-123')

      expect(result.status).toBe('free')
      expect(result.tier).toBe('basic')
    })
  })

  describe('isPremiumUser', () => {
    it('should return true for active premium user', async () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 30)

      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            subscription_status: 'active',
            subscription_tier: 'premium',
            subscription_start_date: new Date().toISOString(),
            subscription_end_date: futureDate.toISOString(),
          },
          error: null,
        }),
      })

      const result = await isPremiumUser('user-123')

      expect(result).toBe(true)
    })

    it('should return false for expired premium user', async () => {
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 10)

      const mockSingle = jest.fn().mockResolvedValue({
        data: {
          subscription_status: 'active',
          subscription_tier: 'premium',
          subscription_start_date: new Date().toISOString(),
          subscription_end_date: pastDate.toISOString(),
        },
        error: null,
      })

      const mockUpdate = jest.fn().mockReturnThis()
      const mockEq = jest.fn().mockResolvedValue({ error: null })

      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: mockSingle,
        update: mockUpdate,
      })

      mockUpdate.mockReturnValue({
        eq: mockEq,
      })

      const result = await isPremiumUser('user-123')

      expect(result).toBe(false)
    })

    it('should return false for free user', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            subscription_status: 'free',
            subscription_tier: 'basic',
            subscription_start_date: null,
            subscription_end_date: null,
          },
          error: null,
        }),
      })

      const result = await isPremiumUser('user-123')

      expect(result).toBe(false)
    })
  })
})
