/**
 * Тесты для проверки подписок с учетом subscription_end_date
 */

import { hasActiveSubscription, type UserProfile } from '../profile'

describe('Subscription Logic', () => {
  describe('hasActiveSubscription', () => {
    it('should return false for null profile', () => {
      expect(hasActiveSubscription(null)).toBe(false)
    })

    it('should return true for active subscription without end date', () => {
      const profile: UserProfile = {
        id: '1',
        role: 'client',
        subscription_status: 'active',
        subscription_tier: 'premium',
        subscription_end_date: null,
      }
      expect(hasActiveSubscription(profile)).toBe(true)
    })

    it('should return true for active subscription with future end date', () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 30)

      const profile: UserProfile = {
        id: '1',
        role: 'client',
        subscription_status: 'active',
        subscription_tier: 'premium',
        subscription_end_date: futureDate.toISOString(),
      }
      expect(hasActiveSubscription(profile)).toBe(true)
    })

    it('should return false for active subscription with past end date', () => {
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 1)

      const profile: UserProfile = {
        id: '1',
        role: 'client',
        subscription_status: 'active',
        subscription_tier: 'premium',
        subscription_end_date: pastDate.toISOString(),
      }
      expect(hasActiveSubscription(profile)).toBe(false)
    })

    it('should return false for cancelled subscription', () => {
      const profile: UserProfile = {
        id: '1',
        role: 'client',
        subscription_status: 'cancelled',
        subscription_tier: 'premium',
        subscription_end_date: null,
      }
      expect(hasActiveSubscription(profile)).toBe(false)
    })

    it('should return false for free subscription', () => {
      const profile: UserProfile = {
        id: '1',
        role: 'client',
        subscription_status: 'free',
        subscription_tier: 'basic',
        subscription_end_date: null,
      }
      expect(hasActiveSubscription(profile)).toBe(false)
    })

    it('should return false for subscription expiring today', () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const profile: UserProfile = {
        id: '1',
        role: 'client',
        subscription_status: 'active',
        subscription_tier: 'premium',
        subscription_end_date: today.toISOString(),
      }
      // Если дата истечения сегодня, подписка уже неактивна
      expect(hasActiveSubscription(profile)).toBe(false)
    })

    it('should return true for subscription expiring tomorrow', () => {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(23, 59, 59, 999)

      const profile: UserProfile = {
        id: '1',
        role: 'client',
        subscription_status: 'active',
        subscription_tier: 'premium',
        subscription_end_date: tomorrow.toISOString(),
      }
      expect(hasActiveSubscription(profile)).toBe(true)
    })
  })
})
