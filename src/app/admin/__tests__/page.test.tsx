/**
 * Component Tests: Admin Page
 * Tests admin panel functionality
 */

import { render, screen } from '@testing-library/react'
import AdminPage from '../page'

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
        data: { user: { id: 'admin-123' } },
        error: null,
      }),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          role: 'super_admin',
        },
        error: null,
      }),
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

describe('Admin Page', () => {
  it('should render admin page', async () => {
    render(<AdminPage />)
    
    // Should show admin title (more specific)
    await screen.findByText(/Панель администратора/i, {}, { timeout: 3000 })
  })
})

