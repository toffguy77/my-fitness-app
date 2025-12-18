import { createClient } from '../client'
import {
  getUserProfile,
  getCoachClients,
  isSuperAdmin,
  isPremium,
  hasActiveSubscription,
  type UserProfile,
} from '../profile'
import { User } from '@supabase/supabase-js'

// Mock the client
jest.mock('../client')

describe('Profile Utilities', () => {
  let mockSupabase: any

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Create a fresh mock for each test
    const mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      single: jest.fn(),
    }

    mockSupabase = {
      from: jest.fn(() => mockQueryBuilder),
    }

    ;(createClient as jest.Mock).mockReturnValue(mockSupabase)
  })

  describe('getUserProfile', () => {
    it('should return user profile successfully', async () => {
      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
      } as User

      const mockProfile: UserProfile = {
        id: 'user-123',
        email: 'test@example.com',
        full_name: 'Test User',
        role: 'client',
      }

      const queryBuilder = mockSupabase.from()
      queryBuilder.single.mockResolvedValue({
        data: mockProfile,
        error: null,
      })

      const result = await getUserProfile(mockUser)

      expect(result).toEqual(mockProfile)
      expect(mockSupabase.from).toHaveBeenCalledWith('profiles')
    })

    it('should return null on error', async () => {
      const mockUser: User = {
        id: 'user-123',
      } as User

      const queryBuilder = mockSupabase.from()
      queryBuilder.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      })

      const result = await getUserProfile(mockUser)

      expect(result).toBeNull()
    })
  })

  describe('getCoachClients', () => {
    it('should return list of clients for a coach', async () => {
      const mockClients: UserProfile[] = [
        {
          id: 'client-1',
          full_name: 'Client One',
          role: 'client',
          coach_id: 'coach-123',
        },
        {
          id: 'client-2',
          full_name: 'Client Two',
          role: 'client',
          coach_id: 'coach-123',
        },
      ]

      const queryBuilder = mockSupabase.from()
      queryBuilder.order.mockResolvedValue({
        data: mockClients,
        error: null,
      })

      const result = await getCoachClients('coach-123')

      expect(result).toEqual(mockClients)
      expect(mockSupabase.from).toHaveBeenCalledWith('profiles')
    })

    it('should return empty array on error', async () => {
      const queryBuilder = mockSupabase.from()
      queryBuilder.order.mockResolvedValue({
        data: null,
        error: { message: 'Error' },
      })

      const result = await getCoachClients('coach-123')

      expect(result).toEqual([])
    })
  })

  describe('isSuperAdmin', () => {
    it('should return true for super_admin role', async () => {
      const queryBuilder = mockSupabase.from()
      queryBuilder.single.mockResolvedValue({
        data: { role: 'super_admin' },
        error: null,
      })

      const result = await isSuperAdmin('user-123')

      expect(result).toBe(true)
    })

    it('should return false for non-admin role', async () => {
      const queryBuilder = mockSupabase.from()
      queryBuilder.single.mockResolvedValue({
        data: { role: 'client' },
        error: null,
      })

      const result = await isSuperAdmin('user-123')

      expect(result).toBe(false)
    })

    it('should return false on error', async () => {
      const queryBuilder = mockSupabase.from()
      queryBuilder.single.mockResolvedValue({
        data: null,
        error: { message: 'Error' },
      })

      const result = await isSuperAdmin('user-123')

      expect(result).toBe(false)
    })
  })

  describe('isPremium', () => {
    it('should return true for active premium subscription', async () => {
      const queryBuilder = mockSupabase.from()
      queryBuilder.single.mockResolvedValue({
        data: {
          subscription_status: 'active',
          subscription_tier: 'premium',
        },
        error: null,
      })

      const result = await isPremium('user-123')

      expect(result).toBe(true)
    })

    it('should return false for non-premium subscription', async () => {
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

    it('should return false for inactive subscription', async () => {
      const queryBuilder = mockSupabase.from()
      queryBuilder.single.mockResolvedValue({
        data: {
          subscription_status: 'cancelled',
          subscription_tier: 'premium',
        },
        error: null,
      })

      const result = await isPremium('user-123')

      expect(result).toBe(false)
    })
  })

  describe('hasActiveSubscription', () => {
    it('should return true for active subscription', () => {
      const profile: UserProfile = {
        id: 'user-123',
        role: 'client',
        subscription_status: 'active',
      }

      const result = hasActiveSubscription(profile)

      expect(result).toBe(true)
    })

    it('should return false for inactive subscription', () => {
      const profile: UserProfile = {
        id: 'user-123',
        role: 'client',
        subscription_status: 'cancelled',
      }

      const result = hasActiveSubscription(profile)

      expect(result).toBe(false)
    })

    it('should return false for null profile', () => {
      const result = hasActiveSubscription(null)

      expect(result).toBe(false)
    })
  })
})

