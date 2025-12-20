/**
 * Утилиты для работы с Open Food Facts API и базой данных продуктов
 */

import { createClient } from '@/utils/supabase/client'
import { logger } from '@/utils/logger'

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

export interface Product {
    id?: string
    name: string
    brand?: string
    barcode?: string | null
    calories_per_100g: number
    protein_per_100g: number
    fats_per_100g: number
    carbs_per_100g: number
    source: 'openfoodfacts' | 'usda' | 'user'
    source_id?: string | null
    image_url?: string | null
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
            id: p.id,
            name: p.name,
            brand: p.brand,
            barcode: p.barcode,
            calories_per_100g: p.calories_per_100g,
            protein_per_100g: p.protein_per_100g,
            fats_per_100g: p.fats_per_100g,
            carbs_per_100g: p.carbs_per_100g,
            source: p.source,
            source_id: p.source_id,
            image_url: p.image_url,
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

        // Проверяем, существует ли продукт (по штрих-коду или названию)
        let existingProduct = null

        if (product.barcode) {
            const { data } = await supabase
                .from('products')
                .select('id')
                .eq('barcode', product.barcode)
                .single()
            existingProduct = data
        }

        if (!existingProduct && product.source_id) {
            const { data } = await supabase
                .from('products')
                .select('id')
                .eq('source_id', product.source_id)
                .eq('source', product.source)
                .single()
            existingProduct = data
        }

        if (existingProduct) {
            // Продукт уже существует, возвращаем его ID
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
            logger.warn('Products DB: ошибка сохранения продукта', { error, product })
            return null
        }

        logger.debug('Products DB: продукт сохранен', { productId: data.id, name: product.name })
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
 * Поиск продуктов (сначала БД, потом API)
 */
export async function searchProducts(query: string, limit: number = 20): Promise<Product[]> {
    if (!query || query.length < 2) {
        return []
    }

    try {
        // Сначала ищем в БД
        const dbResults = await searchProductsInDB(query, limit)
        
        if (dbResults.length >= limit) {
            // Если нашли достаточно в БД, возвращаем их
            return dbResults
        }

        // Если в БД недостаточно результатов, ищем через API
        const apiResults = await searchProductsInAPI(query, limit - dbResults.length)
        
        // Сохраняем результаты из API в БД (асинхронно, не блокируем ответ)
        apiResults.forEach(product => {
            saveProductToDB(product).then(productId => {
                if (productId) {
                    product.id = productId
                }
            }).catch(() => {
                // Игнорируем ошибки сохранения
            })
        })

        // Объединяем результаты: сначала из БД (популярные), потом из API
        return [...dbResults, ...apiResults].slice(0, limit)
    } catch (error) {
        logger.error('Products: ошибка поиска продуктов', error, { query })
        // Fallback: пытаемся вернуть результаты из БД, если они есть
        const dbResults = await searchProductsInDB(query, limit)
        return dbResults
    }
}

/**
 * Получение продукта по штрих-коду (сначала БД, потом API)
 */
export async function getProductByBarcode(barcode: string): Promise<Product | null> {
    try {
        // Сначала проверяем БД
        const supabase = createClient()
        const { data: dbProduct } = await supabase
            .from('products')
            .select('*')
            .eq('barcode', barcode)
            .single()

        if (dbProduct) {
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

        // Если не нашли в БД, ищем через API
        const url = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`

        logger.debug('Products API: получение продукта по штрих-коду', { barcode })

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
        })

        if (!response.ok) {
            if (response.status === 404) {
                return null
            }
            throw new Error(`Open Food Facts API error: ${response.status}`)
        }

        const data = await response.json()

        if (data.status === 0 || !data.product) {
            return null
        }

        const product = transformProduct(data.product)
        
        // Сохраняем в БД (асинхронно)
        saveProductToDB(product).then(productId => {
            if (productId) {
                product.id = productId
            }
        }).catch(() => {
            // Игнорируем ошибки сохранения
        })

        return product
    } catch (error) {
        logger.error('Products API: ошибка получения продукта по штрих-коду', error, { barcode })
        throw error
    }
}

