/**
 * Утилиты для работы с OpenRouter API для OCR обработки
 */

import type { OCRResult, OCRProvider } from '@/types/ocr'
import { extractNutritionData } from './extract'
import { logger } from '@/utils/logger'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

/**
 * Конвертирует File в base64 строку
 */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Убираем префикс data:image/...;base64,
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Системный промпт для OCR моделей
 */
const OCR_SYSTEM_PROMPT = `Ты - специалист по оцифровке документов.

ЗАДАЧА: Верни весь текст документа.

ФОРМАТ ОТВЕТА:
Выведи весь распознанный текст в формате Markdown.

ВАЖНО:
- Документ может содержать рукописный текст.
- Документ на русском языке.
- Внимательно оформляй таблицы, чтобы они были в формате Markdown. Сохраняй исходную структуру таблиц.
- Сохраняй точные значения чисел и единицы измерения (ккал, г, мг).
- Не добавляй информацию, которой нет в документе.`

/**
 * Маппинг моделей OpenRouter на провайдеры
 */
const MODEL_TO_PROVIDER: Record<string, OCRProvider> = {
  'lighton/lightonocr-1b': 'openrouter_lighton',
  'deepseek/deepseek-ocr': 'openrouter_deepseek',
  'paddleocr/paddleocr-vl-0.9b': 'openrouter_paddleocr',
  'qwen/qwen-3-omni': 'openrouter_qwen3_omni',
  'qwen/qwen-3-vl-30b-a3b': 'openrouter_qwen3_vl',
  'google/gemma-3-27b-vision': 'openrouter_gemma',
}

/**
 * Распознает текст через OpenRouter API
 */
export async function recognizeTextOpenRouter(
  imageFile: File,
  model: string,
  apiKey?: string
): Promise<OCRResult> {
  const startTime = Date.now()
  const apiKeyToUse = apiKey || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY

  if (!apiKeyToUse) {
    throw new Error('OpenRouter API key не настроен')
  }

  try {
    const imageBase64 = await fileToBase64(imageFile)

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKeyToUse}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://app.fitnessapp.com',
        'X-Title': 'BURCEV OCR',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: OCR_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenRouter API error: ${response.status} ${errorText}`)
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content || ''

    if (!text) {
      throw new Error('OpenRouter вернул пустой текст')
    }

    const processingTimeMs = Date.now() - startTime
    const extractedData = extractNutritionData(text)

    // Определяем confidence (OpenRouter не всегда возвращает, используем оценку)
    const confidence = data.choices?.[0]?.finish_reason === 'stop' ? 85 : 70

    logger.debug('OpenRouter: распознавание завершено', {
      model,
      textLength: text.length,
      processingTimeMs,
      confidence,
    })

    return {
      text,
      confidence,
      extractedData,
      rawText: text,
      provider: MODEL_TO_PROVIDER[model] || 'openrouter_lighton',
      modelName: model,
      processingTimeMs,
    }
  } catch (error) {
    logger.error('OpenRouter: ошибка распознавания', error, { model })
    throw new Error('Ошибка распознавания через OpenRouter: ' + (error instanceof Error ? error.message : String(error)))
  }
}

/**
 * Быстрая модель для простых этикеток
 */
export async function recognizeTextFast(imageFile: File, apiKey?: string): Promise<OCRResult> {
  return recognizeTextOpenRouter(imageFile, 'lighton/lightonocr-1b', apiKey)
}

/**
 * Модель для таблиц и структурированных данных
 */
export async function recognizeTextStructured(imageFile: File, apiKey?: string): Promise<OCRResult> {
  return recognizeTextOpenRouter(imageFile, 'paddleocr/paddleocr-vl-0.9b', apiKey)
}

/**
 * Продвинутая модель для сложных случаев и рукописного текста
 */
export async function recognizeTextAdvanced(imageFile: File, apiKey?: string): Promise<OCRResult> {
  return recognizeTextOpenRouter(imageFile, 'qwen/qwen-3-vl-30b-a3b', apiKey)
}
