/**
 * Unit tests for FatSecret metrics tracking
 */

import { metricsCollector } from '@/utils/metrics/collector'
import {
    trackFatSecretApiCall,
    trackFallbackActivation,
    trackCacheHit,
    trackProductSearch,
    trackBarcodeSearch,
    trackTokenRefresh,
    updateCacheHitRate,
    updateFallbackRate
} from '../fatsecret-metrics'

describe('FatSecret Metrics', () => {
    beforeEach(() => {
        // Clear metrics before each test
        metricsCollector.clear()
    })

    describe('trackFatSecretApiCall', () => {
        it('should track successful API call', () => {
            trackFatSecretApiCall('foods.search.v4', true, 250)

            const counterMetrics = metricsCollector.getMetricsByName('fatsecret_api_calls_total')
            expect(counterMetrics).toHaveLength(1)
            expect(counterMetrics[0].type).toBe('counter')
            if (counterMetrics[0].type === 'counter') {
                expect(counterMetrics[0].value).toBe(1)
                expect(counterMetrics[0].labels.method).toBe('foods.search.v4')
                expect(counterMetrics[0].labels.status).toBe('success')
            }

            const histogramMetrics = metricsCollector.getMetricsByName('fatsecret_api_response_time_seconds')
            expect(histogramMetrics).toHaveLength(1)
            expect(histogramMetrics[0].type).toBe('histogram')
            if (histogramMetrics[0].type === 'histogram') {
                expect(histogramMetrics[0].observations).toContain(0.25) // 250ms = 0.25s
                expect(histogramMetrics[0].labels.method).toBe('foods.search.v4')
            }
        })

        it('should track failed API call', () => {
            trackFatSecretApiCall('food.get.v4', false, 5000)

            const counterMetrics = metricsCollector.getMetricsByName('fatsecret_api_calls_total')
            expect(counterMetrics).toHaveLength(1)
            if (counterMetrics[0].type === 'counter') {
                expect(counterMetrics[0].labels.status).toBe('error')
            }
        })

        it('should accumulate multiple API calls', () => {
            trackFatSecretApiCall('foods.search.v4', true, 200)
            trackFatSecretApiCall('foods.search.v4', true, 300)
            trackFatSecretApiCall('foods.search.v4', false, 5000)

            const counterMetrics = metricsCollector.getMetricsByName('fatsecret_api_calls_total')
            expect(counterMetrics).toHaveLength(2) // One for success, one for error

            const successMetric = counterMetrics.find(m =>
                m.type === 'counter' && m.labels.status === 'success'
            )
            const errorMetric = counterMetrics.find(m =>
                m.type === 'counter' && m.labels.status === 'error'
            )

            expect(successMetric).toBeDefined()
            expect(errorMetric).toBeDefined()
            if (successMetric?.type === 'counter') {
                expect(successMetric.value).toBe(2)
            }
            if (errorMetric?.type === 'counter') {
                expect(errorMetric.value).toBe(1)
            }
        })
    })

    describe('trackFallbackActivation', () => {
        it('should track fallback activation with reason', () => {
            trackFallbackActivation('api_error', 'openfoodfacts')

            const metrics = metricsCollector.getMetricsByName('fatsecret_fallback_activations_total')
            expect(metrics).toHaveLength(1)
            expect(metrics[0].type).toBe('counter')
            if (metrics[0].type === 'counter') {
                expect(metrics[0].value).toBe(1)
                expect(metrics[0].labels.reason).toBe('api_error')
                expect(metrics[0].labels.fallback_source).toBe('openfoodfacts')
            }
        })

        it('should track multiple fallback reasons separately', () => {
            trackFallbackActivation('api_error', 'openfoodfacts')
            trackFallbackActivation('no_results', 'openfoodfacts')
            trackFallbackActivation('api_error', 'openfoodfacts')

            const metrics = metricsCollector.getMetricsByName('fatsecret_fallback_activations_total')
            expect(metrics).toHaveLength(2) // One for each reason

            const apiErrorMetric = metrics.find(m =>
                m.type === 'counter' && m.labels.reason === 'api_error'
            )
            const noResultsMetric = metrics.find(m =>
                m.type === 'counter' && m.labels.reason === 'no_results'
            )

            if (apiErrorMetric?.type === 'counter') {
                expect(apiErrorMetric.value).toBe(2)
            }
            if (noResultsMetric?.type === 'counter') {
                expect(noResultsMetric.value).toBe(1)
            }
        })
    })

    describe('trackCacheHit', () => {
        it('should track cache hit', () => {
            trackCacheHit(true, 'database')

            const metrics = metricsCollector.getMetricsByName('fatsecret_cache_requests_total')
            expect(metrics).toHaveLength(1)
            if (metrics[0].type === 'counter') {
                expect(metrics[0].value).toBe(1)
                expect(metrics[0].labels.cache_type).toBe('database')
                expect(metrics[0].labels.result).toBe('hit')
            }
        })

        it('should track cache miss', () => {
            trackCacheHit(false, 'database')

            const metrics = metricsCollector.getMetricsByName('fatsecret_cache_requests_total')
            expect(metrics).toHaveLength(1)
            if (metrics[0].type === 'counter') {
                expect(metrics[0].labels.result).toBe('miss')
            }
        })

        it('should track hits and misses separately', () => {
            trackCacheHit(true, 'database')
            trackCacheHit(true, 'database')
            trackCacheHit(false, 'database')

            const metrics = metricsCollector.getMetricsByName('fatsecret_cache_requests_total')
            expect(metrics).toHaveLength(2)

            const hitMetric = metrics.find(m =>
                m.type === 'counter' && m.labels.result === 'hit'
            )
            const missMetric = metrics.find(m =>
                m.type === 'counter' && m.labels.result === 'miss'
            )

            if (hitMetric?.type === 'counter') {
                expect(hitMetric.value).toBe(2)
            }
            if (missMetric?.type === 'counter') {
                expect(missMetric.value).toBe(1)
            }
        })
    })

    describe('trackProductSearch', () => {
        it('should track product search by source', () => {
            trackProductSearch('fatsecret', 15)

            const counterMetrics = metricsCollector.getMetricsByName('product_search_total')
            expect(counterMetrics).toHaveLength(1)
            if (counterMetrics[0].type === 'counter') {
                expect(counterMetrics[0].value).toBe(1)
                expect(counterMetrics[0].labels.source).toBe('fatsecret')
            }

            const histogramMetrics = metricsCollector.getMetricsByName('product_search_results_count')
            expect(histogramMetrics).toHaveLength(1)
            if (histogramMetrics[0].type === 'histogram') {
                expect(histogramMetrics[0].observations).toContain(15)
                expect(histogramMetrics[0].labels.source).toBe('fatsecret')
            }
        })

        it('should track searches from different sources', () => {
            trackProductSearch('fatsecret', 10)
            trackProductSearch('database', 20)
            trackProductSearch('openfoodfacts', 5)

            const metrics = metricsCollector.getMetricsByName('product_search_total')
            expect(metrics).toHaveLength(3)
        })
    })

    describe('trackBarcodeSearch', () => {
        it('should track barcode search by source', () => {
            trackBarcodeSearch('fatsecret')

            const metrics = metricsCollector.getMetricsByName('barcode_search_total')
            expect(metrics).toHaveLength(1)
            if (metrics[0].type === 'counter') {
                expect(metrics[0].value).toBe(1)
                expect(metrics[0].labels.source).toBe('fatsecret')
            }
        })

        it('should track not found barcodes', () => {
            trackBarcodeSearch('not_found')

            const metrics = metricsCollector.getMetricsByName('barcode_search_total')
            expect(metrics).toHaveLength(1)
            if (metrics[0].type === 'counter') {
                expect(metrics[0].labels.source).toBe('not_found')
            }
        })
    })

    describe('trackTokenRefresh', () => {
        it('should track successful token refresh', () => {
            trackTokenRefresh(true)

            const metrics = metricsCollector.getMetricsByName('fatsecret_token_refresh_total')
            expect(metrics).toHaveLength(1)
            if (metrics[0].type === 'counter') {
                expect(metrics[0].value).toBe(1)
                expect(metrics[0].labels.status).toBe('success')
            }
        })

        it('should track failed token refresh', () => {
            trackTokenRefresh(false)

            const metrics = metricsCollector.getMetricsByName('fatsecret_token_refresh_total')
            expect(metrics).toHaveLength(1)
            if (metrics[0].type === 'counter') {
                expect(metrics[0].labels.status).toBe('error')
            }
        })
    })

    describe('updateCacheHitRate', () => {
        it('should calculate cache hit rate correctly', () => {
            // Simulate cache hits and misses
            trackCacheHit(true, 'database')
            trackCacheHit(true, 'database')
            trackCacheHit(true, 'database')
            trackCacheHit(false, 'database')

            updateCacheHitRate()

            const metrics = metricsCollector.getMetricsByName('fatsecret_cache_hit_rate')
            expect(metrics).toHaveLength(1)
            if (metrics[0].type === 'gauge') {
                expect(metrics[0].value).toBe(0.75) // 3 hits / 4 total = 0.75
            }
        })

        it('should handle zero requests', () => {
            updateCacheHitRate()

            const metrics = metricsCollector.getMetricsByName('fatsecret_cache_hit_rate')
            expect(metrics).toHaveLength(1)
            if (metrics[0].type === 'gauge') {
                expect(metrics[0].value).toBe(0)
            }
        })

        it('should handle all hits', () => {
            trackCacheHit(true, 'database')
            trackCacheHit(true, 'database')

            updateCacheHitRate()

            const metrics = metricsCollector.getMetricsByName('fatsecret_cache_hit_rate')
            if (metrics[0].type === 'gauge') {
                expect(metrics[0].value).toBe(1.0)
            }
        })

        it('should handle all misses', () => {
            trackCacheHit(false, 'database')
            trackCacheHit(false, 'database')

            updateCacheHitRate()

            const metrics = metricsCollector.getMetricsByName('fatsecret_cache_hit_rate')
            if (metrics[0].type === 'gauge') {
                expect(metrics[0].value).toBe(0)
            }
        })
    })

    describe('updateFallbackRate', () => {
        it('should calculate fallback rate correctly', () => {
            // Simulate API calls and fallbacks
            trackFatSecretApiCall('foods.search.v4', true, 200)
            trackFatSecretApiCall('foods.search.v4', true, 300)
            trackFatSecretApiCall('foods.search.v4', false, 5000)
            trackFatSecretApiCall('food.get.v4', false, 5000)

            trackFallbackActivation('api_error', 'openfoodfacts')

            updateFallbackRate()

            const metrics = metricsCollector.getMetricsByName('fatsecret_fallback_rate')
            expect(metrics).toHaveLength(1)
            if (metrics[0].type === 'gauge') {
                expect(metrics[0].value).toBe(0.25) // 1 fallback / 4 API calls = 0.25
            }
        })

        it('should handle zero API calls', () => {
            updateFallbackRate()

            const metrics = metricsCollector.getMetricsByName('fatsecret_fallback_rate')
            expect(metrics).toHaveLength(1)
            if (metrics[0].type === 'gauge') {
                expect(metrics[0].value).toBe(0)
            }
        })

        it('should handle no fallbacks', () => {
            trackFatSecretApiCall('foods.search.v4', true, 200)
            trackFatSecretApiCall('foods.search.v4', true, 300)

            updateFallbackRate()

            const metrics = metricsCollector.getMetricsByName('fatsecret_fallback_rate')
            if (metrics[0].type === 'gauge') {
                expect(metrics[0].value).toBe(0)
            }
        })
    })

    describe('Metrics export format', () => {
        it('should export metrics in correct format', () => {
            // Track various metrics
            trackFatSecretApiCall('foods.search.v4', true, 250)
            trackFallbackActivation('api_error', 'openfoodfacts')
            trackCacheHit(true, 'database')
            trackProductSearch('fatsecret', 10)
            trackBarcodeSearch('fatsecret')
            trackTokenRefresh(true)

            const allMetrics = metricsCollector.getAllMetrics()

            // Verify all metrics are present
            expect(allMetrics.length).toBeGreaterThan(0)

            // Verify each metric has required fields
            allMetrics.forEach(metric => {
                expect(metric).toHaveProperty('type')
                expect(metric).toHaveProperty('name')
                expect(metric).toHaveProperty('help')
                expect(metric).toHaveProperty('labels')

                if (metric.type === 'counter' || metric.type === 'gauge') {
                    expect(metric).toHaveProperty('value')
                    expect(typeof metric.value).toBe('number')
                }

                if (metric.type === 'histogram') {
                    expect(metric).toHaveProperty('observations')
                    expect(metric).toHaveProperty('sum')
                    expect(metric).toHaveProperty('count')
                    expect(metric).toHaveProperty('buckets')
                }
            })
        })
    })
})
