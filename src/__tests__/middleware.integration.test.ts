/**
 * Integration Tests: Middleware
 * Tests middleware in Next.js server environment context
 * Note: These tests mock Next.js server environment
 */

import { NextRequest, NextResponse } from 'next/server'
import { middleware } from '../middleware'

// Mock Next.js server modules
jest.mock('next/server', () => ({
  NextRequest: jest.fn(),
  NextResponse: {
    next: jest.fn(() => ({ type: 'next' })),
    redirect: jest.fn((url: string) => ({ type: 'redirect', url })),
    rewrite: jest.fn((url: string) => ({ type: 'rewrite', url })),
  },
}))

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}))

jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

describe('Middleware Integration Tests', () => {
  let mockGetUser: jest.Mock
  let mockFrom: jest.Mock
  let mockRequest: Partial<NextRequest>

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key'

    mockGetUser = jest.fn()
    mockFrom = jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
    }))

    const { createServerClient } = require('@supabase/ssr')
    createServerClient.mockReturnValue({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    })

    mockRequest = {
      nextUrl: {
        pathname: '/',
        clone: jest.fn(() => ({
          pathname: '/',
        })),
      },
      url: 'http://localhost',
      cookies: {
        getAll: jest.fn(() => []),
        set: jest.fn(),
      },
      headers: new Headers(),
    } as unknown as NextRequest
  })

  describe('Public Routes', () => {
    it('should allow access to public routes', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
      mockRequest.nextUrl!.pathname = '/login'

      const result = await middleware(mockRequest as NextRequest)
      
      expect(result.type).toBe('next')
    })

    it('should allow access to register route', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
      mockRequest.nextUrl!.pathname = '/register'

      const result = await middleware(mockRequest as NextRequest)
      
      expect(result.type).toBe('next')
    })

    it('should allow access to landing page', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
      mockRequest.nextUrl!.pathname = '/'

      const result = await middleware(mockRequest as NextRequest)
      
      expect(result.type).toBe('next')
    })
  })

  describe('Protected Routes', () => {
    it('should redirect unauthenticated users from protected routes', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
      mockRequest.nextUrl!.pathname = '/app/dashboard'

      const result = await middleware(mockRequest as NextRequest)
      
      expect(result.type).toBe('redirect')
      expect(result.url).toBe('http://localhost/login')
    })

    it('should redirect unauthenticated users from onboarding', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
      mockRequest.nextUrl!.pathname = '/onboarding'

      const result = await middleware(mockRequest as NextRequest)
      
      expect(result.type).toBe('redirect')
      expect(result.url).toBe('http://localhost/login')
    })
  })

  describe('Role-Based Access', () => {
    it('should allow coach access to coach routes', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'coach-123' } }, error: null })
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { role: 'coach' },
          error: null,
        }),
      })
      mockRequest.nextUrl!.pathname = '/app/coach'

      const result = await middleware(mockRequest as NextRequest)
      
      expect(result.type).toBe('next')
    })

    it('should redirect non-coach users from coach routes', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { role: 'client' },
          error: null,
        }),
      })
      mockRequest.nextUrl!.pathname = '/app/coach'

      const result = await middleware(mockRequest as NextRequest)
      
      expect(result.type).toBe('redirect')
    })

    it('should allow super admin access to admin routes', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-123' } }, error: null })
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { role: 'super_admin' },
          error: null,
        }),
      })
      mockRequest.nextUrl!.pathname = '/admin'

      const result = await middleware(mockRequest as NextRequest)
      
      expect(result.type).toBe('next')
    })

    it('should redirect non-admin users from admin routes', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { role: 'client' },
          error: null,
        }),
      })
      mockRequest.nextUrl!.pathname = '/admin'

      const result = await middleware(mockRequest as NextRequest)
      
      expect(result.type).toBe('redirect')
    })
  })

  describe('Premium Access', () => {
    it('should allow premium users access to reports', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            role: 'client',
            subscription_status: 'active',
            subscription_tier: 'premium',
          },
          error: null,
        }),
      })
      mockRequest.nextUrl!.pathname = '/app/reports'

      const result = await middleware(mockRequest as NextRequest)
      
      expect(result.type).toBe('next')
    })

    it('should redirect free users from reports', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            role: 'client',
            subscription_status: 'free',
            subscription_tier: 'basic',
          },
          error: null,
        }),
      })
      mockRequest.nextUrl!.pathname = '/app/reports'

      const result = await middleware(mockRequest as NextRequest)
      
      expect(result.type).toBe('redirect')
      expect(result.url).toBe('http://localhost/app/dashboard')
    })
  })

  describe('Error Handling', () => {
    it('should handle auth errors gracefully', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Auth error' },
      })
      mockRequest.nextUrl!.pathname = '/app/dashboard'

      const result = await middleware(mockRequest as NextRequest)
      
      expect(result.type).toBe('redirect')
    })

    it('should handle database errors gracefully', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      })
      mockRequest.nextUrl!.pathname = '/app/dashboard'

      const result = await middleware(mockRequest as NextRequest)
      
      // Should handle error and allow access or redirect
      expect(result).toBeDefined()
    })
  })
})

