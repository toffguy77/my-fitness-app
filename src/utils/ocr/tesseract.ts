/**
 * Утилиты для работы с Tesseract.js (клиентская OCR обработка)
 */

import { createWorker, type Worker } from 'tesseract.js'
import type { OCRResult } from '@/types/ocr'
import { extractNutritionData } from './extract'
import { logger } from '@/utils/logger'

let workerInstance: Worker | null = null

/**
 * Создает или возвращает существующий экземпляр Worker
 */
async function getWorker(): Promise<Worker> {
  if (!workerInstance) {
    workerInstance = await createWorker('rus+eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          // Можно использовать для отображения прогресса
          logger.debug('Tesseract: распознавание текста', { progress: m.progress })
        }
      },
    })
  }
  return workerInstance
}

/**
 * Распознает текст с изображения используя Tesseract.js
 */
export async function recognizeText(imageFile: File): Promise<OCRResult> {
  const startTime = Date.now()

  try {
    const worker = await getWorker()

    const { data } = await worker.recognize(imageFile)

    const processingTimeMs = Date.now() - startTime

    const extractedData = extractNutritionData(data.text)

    logger.debug('Tesseract: распознавание завершено', {
      confidence: data.confidence,
      textLength: data.text.length,
      processingTimeMs,
    })

    return {
      text: data.text,
      confidence: data.confidence,
      extractedData,
      rawText: data.text,
      provider: 'tesseract',
      processingTimeMs,
    }
  } catch (error) {
    logger.error('Tesseract: ошибка распознавания', error)
    throw new Error('Ошибка распознавания текста: ' + (error instanceof Error ? error.message : String(error)))
  }
}

/**
 * Освобождает ресурсы Worker (вызывать при завершении работы)
 */
export async function terminateWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.terminate()
    workerInstance = null
    logger.debug('Tesseract: worker завершен')
  }
}
