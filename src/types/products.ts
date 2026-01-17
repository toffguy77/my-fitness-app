/**
 * Типы для продуктов
 */

/**
 * Источник данных о продукте
 * - fatsecret: FatSecret API (основной источник)
 * - openfoodfacts: Open Food Facts API (резервный источник)
 * - usda: USDA Food Database
 * - user: Пользовательский продукт
 */
export type ProductSource = 'fatsecret' | 'openfoodfacts' | 'usda' | 'user'

/**
 * Продукт питания
 *
 * Представляет продукт из любого источника данных (FatSecret, Open Food Facts, USDA, или пользовательский).
 * Все пищевые значения нормализованы на 100г продукта.
 *
 * @property id - Уникальный идентификатор в локальной базе данных (опционально для новых продуктов)
 * @property name - Название продукта
 * @property brand - Бренд/производитель (опционально)
 * @property barcode - Штрих-код продукта (GTIN-13 или другой формат)
 * @property calories_per_100g - Калории на 100г
 * @property protein_per_100g - Белки на 100г (в граммах)
 * @property fats_per_100g - Жиры на 100г (в граммах)
 * @property carbs_per_100g - Углеводы на 100г (в граммах)
 * @property source - Источник данных о продукте
 * @property source_id - Идентификатор продукта в источнике (для дедупликации)
 * @property image_url - URL изображения продукта (опционально)
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
    source: ProductSource
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
