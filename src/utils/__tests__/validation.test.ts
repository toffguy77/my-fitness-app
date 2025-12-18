/**
 * Unit тесты для валидации данных о питании
 */

import {
  NUTRITION_LIMITS,
  calculateCaloriesFromMacros,
  validateCaloriesMatchMacros,
  validateNutritionLimits,
  validateMeal,
  validateDailyTotals,
} from '../validation/nutrition'

describe('Nutrition Validation', () => {
  describe('calculateCaloriesFromMacros', () => {
    it('should calculate calories correctly from macros', () => {
      // Белки: 100г * 4 = 400 ккал
      // Жиры: 50г * 9 = 450 ккал
      // Углеводы: 200г * 4 = 800 ккал
      // Итого: 1650 ккал
      expect(calculateCaloriesFromMacros(100, 50, 200)).toBe(1650)
    })

    it('should handle zero values', () => {
      expect(calculateCaloriesFromMacros(0, 0, 0)).toBe(0)
    })

    it('should round to nearest integer', () => {
      // Белки: 10.5г * 4 = 42 ккал
      // Жиры: 5.5г * 9 = 49.5 ккал
      // Углеводы: 20.5г * 4 = 82 ккал
      // Итого: 173.5 ккал → 174
      expect(calculateCaloriesFromMacros(10.5, 5.5, 20.5)).toBe(174)
    })
  })

  describe('validateCaloriesMatchMacros', () => {
    it('should return valid when calories match macros within tolerance', () => {
      const result = validateCaloriesMatchMacros(1650, 100, 50, 200)
      expect(result.valid).toBe(true)
      expect(result.calculatedCalories).toBe(1650)
    })

    it('should return invalid when calories differ significantly', () => {
      const result = validateCaloriesMatchMacros(2000, 100, 50, 200) // Разница 350 ккал
      expect(result.valid).toBe(false)
      expect(result.error).toContain('не соответствуют')
      expect(result.calculatedCalories).toBe(1650)
    })

    it('should allow tolerance of 50 kcal', () => {
      const result = validateCaloriesMatchMacros(1700, 100, 50, 200) // Разница 50 ккал
      expect(result.valid).toBe(true)
    })

    it('should reject difference greater than tolerance', () => {
      const result = validateCaloriesMatchMacros(1710, 100, 50, 200) // Разница 60 ккал
      expect(result.valid).toBe(false)
    })
  })

  describe('validateNutritionLimits', () => {
    it('should return valid for normal values', () => {
      const result = validateNutritionLimits(2000, 150, 60, 200, false)
      expect(result.valid).toBe(true)
      expect(result.errors.length).toBe(0)
    })

    it('should return errors for calories exceeding daily limit', () => {
      const result = validateNutritionLimits(15000, 150, 60, 200, false)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('Калории превышают максимум'))).toBe(true)
    })

    it('should return errors for calories exceeding meal limit', () => {
      const result = validateNutritionLimits(6000, 150, 60, 200, true)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('Калории превышают максимум'))).toBe(true)
    })

    it('should return errors for negative values', () => {
      const result = validateNutritionLimits(-100, 150, 60, 200, false)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('не могут быть отрицательными'))).toBe(true)
    })

    it('should return warnings for high values', () => {
      const result = validateNutritionLimits(8000, 800, 400, 1200, false)
      expect(result.warnings.length).toBeGreaterThan(0)
    })
  })

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
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should return warnings for calories mismatch', () => {
      const meal = {
        calories: 1000,
        protein: 30, // Расчетные калории: 30*4 + 20*9 + 50*4 = 470
        fats: 20,
        carbs: 50,
        weight: 200,
      }
      const result = validateMeal(meal)
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings.some(w => w.includes('не соответствуют'))).toBe(true)
    })

    it('should validate weight limits', () => {
      const meal = {
        calories: 500,
        protein: 30,
        fats: 20,
        carbs: 50,
        weight: 6000, // Очень большой вес
      }
      const result = validateMeal(meal)
      expect(result.warnings.some(w => w.includes('Вес порции'))).toBe(true)
    })
  })

  describe('validateDailyTotals', () => {
    it('should return valid for normal daily totals', () => {
      const result = validateDailyTotals(2000, 150, 60, 200)
      expect(result.valid).toBe(true)
    })

    it('should return errors for exceeding daily limits', () => {
      const result = validateDailyTotals(15000, 150, 60, 200)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should return warnings for calories mismatch', () => {
      const result = validateDailyTotals(3000, 100, 50, 200)
      // Расчетные: 100*4 + 50*9 + 200*4 = 1650
      // Разница: 1350 ккал
      expect(result.warnings.length).toBeGreaterThan(0)
    })
  })

  describe('NUTRITION_LIMITS constants', () => {
    it('should have correct limit values', () => {
      expect(NUTRITION_LIMITS.MAX_CALORIES_PER_DAY).toBe(10000)
      expect(NUTRITION_LIMITS.MAX_CALORIES_PER_MEAL).toBe(5000)
      expect(NUTRITION_LIMITS.MAX_PROTEIN_PER_DAY).toBe(1000)
      expect(NUTRITION_LIMITS.MAX_FATS_PER_DAY).toBe(500)
      expect(NUTRITION_LIMITS.MAX_CARBS_PER_DAY).toBe(1500)
      expect(NUTRITION_LIMITS.CALORIES_TOLERANCE).toBe(50)
    })
  })
})

