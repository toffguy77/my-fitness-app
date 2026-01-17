/**
 * FatSecret API Client
 *
 * Handles all communication with FatSecret API including search, food details,
 * and barcode lookup operations.
 *
 * @see https://platform.fatsecret.com/api/Default.aspx?screen=rapiref2
 */

import { logger } from '@/utils/logger'
import { getFatSecretConfig, type FatSecretConfiguration } from '@/config/fatsecret'
import { getFatSecretAuthManager } from './fatsecret-auth'
import { trackFatSecretApiCall } from './fatsecret-metrics'

/**
 * FatSecret serving information
 */
export interface FatSecretServing {
    /** Unique serving ID */
    serving_id: string
    /** Human-readable serving description (e.g., "100g", "1 cup") */
    serving_description: string
    /** Metric serving amount (e.g., "100") */
    metric_serving_amount: string
    /** Metric serving unit (e.g., "g", "ml") */
    metric_serving_unit: string
    /** Calories per serving */
    calories: string
    /** Carbohydrates in grams */
    carbohydrate: string
    /** Protein in grams */
    protein: string
    /** Fat in grams */
    fat: string
    /** Saturated fat in grams (optional) */
    saturated_fat?: string
    /** Fiber in grams (optional) */
    fiber?: string
    /** Sugar in grams (optional) */
    sugar?: string
    /** Sodium in mg (optional) */
    sodium?: string
}

/**
 * FatSecret food item from API
 */
export interface FatSecretFood {
    /** Unique food ID */
    food_id: string
    /** Food name */
    food_name: string
    /** Brand name (for branded foods) */
    brand_name?: string
    /** Food type: Generic or Brand */
    food_type: 'Generic' | 'Brand'
    /** URL to food details page */
    food_url?: string
    /** Food images */
    food_images?: {
        food_image: Array<{
            image_url: string
            image_type: string
        }>
    }
    /** Available servings */
    servings: {
        serving: FatSecretServing | FatSecretServing[]
    }
}

/**
 * FatSecret API search response
 */
interface FatSecretSearchResponse {
    foods?: {
        food?: FatSecretFood | FatSecretFood[]
        max_results?: string
        page_number?: string
        total_results?: string
    }
}

/**
 * FatSecret API food details response
 */
interface FatSecretFoodResponse {
    food?: FatSecretFood
}

/**
 * FatSecret API barcode response
 */
interface FatSecretBarcodeResponse {
    food_id?: {
        value?: string
    }
}

/**
 * FatSecret API error response
 */
interface FatSecretErrorResponse {
    error?: {
        code?: number
        message?: string
    }
}

/**
 * FatSecret API Client
 *
 * Provides methods for searching foods, retrieving food details, and barcode lookup.
 * Handles authentication, request signing, and error handling.
 *
 * @example
 * ```typescript
 * const client = new FatSecretClient()
 * const foods = await client.searchFoods('apple', 20, 0)
 * const food = await client.getFoodById('12345')
 * const barcodeFood = await client.findFoodByBarcode('5449000000996')
 * ```
 */
export class FatSecretClient {
    private config: FatSecretConfiguration
    private authManager: ReturnType<typeof getFatSecretAuthManager>

    /**
     * Create a new FatSecret API client
     *
     * @param config - Optional configuration (uses environment config by default)
     */
    constructor(config?: FatSecretConfiguration) {
        this.config = config || getFatSecretConfig()

        if (!this.config.enabled) {
            throw new Error('FatSecret integration is disabled')
        }

        this.authManager = getFatSecretAuthManager(this.config)
    }

    /**
     * Search for foods by query string
     *
     * Uses the foods.search.v4 endpoint to search FatSecret's food database.
     *
     * @param query - Search query (minimum 2 characters)
     * @param maxResults - Maximum number of results to return (default: 20)
     * @param pageNumber - Page number for pagination (default: 0)
     * @returns Array of matching foods
     * @throws Error if API request fails
     *
     * @example
     * ```typescript
     * const foods = await client.searchFoods('chicken breast', 10, 0)
     * ```
     */
    async searchFoods(
        query: string,
        maxResults: number = 20,
        pageNumber: number = 0
    ): Promise<FatSecretFood[]> {
        if (!query || query.length < 2) {
            logger.debug('FatSecret: search query too short', {
                query,
                context: 'fatsecret-client'
            })
            return []
        }

        try {
            logger.debug('FatSecret: searching foods', {
                query,
                maxResults,
                pageNumber,
                context: 'fatsecret-client'
            })

            const response = await this.makeRequest<FatSecretSearchResponse>('foods.search.v4', {
                search_expression: query,
                max_results: maxResults.toString(),
                page_number: pageNumber.toString(),
                format: 'json'
            })

            // Handle empty or missing results
            if (!response.foods || !response.foods.food) {
                logger.debug('FatSecret: no foods found', {
                    query,
                    context: 'fatsecret-client'
                })
                return []
            }

            // Normalize response (API returns single object or array)
            const foods = Array.isArray(response.foods.food)
                ? response.foods.food
                : [response.foods.food]

            // Normalize servings array
            const normalizedFoods = foods.map(food => ({
                ...food,
                servings: {
                    serving: Array.isArray(food.servings.serving)
                        ? food.servings.serving
                        : [food.servings.serving]
                }
            }))

            logger.info('FatSecret: foods found', {
                query,
                count: normalizedFoods.length,
                context: 'fatsecret-client'
            })

            return normalizedFoods
        } catch (error) {
            this.handleApiError(error, 'searchFoods', { query, maxResults, pageNumber })
            throw error
        }
    }

