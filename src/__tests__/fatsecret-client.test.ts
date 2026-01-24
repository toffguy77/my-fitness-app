/**
 * Unit Tests: FatSecret API Client
 * Tests for FatSecret client functionality
 * **Validates: Requirements 2.1, 6.2**
 */

import { FatSecretClient, resetFatSecretClient } from '@/utils/products/fatsecret'
import { resetFatSecretAuthManager } from '@/utils/products/fatsecret-auth'
import type { FatSecretConfiguration } from '@/config/fatsecret'

describe('FatSecret API Client', () => {
    let originalFetch: typeof global.fetch
    const testConfig: FatSecretConfiguration = {
        enabled: true,
        clientId: 'test_id',
        clientSecret: 'test_secret',
        baseUrl: 'https://platform.fatsecret.com/rest/server.api',
        timeout: 5000,
        maxResults: 20,
        fallbackEnabled: true,
        region: 'US',
        language: 'en'
    }

    beforeAll(() => {
        originalFetch = global.fetch
    })

    beforeEach(() => {
        resetFatSecretClient()
        resetFatSecretAuthManager()
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    afterAll(() => {
        global.fetch = originalFetch
    })

    describe('searchFoods', () => {
        it('should return results for valid query', async () => {
            global.fetch = jest.fn(async (input: RequestInfo | URL) => {
                const url = typeof input === 'string' ? input : input.toString()

                if (url.includes('oauth.fatsecret.com')) {
                    return {
                        ok: true,
                        json: async () => ({
                            access_token: 'test_token',
                            token_type: 'Bearer',
                            expires_in: 3600
                        })
                    } as Response
                }

                return {
                    ok: true,
                    json: async () => ({
                        foods: {
                            food: [
                                {
                                    food_id: '123',
                                    food_name: 'Apple',
                                    food_type: 'Generic',
                                    servings: {
                                        serving: {
                                            serving_id: '1',
                                            serving_description: '100g',
                                            metric_serving_amount: '100',
                                            metric_serving_unit: 'g',
                                            calories: '52',
                                            carbohydrate: '14',
                                            protein: '0.3',
                                            fat: '0.2'
                                        }
                                    }
                                }
                            ]
                        }
                    })
                } as Response
            }) as jest.Mock

            const client = new FatSecretClient(testConfig)
            const results = await client.searchFoods('apple', 10, 0)

            expect(results).toHaveLength(1)
            expect(results[0].food_name).toBe('Apple')
            expect(results[0].food_id).toBe('123')
        })

        it('should return empty array for short query', async () => {
            const client = new FatSecretClient(testConfig)
            const results = await client.searchFoods('a', 10, 0)

            expect(results).toEqual([])
        })

        it('should return empty array when no results found', async () => {
            global.fetch = jest.fn(async (input: RequestInfo | URL) => {
                const url = typeof input === 'string' ? input : input.toString()

                if (url.includes('oauth.fatsecret.com')) {
                    return {
                        ok: true,
                        json: async () => ({
                            access_token: 'test_token',
                            token_type: 'Bearer',
                            expires_in: 3600
                        })
                    } as Response
                }

                return {
                    ok: true,
                    json: async () => ({ foods: {} })
                } as Response
            }) as jest.Mock

            const client = new FatSecretClient(testConfig)
            const results = await client.searchFoods('nonexistent', 10, 0)

            expect(results).toEqual([])
        })

        it('should normalize single food result to array', async () => {
            global.fetch = jest.fn(async (input: RequestInfo | URL) => {
                const url = typeof input === 'string' ? input : input.toString()

                if (url.includes('oauth.fatsecret.com')) {
                    return {
                        ok: true,
                        json: async () => ({
                            access_token: 'test_token',
                            token_type: 'Bearer',
                            expires_in: 3600
                        })
                    } as Response
                }

                return {
                    ok: true,
                    json: async () => ({
                        foods: {
                            food: {
                                food_id: '123',
                                food_name: 'Apple',
                                food_type: 'Generic',
                                servings: {
                                    serving: {
                                        serving_id: '1',
                                        serving_description: '100g',
                                        metric_serving_amount: '100',
                                        metric_serving_unit: 'g',
                                        calories: '52',
                                        carbohydrate: '14',
                                        protein: '0.3',
                                        fat: '0.2'
                                    }
                                }
                            }
                        }
                    })
                } as Response
            }) as jest.Mock

            const client = new FatSecretClient(testConfig)
            const results = await client.searchFoods('apple', 10, 0)

            expect(Array.isArray(results)).toBe(true)
            expect(results).toHaveLength(1)
        })
    })

    describe('getFoodById', () => {
        it('should return food details for valid ID', async () => {
            global.fetch = jest.fn(async (input: RequestInfo | URL) => {
                const url = typeof input === 'string' ? input : input.toString()

                if (url.includes('oauth.fatsecret.com')) {
                    return {
                        ok: true,
                        json: async () => ({
                            access_token: 'test_token',
                            token_type: 'Bearer',
                            expires_in: 3600
                        })
                    } as Response
                }

                return {
                    ok: true,
                    json: async () => ({
                        food: {
                            food_id: '123',
                            food_name: 'Apple',
                            food_type: 'Generic',
                            servings: {
                                serving: {
                                    serving_id: '1',
                                    serving_description: '100g',
                                    metric_serving_amount: '100',
                                    metric_serving_unit: 'g',
                                    calories: '52',
                                    carbohydrate: '14',
                                    protein: '0.3',
                                    fat: '0.2'
                                }
                            }
                        }
                    })
                } as Response
            }) as jest.Mock

            const client = new FatSecretClient(testConfig)
            const food = await client.getFoodById('123')

            expect(food).not.toBeNull()
            expect(food?.food_id).toBe('123')
            expect(food?.food_name).toBe('Apple')
        })

        it('should return null for empty food ID', async () => {
            const client = new FatSecretClient(testConfig)
            const food = await client.getFoodById('')

            expect(food).toBeNull()
        })

        it('should return null when food not found', async () => {
            global.fetch = jest.fn(async (input: RequestInfo | URL) => {
                const url = typeof input === 'string' ? input : input.toString()

                if (url.includes('oauth.fatsecret.com')) {
                    return {
                        ok: true,
                        json: async () => ({
                            access_token: 'test_token',
                            token_type: 'Bearer',
                            expires_in: 3600
                        })
                    } as Response
                }

                return {
                    ok: true,
                    json: async () => ({})
                } as Response
            }) as jest.Mock

            const client = new FatSecretClient(testConfig)
            const food = await client.getFoodById('999')

            expect(food).toBeNull()
        })
    })

    describe('findFoodByBarcode', () => {
        it('should find food by valid barcode', async () => {
            global.fetch = jest.fn(async (input: RequestInfo | URL) => {
                const url = typeof input === 'string' ? input : input.toString()

                if (url.includes('oauth.fatsecret.com')) {
                    return {
                        ok: true,
                        json: async () => ({
                            access_token: 'test_token',
                            token_type: 'Bearer',
                            expires_in: 3600
                        })
                    } as Response
                }

                if (url.includes('find_id_for_barcode')) {
                    return {
                        ok: true,
                        json: async () => ({
                            food_id: { value: '123' }
                        })
                    } as Response
                }

                return {
                    ok: true,
                    json: async () => ({
                        food: {
                            food_id: '123',
                            food_name: 'Coca Cola',
                            food_type: 'Brand',
                            brand_name: 'Coca-Cola',
                            servings: {
                                serving: {
                                    serving_id: '1',
                                    serving_description: '100ml',
                                    metric_serving_amount: '100',
                                    metric_serving_unit: 'ml',
                                    calories: '42',
                                    carbohydrate: '10.6',
                                    protein: '0',
                                    fat: '0'
                                }
                            }
                        }
                    })
                } as Response
            }) as jest.Mock

            const client = new FatSecretClient(testConfig)
            const food = await client.findFoodByBarcode('5449000000996')

            expect(food).not.toBeNull()
            expect(food?.food_id).toBe('123')
            expect(food?.food_name).toBe('Coca Cola')
        })

        it('should return null for empty barcode', async () => {
            const client = new FatSecretClient(testConfig)
            const food = await client.findFoodByBarcode('')

            expect(food).toBeNull()
        })

        it('should return null when barcode not found', async () => {
            global.fetch = jest.fn(async (input: RequestInfo | URL) => {
                const url = typeof input === 'string' ? input : input.toString()

                if (url.includes('oauth.fatsecret.com')) {
                    return {
                        ok: true,
                        json: async () => ({
                            access_token: 'test_token',
                            token_type: 'Bearer',
                            expires_in: 3600
                        })
                    } as Response
                }

                return {
                    ok: true,
                    json: async () => ({})
                } as Response
            }) as jest.Mock

            const client = new FatSecretClient(testConfig)
            const food = await client.findFoodByBarcode('9999999999999')

            expect(food).toBeNull()
        })
    })

    describe('error handling', () => {
        it('should handle network failures', async () => {
            global.fetch = jest.fn(async (input: RequestInfo | URL) => {
                const url = typeof input === 'string' ? input : input.toString()

                if (url.includes('oauth.fatsecret.com')) {
                    return {
                        ok: true,
                        json: async () => ({
                            access_token: 'test_token',
                            token_type: 'Bearer',
                            expires_in: 3600
                        })
                    } as Response
                }

                throw new Error('Network error')
            }) as jest.Mock

            const client = new FatSecretClient(testConfig)

            await expect(client.searchFoods('apple', 10, 0)).rejects.toThrow('Network error')
        })

        it('should handle API errors', async () => {
            global.fetch = jest.fn(async (input: RequestInfo | URL) => {
                const url = typeof input === 'string' ? input : input.toString()

                if (url.includes('oauth.fatsecret.com')) {
                    return {
                        ok: true,
                        json: async () => ({
                            access_token: 'test_token',
                            token_type: 'Bearer',
                            expires_in: 3600
                        })
                    } as Response
                }

                return {
                    ok: false,
                    status: 500,
                    statusText: 'Internal Server Error',
                    text: async () => 'Server error'
                } as Response
            }) as jest.Mock

            const client = new FatSecretClient(testConfig)

            await expect(client.searchFoods('apple', 10, 0)).rejects.toThrow('FatSecret API error')
        })
    })
})
