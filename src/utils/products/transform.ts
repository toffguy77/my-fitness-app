/**
 * Product Transformation Layer
 *
 * Converts FatSecret API responses to internal Product format.
 * Handles serving size calculations and data normalization.
 */

import { logger } from '@/utils/logger'
import type { FatSecretFood, FatSecretServing } from './fatsecret'
import type { Product } from '@/types/products'

/**
 * Transform FatSecret food item to internal Product format
 *
 * Converts FatSecret API response to our standardized Product interface.
 * Finds or calculates nutritional values per 100g serving.
 *
 * @param food - FatSecret food item from API
 * @returns Transformed product in internal format
 * @throws Error if food data is invalid or missing required fields
 *
 * @example
 * ```typescript
 * const fatSecretFood = await client.getFoodById('12345')
 * const product = transformFatSecretFood(fatSecretFood)
 * ```
 */
export function transformFatSecretFood(food: FatSecretFood): Product {
    if (!food || !food.food_id || !food.food_name) {
        throw new Error('Invalid FatSecret food: missing required fields')
    }

    // Normalize servings to array
    const servings = Array.isArray(food.servings.serving)
        ? food.servings.serving
        : [food.servings.serving]

    if (servings.length === 0) {
        throw new Error(`No servings available for food: ${food.food_name}`)
    }

    // Find or calculate 100g serving
    const serving100g = findOrCalculate100gServing(servings)

    if (!serving100g) {
        throw new Error(`Unable to calculate 100g serving for food: ${food.food_name}`)
    }

    // Parse nutritional values
    const calories = parseFloat(serving100g.calories) || 0
    const protein = parseFloat(serving100g.protein) || 0
    const fat = parseFloat(serving100g.fat) || 0
    const carbs = parseFloat(serving100g.carbohydrate) || 0

    // Extract image URL
    const imageUrl = extractImageUrl(food.food_images)

    // Build product
    const product: Product = {
        name: food.food_name,
        brand: food.brand_name || undefined,
        barcode: null, // FatSecret doesn't return barcode in search/details
        calories_per_100g: calories,
        protein_per_100g: protein,
        fats_per_100g: fat,
        carbs_per_100g: carbs,
        source: 'fatsecret' as const,
        source_id: food.food_id,
        image_url: imageUrl,
    }

    logger.debug('FatSecret: transformed food to product', {
        foodId: food.food_id,
        foodName: food.food_name,
        servingsCount: servings.length,
        context: 'transform'
    })

    return product
}

/**
 * Find or calculate 100g serving from available servings
 *
 * Strategy:
 * 1. Look for exact 100g serving
 * 2. Look for metric serving (g or ml) and calculate proportionally
 * 3. Use first available serving and calculate
 *
 * @param servings - Array of FatSecret servings
 * @returns Serving with nutritional values per 100g, or null if calculation fails
 *
 * @example
 * ```typescript
 * const serving100g = findOrCalculate100gServing(food.servings.serving)
 * ```
 */
