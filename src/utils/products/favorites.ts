/**
 * Утилиты для работы с избранными продуктами
 */

import { createClient } from '@/utils/supabase/client'
import { logger } from '@/utils/logger'
import type { Product } from '@/types/products'

/**
 * Добавить продукт в избранное
 */
export async function addToFavorites(
    userId: string,
    productId?: string,
    userProductId?: string
): Promise<boolean> {
    const supabase = createClient()

    if (!productId && !userProductId) {
        throw new Error('Необходимо указать productId или userProductId')
    }

    if (productId && userProductId) {
        throw new Error('Нельзя указать одновременно productId и userProductId')
    }

    try {
        const { error } = await supabase
            .from('favorite_products')
            .insert({
                user_id: userId,
                product_id: productId || null,
                user_product_id: userProductId || null,
            })

        if (error) {
            // Если продукт уже в избранном, это не ошибка
            if (error.code === '23505') {
                logger.debug('Products: продукт уже в избранном', { userId, productId, userProductId })
                return true
            }
            throw error
        }

        logger.info('Products: продукт добавлен в избранное', { userId, productId, userProductId })
        return true
    } catch (error) {
        logger.error('Products: ошибка добавления в избранное', error, { userId, productId, userProductId })
        throw error
    }
}

/**
 * Удалить продукт из избранного
 */
export async function removeFromFavorites(
    userId: string,
    productId?: string,
    userProductId?: string
): Promise<boolean> {
    const supabase = createClient()

    if (!productId && !userProductId) {
        throw new Error('Необходимо указать productId или userProductId')
    }

    try {
        const query = supabase
            .from('favorite_products')
            .delete()
            .eq('user_id', userId)

        if (productId) {
            query.eq('product_id', productId)
        } else if (userProductId) {
            query.eq('user_product_id', userProductId)
        }

        const { error } = await query

        if (error) {
            throw error
        }

        logger.info('Products: продукт удален из избранного', { userId, productId, userProductId })
        return true
    } catch (error) {
        logger.error('Products: ошибка удаления из избранного', error, { userId, productId, userProductId })
        throw error
    }
}

/**
 * Проверить, находится ли продукт в избранном
 */
export async function isFavorite(
    userId: string,
    productId?: string,
    userProductId?: string
): Promise<boolean> {
    const supabase = createClient()

    if (!productId && !userProductId) {
        return false
    }

    try {
        const query = supabase
            .from('favorite_products')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)

        if (productId) {
            query.eq('product_id', productId)
        } else if (userProductId) {
            query.eq('user_product_id', userProductId)
        }

        const { count, error } = await query

        if (error) {
            throw error
        }

        return (count || 0) > 0
    } catch (error) {
        logger.error('Products: ошибка проверки избранного', error, { userId, productId, userProductId })
        return false
    }
}

/**
 * Получить список избранных продуктов пользователя
 */
export async function getFavoriteProducts(userId: string): Promise<Product[]> {
    const supabase = createClient()

    try {
        const { data, error } = await supabase
            .from('favorite_products')
            .select(`
        product_id,
        user_product_id,
        products (*),
        user_products (*)
      `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })

        if (error) {
            throw error
        }

        // Преобразуем в формат Product
        const products: Product[] = []

        for (const item of data || []) {
            if (item.product_id && item.products) {
                const p = item.products as any
                products.push({
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
                })
            } else if (item.user_product_id && item.user_products) {
                const up = item.user_products as any
                products.push({
                    id: up.id,
                    name: up.name,
                    calories_per_100g: up.calories_per_100g,
                    protein_per_100g: up.protein_per_100g,
                    fats_per_100g: up.fats_per_100g,
                    carbs_per_100g: up.carbs_per_100g,
                    source: 'user',
                })
            }
        }

        logger.debug('Products: избранные продукты загружены', { userId, count: products.length })
        return products
    } catch (error) {
        logger.error('Products: ошибка загрузки избранных продуктов', error, { userId })
        throw error
    }
}

