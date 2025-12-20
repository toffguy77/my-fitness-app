/**
 * Supabase Edge Function для обновления кэша популярных продуктов
 * 
 * Использование:
 * POST /functions/v1/update-product-cache
 * Вызывается через cron job еженедельно (воскресенье 02:00 UTC)
 * 
 * Функция обновляет данные о топ-100 популярных продуктов из Open Food Facts API
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MAX_PRODUCTS_TO_UPDATE = 100
const API_REQUEST_DELAY = 1000 // 1 секунда между запросами для rate limiting

interface OpenFoodFactsProduct {
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

interface Product {
  id: string
  name: string
  barcode: string | null
  source_id: string | null
  source: string
}

/**
 * Преобразует продукт из Open Food Facts API в формат для обновления БД
 */
function transformProductData(product: OpenFoodFactsProduct) {
  const nutriments = product.nutriments || {}

  return {
    calories_per_100g: nutriments['energy-kcal_100g'] || 0,
    protein_per_100g: nutriments['proteins_100g'] || 0,
    fats_per_100g: nutriments['fat_100g'] || 0,
    carbs_per_100g: nutriments['carbohydrates_100g'] || 0,
    image_url: product.image_url || product.image_front_url || null,
  }
}

/**
 * Получение продукта из Open Food Facts API по штрих-коду
 */
async function fetchProductFromAPI(barcode: string): Promise<OpenFoodFactsProduct | null> {
  try {
    const url = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'MyFitnessApp/1.0',
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

    return data.product
  } catch (error) {
    console.error(`Error fetching product ${barcode} from API:`, error)
    return null
  }
}

/**
 * Задержка между запросами для rate limiting
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

serve(async (req) => {
  try {
    // Проверка авторизации (можно использовать service role key для cron)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    console.log('Starting product cache update...')

    // Получаем топ-100 популярных продуктов по usage_count
    const { data: products, error: fetchError } = await supabaseClient
      .from('products')
      .select('id, name, barcode, source_id, source')
      .eq('source', 'openfoodfacts')
      .not('barcode', 'is', null)
      .order('usage_count', { ascending: false })
      .limit(MAX_PRODUCTS_TO_UPDATE)

    if (fetchError) {
      console.error('Error fetching products:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Ошибка получения продуктов', details: fetchError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!products || products.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Нет продуктов для обновления',
          updated: 0,
          skipped: 0,
          errors: 0
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Found ${products.length} products to update`)

    let updated = 0
    let skipped = 0
    let errors = 0
    const updateResults: Array<{ productId: string; name: string; status: 'updated' | 'skipped' | 'error'; error?: string }> = []

    // Обновляем каждый продукт
    for (const product of products) {
      // Пропускаем продукты без штрих-кода или source_id
      if (!product.barcode && !product.source_id) {
        skipped++
        updateResults.push({
          productId: product.id,
          name: product.name,
          status: 'skipped',
          error: 'No barcode or source_id',
        })
        continue
      }

      // Используем barcode или source_id для запроса к API
      const identifier = product.barcode || product.source_id
      if (!identifier) {
        skipped++
        continue
      }

      try {
        // Получаем данные из API
        const apiProduct = await fetchProductFromAPI(identifier)

        if (!apiProduct) {
          skipped++
          updateResults.push({
            productId: product.id,
            name: product.name,
            status: 'skipped',
            error: 'Product not found in API',
          })
          // Задержка даже при пропуске для rate limiting
          await delay(API_REQUEST_DELAY)
          continue
        }

        // Преобразуем данные
        const updateData = transformProductData(apiProduct)

        // Обновляем продукт в БД
        const { error: updateError } = await supabaseClient
          .from('products')
          .update({
            ...updateData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', product.id)

        if (updateError) {
          errors++
          console.error(`Error updating product ${product.id}:`, updateError)
          updateResults.push({
            productId: product.id,
            name: product.name,
            status: 'error',
            error: updateError.message,
          })
        } else {
          updated++
          updateResults.push({
            productId: product.id,
            name: product.name,
            status: 'updated',
          })
        }

        // Задержка между запросами для rate limiting
        await delay(API_REQUEST_DELAY)
      } catch (error) {
        errors++
        console.error(`Error processing product ${product.id}:`, error)
        updateResults.push({
          productId: product.id,
          name: product.name,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    console.log(`Update completed: ${updated} updated, ${skipped} skipped, ${errors} errors`)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Product cache update completed',
        updated,
        skipped,
        errors,
        total: products.length,
        results: updateResults.slice(0, 20), // Возвращаем первые 20 результатов для логирования
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

