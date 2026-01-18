/**
 * Unit Tests: Image Loader
 * Tests image loading with fallback functionality
 * **Validates: Requirements 3.2**
 */

import { loadImage, getPlaceholder, preloadImage, preloadImages } from '../image-loader'

// Mock fetch globally
global.fetch = jest.fn()

describe('Image Loader', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        jest.clearAllTimers()
    })

    describe('loadImage', () => {
        it('should return original URL for successful image load', async () => {
            const mockUrl = 'https://example.com/image.jpg'

                ; (global.fetch as jest.Mock).mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    statusText: 'OK'
                })

            const result = await loadImage(mockUrl)

            expect(result).toBe(mockUrl)
            expect(global.fetch).toHaveBeenCalledWith(
                mockUrl,
                expect.objectContaining({
                    method: 'HEAD',
                    credentials: 'omit',
                    cache: 'force-cache'
                })
            )
        })

        it('should return placeholder for failed image load', async () => {
            const mockUrl = 'https://example.com/missing.jpg'

                ; (global.fetch as jest.Mock).mockResolvedValueOnce({
                    ok: false,
                    status: 404,
                    statusText: 'Not Found'
                })

            const result = await loadImage(mockUrl)

            expect(result).toBe('/images/product-placeholder.svg')
        })

        it('should return placeholder for network errors', async () => {
            const mockUrl = 'https://example.com/error.jpg'

                ; (global.fetch as jest.Mock).mockRejectedValueOnce(
                    new Error('Network error')
                )

            const result = await loadImage(mockUrl)

            expect(result).toBe('/images/product-placeholder.svg')
        })

        it('should return custom fallback URL when provided', async () => {
            const mockUrl = 'https://example.com/image.jpg'
            const customFallback = '/custom-placeholder.png'

                ; (global.fetch as jest.Mock).mockRejectedValueOnce(
                    new Error('Network error')
                )

            const result = await loadImage(mockUrl, {
                fallbackUrl: customFallback
            })

            expect(result).toBe(customFallback)
        })

        it('should call onError callback when image fails to load', async () => {
            const mockUrl = 'https://example.com/error.jpg'
            const onError = jest.fn()

                ; (global.fetch as jest.Mock).mockRejectedValueOnce(
                    new Error('Network error')
                )

            await loadImage(mockUrl, { onError })

            expect(onError).toHaveBeenCalledWith(expect.any(Error))
        })

        it('should return local URLs directly without fetching', async () => {
            const localUrl = '/local/image.jpg'

            const result = await loadImage(localUrl)

            expect(result).toBe(localUrl)
            expect(global.fetch).not.toHaveBeenCalled()
        })

        it('should return data URLs directly without fetching', async () => {
            const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

            const result = await loadImage(dataUrl)

            expect(result).toBe(dataUrl)
            expect(global.fetch).not.toHaveBeenCalled()
        })

        it('should return placeholder for invalid URLs', async () => {
            const result1 = await loadImage('')
            const result2 = await loadImage(null as any)
            const result3 = await loadImage(undefined as any)

            expect(result1).toBe('/images/product-placeholder.svg')
            expect(result2).toBe('/images/product-placeholder.svg')
            expect(result3).toBe('/images/product-placeholder.svg')
            expect(global.fetch).not.toHaveBeenCalled()
        })

        it('should handle timeout and return placeholder', async () => {
            const mockUrl = 'https://example.com/slow.jpg'

                ; (global.fetch as jest.Mock).mockImplementationOnce(
                    (_url: string, options: any) => {
                        return new Promise((resolve, reject) => {
                            // Listen for abort signal
                            if (options?.signal) {
                                options.signal.addEventListener('abort', () => {
                                    reject(new DOMException('The operation was aborted', 'AbortError'))
                                })
                            }
                            // Never resolve to simulate slow response
                        })
                    }
                )

            const result = await loadImage(mockUrl, { timeout: 100 })

            expect(result).toBe('/images/product-placeholder.svg')
        })

    })

    describe('getPlaceholder', () => {
        it('should return the default placeholder path', () => {
            const placeholder = getPlaceholder()

            expect(placeholder).toBe('/images/product-placeholder.svg')
        })
    })

    describe('preloadImage', () => {
        it('should preload image without throwing errors', async () => {
            const mockUrl = 'https://example.com/image.jpg'

                ; (global.fetch as jest.Mock).mockResolvedValueOnce({
                    ok: true,
                    status: 200
                })

            await expect(preloadImage(mockUrl)).resolves.not.toThrow()
        })

        it('should silently ignore preload errors', async () => {
            const mockUrl = 'https://example.com/error.jpg'

                ; (global.fetch as jest.Mock).mockRejectedValueOnce(
                    new Error('Network error')
                )

            await expect(preloadImage(mockUrl)).resolves.not.toThrow()
        })
    })

    describe('preloadImages', () => {
        it('should preload multiple images concurrently', async () => {
            const urls = [
                'https://example.com/image1.jpg',
                'https://example.com/image2.jpg',
                'https://example.com/image3.jpg'
            ]

                ; (global.fetch as jest.Mock).mockResolvedValue({
                    ok: true,
                    status: 200
                })

            await preloadImages(urls)

            expect(global.fetch).toHaveBeenCalledTimes(3)
        })

        it('should continue preloading even if some images fail', async () => {
            const urls = [
                'https://example.com/image1.jpg',
                'https://example.com/error.jpg',
                'https://example.com/image3.jpg'
            ]

                ; (global.fetch as jest.Mock)
                    .mockResolvedValueOnce({ ok: true, status: 200 })
                    .mockRejectedValueOnce(new Error('Network error'))
                    .mockResolvedValueOnce({ ok: true, status: 200 })

            await expect(preloadImages(urls)).resolves.not.toThrow()
            expect(global.fetch).toHaveBeenCalledTimes(3)
        })
    })
})
