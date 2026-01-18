'use server'

import { searchProducts as searchProductsInternal, getProductByBarcode as getProductByBarcodeInternal } from './api'
import type { Product } from '@/types/products'

/**
 * Server action для поиска продуктов
 * Используется в клиентских компонентах
 */
export async function searchProducts(query: string, limit: number = 20): Promise<Product[]> {
    return searchProductsInternal(query, limit)
}

/**
 * Server action для поиска по штрих-коду
 */
export async function getProductByBarcode(barcode: string): Promise<Product | null> {
    return getProductByBarcodeInternal(barcode)
}
