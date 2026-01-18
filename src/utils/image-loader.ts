/**
 * Image Loader with Fallback
 * Provides graceful degradation for image loading failures
 * **Validates: Requirements 3.2**
 */

import { logger } from './logger'
import { trackImageFallback } from './metrics/error-handling-metrics'

/**
 * Options for image loading
 */
export interface ImageLoaderOptions {
    /** Fallback URL to use if primary image fails */
    fallbackUrl?: string
    /** Callback when image loading fails */
    onError?: (error: Error) => void
    /** Timeout in milliseconds for image loading */
    timeout?: number
}

/**
 * Default placeholder image path
 */
const PLACEHOLDER_IMAGE = '/images/product-placeholder.svg'

/**
 * Load an image with fallback support
 *
 * Attempts to load the specified image URL. If loading fails,
 * returns the fallback URL (or default placeholder).
 *
 * @param url - Primary image URL to load
 * @param options - Loading options
 * @returns Promise resolving to the loaded image URL or fallback
 *
 * @example
 * ```typescript
 * const imageUrl = await loadImage('https://example.com/image.jpg')
 * // Returns original URL if successful, placeholder if failed
 * ```
 */
export async function loadImage(
    url: string,
    options: ImageLoaderOptions = {}
): Promise<string> {
    const {
        fallbackUrl = PLACEHOLDER_IMAGE,
        onError,
        timeout = 5000
    } = options

    // If URL is empty or invalid, return fallback immediately
    if (!url || typeof url !== 'string') {
        logger.warn('Invalid image URL provided, using placeholder', { url })
        trackImageFallback({
            originalUrl: url || '',
            fallbackUrl,
            reason: 'invalid'
        })
        return fallbackUrl
    }

    // If URL is already a placeholder or local asset, return it directly
    if (url.startsWith('/') || url.startsWith('data:')) {
        return url
    }

    try {
        // Create abort controller for timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        try {
            // Attempt to fetch image headers to verify it exists
            const response = await fetch(url, {
                method: 'HEAD',
                signal: controller.signal,
                // Don't send credentials for external images
                credentials: 'omit',
                // Set cache to avoid unnecessary requests
                cache: 'force-cache'
            })

            clearTimeout(timeoutId)

            // If response is OK, return the original URL
            if (response.ok) {
                return url
            }

            // If response is not OK, log and use fallback
            logger.warn('Image load failed with non-OK status, using placeholder', {
                url,
                status: response.status,
                statusText: response.statusText
            })

            const error = new Error(`Image load failed: ${response.status} ${response.statusText}`)
            onError?.(error)

            trackImageFallback({
                originalUrl: url,
                fallbackUrl,
                reason: response.status === 404 ? 'not_found' : 'error'
            })

            return fallbackUrl
        } catch (fetchError) {
            clearTimeout(timeoutId)
            throw fetchError
        }
    } catch (error) {
        // Handle fetch errors (network issues, timeout, etc.)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'

        // Don't log AbortError (timeout) as error, just as warning
        if (error instanceof Error && error.name === 'AbortError') {
            logger.warn('Image load timeout, using placeholder', { url, timeout })
            trackImageFallback({
                originalUrl: url,
                fallbackUrl,
                reason: 'timeout'
            })
        } else {
            logger.warn('Image load failed, using placeholder', {
                url,
                error: errorMessage
            })
            trackImageFallback({
                originalUrl: url,
                fallbackUrl,
                reason: 'error'
            })
        }

        const loadError = error instanceof Error ? error : new Error(errorMessage)
        onError?.(loadError)

        return fallbackUrl
    }
}

/**
 * Get the default placeholder image path
 *
 * @returns Path to the default placeholder image
 *
 * @example
 * ```typescript
 * const placeholder = getPlaceholder()
 * // Returns: '/images/product-placeholder.svg'
 * ```
 */
export function getPlaceholder(): string {
    return PLACEHOLDER_IMAGE
}

/**
 * Preload an image to cache it
 *
 * Useful for preloading images that will be displayed later.
 * Does not throw errors - failures are logged but ignored.
 *
 * @param url - Image URL to preload
 *
 * @example
 * ```typescript
 * preloadImage('https://example.com/image.jpg')
 * // Image will be cached for later use
 * ```
 */
export async function preloadImage(url: string): Promise<void> {
    try {
        await loadImage(url, {
            onError: () => {
                // Silently ignore preload errors
            }
        })
    } catch (error) {
        // Silently ignore preload errors
    }
}

/**
 * Batch preload multiple images
 *
 * Preloads multiple images concurrently.
 * Does not throw errors - failures are logged but ignored.
 *
 * @param urls - Array of image URLs to preload
 *
 * @example
 * ```typescript
 * await preloadImages([
 *   'https://example.com/image1.jpg',
 *   'https://example.com/image2.jpg'
 * ])
 * ```
 */
export async function preloadImages(urls: string[]): Promise<void> {
    await Promise.allSettled(urls.map(url => preloadImage(url)))
}
