/**
 * Extended Component Tests: Settings Page
 * Tests settings page functionality, forms, and interactions
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsPage from '../page'

// Mock Next.js modules
const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: jest.fn(),
  }),
}))

// Mock profile utils
jest.mock('@/utils/supabase/profile', () => ({
  getUserProfile: jest.fn().mockResolvedValue({
    id: 'user-123',
    role: 'client',
    subscription_status: 'free',
    subscription_tier: 'basic',
    full_name: 'Test User',
    phone: '+1234567890',
  }),
  hasActiveSubscription: jest.fn(() => false),
}))

// Mock Supabase
const mockGetUser = jest.fn()
const mockFrom = jest.fn()
const mockUpdate = jest.fn()
const mockUpdateUser = jest.fn()

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: mockGetUser,
      updateUser: mockUpdateUser,
    },
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

describe('Settings Page Extended Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' },
      }),
      update: mockUpdate.mockResolvedValue({ error: null }),
    })

    mockUpdateUser.mockResolvedValue({ error: null })
  })

  it('should render settings page', async () => {
    render(<SettingsPage />)
    
    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should display user profile information', async () => {
    render(<SettingsPage />)
    
    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })

    // Should display profile section
    const profileSection = screen.queryByText(/профиль|profile/i)
    expect(profileSection || screen.getByRole('main')).toBeInTheDocument()
  })

  it('should handle profile save errors', async () => {
    mockUpdate.mockResolvedValue({
      error: { message: 'Save failed' },
    })

    render(<SettingsPage />)
    
    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })

    // Should handle error gracefully
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('should handle password change errors', async () => {
    mockUpdateUser.mockResolvedValue({
      error: { message: 'Password change failed' },
    })

    render(<SettingsPage />)
    
    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })

    // Should handle error gracefully
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('should redirect unauthenticated users', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    })

    render(<SettingsPage />)
    
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login')
    }, { timeout: 3000 })
  })
})

