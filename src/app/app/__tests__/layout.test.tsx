/**
 * Component Tests: App Layout
 * Tests app layout rendering
 */

import { render, screen, waitFor } from '@testing-library/react'
import AppLayout from '../layout'

// Мокаем зависимости, которые могут вызывать проблемы с памятью
jest.mock('@/hooks/useAnalytics', () => ({
  useAnalytics: jest.fn(),
}))

jest.mock('@/components/SubscriptionBanner', () => {
  return function MockSubscriptionBanner() {
    return null
  }
})

jest.mock('@/components/chat/GlobalChatWidget', () => {
  return function MockGlobalChatWidget() {
    return null
  }
})

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: null },
        error: null,
      }),
    },
  })),
}))

describe('App Layout', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should render app layout with children', async () => {
    render(
      <AppLayout>
        <div>Test Content</div>
      </AppLayout>
    )
    
    await waitFor(() => {
      expect(screen.getByText('Test Content')).toBeInTheDocument()
    })
  })

  it('should render multiple children', async () => {
    render(
      <AppLayout>
        <div>Child 1</div>
        <div>Child 2</div>
      </AppLayout>
    )
    
    await waitFor(() => {
      expect(screen.getByText('Child 1')).toBeInTheDocument()
      expect(screen.getByText('Child 2')).toBeInTheDocument()
    })
  })
})

