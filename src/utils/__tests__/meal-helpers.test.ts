/**
 * Unit Tests: Meal Helper Functions
 * Tests meal-related utility functions
 */

describe('Meal Helper Functions', () => {
  describe('getMealNameByTime', () => {
    const getMealNameByTime = (hour: number = new Date().getHours()): string => {
      if (hour >= 6 && hour < 10) return 'Завтрак'
      if (hour >= 10 && hour < 13) return 'Второй завтрак'
      if (hour >= 13 && hour < 16) return 'Обед'
      if (hour >= 16 && hour < 20) return 'Полдник'
      if (hour >= 20 || hour < 6) return 'Ужин'
      return 'Прием пищи'
    }

    it('should return Завтрак for 6-9 hours', () => {
      expect(getMealNameByTime(6)).toBe('Завтрак')
      expect(getMealNameByTime(7)).toBe('Завтрак')
      expect(getMealNameByTime(8)).toBe('Завтрак')
      expect(getMealNameByTime(9)).toBe('Завтрак')
    })

    it('should return Второй завтрак for 10-12 hours', () => {
      expect(getMealNameByTime(10)).toBe('Второй завтрак')
      expect(getMealNameByTime(11)).toBe('Второй завтрак')
      expect(getMealNameByTime(12)).toBe('Второй завтрак')
    })

    it('should return Обед for 13-15 hours', () => {
      expect(getMealNameByTime(13)).toBe('Обед')
      expect(getMealNameByTime(14)).toBe('Обед')
      expect(getMealNameByTime(15)).toBe('Обед')
    })

    it('should return Полдник for 16-19 hours', () => {
      expect(getMealNameByTime(16)).toBe('Полдник')
      expect(getMealNameByTime(17)).toBe('Полдник')
      expect(getMealNameByTime(18)).toBe('Полдник')
      expect(getMealNameByTime(19)).toBe('Полдник')
    })

    it('should return Ужин for 20-23 and 0-5 hours', () => {
      expect(getMealNameByTime(20)).toBe('Ужин')
      expect(getMealNameByTime(21)).toBe('Ужин')
      expect(getMealNameByTime(22)).toBe('Ужин')
      expect(getMealNameByTime(23)).toBe('Ужин')
      expect(getMealNameByTime(0)).toBe('Ужин')
      expect(getMealNameByTime(1)).toBe('Ужин')
      expect(getMealNameByTime(2)).toBe('Ужин')
      expect(getMealNameByTime(3)).toBe('Ужин')
      expect(getMealNameByTime(4)).toBe('Ужин')
      expect(getMealNameByTime(5)).toBe('Ужин')
    })

    it('should handle boundary values', () => {
      expect(getMealNameByTime(6)).toBe('Завтрак')
      expect(getMealNameByTime(10)).toBe('Второй завтрак')
      expect(getMealNameByTime(13)).toBe('Обед')
      expect(getMealNameByTime(16)).toBe('Полдник')
      expect(getMealNameByTime(20)).toBe('Ужин')
    })

    it('should use current hour when no parameter provided', () => {
      const result = getMealNameByTime()
      expect(['Завтрак', 'Второй завтрак', 'Обед', 'Полдник', 'Ужин']).toContain(result)
    })
  })

  describe('Meal Aggregation', () => {
    it('should calculate totals from meals', () => {
      const meals = [
        { calories: 300, protein: 20, fats: 10, carbs: 30 },
        { calories: 500, protein: 40, fats: 20, carbs: 50 },
      ]

      const totals = meals.reduce(
        (acc, meal) => ({
          calories: acc.calories + (meal.calories || 0),
          protein: acc.protein + (meal.protein || 0),
          fats: acc.fats + (meal.fats || 0),
          carbs: acc.carbs + (meal.carbs || 0),
        }),
        { calories: 0, protein: 0, fats: 0, carbs: 0 }
      )

      expect(totals.calories).toBe(800)
      expect(totals.protein).toBe(60)
      expect(totals.fats).toBe(30)
      expect(totals.carbs).toBe(80)
    })

    it('should handle empty meals array', () => {
      const meals: any[] = []
      const totals = meals.reduce(
        (acc, meal) => ({
          calories: acc.calories + (meal.calories || 0),
          protein: acc.protein + (meal.protein || 0),
          fats: acc.fats + (meal.fats || 0),
          carbs: acc.carbs + (meal.carbs || 0),
        }),
        { calories: 0, protein: 0, fats: 0, carbs: 0 }
      )

      expect(totals.calories).toBe(0)
      expect(totals.protein).toBe(0)
      expect(totals.fats).toBe(0)
      expect(totals.carbs).toBe(0)
    })

    it('should handle null/undefined values in meals', () => {
      const meals = [
        { calories: null, protein: undefined, fats: 10, carbs: 20 },
      ]

      const totals = meals.reduce(
        (acc, meal) => ({
          calories: acc.calories + (meal.calories || 0),
          protein: acc.protein + (meal.protein || 0),
          fats: acc.fats + (meal.fats || 0),
          carbs: acc.carbs + (meal.carbs || 0),
        }),
        { calories: 0, protein: 0, fats: 0, carbs: 0 }
      )

      expect(totals.calories).toBe(0)
      expect(totals.protein).toBe(0)
      expect(totals.fats).toBe(10)
      expect(totals.carbs).toBe(20)
    })
  })
})
