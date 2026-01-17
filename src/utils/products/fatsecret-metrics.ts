/**
 * FatSecret API Metrics Tracking
 *
 * Tracks API usage, response times, fallback activations, and cache hit rates
 * for monitoring and optimization purposes.
 */

import { metricsCollector } from '@/utils/metrics/collector'

/**
 * Track FatSecret API call
 *
 * @param method - API method name (e.g., 'foods.search.v4')
 * @param success - Whether the call succeeded
 * @param responseTime - Response time in milliseconds
 */
export function trackFatSecretApiCall(
    method: string,
    success: boolean,
    responseTime: number
): void {
    // Track API call count
    metricsCollector.counter(
        'fatsecret_api_calls_total',
        'Total number of FatSecret API calls',
        {
            method,
            status: success ? 'success' : 'error'
        }
    )

    // Track API response time (convert ms to seconds for Prometheus)
    metricsCollector.histogram(
        'fatsecret_api_response_time_seconds',
        'FatSecret API response time in seconds',
        responseTime / 1000,
        { method },
        {
            buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10] // Response time buckets in seconds
        }
    )
}

/**
 * Track fallback activation
 *
 * @param reason - Reason for fallback ('no_results', 'api_error', 'timeout', etc.)
 * @param source - Fallback source ('openfoodfacts')
 */
export function trackFallbackActivation(
    reason: string,
    source: string = 'openfoodfacts'
): void {
    metricsCollector.counter(
        'fatsecret_fallback_activations_total',
        'Total number of fallback activations from FatSecret to other sources',
        {
            reason,
            fallback_source: source
        }
    )
}

/**
 * Track cache hit or miss
 *
 * @param hit - Whether cache was hit (true) or missed (false)
 * @param cacheType - Type of cache ('database', 'memory')
 */
export function trackCacheHit(
    hit: boolean,
    cacheType: string = 'database'
): void {
    metricsCollector.counter(
        'fatsecret_cache_requests_total',
        'Total number of cache requests',
        {
            cache_type: cacheType,
            result: hit ? 'hit' : 'miss'
        }
    )
}

/**
 * Track product search operation
 *
 * @param source - Source of results ('database', 'fatsecret', 'openfoodfacts')
 * @param resultsCount - Number of results returned
 */
export function trackProductSearch(
    source: string,
    resultsCount: number
): void {
    metricsCollector.counter(
        'product_search_total',
        'Total number of product searches',
        { source }
    )

    metricsCollector.histogram(
        'product_search_results_count',
        'Number of results returned per search',
        resultsCount,
        { source },
        {
            buckets: [0, 1, 5, 10, 20, 50, 100]
        }
    )
}

/**
 * Track barcode lookup operation
 *
 * @param source - Source where barcode was found ('database', 'fatsecret', 'openfoodfacts', 'not_found')
 */
export function trackBarcodeSearch(
    source: string
): void {
    metricsCollector.counter(
        'barcode_search_total',
        'Total number of barcode searches',
        { source }
    )
}

/**
 * Track authentication token refresh
 *
 * @param success - Whether token refresh succeeded
 */
export function trackTokenRefresh(
    success: boolean
): void {
    metricsCollector.counter(
        'fatsecret_token_refresh_total',
        'Total number of FatSecret OAuth token refreshes',
        {
            status: success ? 'success' : 'error'
        }
    )
}

/**
 * Calculate and update cache hit rate gauge
 *
 * This should be called periodically to update the cache hit rate metric
 */
export function updateCacheHitRate(): void {
    const metrics = metricsCollector.getMetricsByName('fatsecret_cache_requests_total')

    let totalHits = 0
    let totalMisses = 0

    metrics.forEach(metric => {
        if (metric.type === 'counter') {
            if (metric.labels.result === 'hit') {
                totalHits += metric.value
            } else if (metric.labels.result === 'miss') {
                totalMisses += metric.value
            }
        }
    })

    const totalRequests = totalHits + totalMisses
    const hitRate = totalRequests > 0 ? totalHits / totalRequests : 0

    metricsCollector.gauge(
        'fatsecret_cache_hit_rate',
        'Cache hit rate (0-1)',
        hitRate
    )
}

/**
 * Calculate and update fallback rate gauge
 *
 * This should be called periodically to update the fallback rate metric
 */
export function updateFallbackRate(): void {
    const apiCallMetrics = metricsCollector.getMetricsByName('fatsecret_api_calls_total')
    const fallbackMetrics = metricsCollector.getMetricsByName('fatsecret_fallback_activations_total')

    let totalApiCalls = 0
    apiCallMetrics.forEach(metric => {
        if (metric.type === 'counter') {
            totalApiCalls += metric.value
        }
    })

    let totalFallbacks = 0
    fallbackMetrics.forEach(metric => {
        if (metric.type === 'counter') {
            totalFallbacks += metric.value
        }
    })

    const fallbackRate = totalApiCalls > 0 ? totalFallbacks / totalApiCalls : 0

    metricsCollector.gauge(
        'fatsecret_fallback_rate',
        'Fallback activation rate (0-1)',
        fallbackRate
    )
}
