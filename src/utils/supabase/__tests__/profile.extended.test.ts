/**
 * Extended Unit Tests: Profile Utilities
 * Tests edge cases, error handling, and additional scenarios
 */

import { createClient } from '../client'
import {
  getUserProfile,
  getCoordinatorClients,
  isSuperAdmin,
  isPremium,
  hasActiveSubscription,
  type UserProfile,
} from '../profile'
import { User } from '@supabase/supabase-js'

jest.mock('../client')

describe('Profile Utilities Extended Tests', () => {
  let mockSupabase: any

  beforeEach(() => {
    jest.clearAllMocks()

    const mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      single: jest.fn(),
      maybeSingle: jest.fn(),
    }

    mockSupabase = {
      from: jest.fn(() => mockQueryBuilder),
    }

    ;(createClient as jest.Mock).mockReturnValue(mockSupabase)
  })

  describe('getUserProfile Extended', () => {
    it('should handle user with minimal data', async () => {
      const mockUser: User = { id: 'user-123' } as User

      const queryBuilder = mockSupabase.from()
      queryBuilder.maybeSingle.mockResolvedValue({
        data: {
          id: 'user-123',
          role: 'client',
        },
        error: null,
      })

      const result = await getUserProfile(mockUser)

      expect(result).toBeDefined()
      expect(result?.id).toBe('user-123')
      expect(result?.role).toBe('client')
    })

    it('should handle user with all fields populated', async () => {
      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
      } as User

      const fullProfile: UserProfile = {
        id: 'user-123',
        email: 'test@example.com',
        full_name: 'Test User',
        phone: '+1234567890',
        role: 'client',
        coordinator_id: 'coordinator-123',
        avatar_url: 'https://example.com/avatar.jpg',
        subscription_status: 'active',
        subscription_tier: 'premium',
        subscription_start_date: '2024-01-01',
        subscription_end_date: '2024-12-31',
        gender: 'male',
        birth_date: '1990-01-01',
        height: 180,
        activity_level: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }

      const queryBuilder = mockSupabase.from()
      queryBuilder.maybeSingle.mockResolvedValue({
        data: fullProfile,
        error: null,
      })

      const result = await getUserProfile(mockUser)

      expect(result).toEqual(fullProfile)
    })

    it('should handle network errors', async () => {
      const mockUser: User = { id: 'user-123' } as User

      const queryBuilder = mockSupabase.from()
      queryBuilder.maybeSingle.mockResolvedValue({
        data: null,
        error: { message: 'Network error', code: 'PGRST301' },
      })

      const result = await getUserProfile(mockUser)

      expect(result).toBeNull()
    })

    it('should handle timeout errors', async () => {
      const mockUser: User = { id: 'user-123' } as User

      const queryBuilder = mockSupabase.from()
      queryBuilder.maybeSingle.mockResolvedValue({
        data: null,
        error: { message: 'Request timeout', code: 'ETIMEDOUT' },
      })

      const result = await getUserProfile(mockUser)

      expect(result).toBeNull()
    })
  })

  describe('getCoordinatorClients Extended', () => {
    it('should handle coordinator with no clients', async () => {
      const queryBuilder = mockSupabase.from()
      queryBuilder.order.mockResolvedValue({
        data: [],
        error: null,
      })

      const result = await getCoordinatorClients('coordinator-123')

      expect(result).toEqual([])
    })

    it('should handle coordinator with many clients', async () => {
      const manyClients: UserProfile[] = Array.from({ length: 50 }, (_, i) => ({
        id: `client-${i}`,
        full_name: `Client ${i}`,
        role: 'client',
        coordinator_id: 'coordinator-123',
      }))

      const queryBuilder = mockSupabase.from()
      queryBuilder.order.mockResolvedValue({
        data: manyClients,
        error: null,
      })

      const result = await getCoordinatorClients('coordinator-123')

      expect(result).toHaveLength(50)
    })

    it('should order clients by full_name ascending', async () => {
      const clients: UserProfile[] = [
        { id: '1', full_name: 'Zebra', role: 'client', coordinator_id: 'coordinator-123' },
        { id: '2', full_name: 'Alpha', role: 'client', coordinator_id: 'coordinator-123' },
        { id: '3', full_name: 'Beta', role: 'client', coordinator_id: 'coordinator-123' },
      ]

      const queryBuilder = mockSupabase.from()
      queryBuilder.order.mockResolvedValue({
        data: clients,
        error: null,
      })

      await getCoordinatorClients('coordinator-123')

      expect(queryBuilder.order).toHaveBeenCalledWith('full_name', { ascending: true })
    })
  })

  describe('isSuperAdmin Extended', () => {
    it('should handle all role types', async () => {
      const roles: Array<'client' | 'coordinator' | 'super_admin'> = ['client', 'coordinator', 'super_admin']

      for (const role of roles) {
        const queryBuilder = mockSupabase.from()
        queryBuilder.single.mockResolvedValue({
          data: { role },
          error: null,
        })

        const result = await isSuperAdmin('user-123')

        expect(result).toBe(role === 'super_admin')
      }
    })

    it('should handle null data response', async () => {
      const queryBuilder = mockSupabase.from()
      queryBuilder.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      })

      const result = await isSuperAdmin('user-123')

      expect(result).toBe(false)
    })
  })

  describe('isPremium Extended', () => {
    it('should handle all subscription statuses', async () => {
      const statuses: Array<'free' | 'active' | 'cancelled' | 'past_due'> = [
        'free',
        'active',
        'cancelled',
        'past_due',
      ]

      for (const status of statuses) {
        const queryBuilder = mockSupabase.from()
        queryBuilder.single.mockResolvedValue({
          data: {
            subscription_status: status,
            subscription_tier: 'premium',
          },
          error: null,
        })

        const result = await isPremium('user-123')

        expect(result).toBe(status === 'active')
      }
    })

    it('should handle all subscription tiers', async () => {
      const tiers: Array<'basic' | 'premium'> = ['basic', 'premium']

      for (const tier of tiers) {
        const queryBuilder = mockSupabase.from()
        queryBuilder.single.mockResolvedValue({
          data: {
            subscription_status: 'active',
            subscription_tier: tier,
          },
          error: null,
        })

        const result = await isPremium('user-123')

        expect(result).toBe(tier === 'premium')
      }
    })

    it('should require both active status and premium tier', async () => {
      const queryBuilder = mockSupabase.from()
      queryBuilder.single.mockResolvedValue({
        data: {
          subscription_status: 'active',
          subscription_tier: 'basic',
        },
        error: null,
      })

      const result = await isPremium('user-123')

      expect(result).toBe(false)
    })
  })

  describe('hasActiveSubscription Extended', () => {
    it('should handle all subscription statuses', () => {
      const statuses: Array<'free' | 'active' | 'cancelled' | 'past_due'> = [
        'free',
        'active',
        'cancelled',
        'past_due',
      ]

      statuses.forEach((status) => {
        const profile: UserProfile = {
          id: 'user-123',
          role: 'client',
          subscription_status: status,
        }

        const result = hasActiveSubscription(profile)

        expect(result).toBe(status === 'active')
      })
    })

    it('should handle undefined subscription_status', () => {
      const profile: UserProfile = {
        id: 'user-123',
        role: 'client',
        subscription_status: undefined,
      }

      const result = hasActiveSubscription(profile)

      expect(result).toBe(false)
    })

    it('should handle null subscription_status', () => {
      const profile: UserProfile = {
        id: 'user-123',
        role: 'client',
        subscription_status: null as any,
      }

      const result = hasActiveSubscription(profile)

      expect(result).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty string user ID', async () => {
      const mockUser: User = { id: '' } as User

      const queryBuilder = mockSupabase.from()
      queryBuilder.maybeSingle.mockResolvedValue({
        data: null,
        error: { message: 'Invalid ID' },
      })

      const result = await getUserProfile(mockUser)

      expect(result).toBeNull()
    })

    it('should handle very long user ID', async () => {
      const longId = 'a'.repeat(1000)
      const mockUser: User = { id: longId } as User

      const queryBuilder = mockSupabase.from()
      queryBuilder.maybeSingle.mockResolvedValue({
        data: { id: longId, role: 'client' },
        error: null,
      })

      const result = await getUserProfile(mockUser)

      expect(result?.id).toBe(longId)
    })

    it('should handle special characters in user ID', async () => {
      const specialId = 'user-123-!@#$%^&*()'
      const mockUser: User = { id: specialId } as User

      const queryBuilder = mockSupabase.from()
      queryBuilder.maybeSingle.mockResolvedValue({
        data: null,
        error: { message: 'Invalid ID' },
      })

      const result = await getUserProfile(mockUser)

      expect(result).toBeNull()
    })
  })
})