export function findOrCalculate100gServing(
    servings: FatSecretServing[]
): FatSecretServing | null {
    if (!servings || servings.length === 0) {
        logger.warn('FatSecret: no servings provided', { context: 'transform' })
        return null
    }

    // Strategy 1: Look for exact 100g serving
    const exact100g = servings.find(s => {
        const amount = parseFloat(s.metric_serving_amount)
        const unit = s.metric_serving_unit?.toLowerCase()
        return amount === 100 && (unit === 'g' || unit === 'ml')
    })

    if (exact100g) {
        logger.debug('FatSecret: found exact 100g serving', { context: 'transform' })
        return exact100g
    }

    // Strategy 2: Find best metric serving to calculate from
    const metricServing = servings.find(s => {
        const unit = s.metric_serving_unit?.toLowerCase()
        return unit === 'g' || unit === 'ml'
    })

    if (metricServing) {
        const amount = parseFloat(metricServing.metric_serving_amount)

        if (amount > 0) {
            const scaleFactor = 100 / amount

            const calculated: FatSecretServing = {
                serving_id: metricServing.serving_id,
                serving_description: '100g',
                metric_serving_amount: '100',
                metric_serving_unit: metricServing.metric_serving_unit,
                calories: (parseFloat(metricServing.calories) * scaleFactor).toFixed(2),
                carbohydrate: (parseFloat(metricServing.carbohydrate) * scaleFactor).toFixed(2),
                protein: (parseFloat(metricServing.protein) * scaleFactor).toFixed(2),
                fat: (parseFloat(metricServing.fat) * scaleFactor).toFixed(2),
                saturated_fat: metricServing.saturated_fat
                    ? (parseFloat(metricServing.saturated_fat) * scaleFactor).toFixed(2)
                    : undefined,
                fiber: metricServing.fiber
                    ? (parseFloat(metricServing.fiber) * scaleFactor).toFixed(2)
                    : undefined,
                sugar: metricServing.sugar
                    ? (parseFloat(metricServing.sugar) * scaleFactor).toFixed(2)
                    : undefined,
                sodium: metricServing.sodium
                    ? (parseFloat(metricServing.sodium) * scaleFactor).toFixed(2)
                    : undefined,
            }

            logger.debug('FatSecret: calculated 100g serving from metric serving', {
                originalAmount: amount,
                originalUnit: metricServing.metric_serving_unit,
                scaleFactor,
                context: 'transform'
            })

            return calculated
        }
    }

    // Strategy 3: Use first serving and calculate (last resort)
    const firstServing = servings[0]
    const amount = parseFloat(firstServing.metric_serving_amount)

    if (amount > 0) {
        const scaleFactor = 100 / amount

        const calculated: FatSecretServing = {
            serving_id: firstServing.serving_id,
            serving_description: '100g (estimated)',
            metric_serving_amount: '100',
            metric_serving_unit: firstServing.metric_serving_unit || 'g',
            calories: (parseFloat(firstServing.calories) * scaleFactor).toFixed(2),
            carbohydrate: (parseFloat(firstServing.carbohydrate) * scaleFactor).toFixed(2),
            protein: (parseFloat(firstServing.protein) * scaleFactor).toFixed(2),
            fat: (parseFloat(firstServing.fat) * scaleFactor).toFixed(2),
            saturated_fat: firstServing.saturated_fat
                ? (parseFloat(firstServing.saturated_fat) * scaleFactor).toFixed(2)
                : undefined,
            fiber: firstServing.fiber
                ? (parseFloat(firstServing.fiber) * scaleFactor).toFixed(2)
                : undefined,
            sugar: firstServing.sugar
                ? (parseFloat(firstServing.sugar) * scaleFactor).toFixed(2)
                : undefined,
            sodium: firstServing.sodium
                ? (parseFloat(firstServing.sodium) * scaleFactor).toFixed(2)
                : undefined,
        }

        logger.debug('FatSecret: calculated 100g serving from first serving', {
            originalAmount: amount,
            originalUnit: firstServing.metric_serving_unit,
            scaleFactor,
            context: 'transform'
        })

        return calculated
    }

    logger.warn('FatSecret: unable to calculate 100g serving', {
        servingsCount: servings.length,
        context: 'transform'
    })

    return null
}

/**
 * Extract image URL from FatSecret food images
 *
 * Prioritizes highest quality image available.
 *
 * @param images - FatSecret food images object
 * @returns Image URL or null if no images available
 *
 * @example
 * ```typescript
 * const imageUrl = extractImageUrl(food.food_images)
 * ```
 */
export function extractImageUrl(
    images?: FatSecretFood['food_images']
): string | null {
    if (!images || !images.food_image || images.food_image.length === 0) {
        return null
    }

    // Normalize to array
    const imageArray = Array.isArray(images.food_image)
        ? images.food_image
        : [images.food_image]

    // Priority order for image types
    const priorityOrder = ['front', 'product', 'nutrition', 'ingredients']

    // Try to find image by priority
    for (const priority of priorityOrder) {
        const image = imageArray.find(img =>
            img.image_type?.toLowerCase().includes(priority)
        )
        if (image?.image_url) {
            return image.image_url
        }
    }

    // Fallback: return first available image
    const firstImage = imageArray.find(img => img.image_url)
    return firstImage?.image_url || null
}
