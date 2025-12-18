/**
 * Extended Unit Tests: Supabase Client
 * Tests client creation, error handling, and edge cases
 */

import { createClient } from '../client'

// Mock @supabase/ssr
const mockCreateBrowserClient = jest.fn()

jest.mock('@supabase/ssr', () => ({
  createBrowserClient: jest.fn((...args) => mockCreateBrowserClient(...args)),
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

describe('Supabase Client Extended Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    mockCreateBrowserClient.mockReturnValue({
      from: jest.fn(),
      auth: {
        getUser: jest.fn(),
        signOut: jest.fn(),
      },
    })
  })

  describe('Client Creation', () => {
    it('should create client with valid environment variables', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key-123'

      const client = createClient()
      
      expect(client).toBeDefined()
      expect(mockCreateBrowserClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-key-123'
      )
    })

    it('should throw error when URL is missing', () => {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key'

      expect(() => createClient()).toThrow('Supabase configuration is missing')
    })

    it('should throw error when key is missing', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'

      expect(() => createClient()).toThrow('Supabase configuration is missing')
    })

    it('should throw error when both are missing', () => {
      expect(() => createClient()).toThrow('Supabase configuration is missing')
    })

    it('should handle empty string URL', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = ''
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key'

      expect(() => createClient()).toThrow('Supabase configuration is missing')
    })

    it('should handle empty string key', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ''

      expect(() => createClient()).toThrow('Supabase configuration is missing')
    })
  })

  describe('Client Methods', () => {
    it('should return client with from method', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key'

      const client = createClient()
      
      expect(client).toBeDefined()
      expect(client.from).toBeDefined()
      expect(typeof client.from).toBe('function')
    })

    it('should return client with auth methods', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key'

      const client = createClient()
      
      expect(client.auth).toBeDefined()
      expect(client.auth.getUser).toBeDefined()
      expect(client.auth.signOut).toBeDefined()
    })
  })

  describe('Environment Variables', () => {
    it('should use correct environment variable names', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key'

      createClient()

      expect(mockCreateBrowserClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-key'
      )
    })

    it('should handle different URL formats', () => {
      const urls = [
        'https://test.supabase.co',
        'http://localhost:54321',
        'https://abc123.supabase.co',
      ]

      urls.forEach((url) => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = url
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key'
        
        const client = createClient()
        expect(client).toBeDefined()
      })
    })
  })
})


