/**
 * Типы для продуктов
 */

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

export interface UserProduct {
    id: string
    user_id: string
    name: string
    calories_per_100g: number
    protein_per_100g: number
    fats_per_100g: number
    carbs_per_100g: number
    category?: string | null
    notes?: string | null
    created_at: string
    updated_at: string
}

export interface ProductUsageHistory {
    id: string
    user_id: string
    product_id?: string | null
    user_product_id?: string | null
    used_at: string
}

export interface FavoriteProduct {
    user_id: string
    product_id?: string | null
    user_product_id?: string | null
    created_at: string
}
