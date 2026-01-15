/**
 * Утилиты для извлечения данных о питании из распознанного текста
 */

import type { ExtractedNutritionData } from '@/types/ocr'

/**
 * Извлекает данные о питании из распознанного текста
 */
export function extractNutritionData(text: string): ExtractedNutritionData {
  const result: ExtractedNutritionData = {}

  // Нормализация текста: приводим к нижнему регистру для поиска
  const normalizedText = text.toLowerCase()

  // Поиск названия продукта
  // Ищем паттерны типа "наименование:", "название:", "product name:"
  const productNamePatterns = [
    /(?:наименование|название|product\s+name)[\s:]*([^\n]+)/i,
    /^([А-Яа-яA-Za-z\s]+?)(?:\s*[\n\r]|$)/m, // Первая строка может быть названием
  ]

  for (const pattern of productNamePatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      result.productName = match[1].trim()
      break
    }
  }

  // Поиск калорий
  // Паттерны: "калории: 100 ккал", "энергетическая ценность: 100 ккал", "energy: 100 kcal"
  const caloriesPatterns = [
    /(?:калории|энергетическая\s+ценность|energy|энергия)[\s:]*(\d+(?:[.,]\d+)?)\s*(?:ккал|kcal|кДж|kj)/i,
    /(\d+(?:[.,]\d+)?)\s*(?:ккал|kcal)(?:\s*на\s*100\s*г|$)/i,
  ]

  for (const pattern of caloriesPatterns) {
    const match = normalizedText.match(pattern)
    if (match && match[1]) {
      result.calories = parseFloat(match[1].replace(',', '.'))
      break
    }
  }

  // Поиск белков
  // Паттерны: "белки: 10 г", "белок: 10 г", "proteins: 10 g"
  const proteinPatterns = [
    /(?:белки|белок|proteins?)[\s:]*(\d+(?:[.,]\d+)?)\s*(?:г|g|грамм)/i,
    /белки[\s:]*(\d+(?:[.,]\d+)?)/i,
  ]

  for (const pattern of proteinPatterns) {
    const match = normalizedText.match(pattern)
    if (match && match[1]) {
      result.protein = parseFloat(match[1].replace(',', '.'))
      break
    }
  }

  // Поиск жиров
  // Паттерны: "жиры: 5 г", "жир: 5 г", "fats?: 5 g"
  const fatsPatterns = [
    /(?:жиры|жир|fats?)[\s:]*(\d+(?:[.,]\d+)?)\s*(?:г|g|грамм)/i,
    /жиры[\s:]*(\d+(?:[.,]\d+)?)/i,
  ]

  for (const pattern of fatsPatterns) {
    const match = normalizedText.match(pattern)
    if (match && match[1]) {
      result.fats = parseFloat(match[1].replace(',', '.'))
      break
    }
  }

  // Поиск углеводов
  // Паттерны: "углеводы: 20 г", "углевод: 20 г", "carbohydrates?: 20 g"
  const carbsPatterns = [
    /(?:углеводы|углевод|carbohydrates?)[\s:]*(\d+(?:[.,]\d+)?)\s*(?:г|g|грамм)/i,
    /углеводы[\s:]*(\d+(?:[.,]\d+)?)/i,
  ]

  for (const pattern of carbsPatterns) {
    const match = normalizedText.match(pattern)
    if (match && match[1]) {
      result.carbs = parseFloat(match[1].replace(',', '.'))
      break
    }
  }

  // Поиск веса порции
  // Паттерны: "100 г", "100g", "порция: 100 г"
  const weightPatterns = [
    /(?:порция|вес|weight|масса)[\s:]*(\d+(?:[.,]\d+)?)\s*(?:г|g|грамм)/i,
    /(\d+(?:[.,]\d+)?)\s*(?:г|g)(?:\s*на\s*порцию|$)/i,
  ]

  for (const pattern of weightPatterns) {
    const match = normalizedText.match(pattern)
    if (match && match[1]) {
      result.weight = parseFloat(match[1].replace(',', '.'))
      break
    }
  }

  // Поиск бренда
  // Обычно бренд находится в начале текста или после "бренд:", "brand:"
  const brandPatterns = [
    /(?:бренд|brand|производитель)[\s:]*([^\n]+)/i,
    /^([А-Яа-яA-Z][А-Яа-яA-Z\s]+?)(?:\s*[\n\r])/m, // Первое слово с заглавной буквы
  ]

  for (const pattern of brandPatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const brand = match[1].trim()
      // Исключаем общие слова
      if (!['наименование', 'название', 'продукт', 'product'].includes(brand.toLowerCase())) {
        result.brand = brand
        break
      }
    }
  }

  return result
}

/**
 * Валидирует извлеченные данные о питании
 */
export function validateExtractedData(data: ExtractedNutritionData): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (data.calories !== undefined) {
    if (data.calories < 0 || data.calories > 10000) {
      errors.push('Калории должны быть в диапазоне 0-10000')
    }
  }

  if (data.protein !== undefined) {
    if (data.protein < 0 || data.protein > 1000) {
      errors.push('Белки должны быть в диапазоне 0-1000 г')
    }
  }

  if (data.fats !== undefined) {
    if (data.fats < 0 || data.fats > 1000) {
      errors.push('Жиры должны быть в диапазоне 0-1000 г')
    }
  }

  if (data.carbs !== undefined) {
    if (data.carbs < 0 || data.carbs > 1000) {
      errors.push('Углеводы должны быть в диапазоне 0-1000 г')
    }
  }

  if (data.weight !== undefined) {
    if (data.weight < 0 || data.weight > 10000) {
      errors.push('Вес порции должен быть в диапазоне 0-10000 г')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Нормализует единицы измерения
 */
export function normalizeUnits(value: number, unit: string): number {
  const normalizedUnit = unit.toLowerCase().trim()

  // Конвертация кДж в ккал (1 ккал = 4.184 кДж)
  if (normalizedUnit.includes('кдж') || normalizedUnit.includes('kj')) {
    return value / 4.184
  }

  // Конвертация мг в г (для микроэлементов)
  if (normalizedUnit.includes('мг') || normalizedUnit.includes('mg')) {
    return value / 1000
  }

  return value
}
