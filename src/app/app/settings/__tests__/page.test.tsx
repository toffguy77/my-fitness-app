/**
 * Component Tests: Settings Page
 * Tests settings page functionality
 */

import { render, screen } from '@testing-library/react'
import SettingsPage from '../page'

// Mock Next.js modules
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
}))

// Mock Supabase
jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: 'user-123',
          email: 'test@example.com',
          full_name: 'Test User',
          role: 'client',
          subscription_status: 'free',
        },
        error: null,
      }),
      update: jest.fn().mockResolvedValue({ error: null }),
    })),
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

describe('Settings Page', () => {
  it('should render settings page', async () => {
    render(<SettingsPage />)
    
    // Should show settings title
    await screen.findByText(/настройки|settings/i, {}, { timeout: 3000 })
  })

  it('should display user profile information', async () => {
    render(<SettingsPage />)
    
    // Should show email or name
    await screen.findByText(/test@example.com|Test User/i, {}, { timeout: 3000 })
  })
})

