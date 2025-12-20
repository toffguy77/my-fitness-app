/**
 * Unit Tests: Nutrition Validation
 * Tests nutrition data validation functions
 */

import {
  validateMeal,
  validateDailyTotals,
  validateNutritionTargets,
  type ValidationResult,
} from '../validation/nutrition'

describe('Nutrition Validation', () => {
  describe('validateMeal', () => {
    it('should validate valid meal', () => {
      const result = validateMeal({
        calories: 500,
        protein: 30,
        fats: 20,
        carbs: 50,
        weight: 200,
      })

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject negative calories', () => {
      const result = validateMeal({
        calories: -100,
        protein: 30,
        fats: 20,
        carbs: 50,
      })

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Калории не могут быть отрицательными')
    })

    it('should reject negative protein', () => {
      const result = validateMeal({
        calories: 500,
        protein: -10,
        fats: 20,
        carbs: 50,
      })

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Белки не могут быть отрицательными')
    })

    it('should reject negative fats', () => {
      const result = validateMeal({
        calories: 500,
        protein: 30,
        fats: -5,
        carbs: 50,
      })

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Жиры не могут быть отрицательными')
    })

    it('should reject negative carbs', () => {
      const result = validateMeal({
        calories: 500,
        protein: 30,
        fats: 20,
        carbs: -10,
      })

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Углеводы не могут быть отрицательными')
    })

    it('should reject zero or negative weight', () => {
      const result = validateMeal({
        calories: 500,
        weight: 0,
      })

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Вес должен быть больше 0')
    })

    it('should warn about very high calories', () => {
      const result = validateMeal({
        calories: 6000,
        protein: 30,
        fats: 20,
        carbs: 50,
      })

      expect(result.valid).toBe(true)
      expect(result.warnings).toContain('Калорийность очень высокая (>5000 ккал). Проверьте правильность ввода.')
    })

    it('should warn about very high weight', () => {
      const result = validateMeal({
        calories: 500,
        weight: 15000,
      })

      expect(result.valid).toBe(true)
      expect(result.warnings).toContain('Вес очень большой (>10 кг). Проверьте правильность ввода.')
    })

    it('should handle null values', () => {
      const result = validateMeal({
        calories: null,
        protein: null,
        fats: null,
        carbs: null,
        weight: null,
      })

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should handle undefined values', () => {
      const result = validateMeal({
        calories: undefined,
        protein: undefined,
      })

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('validateDailyTotals', () => {
    it('should validate valid daily totals', () => {
      const result = validateDailyTotals(2000, 150, 60, 200)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject calories below minimum', () => {
      const result = validateDailyTotals(500, 150, 60, 200)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Дневная норма калорий слишком низкая (<1000 ккал). Минимум: 1000 ккал.')
    })

    it('should reject calories above maximum', () => {
      const result = validateDailyTotals(7000, 150, 60, 200)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Дневная норма калорий слишком высокая (>6000 ккал). Максимум: 6000 ккал.')
    })

    it('should warn about low calories', () => {
      const result = validateDailyTotals(1100, 150, 60, 200)

      expect(result.valid).toBe(true)
      expect(result.warnings).toContain('Дневная норма калорий очень низкая (<1200 ккал). Убедитесь, что это безопасно.')
    })

    it('should reject protein below minimum', () => {
      const result = validateDailyTotals(2000, 10, 60, 200)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Дневная норма белков слишком низкая (<20 г). Минимум: 20 г.')
    })

    it('should reject protein above maximum', () => {
      const result = validateDailyTotals(2000, 600, 60, 200)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Дневная норма белков слишком высокая (>500 г). Максимум: 500 г.')
    })

    it('should reject fats below minimum', () => {
      const result = validateDailyTotals(2000, 150, 10, 200)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Дневная норма жиров слишком низкая (<20 г). Минимум: 20 г.')
    })

    it('should reject fats above maximum', () => {
      const result = validateDailyTotals(2000, 150, 250, 200)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Дневная норма жиров слишком высокая (>200 г). Максимум: 200 г.')
    })

    it('should reject carbs below minimum', () => {
      const result = validateDailyTotals(2000, 150, 60, 10)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Дневная норма углеводов слишком низкая (<20 г). Минимум: 20 г.')
    })

    it('should reject carbs above maximum', () => {
      const result = validateDailyTotals(2000, 150, 60, 600)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Дневная норма углеводов слишком высокая (>500 г). Максимум: 500 г.')
    })

    it('should warn about low protein', () => {
      const result = validateDailyTotals(2000, 40, 60, 200)

      expect(result.valid).toBe(true)
      expect(result.warnings).toContain('Дневная норма белков низкая (<50 г). Рекомендуется минимум 50-60 г.')
    })

    it('should warn about low fats', () => {
      const result = validateDailyTotals(2000, 150, 25, 200)

      expect(result.valid).toBe(true)
      expect(result.warnings).toContain('Дневная норма жиров низкая (<30 г). Рекомендуется минимум 30-40 г.')
    })

    it('should warn about low carbs', () => {
      const result = validateDailyTotals(2000, 150, 60, 30)

      expect(result.valid).toBe(true)
      expect(result.warnings).toContain('Дневная норма углеводов низкая (<50 г). Возможно, это кето-диета.')
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

