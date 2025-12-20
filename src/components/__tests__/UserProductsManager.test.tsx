/**
 * Component Tests: UserProductsManager
 * Tests user products manager component
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UserProductsManager from '../products/UserProductsManager'

// Mock Supabase
const mockFrom = jest.fn()

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
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

// Mock toast
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

describe('UserProductsManager Component', () => {
  const mockProducts = [
    {
      id: '1',
      user_id: 'user-123',
      name: 'Test Product',
      calories_per_100g: 250,
      protein_per_100g: 20,
      fats_per_100g: 10,
      carbs_per_100g: 30,
      category: 'Test',
      notes: 'Test notes',
      created_at: new Date().toISOString(),
    },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: mockProducts,
        error: null,
      }),
      insert: jest.fn().mockResolvedValue({
        data: [{ id: 'new-id' }],
        error: null,
      }),
      update: jest.fn().mockResolvedValue({
        data: [{ id: '1' }],
        error: null,
      }),
      delete: jest.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    })
  })

  it('should render user products manager', async () => {
    render(<UserProductsManager userId="user-123" />)

    await waitFor(() => {
      expect(screen.queryByText(/загрузка/i)).not.toBeInTheDocument()
    })

    // Component doesn't have a title, but has search input and add button
    expect(screen.getByPlaceholderText(/поиск продуктов|search/i)).toBeInTheDocument()
    expect(screen.getByText(/добавить|add/i)).toBeInTheDocument()
  })

  it('should display products list', async () => {
    render(<UserProductsManager userId="user-123" />)

    await waitFor(() => {
      expect(screen.getByText('Test Product')).toBeInTheDocument()
    })
  })

  it('should show add product button', async () => {
    render(<UserProductsManager userId="user-123" />)

    await waitFor(() => {
      expect(screen.queryByText(/загрузка/i)).not.toBeInTheDocument()
    })

    const addButton = screen.getByText(/добавить|add/i)
    expect(addButton).toBeInTheDocument()
  })

  it('should open add modal when add button is clicked', async () => {
    const user = userEvent.setup()
    render(<UserProductsManager userId="user-123" />)

    await waitFor(() => {
      expect(screen.queryByText(/загрузка/i)).not.toBeInTheDocument()
    })

    const addButton = screen.getByText(/добавить|add/i)
    await user.click(addButton)

    expect(screen.getByText(/название|name/i)).toBeInTheDocument()
  })

  it('should filter products by search query', async () => {
    const user = userEvent.setup()
    render(<UserProductsManager userId="user-123" />)

    await waitFor(() => {
      expect(screen.getByText('Test Product')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/поиск|search/i)
    await user.type(searchInput, 'Test')

    expect(screen.getByText('Test Product')).toBeInTheDocument()
  })

  it('should show edit button for products', async () => {
    render(<UserProductsManager userId="user-123" />)

    await waitFor(() => {
      expect(screen.getByText('Test Product')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByTitle(/редактировать|edit/i)
    expect(editButtons.length).toBeGreaterThan(0)
  })

  it('should show delete button for products', async () => {
    render(<UserProductsManager userId="user-123" />)

    await waitFor(() => {
      expect(screen.getByText('Test Product')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByTitle(/удалить|delete/i)
    expect(deleteButtons.length).toBeGreaterThan(0)
  })

  it('should handle empty products list', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    })

    render(<UserProductsManager userId="user-123" />)

    await waitFor(() => {
      expect(screen.queryByText(/загрузка/i)).not.toBeInTheDocument()
    })

    expect(screen.getByText(/у вас пока нет пользовательских продуктов/i)).toBeInTheDocument()
  })

  it('should handle loading state', () => {
    const { container } = render(<UserProductsManager userId="user-123" />)

    // Component should render
    expect(container.firstChild).toBeInTheDocument()
  })
})

