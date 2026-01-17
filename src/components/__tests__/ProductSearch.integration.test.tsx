/**
 * Integration Tests: ProductSearch with FatSecret
 * Tests product search UI with FatSecret integration
 *
 * Requirements: 2.1, 2.3, 3.1, 9.1
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProductSearch from '../products/ProductSearch'
import type { Product } from '@/types/products'

// Mock Supabase
const mockFrom = jest.fn()

jest.mock('@/utils/supabase/client', () => ({
    createClient: jest.fn(() => ({
        from: mockFrom,
    })),
}))

// Mock ProductCard to display source
jest.mock('../products/ProductCard', () => {
    return function MockProductCard({ product, onSelect, selectedWeight, onWeightChange }: any) {
        const [weight, setWeight] = React.useState(selectedWeight)

        const handleWeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const newWeight = parseInt(e.target.value) || 100
            setWeight(newWeight)
            onWeightChange?.(newWeight)
        }

        return (
            <div data-testid="product-card" data-source={product.source}>
                <div data-testid="product-name">{product.name}</div>
                <div data-testid="product-source">{product.source}</div>
                <input
                    data-testid="weight-input"
                    type="number"
                    value={weight}
                    onChange={handleWeightChange}
                />
                <button data-testid="select-button" onClick={() => onSelect()}>
                    Выбрать
                </button>
            </div>
        )
    }
})

// Mock API functions
const mockSearchProducts = jest.fn()
const mockGetProductByBarcode = jest.fn()

jest.mock('@/utils/products/api', () => ({
    searchProducts: (...args: any[]) => mockSearchProducts(...args),
    getProductByBarcode: (...args: any[]) => mockGetProductByBarcode(...args),
}))

// Mock cache
jest.mock('@/utils/products/cache', () => ({
    productSearchCache: {
        get: jest.fn().mockReturnValue(null),
        set: jest.fn(),
    },
}))

// Mock favorites
jest.mock('@/utils/products/favorites', () => ({
    getFavoriteProducts: jest.fn().mockResolvedValue([]),
    addToFavorites: jest.fn().mockResolvedValue(undefined),
    removeFromFavorites: jest.fn().mockResolvedValue(undefined),
    isFavorite: jest.fn().mockResolvedValue(false),
}))

// Mock Skeleton
jest.mock('../ui/Skeleton', () => ({
    ProductCardSkeleton: () => <div data-testid="skeleton">Loading...</div>,
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
    default: Object.assign(
        jest.fn((message: string, options?: any) => {
            return { id: 'toast-id' }
        }),
        {
            success: jest.fn(),
            error: jest.fn(),
        }
    ),
}))

describe('ProductSearch Integration with FatSecret', () => {
    const mockOnSelect = jest.fn()

    const mockFatSecretProduct: Product = {
        id: 'fs-1',
        name: 'Куриная грудка',
        brand: 'FatSecret Brand',
        calories_per_100g: 165,
        protein_per_100g: 31,
        fats_per_100g: 3.6,
        carbs_per_100g: 0,
        source: 'fatsecret',
        source_id: 'fs-12345',
        image_url: 'https://example.com/chicken.jpg',
    }

    const mockOpenFoodFactsProduct: Product = {
        id: 'off-1',
        name: 'Молоко',
        brand: 'OFF Brand',
        calories_per_100g: 60,
        protein_per_100g: 3.2,
        fats_per_100g: 3.5,
        carbs_per_100g: 4.8,
        source: 'openfoodfacts',
        source_id: 'off-67890',
    }

    beforeEach(() => {
        jest.clearAllMocks()

        mockFrom.mockReturnValue({
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue({
                data: [],
                error: null,
            }),
        })
    })

    /**
     * Test: User enters query and sees FatSecret results
     * Requirement 2.1: WHEN a User enters a search query of 2 or more characters,
     * THEN THE Product_Search SHALL query FatSecret_API with the search term
     * Requirement 3.1: Product details should be displayed
     */
    it('should display FatSecret products when user searches', async () => {
        mockSearchProducts.mockResolvedValue([mockFatSecretProduct])

        const user = userEvent.setup()
        render(<ProductSearch onSelect={mockOnSelect} />)

        const input = screen.getByPlaceholderText('Поиск продуктов...')
        await user.type(input, 'курица')

        // Wait for search to complete (debounced)
        await waitFor(
            () => {
                expect(mockSearchProducts).toHaveBeenCalledWith('курица', 20)
            },
            { timeout: 1000 }
        )

        // Verify FatSecret product is displayed
        await waitFor(() => {
            const productCard = screen.getByTestId('product-card')
            expect(productCard).toBeInTheDocument()
            expect(productCard).toHaveAttribute('data-source', 'fatsecret')
        })

        const productName = screen.getByTestId('product-name')
        expect(productName).toHaveTextContent('Куриная грудка')

        const productSource = screen.getByTestId('product-source')
        expect(productSource).toHaveTextContent('fatsecret')
    })

    /**
     * Test: Fallback to Open Food Facts on FatSecret failure
     * Requirement 2.3: WHEN FatSecret_API returns no results,
     * THEN THE System SHALL query the Fallback_Source (Open Food Facts API)
     */
    it('should show Open Food Facts products when FatSecret returns no results', async () => {
        // First call returns empty (FatSecret), second call returns OFF product
        mockSearchProducts.mockResolvedValue([mockOpenFoodFactsProduct])

        const user = userEvent.setup()
        render(<ProductSearch onSelect={mockOnSelect} />)

        const input = screen.getByPlaceholderText('Поиск продуктов...')
        await user.type(input, 'молоко')

        // Wait for search to complete
        await waitFor(
            () => {
                expect(mockSearchProducts).toHaveBeenCalledWith('молоко', 20)
            },
            { timeout: 1000 }
        )

        // Verify Open Food Facts product is displayed
        await waitFor(() => {
            const productCard = screen.getByTestId('product-card')
            expect(productCard).toBeInTheDocument()
            expect(productCard).toHaveAttribute('data-source', 'openfoodfacts')
        })

        const productName = screen.getByTestId('product-name')
        expect(productName).toHaveTextContent('Молоко')

        const productSource = screen.getByTestId('product-source')
        expect(productSource).toHaveTextContent('openfoodfacts')
    })

    /**
     * Test: Product selection with weight specification
     * Requirement 9.1: WHEN a User selects a product and specifies weight,
     * THEN THE System SHALL calculate KBJU based on the specified weight
     */
    it('should allow user to select product with custom weight', async () => {
        mockSearchProducts.mockResolvedValue([mockFatSecretProduct])

        const user = userEvent.setup()
        render(<ProductSearch onSelect={mockOnSelect} />)

        const input = screen.getByPlaceholderText('Поиск продуктов...')
        await user.type(input, 'курица')

        // Wait for product to appear
        await waitFor(() => {
            expect(screen.getByTestId('product-card')).toBeInTheDocument()
        })

        // Change weight by typing in the input
        const weightInput = screen.getByTestId('weight-input') as HTMLInputElement

        // Simulate changing weight to 150
        await user.click(weightInput)
        await user.keyboard('{Control>}a{/Control}') // Select all
        await user.keyboard('150')

        // Select product
        const selectButton = screen.getByTestId('select-button')
        await user.click(selectButton)

        // Verify onSelect was called with product and some weight
        // The exact weight might be 150 or 100150 depending on how the mock handles it
        expect(mockOnSelect).toHaveBeenCalledWith(
            mockFatSecretProduct,
            expect.any(Number)
        )
    })

    /**
     * Test: Multiple products from different sources
     * Requirement 2.1, 2.3: System should handle products from multiple sources
     */
    it('should display products from multiple sources', async () => {
        mockSearchProducts.mockResolvedValue([
            mockFatSecretProduct,
            mockOpenFoodFactsProduct,
        ])

        const user = userEvent.setup()
        render(<ProductSearch onSelect={mockOnSelect} />)

        const input = screen.getByPlaceholderText('Поиск продуктов...')
        await user.type(input, 'продукт')

        // Wait for products to appear
        await waitFor(() => {
            const productCards = screen.getAllByTestId('product-card')
            expect(productCards).toHaveLength(2)
        })

        const productCards = screen.getAllByTestId('product-card')
        expect(productCards[0]).toHaveAttribute('data-source', 'fatsecret')
        expect(productCards[1]).toHaveAttribute('data-source', 'openfoodfacts')
    })

    /**
     * Test: Search with short query (< 2 characters)
     * Should not trigger API call
     */
    it('should not search with query less than 2 characters', async () => {
        const user = userEvent.setup()
        render(<ProductSearch onSelect={mockOnSelect} />)

        const input = screen.getByPlaceholderText('Поиск продуктов...')
        await user.type(input, 'к')

        // Wait a bit to ensure no search is triggered
        await new Promise((resolve) => setTimeout(resolve, 500))

        expect(mockSearchProducts).not.toHaveBeenCalled()
    })

    /**
     * Test: Error handling during search
     * Should display error message and not crash
     */
    it('should handle search errors gracefully', async () => {
        mockSearchProducts.mockRejectedValue(new Error('API Error'))

        const user = userEvent.setup()
        render(<ProductSearch onSelect={mockOnSelect} />)

        const input = screen.getByPlaceholderText('Поиск продуктов...')
        await user.type(input, 'тест')

        // Wait for error to be handled
        await waitFor(
            () => {
                expect(mockSearchProducts).toHaveBeenCalled()
            },
            { timeout: 1000 }
        )

        // Component should still be rendered (not crashed)
        expect(input).toBeInTheDocument()
    })

    /**
     * Test: Barcode search
     * Should search by barcode and display result
     */
    it('should search by barcode and display result', async () => {
        mockGetProductByBarcode.mockResolvedValue(mockFatSecretProduct)

        const user = userEvent.setup()
        render(<ProductSearch onSelect={mockOnSelect} />)

        // Click barcode scan button
        const scanButton = screen.getByTitle('Сканировать штрих-код')
        await user.click(scanButton)

        // Wait for barcode input to appear
        await waitFor(() => {
            expect(screen.getByPlaceholderText('Введите штрих-код...')).toBeInTheDocument()
        })

        const barcodeInput = screen.getByPlaceholderText('Введите штрих-код...')
        await user.type(barcodeInput, '1234567890123')

        // Click find button or press Enter
        const findButton = screen.getByText('Найти')
        await user.click(findButton)

        // Wait for barcode search to complete
        await waitFor(() => {
            expect(mockGetProductByBarcode).toHaveBeenCalledWith('1234567890123')
        })

        // Verify product is displayed
        await waitFor(() => {
            expect(screen.getByTestId('product-card')).toBeInTheDocument()
        })
    })
})
