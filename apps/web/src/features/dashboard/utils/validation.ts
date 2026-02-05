/**
 * Validation utilities for dashboard inputs
 */

/**
 * Validation result type
 */
export interface ValidationResult {
    isValid: boolean
    error?: string
}

/**
 * Validate weight input
 *
 * Requirements:
 * - Must be a positive number
 * - Maximum 500 kg
 * - Up to 1 decimal place
 *
 * @param input - Weight value to validate
 * @returns Validation result with error message if invalid
 */
export function validateWeight(input: unknown): ValidationResult {
    // Check if input is a number
    if (typeof input !== 'number') {
        return {
            isValid: false,
            error: 'Вес должен быть числом',
        }
    }

    // Check for NaN
    if (isNaN(input)) {
        return {
            isValid: false,
            error: 'Вес должен быть корректным числом',
        }
    }

    // Check if positive
    if (input <= 0) {
        return {
            isValid: false,
            error: 'Вес должен быть положительным',
        }
    }

    // Check maximum value
    if (input > 500) {
        return {
            isValid: false,
            error: 'Вес должен быть не более 500 кг',
        }
    }

    // Check decimal places (max 1)
    const decimalPlaces = (input.toString().split('.')[1] || '').length
    if (decimalPlaces > 1) {
        return {
            isValid: false,
            error: 'Вес может иметь не более 1 знака после запятой',
        }
    }

    return { isValid: true }
}

/**
 * Validate steps input
 *
 * Requirements:
 * - Must be a non-negative integer
 * - Maximum 100,000 steps
 *
 * @param input - Steps value to validate
 * @returns Validation result with error message if invalid
 */
export function validateSteps(input: unknown): ValidationResult {
    // Check if input is a number
    if (typeof input !== 'number') {
        return {
            isValid: false,
            error: 'Шаги должны быть числом',
        }
    }

    // Check for NaN
    if (isNaN(input)) {
        return {
            isValid: false,
            error: 'Шаги должны быть корректным числом',
        }
    }

    // Check if non-negative
    if (input < 0) {
        return {
            isValid: false,
            error: 'Шаги не могут быть отрицательными',
        }
    }

    // Check if integer
    if (!Number.isInteger(input)) {
        return {
            isValid: false,
            error: 'Шаги должны быть целым числом',
        }
    }

    // Check maximum value
    if (input > 100000) {
        return {
            isValid: false,
            error: 'Шаги должны быть не более 100,000',
        }
    }

    return { isValid: true }
}

/**
 * Validate calories input
 *
 * Requirements:
 * - Must be a non-negative number
 * - Maximum 10,000 calories
 *
 * @param input - Calories value to validate
 * @returns Validation result with error message if invalid
 */
export function validateCalories(input: unknown): ValidationResult {
    // Check if input is a number
    if (typeof input !== 'number') {
        return {
            isValid: false,
            error: 'Калории должны быть числом',
        }
    }

    // Check for NaN
    if (isNaN(input)) {
        return {
            isValid: false,
            error: 'Калории должны быть корректным числом',
        }
    }

    // Check if non-negative
    if (input < 0) {
        return {
            isValid: false,
            error: 'Калории не могут быть отрицательными',
        }
    }

    // Check maximum value
    if (input > 10000) {
        return {
            isValid: false,
            error: 'Калории должны быть не более 10,000',
        }
    }

    return { isValid: true }
}

/**
 * Validate photo file
 *
 * Requirements:
 * - Must be an image format (JPEG, PNG, WebP)
 * - Maximum 10 MB file size
 *
 * @param file - File to validate
 * @returns Validation result with error message if invalid
 */
export function validatePhoto(file: File): ValidationResult {
    // Check file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
        return {
            isValid: false,
            error: 'Фото должно быть в формате JPEG, PNG или WebP',
        }
    }

    // Check file size (max 10 MB)
    const maxSize = 10 * 1024 * 1024 // 10 MB in bytes
    if (file.size > maxSize) {
        return {
            isValid: false,
            error: 'Фото должно быть не более 10 МБ',
        }
    }

    // Check file size is not zero
    if (file.size === 0) {
        return {
            isValid: false,
            error: 'Файл фото пустой',
        }
    }

    return { isValid: true }
}

/**
 * Weekly report validation result
 */
export interface WeeklyReportValidationResult {
    isValid: boolean
    errors: string[]
    missingItems: {
        nutrition: number // days missing
        weight: number // days missing
        photo: boolean // photo missing
    }
}

/**
 * Validate weekly report data
 *
 * Requirements:
 * - Nutrition logged for ≥5 days (calories > 0)
 * - Weight logged for ≥5 days (weight exists)
 * - Weekly photo uploaded
 *
 * @param weekData - Array of daily metrics for the week
 * @param hasPhoto - Whether weekly photo is uploaded
 * @returns Validation result with specific error messages if invalid
 */
export function validateWeeklyReport(
    weekData: Array<{ date: string; nutrition: { calories: number }; weight: number | null }>,
    hasPhoto: boolean
): WeeklyReportValidationResult {
    const errors: string[] = []
    const missingItems = {
        nutrition: 0,
        weight: 0,
        photo: false,
    }

    // Count days with nutrition data (calories > 0)
    const daysWithNutrition = weekData.filter(day => day.nutrition.calories > 0).length
    const nutritionMissing = Math.max(0, 5 - daysWithNutrition)
    missingItems.nutrition = nutritionMissing

    if (nutritionMissing > 0) {
        errors.push(`Необходимо заполнить питание еще на ${nutritionMissing} ${nutritionMissing === 1 ? 'день' : nutritionMissing < 5 ? 'дня' : 'дней'}`)
    }

    // Count days with weight data (weight exists)
    const daysWithWeight = weekData.filter(day => day.weight !== null && day.weight > 0).length
    const weightMissing = Math.max(0, 5 - daysWithWeight)
    missingItems.weight = weightMissing

    if (weightMissing > 0) {
        errors.push(`Необходимо записать вес еще на ${weightMissing} ${weightMissing === 1 ? 'день' : weightMissing < 5 ? 'дня' : 'дней'}`)
    }

    // Check photo uploaded
    if (!hasPhoto) {
        missingItems.photo = true
        errors.push('Необходимо загрузить фото недели')
    }

    return {
        isValid: errors.length === 0,
        errors,
        missingItems,
    }
}
