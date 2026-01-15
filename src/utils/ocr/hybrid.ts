/**
 * Hybrid подход для OCR: многоуровневая стратегия обработки
 */

import type { OCRResult, OCRModelTier } from '@/types/ocr'
import { recognizeText } from './tesseract'
import {
  recognizeTextFast,
  recognizeTextStructured,
  recognizeTextAdvanced,
} from './openrouter'
import { logger } from '@/utils/logger'

/**
 * Распознает текст используя Hybrid подход с автоматическим выбором модели
 */
export async function recognizeTextHybrid(
  imageFile: File,
  preferredTier: OCRModelTier = 'balanced',
  openRouterApiKey?: string
): Promise<OCRResult> {
  // Уровень 1: Tesseract.js (клиент) - всегда пробуем сначала
  let tesseractResult: OCRResult | null = null

  try {
    tesseractResult = await recognizeText(imageFile)

    // Если confidence высокий и нужен быстрый результат, возвращаем
    if (tesseractResult.confidence >= 80 && preferredTier === 'fast') {
      logger.debug('OCR Hybrid: используем результат Tesseract (высокий confidence)', {
        confidence: tesseractResult.confidence,
      })
      return tesseractResult
    }
  } catch (error) {
    logger.warn('OCR Hybrid: ошибка Tesseract, продолжаем с OpenRouter', { error: error instanceof Error ? error.message : String(error) })
  }

  // Уровень 2: OpenRouter - быстрая модель (LightOnOCR или PaddleOCR)
  if (preferredTier === 'fast' || preferredTier === 'balanced') {
    try {
      // Пробуем быструю модель
      const fastResult = await recognizeTextFast(imageFile, openRouterApiKey)

      if (fastResult.confidence >= 75) {
        logger.debug('OCR Hybrid: используем результат быстрой модели OpenRouter', {
          confidence: fastResult.confidence,
          model: 'lighton/lightonocr-1b',
        })
        return fastResult
      }

      // Если confidence низкий, пробуем модель для структурированных данных
      if (preferredTier === 'balanced') {
        const structuredResult = await recognizeTextStructured(imageFile, openRouterApiKey)

        if (structuredResult.confidence >= 75) {
          logger.debug('OCR Hybrid: используем результат модели для структурированных данных', {
            confidence: structuredResult.confidence,
            model: 'paddleocr/paddleocr-vl-0.9b',
          })
          return structuredResult
        }
      }
    } catch (error) {
      logger.warn('OCR Hybrid: ошибка OpenRouter быстрой модели', { error: error instanceof Error ? error.message : String(error) })
    }
  }

  // Уровень 3: OpenRouter - продвинутая модель (Qwen3 VL)
  if (preferredTier === 'advanced' || (tesseractResult && tesseractResult.confidence < 70)) {
    try {
      const advancedResult = await recognizeTextAdvanced(imageFile, openRouterApiKey)

      logger.debug('OCR Hybrid: используем результат продвинутой модели OpenRouter', {
        confidence: advancedResult.confidence,
        model: 'qwen/qwen-3-vl-30b-a3b',
      })
      return advancedResult
    } catch (error) {
      logger.error('OCR Hybrid: ошибка продвинутой модели', error)
    }
  }

  // Fallback на Tesseract результат или возвращаем ошибку
  if (tesseractResult) {
    logger.warn('OCR Hybrid: используем результат Tesseract как fallback', {
      confidence: tesseractResult.confidence,
    })
    return tesseractResult
  }

  throw new Error('Не удалось распознать текст ни одним из доступных методов')
}

/**
 * Автоматический выбор модели на основе анализа изображения
 * Пока используем balanced подход, в будущем можно добавить предварительный анализ
 */
export async function recognizeTextAuto(
  imageFile: File,
  openRouterApiKey?: string
): Promise<OCRResult> {
  // TODO: Добавить предварительный анализ изображения:
  // - Определение наличия таблиц
  // - Определение наличия рукописного текста
  // - Оценка сложности структуры

  // Пока используем balanced подход
  return recognizeTextHybrid(imageFile, 'balanced', openRouterApiKey)
}