    /**
     * Get detailed food information by ID
     *
     * Uses the food.get.v4 endpoint to retrieve complete food details.
     *
     * @param foodId - FatSecret food ID
     * @returns Food details or null if not found
     * @throws Error if API request fails
     *
     * @example
     * ```typescript
     * const food = await client.getFoodById('12345')
     * ```
     */
    async getFoodById(foodId: string): Promise<FatSecretFood | null> {
        if (!foodId) {
            logger.warn('FatSecret: getFoodById called with empty foodId', {
                context: 'fatsecret-client'
            })
            return null
        }

        try {
            logger.debug('FatSecret: getting food by ID', {
                foodId,
                context: 'fatsecret-client'
            })

            const response = await this.makeRequest<FatSecretFoodResponse>('food.get.v4', {
                food_id: foodId,
                format: 'json'
            })

            if (!response.food) {
                logger.debug('FatSecret: food not found', {
                    foodId,
                    context: 'fatsecret-client'
                })
                return null
            }

            // Normalize servings array
            const food = response.food
            const normalizedFood: FatSecretFood = {
                ...food,
                servings: {
                    serving: Array.isArray(food.servings.serving)
                        ? food.servings.serving
                        : [food.servings.serving]
                }
            }

            logger.info('FatSecret: food retrieved', {
                foodId,
                foodName: normalizedFood.food_name,
                context: 'fatsecret-client'
            })

            return normalizedFood
        } catch (error) {
            this.handleApiError(error, 'getFoodById', { foodId })
            throw error
        }
    }

    /**
     * Find food by barcode
     *
     * Uses the food.find_id_for_barcode endpoint to lookup food by barcode,
     * then retrieves full food details.
     *
     * @param barcode - Product barcode (GTIN-13, UPC, etc.)
     * @returns Food details or null if not found
     * @throws Error if API request fails
     *
     * @example
     * ```typescript
     * const food = await client.findFoodByBarcode('5449000000996')
     * ```
     */
    async findFoodByBarcode(barcode: string): Promise<FatSecretFood | null> {
        if (!barcode) {
            logger.warn('FatSecret: findFoodByBarcode called with empty barcode', {
                context: 'fatsecret-client'
            })
            return null
        }

        try {
            logger.debug('FatSecret: finding food by barcode', {
                barcode,
                context: 'fatsecret-client'
            })

            // Step 1: Get food ID from barcode
            const response = await this.makeRequest<FatSecretBarcodeResponse>('food.find_id_for_barcode', {
                barcode,
                format: 'json'
            })

            if (!response.food_id || !response.food_id.value) {
                logger.debug('FatSecret: no food found for barcode', {
                    barcode,
                    context: 'fatsecret-client'
                })
                return null
            }

            const foodId = response.food_id.value

            logger.debug('FatSecret: food ID found for barcode', {
                barcode,
                foodId,
                context: 'fatsecret-client'
            })

            // Step 2: Get full food details
            return await this.getFoodById(foodId)
        } catch (error) {
            this.handleApiError(error, 'findFoodByBarcode', { barcode })
            throw error
        }
    }

