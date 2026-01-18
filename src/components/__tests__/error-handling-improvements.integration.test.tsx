/**
 * Integration Tests: Error Handling Improvements
 * Tests components updated with useAbortController and image loader
 * **Validates: Requirements 1.1, 1.4, 3.2**
 */

import { render, screen, waitFor, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Header from '../Header'
import GlobalChatWidget from '../chat/GlobalChatWidget'
import SubscriptionBanner from '../SubscriptionBanner'
import ProductCard from '../products/ProductCard'
import { useAbortController } from '@/hooks/useAbortController'
import type { Product } from '@/types/products'

// Mock Next.js router
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
    useRouter: () => ({
        push: mockPush,
    }),
}))

// Mock Supabase
const mockGetUser = jest.fn()
const mockFrom = jest.fn()
const mockSelect = jest.fn()
const mockEq = jest.fn()
const mockSingle = jest.fn()

jest.mock('@/utils/supabase/client', () => ({
    createClient: jest.fn(() => ({
        auth: {
            getUser: mockGetUser,
        },
        from: mockFrom,
    })),
}))

// Mock profile utils
jest.mock('@/utils/supabase/profile', () => ({
    getUserProfile: jest.fn(),
    hasActiveSubscription: jest.fn(),
}))

// Mock subscription utils
jest.mock('@/utils/supabase/subscription', () => ({
    checkSubscriptionStatus: jest.fn(),
}))

// Mock ChatWidget
jest.mock('../chat/ChatWidget', () => {
    return function MockChatWidget() {
        return <div data-testid="chat-widget">Chat Widget</div>
    }
})

// Mock Logo
jest.mock('../Logo', () => {
    return function MockLogo({ onClick }: any) {
        return <div data-testid="logo" onClick={onClick}>Logo</div>
    }
})

// Mock logger
jest.mock('@/utils/logger', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}))

// Mock image loader
jest.mock('@/utils/image-loader', () => ({
    loadImage: jest.fn((url: string) => Promise.resolve(url)),
    getPlaceholder: jest.fn(() => '/images/product-placeholder.svg'),
}))

