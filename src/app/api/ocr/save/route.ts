import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/utils/logger'
import type { OCRScanRecord, OCRProvider, ExtractedNutritionData } from '@/types/ocr'
import crypto from 'crypto'

/**
 * Сохраняет результат OCR сканирования в БД
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Проверка авторизации
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    }

    const body = await request.json()
    const {
      imageBase64,
      ocrResult,
      success,
    }: {
      imageBase64?: string // Base64 строка изображения для вычисления хэша
      ocrResult: {
        provider: OCRProvider
        modelName?: string
        confidence: number
        extractedData: ExtractedNutritionData
        processingTimeMs?: number
      }
      success: boolean
    } = body

    // Вычисляем хэш изображения для дедупликации
    let imageHash: string | null = null
    if (imageBase64) {
      // Убираем префикс data:image/...;base64, если есть
      const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
      imageHash = crypto.createHash('sha256').update(base64Data).digest('hex')
    }

    // Сохраняем запись в БД
    const { data, error } = await supabase
      .from('ocr_scans')
      .insert({
        user_id: user.id,
        image_hash: imageHash,
        ocr_provider: ocrResult.provider,
        model_name: ocrResult.modelName || null,
        confidence: ocrResult.confidence,
        success,
        extracted_data: ocrResult.extractedData,
        processing_time_ms: ocrResult.processingTimeMs || null,
        cost_usd: null, // TODO: вычислять стоимость на основе модели и использования API
      })
      .select()
      .single()

    if (error) {
      logger.error('OCR save: ошибка сохранения в БД', error)
      return NextResponse.json({ error: 'Ошибка сохранения' }, { status: 500 })
    }

    logger.debug('OCR save: запись сохранена', { id: data.id })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    logger.error('OCR save: неожиданная ошибка', error)
    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера' },
      { status: 500 }
    )
  }
}
