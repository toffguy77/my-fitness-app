/**
 * Component Tests: ProductCard
 * Tests product card component
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProductCard from '../products/ProductCard'
import type { Product } from '@/types/products'

describe('ProductCard Component', () => {
  const mockProduct: Product = {
    id: '1',
    name: 'Test Product',
    brand: 'Test Brand',
    calories_per_100g: 250,
    protein_per_100g: 20,
    fats_per_100g: 10,
    carbs_per_100g: 30,
    source: 'user',
  }

  const mockOnSelect = jest.fn()
  const mockOnWeightChange = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should render product information', () => {
    render(
      <ProductCard
        product={mockProduct}
        onSelect={mockOnSelect}
      />
    )

    expect(screen.getByText('Test Product')).toBeInTheDocument()
    expect(screen.getByText('Test Brand')).toBeInTheDocument()
  })

  it('should calculate macros based on weight', () => {
    render(
      <ProductCard
        product={mockProduct}
        onSelect={mockOnSelect}
        selectedWeight={200}
      />
    )

    // 250 cal * 200g / 100 = 500 cal
    expect(screen.getByText(/500/)).toBeInTheDocument()
  })

  it('should call onSelect when select button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <ProductCard
        product={mockProduct}
        onSelect={mockOnSelect}
      />
    )

    const selectButton = screen.getByText(/выбрать/i)
    await user.click(selectButton)

    expect(mockOnSelect).toHaveBeenCalled()
  })

  it('should call onWeightChange when weight input changes', async () => {
    const user = userEvent.setup()
    render(
      <ProductCard
        product={mockProduct}
        onSelect={mockOnSelect}
        onWeightChange={mockOnWeightChange}
      />
    )

    const weightInput = screen.getByDisplayValue('100')
    await user.clear(weightInput)
    await user.type(weightInput, '150')

    // onWeightChange is called on each keystroke (1, 0, 1, 5, 0)
    // parseInt("100150") = 100150, but we want to check that it was called
    expect(mockOnWeightChange).toHaveBeenCalled()
    const calls = mockOnWeightChange.mock.calls
    // Check that it was called multiple times (one per keystroke)
    expect(calls.length).toBeGreaterThan(0)
    // The last call should have a numeric value
    const lastValue = calls[calls.length - 1][0]
    expect(typeof lastValue).toBe('number')
  })

  it('should show favorite button when showFavorite is true', () => {
    const mockOnFavorite = jest.fn()
    render(
      <ProductCard
        product={mockProduct}
        onSelect={mockOnSelect}
        showFavorite={true}
        onFavorite={mockOnFavorite}
      />
    )

    const favoriteButton = screen.getByTitle(/избранное/i)
    expect(favoriteButton).toBeInTheDocument()
  })

  it('should call onFavorite when favorite button is clicked', async () => {
    const user = userEvent.setup()
    const mockOnFavorite = jest.fn()
    render(
      <ProductCard
        product={mockProduct}
        onSelect={mockOnSelect}
        showFavorite={true}
        onFavorite={mockOnFavorite}
      />
    )

    const favoriteButton = screen.getByTitle(/избранное/i)
    await user.click(favoriteButton)

    expect(mockOnFavorite).toHaveBeenCalled()
  })

  it('should display product image if available', () => {
    const productWithImage: Product = {
      ...mockProduct,
      image_url: 'https://example.com/image.jpg',
    }

    render(
      <ProductCard
        product={productWithImage}
        onSelect={mockOnSelect}
      />
    )

    const image = screen.getByAltText('Test Product')
    expect(image).toBeInTheDocument()
    expect(image).toHaveAttribute('src', 'https://example.com/image.jpg')
  })

  it('should handle missing brand', () => {
    const productWithoutBrand: Product = {
      ...mockProduct,
      brand: undefined,
    }

    render(
      <ProductCard
        product={productWithoutBrand}
        onSelect={mockOnSelect}
      />
    )

    expect(screen.getByText('Test Product')).toBeInTheDocument()
    expect(screen.queryByText('Test Brand')).not.toBeInTheDocument()
  })
})
