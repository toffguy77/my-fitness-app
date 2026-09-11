/**
 * Validation utilities for dashboard inputs
 */

import { t, plural } from '@/shared/i18n'

/**
 * The day counter reads "1 день", "2 дня", "5 дней". The rule lives in the
 * i18n module, so it is stated once rather than inline at each call.
 */
function dayNoun(count: number): string {
    return plural(count, {
        one: t('dashboard.validation.dayOne'),
        few: t('dashboard.validation.dayFew'),
        many: t('dashboard.validation.dayMany'),
    })
}

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
            error: t('dashboard.validation.weightNotANumber'),
        }
    }

    // Check for NaN
    if (isNaN(input)) {
        return {
            isValid: false,
            error: t('dashboard.validation.weightNotValid'),
        }
    }

    // Check if positive
    if (input <= 0) {
        return {
            isValid: false,
            error: t('dashboard.validation.weightNotPositive'),
        }
    }

    // Check maximum value
    if (input > 500) {
        return {
            isValid: false,
            error: t('dashboard.validation.weightTooLarge'),
        }
    }

    // Check decimal places (max 1)
    const decimalPlaces = (input.toString().split('.')[1] || '').length
    if (decimalPlaces > 1) {
        return {
            isValid: false,
            error: t('dashboard.validation.weightPrecision'),
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
            error: t('dashboard.validation.stepsNotANumber'),
        }
    }

    // Check for NaN
    if (isNaN(input)) {
        return {
            isValid: false,
            error: t('dashboard.validation.stepsNotValid'),
        }
    }

    // Check if non-negative
    if (input < 0) {
        return {
            isValid: false,
            error: t('dashboard.validation.stepsNegative'),
        }
    }

    // Check if integer
    if (!Number.isInteger(input)) {
        return {
            isValid: false,
            error: t('dashboard.validation.stepsNotInteger'),
        }
    }

    // Check maximum value
    if (input > 100000) {
        return {
            isValid: false,
            error: t('dashboard.validation.stepsTooLarge'),
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
            error: t('dashboard.validation.caloriesNotANumber'),
        }
    }

    // Check for NaN
    if (isNaN(input)) {
        return {
            isValid: false,
            error: t('dashboard.validation.caloriesNotValid'),
        }
    }

    // Check if non-negative
    if (input < 0) {
        return {
            isValid: false,
            error: t('dashboard.validation.caloriesNegative'),
        }
    }

    // Check maximum value
    if (input > 10000) {
        return {
            isValid: false,
            error: t('dashboard.validation.caloriesTooLarge'),
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
            error: t('dashboard.validation.photoFormat'),
        }
    }

    // Check file size (max 10 MB)
    const maxSize = 10 * 1024 * 1024 // 10 MB in bytes
    if (file.size > maxSize) {
        return {
            isValid: false,
            error: t('dashboard.validation.photoTooLarge'),
        }
    }

    // Check file size is not zero
    if (file.size === 0) {
        return {
            isValid: false,
            error: t('dashboard.validation.photoEmpty'),
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
        errors.push(t('dashboard.validation.nutritionMissing', { count: nutritionMissing, noun: dayNoun(nutritionMissing) }))
    }

    // Count days with weight data (weight exists)
    const daysWithWeight = weekData.filter(day => day.weight !== null && day.weight > 0).length
    const weightMissing = Math.max(0, 5 - daysWithWeight)
    missingItems.weight = weightMissing

    if (weightMissing > 0) {
        errors.push(t('dashboard.validation.weightMissing', { count: weightMissing, noun: dayNoun(weightMissing) }))
    }

    // Check photo uploaded
    if (!hasPhoto) {
        missingItems.photo = true
        errors.push(t('dashboard.validation.photoMissing'))
    }

    return {
        isValid: errors.length === 0,
        errors,
        missingItems,
    }
}
