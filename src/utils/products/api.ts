/**
 * Утилиты для работы с Open Food Facts API и базой данных продуктов
 */

import { createClient } from '@/utils/supabase/client'
import { logger, logRLSError, handleSupabaseError } from '@/utils/logger'
import { getFatSecretClient } from './fatsecret'
import { transformFatSecretFood } from './transform'
import { getFatSecretConfig } from '@/config/fatsecret'
import {
    trackCacheHit,
    trackFallbackActivation,
    trackProductSearch,
    trackBarcodeSearch
} from './fatsecret-metrics'
import type { Product } from '@/types/products'

export interface OpenFoodFactsProduct {
    code?: string
    product_name?: string
    product_name_en?: string
    brands?: string
    nutriments?: {
        'energy-kcal_100g'?: number
        'proteins_100g'?: number
        'fat_100g'?: number
        'carbohydrates_100g'?: number
    }
    image_url?: string
    image_front_url?: string
}

/**
 * Преобразует продукт из Open Food Facts API в наш формат
 */
export function transformProduct(product: OpenFoodFactsProduct): Product {
    const nutriments = product.nutriments || {}

    return {
        name: product.product_name || product.product_name_en || 'Unknown',
        brand: product.brands || undefined,
        barcode: product.code || null,
        calories_per_100g: nutriments['energy-kcal_100g'] || 0,
        protein_per_100g: nutriments['proteins_100g'] || 0,
        fats_per_100g: nutriments['fat_100g'] || 0,
        carbs_per_100g: nutriments['carbohydrates_100g'] || 0,
        image_url: product.image_url || product.image_front_url || null,
        source: 'openfoodfacts',
        source_id: product.code || null,
    }
}

/**
 * Поиск продуктов в базе данных
 */