describe('Error Handling Improvements - Integration Tests', () => {
    const { getUserProfile } = require('@/utils/supabase/profile')
    const { checkSubscriptionStatus } = require('@/utils/supabase/subscription')
    const { hasActiveSubscription } = require('@/utils/supabase/profile')
    const { logger } = require('@/utils/logger')
    const { loadImage } = require('@/utils/image-loader')

    beforeEach(() => {
        jest.clearAllMocks()
        mockFrom.mockReturnValue({
            select: mockSelect,
        })
        mockSelect.mockReturnValue({
            eq: mockEq,
        })
        mockEq.mockReturnValue({
            single: mockSingle,
        })
    })

    describe('Request Cancellation on Navigation', () => {
        /**
         * Test: Components should cancel pending requests when unmounted
         * **Validates: Requirements 1.1, 1.4**
         */
        it('should cancel requests in Header when component unmounts', async () => {
            mockGetUser.mockImplementation(() =>
                new Promise((resolve) => {
                    setTimeout(() => {
                        resolve({
                            data: { user: { id: 'user-123' } },
                            error: null,
                        })
                    }, 100)
                })
            )

            getUserProfile.mockResolvedValue({
                id: 'user-123',
                full_name: 'Test User',
                role: 'client',
            })

            const { unmount } = render(<Header />)

            // Unmount before request completes
            unmount()

            // Wait a bit to ensure no errors are logged
            await act(async () => {
                await new Promise(resolve => setTimeout(resolve, 150))
            })

            // Verify no AbortError was logged
            const errorCalls = logger.error.mock.calls
            const abortErrors = errorCalls.filter((call: any[]) =>
                call[0]?.includes('AbortError') || call[1]?.name === 'AbortError'
            )
            expect(abortErrors.length).toBe(0)
        })

        /**
         * Test: GlobalChatWidget should cancel requests on unmount
         * **Validates: Requirements 1.1, 1.4**
         */
        it('should cancel requests in GlobalChatWidget when component unmounts', async () => {
            mockGetUser.mockImplementation(() =>
                new Promise((resolve) => {
                    setTimeout(() => {
                        resolve({
                            data: { user: { id: 'user-123' } },
                            error: null,
                        })
                    }, 100)
                })
            )

            const { unmount } = render(<GlobalChatWidget />)

            // Unmount before request completes
            unmount()

            await act(async () => {
                await new Promise(resolve => setTimeout(resolve, 150))
            })

            // Verify no AbortError was logged
            const errorCalls = logger.error.mock.calls
            const abortErrors = errorCalls.filter((call: any[]) =>
                call[0]?.includes('AbortError') || call[1]?.name === 'AbortError'
            )
            expect(abortErrors.length).toBe(0)
        })

        /**
         * Test: SubscriptionBanner should cancel requests on unmount
         * **Validates: Requirements 1.1, 1.4**
         */
        it('should cancel requests in SubscriptionBanner when component unmounts', async () => {
            mockGetUser.mockImplementation(() =>
                new Promise((resolve) => {
                    setTimeout(() => {
                        resolve({
                            data: { user: { id: 'user-123' } },
                            error: null,
                        })
                    }, 100)
                })
            )

            mockSingle.mockResolvedValue({
                data: { role: 'client' },
                error: null,
            })

            const { unmount } = render(<SubscriptionBanner />)

            // Unmount before request completes
            unmount()

            await act(async () => {
                await new Promise(resolve => setTimeout(resolve, 150))
            })

            // Verify no AbortError was logged
            const errorCalls = logger.error.mock.calls
            const abortErrors = errorCalls.filter((call: any[]) =>
                call[0]?.includes('AbortError') || call[1]?.name === 'AbortError'
            )
            expect(abortErrors.length).toBe(0)
        })

        /**
         * Test: useAbortController hook should cleanup on unmount
         * **Validates: Requirements 1.4**
         */
        it('should cleanup AbortController when hook unmounts', () => {
            const { result, unmount } = renderHook(() => useAbortController())

            const signal = result.current.signal
            expect(signal.aborted).toBe(false)

            // Unmount the hook
            unmount()

            // Signal should be aborted after unmount
            expect(signal.aborted).toBe(true)
        })
    })

    describe('Image Fallback in Products', () => {
        const mockProduct: Product = {
            id: '1',
            name: 'Test Product',
            brand: 'Test Brand',
            calories_per_100g: 250,
            protein_per_100g: 20,
            fats_per_100g: 10,
            carbs_per_100g: 30,
            source: 'user',
            image_url: 'https://example.com/image.jpg',
        }

        /**
         * Test: ProductCard should use image loader for images
         * **Validates: Requirements 3.2**
         */
        it('should load product image using image loader', async () => {
            loadImage.mockResolvedValue('https://example.com/image.jpg')

            render(
                <ProductCard
                    product={mockProduct}
                    onSelect={jest.fn()}
                />
            )

            await waitFor(() => {
                expect(loadImage).toHaveBeenCalledWith('https://example.com/image.jpg')
            })

            const image = screen.getByAltText('Test Product')
            expect(image).toBeInTheDocument()
        })

        /**
         * Test: ProductCard should use placeholder when image fails
         * **Validates: Requirements 3.2**
         */
        it('should use placeholder when image loading fails', async () => {
            loadImage.mockResolvedValue('/images/product-placeholder.svg')

            render(
                <ProductCard
                    product={mockProduct}
                    onSelect={jest.fn()}
                />
            )

            await waitFor(() => {
                const image = screen.getByAltText('Test Product')
                expect(image).toHaveAttribute('src', '/images/product-placeholder.svg')
            })
        })

        /**
         * Test: ProductCard should handle missing image_url
         * **Validates: Requirements 3.2**
         */
        it('should handle product without image_url', () => {
            const productWithoutImage: Product = {
                ...mockProduct,
                image_url: undefined,
            }

            render(
                <ProductCard
                    product={productWithoutImage}
                    onSelect={jest.fn()}
                />
            )

            // Should still render the product card
            expect(screen.getByText('Test Product')).toBeInTheDocument()
        })
    })

    describe('No AbortError in Logs', () => {
        /**
         * Test: Verify AbortErrors are not logged during normal navigation
         * **Validates: Requirements 1.1**
         */
        it('should not log AbortError when components unmount during navigation', async () => {
            // Setup multiple components
            mockGetUser.mockImplementation(() =>
                new Promise((resolve) => {
                    setTimeout(() => {
                        resolve({
                            data: { user: { id: 'user-123' } },
                            error: null,
                        })
                    }, 100)
                })
            )

            getUserProfile.mockResolvedValue({
                id: 'user-123',
                full_name: 'Test User',
                role: 'client',
            })

            mockSingle.mockResolvedValue({
                data: { role: 'client' },
                error: null,
            })

            // Render multiple components
            const { unmount: unmountHeader } = render(<Header />)
            const { unmount: unmountChat } = render(<GlobalChatWidget />)
            const { unmount: unmountBanner } = render(<SubscriptionBanner />)

            // Simulate navigation by unmounting all components
            unmountHeader()
            unmountChat()
            unmountBanner()

            await act(async () => {
                await new Promise(resolve => setTimeout(resolve, 150))
            })

            // Verify no AbortError was logged
            const errorCalls = logger.error.mock.calls
            const abortErrors = errorCalls.filter((call: any[]) =>
                call[0]?.includes('AbortError') ||
                call[1]?.name === 'AbortError' ||
                (typeof call[1] === 'object' && call[1]?.message?.includes('abort'))
            )

            expect(abortErrors.length).toBe(0)
        })
    })

    describe('Component Integration', () => {
        /**
         * Test: Components should work together without errors
         * **Validates: Requirements 1.4, 3.2**
         */
        it('should render all updated components without errors', async () => {
            mockGetUser.mockResolvedValue({
                data: { user: { id: 'user-123' } },
                error: null,
            })

            getUserProfile.mockResolvedValue({
                id: 'user-123',
                full_name: 'Test User',
                role: 'client',
                curator_id: 'curator-123',
            })

            hasActiveSubscription.mockReturnValue(true)

            checkSubscriptionStatus.mockResolvedValue({
                status: 'active',
                tier: 'premium',
            })

            mockSingle.mockResolvedValue({
                data: { role: 'client' },
                error: null,
            })

            loadImage.mockResolvedValue('https://example.com/image.jpg')

            const mockProduct: Product = {
                id: '1',
                name: 'Test Product',
                brand: 'Test Brand',
                calories_per_100g: 250,
                protein_per_100g: 20,
                fats_per_100g: 10,
                carbs_per_100g: 30,
                source: 'user',
                image_url: 'https://example.com/image.jpg',
            }

            // Render all components
            const { container: headerContainer } = render(<Header />)
            const { container: chatContainer } = render(<GlobalChatWidget />)
            const { container: productContainer } = render(
                <ProductCard product={mockProduct} onSelect={jest.fn()} />
            )

            // Wait for components to load
            await waitFor(() => {
                expect(headerContainer.firstChild).not.toBeNull()
            })

            // Verify no errors were logged
            expect(logger.error).not.toHaveBeenCalled()
        })
    })
})
