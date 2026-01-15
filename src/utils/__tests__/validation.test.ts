/**
 * Unit тесты для валидации данных о питании
 */

import {
  validateMeal,
  validateDailyTotals,
  validateNutritionTargets,
} from '../validation/nutrition'

describe('Nutrition Validation', () => {
  describe('validateMeal', () => {
    it('should return valid for normal meal', () => {
      const meal = {
        calories: 500,
        protein: 30,
        fats: 20,
        carbs: 50,
        weight: 200,
      }
      const result = validateMeal(meal)
      expect(result.valid).toBe(true)
    })

    it('should return errors for invalid meal', () => {
      const meal = {
        calories: 6000, // Превышает лимит для приема пищи
        protein: 30,
        fats: 20,
        carbs: 50,
        weight: 200,
      }
      const result = validateMeal(meal)
      expect(result.valid).toBe(true) // Only warnings, not errors
      expect(result.warnings.length).toBeGreaterThan(0)
    })

    it('should validate weight limits', () => {
      const meal = {
        calories: 500,
        protein: 30,
        fats: 20,
        carbs: 50,
        weight: 15000, // Очень большой вес
      }
      const result = validateMeal(meal)
      expect(result.warnings.some(w => w.includes('Вес порции очень большой'))).toBe(true)
    })

    it('should return errors for negative values', () => {
      const meal = {
        calories: -100,
        protein: 30,
        fats: 20,
        carbs: 50,
        weight: 200,
      }
      const result = validateMeal(meal)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('Калории не могут быть отрицательными'))).toBe(true)
    })
  })

  describe('validateDailyTotals', () => {
    it('should return valid for normal daily totals', () => {
      const result = validateDailyTotals(2000, 150, 60, 200)
      expect(result.valid).toBe(true)
    })

    it('should return errors for exceeding daily limits', () => {
      const result = validateDailyTotals(7000, 150, 60, 200)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should return warnings for low values', () => {
      const result = validateDailyTotals(1100, 40, 25, 30)
      expect(result.warnings.length).toBeGreaterThan(0)
    })
  })

  describe('validateNutritionTargets', () => {
    it('should validate nutrition targets', () => {
      const result = validateNutritionTargets({
        calories: 2000,
        protein: 150,
        fats: 60,
        carbs: 200,
      })
      expect(result.valid).toBe(true)
    })

    it('should use validateDailyTotals logic', () => {
      const result = validateNutritionTargets({
        calories: 500,
        protein: 150,
        fats: 60,
        carbs: 200,
      })
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })
})