    /**
     * Make authenticated request to FatSecret API with retry logic
     *
     * Handles authentication, request formatting, timeout, error handling, and retries.
     * Implements exponential backoff for transient failures.
     *
     * @param method - API method name (e.g., 'foods.search.v4')
     * @param params - Request parameters
     * @param retryCount - Current retry attempt (default: 0)
     * @returns Parsed API response
     * @throws Error if request fails after all retries
     * @private
     */
    private async makeRequest<T>(
        method: string,
        params: Record<string, string>,
        retryCount: number = 0
    ): Promise<T> {
        const maxRetries = 2
        const baseDelay = 1000 // 1 second

        try {
            // Get valid access token
            const accessToken = await this.authManager.getToken()

            // Build query parameters
            const queryParams = new URLSearchParams({
                method,
                ...params
            })

            const url = `${this.config.baseUrl}?${queryParams.toString()}`

            // Log API request
            logger.debug('FatSecret: API request', {
                method,
                params,
                retryCount,
                context: 'fatsecret-client',
                timestamp: new Date().toISOString()
            })

            // Create abort controller for timeout
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

            try {
                const startTime = Date.now()
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    signal: controller.signal
                })

                clearTimeout(timeoutId)
                const responseTime = Date.now() - startTime

                // Track API call metrics
                trackFatSecretApiCall(method, response.ok, responseTime)

                // Log response time
                logger.debug('FatSecret: API response received', {
                    method,
                    status: response.status,
                    responseTime,
                    context: 'fatsecret-client'
                })

                if (!response.ok) {
                    const errorText = await response.text()
                    let errorData: FatSecretErrorResponse | null = null

                    try {
                        errorData = JSON.parse(errorText)
                    } catch {
                        // Not JSON, use text as error message
                    }

                    const errorMessage = `FatSecret API error: ${response.status} ${response.statusText} - ${errorData?.error?.message || errorText}`

                    // Log API error with full context
                    logger.error('FatSecret: API error response', {
                        method,
                        params,
                        status: response.status,
                        statusText: response.statusText,
                        errorCode: errorData?.error?.code,
                        errorMessage: errorData?.error?.message || errorText,
                        retryCount,
                        context: 'fatsecret-client',
                        timestamp: new Date().toISOString()
                    })

                    // Check if error is retryable (5xx errors or rate limits)
                    const isRetryable = response.status >= 500 || response.status === 429

                    if (isRetryable && retryCount < maxRetries) {
                        const delay = baseDelay * Math.pow(2, retryCount)
                        logger.warn('FatSecret: retrying request after error', {
                            method,
                            status: response.status,
                            retryCount: retryCount + 1,
                            maxRetries,
                            delayMs: delay,
                            context: 'fatsecret-client'
                        })

                        // Wait before retrying (exponential backoff)
                        await new Promise(resolve => setTimeout(resolve, delay))
                        return this.makeRequest<T>(method, params, retryCount + 1)
                    }

                    // Log rate limit warnings
                    if (response.status === 429) {
                        logger.warn('FatSecret: rate limit exceeded', {
                            method,
                            params,
                            retryCount,
                            context: 'fatsecret-client',
                            timestamp: new Date().toISOString()
                        })
                    }

                    throw new Error(errorMessage)
                }

                const data = await response.json()
                return data as T
            } catch (error) {
                clearTimeout(timeoutId)

                if (error instanceof Error && error.name === 'AbortError') {
                    const timeoutError = new Error(`FatSecret API timeout after ${this.config.timeout}ms`)

                    // Log timeout error
                    logger.error('FatSecret: API timeout', {
                        method,
                        params,
                        timeout: this.config.timeout,
                        retryCount,
                        context: 'fatsecret-client',
                        timestamp: new Date().toISOString()
                    })

                    // Retry on timeout
                    if (retryCount < maxRetries) {
                        const delay = baseDelay * Math.pow(2, retryCount)
                        logger.warn('FatSecret: retrying request after timeout', {
                            method,
                            retryCount: retryCount + 1,
                            maxRetries,
                            delayMs: delay,
                            context: 'fatsecret-client'
                        })

                        await new Promise(resolve => setTimeout(resolve, delay))
                        return this.makeRequest<T>(method, params, retryCount + 1)
                    }

                    throw timeoutError
                }

                throw error
            }
        } catch (error) {
            // Log final error if all retries exhausted
            if (retryCount >= maxRetries) {
                logger.error('FatSecret: request failed after all retries', {
                    method,
                    params,
                    retryCount,
                    maxRetries,
                    error: error instanceof Error ? error.message : String(error),
                    context: 'fatsecret-client',
                    timestamp: new Date().toISOString()
                })
            }

            if (error instanceof Error) {
                throw error
            }
            throw new Error(`FatSecret API request failed: ${String(error)}`)
        }
    }

    /**
     * Handle and log API errors
     *
     * @param error - Error object
     * @param operation - Operation name for logging
     * @param context - Additional context for logging
     * @private
     */
    private handleApiError(
        error: unknown,
        operation: string,
        context: Record<string, unknown>
    ): void {
        logger.error(`FatSecret API error: ${operation}`, {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            operation,
            ...context,
            context: 'fatsecret-client'
        })
    }
}

/**
 * Singleton instance of FatSecret client
 * Initialized lazily on first use
 */
let clientInstance: FatSecretClient | null = null

/**
 * Get the singleton FatSecret client instance
 *
 * @param config - Optional configuration (uses environment config by default)
 * @returns Singleton client instance
 * @throws Error if FatSecret integration is disabled
 *
 * @example
 * ```typescript
 * const client = getFatSecretClient()
 * const foods = await client.searchFoods('apple', 20, 0)
 * ```
 */
export function getFatSecretClient(config?: FatSecretConfiguration): FatSecretClient {
    if (!clientInstance) {
        clientInstance = new FatSecretClient(config)
    }
    return clientInstance
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetFatSecretClient(): void {
    clientInstance = null
}