export async function searchProductsInDB(query: string, limit: number = 20): Promise<Product[]> {
    try {
        const supabase = createClient()

        // Используем полнотекстовый поиск PostgreSQL
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .or(`name.ilike.%${query}%,brand.ilike.%${query}%`)
            .order('usage_count', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(limit)

        if (error) {
            logger.warn('Products DB: ошибка поиска в БД', { error, query })
            return []
        }

        return (data || []).map((p: Record<string, unknown>) => ({
            id: p.id as string | undefined,
            name: p.name as string,
            brand: p.brand as string | undefined,
            barcode: p.barcode as string | null | undefined,
            calories_per_100g: p.calories_per_100g as number,
            protein_per_100g: p.protein_per_100g as number,
            fats_per_100g: p.fats_per_100g as number,
            carbs_per_100g: p.carbs_per_100g as number,
            source: (p.source as 'openfoodfacts' | 'usda' | 'user' | undefined) || 'user',
            source_id: p.source_id as string | undefined,
            image_url: p.image_url as string | undefined,
        }))
    } catch (error) {
        logger.error('Products DB: ошибка поиска в БД', error, { query })
        return []
    }
}

/**
 * Сохранение продукта в базу данных
 */
export async function saveProductToDB(product: Product): Promise<string | null> {
    try {
        const supabase = createClient()

        // Проверяем, существует ли продукт (по source_id и source, или по штрих-коду)
        let existingProduct = null

        // Приоритет 1: Проверка по source_id и source (для FatSecret и других API)
        if (product.source_id && product.source) {
            const { data } = await supabase
                .from('products')
                .select('id')
                .eq('source_id', product.source_id)
                .eq('source', product.source)
                .single()
            existingProduct = data
        }

        // Приоритет 2: Проверка по штрих-коду (если есть)
        if (!existingProduct && product.barcode) {
            const { data } = await supabase
                .from('products')
                .select('id')
                .eq('barcode', product.barcode)
                .single()
            existingProduct = data
        }

        if (existingProduct) {
            // Продукт уже существует, увеличиваем usage_count
            // Сначала получаем текущее значение
            const { data: currentProduct } = await supabase
                .from('products')
                .select('usage_count')
                .eq('id', existingProduct.id)
                .single()

            const currentCount = currentProduct?.usage_count || 0

            const { error: updateError } = await supabase
                .from('products')
                .update({
                    usage_count: currentCount + 1
                })
                .eq('id', existingProduct.id)

            if (updateError) {
                logger.warn('Products DB: ошибка увеличения usage_count', {
                    error: updateError,
                    productId: existingProduct.id
                })
            } else {
                logger.debug('Products DB: продукт уже существует, usage_count увеличен', {
                    productId: existingProduct.id,
                    source: product.source,
                    source_id: product.source_id,
                    newCount: currentCount + 1
                })
            }

            return existingProduct.id
        }

        // Создаем новый продукт
        const { data, error } = await supabase
            .from('products')
            .insert({
                name: product.name,
                brand: product.brand || null,
                barcode: product.barcode || null,
                calories_per_100g: product.calories_per_100g,
                protein_per_100g: product.protein_per_100g,
                fats_per_100g: product.fats_per_100g,
                carbs_per_100g: product.carbs_per_100g,
                source: product.source,
                source_id: product.source_id || null,
                image_url: product.image_url || null,
            })
            .select('id')
            .single()

        if (error) {
            // Use enhanced error logging for RLS violations
            handleSupabaseError(error, {
                table: 'products',
                operation: 'INSERT'
            })
            return null
        }

        logger.debug('Products DB: продукт сохранен', {
            productId: data.id,
            name: product.name,
            source: product.source
        })
        return data.id
    } catch (error) {
        logger.error('Products DB: ошибка сохранения продукта', error, { product })
        return null
    }
}

/**
 * Увеличение счетчика использования продукта
 */
export async function incrementProductUsage(productId: string): Promise<void> {
    try {
        const supabase = createClient()

        // Получаем текущее значение и увеличиваем
        const { data: product } = await supabase
            .from('products')
            .select('usage_count')
            .eq('id', productId)
            .single()

        if (product) {
            await supabase
                .from('products')
                .update({ usage_count: (product.usage_count || 0) + 1 })
                .eq('id', productId)
        }
    } catch (error) {
        // Игнорируем ошибки увеличения счетчика (не критично)
        logger.warn('Products DB: ошибка увеличения счетчика использования', { error, productId })
    }
}

/**
 * Поиск продуктов через Open Food Facts API
 */
export async function searchProductsInAPI(query: string, limit: number = 20): Promise<Product[]> {
    if (!query || query.length < 2) {
        return []
    }

    try {
        const encodedQuery = encodeURIComponent(query)
        const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodedQuery}&page_size=${limit}&json=true&fields=code,product_name,product_name_en,brands,nutriments,image_url,image_front_url`

        logger.debug('Products API: поиск продуктов', { query, limit })

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
        })

        if (!response.ok) {
            throw new Error(`Open Food Facts API error: ${response.status}`)
        }

        const data = await response.json()
        const products = data.products || []

        logger.debug('Products API: найдено продуктов', { count: products.length })

        return products
            .filter((p: OpenFoodFactsProduct) => p.product_name || p.product_name_en)
            .map(transformProduct)
            .filter((p: Product) => p.calories_per_100g > 0) // Фильтруем продукты без данных о калориях
    } catch (error) {
        logger.error('Products API: ошибка поиска продуктов', error, { query })
        throw error
    }
}

/**
 * Поиск продуктов через FatSecret API
 */
export async function searchFatSecretAPI(query: string, limit: number = 20): Promise<Product[]> {
    if (!query || query.length < 2) {
        return []
    }

    try {
        const config = getFatSecretConfig()

        if (!config.enabled) {
            logger.debug('FatSecret: integration disabled, skipping search', {
                query,
                reason: 'integration_disabled'
            })
            return []
        }

        logger.debug('FatSecret: starting API search', {
            query,
            limit,
            timestamp: new Date().toISOString()
        })

        const client = getFatSecretClient()
        const foods = await client.searchFoods(query, limit, 0)

        logger.info('FatSecret: search completed successfully', {
            query,
            resultsCount: foods.length,
            limit
        })

        return foods.map(transformFatSecretFood)
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)

        logger.error('FatSecret: search failed', {
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined,
            query,
            limit,
            timestamp: new Date().toISOString()
        })

        throw error
    }
}

/**
 * Поиск продуктов (сначала БД, потом FatSecret API, потом Open Food Facts)
 */
export async function searchProducts(query: string, limit: number = 20): Promise<Product[]> {
    if (!query || query.length < 2) {
        return []
    }

    try {
        logger.debug('Products: starting product search', {
            query,
            limit,
            timestamp: new Date().toISOString()
        })

        // 1. Сначала ищем в БД
        const dbResults = await searchProductsInDB(query, limit)

        // Track cache hit/miss
        if (dbResults.length > 0) {
            trackCacheHit(true, 'database')
        } else {
            trackCacheHit(false, 'database')
        }

        logger.debug('Products: database search completed', {
            query,
            resultsCount: dbResults.length,
            limit
        })

        if (dbResults.length >= limit) {
            // Если нашли достаточно в БД, возвращаем их
            logger.info('Products: sufficient results from database', {
                query,
                resultsCount: dbResults.length
            })
            trackProductSearch('database', dbResults.length)
            return dbResults
        }

        // 2. Если в БД недостаточно результатов, ищем через FatSecret API
        const remainingLimit = limit - dbResults.length
        let apiResults: Product[] = []

        try {
            logger.debug('Products: attempting FatSecret API search', {
                query,
                remainingLimit
            })

            const fatSecretResults = await searchFatSecretAPI(query, remainingLimit)

            // Если FatSecret вернул результаты, используем их
            if (fatSecretResults.length > 0) {
                apiResults = fatSecretResults

                // Track successful FatSecret search
                trackProductSearch('fatsecret', fatSecretResults.length)

                // Сохраняем результаты из FatSecret в БД (асинхронно, не блокируем ответ)
                fatSecretResults.forEach(product => {
                    saveProductToDB(product).then(productId => {
                        if (productId) {
                            product.id = productId
                        }
                    }).catch(err => {
                        logger.warn('Products: ошибка сохранения продукта FatSecret в БД', {
                            error: err instanceof Error ? err.message : String(err),
                            productId: product.source_id,
                            productName: product.name
                        })
                    })
                })

                logger.info('Products: FatSecret API search successful', {
                    query,
                    resultsCount: fatSecretResults.length,
                    source: 'fatsecret'
                })
            } else {
                // FatSecret не вернул результатов, пробуем Open Food Facts
                logger.info('Products: FatSecret returned no results, activating fallback', {
                    query,
                    reason: 'no_results',
                    fallbackSource: 'openfoodfacts',
                    timestamp: new Date().toISOString()
                })
                trackFallbackActivation('no_results', 'openfoodfacts')
                throw new Error('No results from FatSecret')
            }
        } catch (fatSecretError) {
            const errorMessage = fatSecretError instanceof Error ? fatSecretError.message : String(fatSecretError)

            logger.warn('Products: FatSecret API failed, activating fallback', {
                error: errorMessage,
                query,
                reason: 'api_error',
                fallbackSource: 'openfoodfacts',
                timestamp: new Date().toISOString()
            })

            // Track fallback activation
            trackFallbackActivation('api_error', 'openfoodfacts')

            // 3. Fallback: ищем через Open Food Facts
            try {
                logger.debug('Products: attempting Open Food Facts API search', {
                    query,
                    remainingLimit
                })

                const openFoodFactsResults = await searchProductsInAPI(query, remainingLimit)
                apiResults = openFoodFactsResults

                // Track successful Open Food Facts search
                trackProductSearch('openfoodfacts', openFoodFactsResults.length)

                // Сохраняем результаты из Open Food Facts в БД (асинхронно)
                openFoodFactsResults.forEach(product => {
                    saveProductToDB(product).then(productId => {
                        if (productId) {
                            product.id = productId
                        }
                    }).catch(err => {
                        logger.warn('Products: ошибка сохранения продукта Open Food Facts в БД', {
                            error: err instanceof Error ? err.message : String(err),
                            productName: product.name
                        })
                    })
                })

                logger.info('Products: Open Food Facts API search successful (fallback)', {
                    query,
                    resultsCount: openFoodFactsResults.length,
                    source: 'openfoodfacts',
                    fallbackActivated: true
                })
            } catch (openFoodFactsError) {
                logger.error('Products: both APIs failed, returning database results only', {
                    fatSecretError: errorMessage,
                    openFoodFactsError: openFoodFactsError instanceof Error ? openFoodFactsError.message : String(openFoodFactsError),
                    query,
                    dbResultsCount: dbResults.length,
                    timestamp: new Date().toISOString()
                })
                // Возвращаем только результаты из БД
                return dbResults
            }
        }

        // Объединяем результаты: сначала из БД (популярные), потом из API
        const combinedResults = [...dbResults, ...apiResults].slice(0, limit)

        logger.info('Products: search completed successfully', {
            query,
            totalResults: combinedResults.length,
            dbResults: dbResults.length,
            apiResults: apiResults.length
        })

        return combinedResults
    } catch (error) {
        logger.error('Products: search failed completely', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            query,
            timestamp: new Date().toISOString()
        })
        // Fallback: пытаемся вернуть результаты из БД, если они есть
        try {
            const dbResults = await searchProductsInDB(query, limit)
            logger.info('Products: returning database results after error', {
                query,
                resultsCount: dbResults.length
            })
            return dbResults
        } catch (dbError) {
            logger.error('Products: database fallback also failed', {
                error: dbError instanceof Error ? dbError.message : String(dbError),
                query
            })
            return []
        }
    }
}

/**
 * Получение продукта по штрих-коду (сначала БД, потом FatSecret, потом Open Food Facts)
 */
export async function getProductByBarcode(barcode: string): Promise<Product | null> {
    try {
        logger.debug('Products: starting barcode search', {
            barcode,
            timestamp: new Date().toISOString()
        })

        // 1. Сначала проверяем БД
        const supabase = createClient()
        const { data: dbProduct } = await supabase
            .from('products')
            .select('*')
            .eq('barcode', barcode)
            .single()

        if (dbProduct) {
            logger.info('Products: product found in database by barcode', {
                barcode,
                productId: dbProduct.id,
                productName: dbProduct.name,
                source: 'database'
            })
            trackBarcodeSearch('database')
            return {
                id: dbProduct.id,
                name: dbProduct.name,
                brand: dbProduct.brand,
                barcode: dbProduct.barcode,
                calories_per_100g: dbProduct.calories_per_100g,
                protein_per_100g: dbProduct.protein_per_100g,
                fats_per_100g: dbProduct.fats_per_100g,
                carbs_per_100g: dbProduct.carbs_per_100g,
                source: dbProduct.source,
                source_id: dbProduct.source_id,
                image_url: dbProduct.image_url,
            }
        }

        logger.debug('Products: product not in database, trying FatSecret', {
            barcode
        })

        // 2. Если не нашли в БД, пробуем FatSecret API
        try {
            const config = getFatSecretConfig()

            if (config.enabled) {
                logger.debug('Products: attempting FatSecret barcode search', {
                    barcode
                })

                const client = getFatSecretClient()
                const food = await client.findFoodByBarcode(barcode)

                if (food) {
                    const product = transformFatSecretFood(food)
                    product.barcode = barcode // Добавляем штрих-код к продукту

                    logger.info('Products: product found in FatSecret by barcode', {
                        barcode,
                        productName: product.name,
                        source: 'fatsecret'
                    })

                    trackBarcodeSearch('fatsecret')

                    // Сохраняем в БД (асинхронно)
                    saveProductToDB(product).then(productId => {
                        if (productId) {
                            product.id = productId
                            logger.debug('Products: FatSecret product cached to database', {
                                barcode,
                                productId
                            })
                        }
                    }).catch(err => {
                        logger.warn('Products: failed to cache FatSecret product', {
                            error: err instanceof Error ? err.message : String(err),
                            barcode,
                            productName: product.name
                        })
                    })

                    return product
                }

                logger.debug('Products: product not found in FatSecret, trying fallback', {
                    barcode
                })
            } else {
                logger.debug('Products: FatSecret disabled, skipping to fallback', {
                    barcode
                })
            }
        } catch (fatSecretError) {
            const errorMessage = fatSecretError instanceof Error ? fatSecretError.message : String(fatSecretError)

            logger.warn('Products: FatSecret barcode search failed, activating fallback', {
                error: errorMessage,
                barcode,
                reason: 'api_error',
                fallbackSource: 'openfoodfacts',
                timestamp: new Date().toISOString()
            })

            // Track fallback activation
            trackFallbackActivation('api_error', 'openfoodfacts')
        }

        // 3. Fallback: пробуем Open Food Facts API
        logger.debug('Products: attempting Open Food Facts barcode search', {
            barcode
        })

        const url = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
        })

        if (!response.ok) {
            if (response.status === 404) {
                logger.info('Products: product not found by barcode in any source', {
                    barcode,
                    checkedSources: ['database', 'fatsecret', 'openfoodfacts']
                })
                return null
            }

            const errorMessage = `Open Food Facts API error: ${response.status}`
            logger.error('Products: Open Food Facts barcode search failed', {
                barcode,
                status: response.status,
                statusText: response.statusText,
                error: errorMessage,
                timestamp: new Date().toISOString()
            })
            throw new Error(errorMessage)
        }

        const data = await response.json()

        if (data.status === 0 || !data.product) {
            logger.info('Products: product not found by barcode in any source', {
                barcode,
                checkedSources: ['database', 'fatsecret', 'openfoodfacts']
            })
            trackBarcodeSearch('not_found')
            return null
        }

        const product = transformProduct(data.product)

        logger.info('Products: product found in Open Food Facts by barcode (fallback)', {
            barcode,
            productName: product.name,
            source: 'openfoodfacts',
            fallbackActivated: true
        })

        trackBarcodeSearch('openfoodfacts')

        // Сохраняем в БД (асинхронно)
        saveProductToDB(product).then(productId => {
            if (productId) {
                product.id = productId
                logger.debug('Products: Open Food Facts product cached to database', {
                    barcode,
                    productId
                })
            }
        }).catch(err => {
            logger.warn('Products: failed to cache Open Food Facts product', {
                error: err instanceof Error ? err.message : String(err),
                barcode,
                productName: product.name
            })
        })

        return product
    } catch (error) {
        logger.error('Products: barcode search failed completely', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            barcode,
            timestamp: new Date().toISOString()
        })
        return null
    }
}
