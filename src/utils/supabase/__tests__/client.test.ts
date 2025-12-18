/**
 * Unit Tests: Supabase Client
 * Tests client creation and configuration
 */

import { createClient } from '../client'

// Mock @supabase/ssr
jest.mock('@supabase/ssr', () => ({
  createBrowserClient: jest.fn(() => ({
    from: jest.fn(),
    auth: {
      getUser: jest.fn(),
      signOut: jest.fn(),
    },
  })),
}))

describe('Supabase Client', () => {
  beforeEach(() => {
    // Reset environment
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  })

  it('should create client with environment variables', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key'

    const client = createClient()
    expect(client).toBeDefined()
  })

  it('should handle missing environment variables gracefully', () => {
    // Client should still be created (will fail at runtime if used)
    const client = createClient()
    expect(client).toBeDefined()
  })
})

