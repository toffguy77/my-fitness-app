/**
 * Business Logic Tests: Onboarding Calculations
 * Tests BMR, TDEE, target calories, and macros calculations
 */

describe('Onboarding Calculations', () => {
  // BMR calculation function (Harris-Benedict formula)
  const calculateBMR = (gender: string, weight: number, height: number, age: number): number => {
    if (gender === 'male') {
      return 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age)
    } else {
      return 447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age)
    }
  }

  // TDEE calculation function
  const calculateTDEE = (bmr: number, activityLevel: string): number => {
    const multipliers: Record<string, number> = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9
    }
    return bmr * (multipliers[activityLevel] || 1.55)
  }

  // Target calories calculation
  const calculateTargetCalories = (tdee: number, goal: string): number => {
    switch (goal) {
      case 'lose':
        return Math.round(tdee * 0.85) // Дефицит 15%
      case 'gain':
        return Math.round(tdee * 1.10) // Профицит 10%
      case 'maintain':
      default:
        return Math.round(tdee)
    }
  }

  // Macros calculation
  const calculateMacros = (calories: number) => {
    const protein = Math.round((calories * 0.30) / 4) // 1г белка = 4 ккал
    const fats = Math.round((calories * 0.25) / 9)    // 1г жира = 9 ккал
    const carbs = Math.round((calories * 0.45) / 4)   // 1г углеводов = 4 ккал
    return { protein, fats, carbs }
  }

  describe('BMR Calculation (Harris-Benedict Formula)', () => {
    it('should calculate BMR correctly for male', () => {
      const bmr = calculateBMR('male', 80, 180, 30)
      // Expected: 88.362 + (13.397 * 80) + (4.799 * 180) - (5.677 * 30)
      // = 88.362 + 1071.76 + 863.82 - 170.31 = 1853.632
      expect(bmr).toBeCloseTo(1853.63, 1)
    })

    it('should calculate BMR correctly for female', () => {
      const bmr = calculateBMR('female', 65, 165, 25)
      // Expected: 447.593 + (9.247 * 65) + (3.098 * 165) - (4.330 * 25)
      // = 447.593 + 601.055 + 511.17 - 108.25 = 1451.568
      expect(bmr).toBeCloseTo(1451.57, 1)
    })

    it('should handle edge case: very low weight', () => {
      const bmr = calculateBMR('male', 30, 150, 20)
      expect(bmr).toBeGreaterThan(0)
      expect(bmr).toBeLessThan(2000)
    })

    it('should handle edge case: very high weight', () => {
      const bmr = calculateBMR('male', 300, 200, 50)
      expect(bmr).toBeGreaterThan(0)
      expect(bmr).toBeLessThan(10000)
    })

    it('should handle edge case: very young age', () => {
      const bmr = calculateBMR('male', 70, 170, 18)
      expect(bmr).toBeGreaterThan(0)
    })

    it('should handle edge case: very old age', () => {
      const bmr = calculateBMR('male', 70, 170, 80)
      expect(bmr).toBeGreaterThan(0)
    })

    it('should handle other gender', () => {
      const bmr = calculateBMR('other', 70, 170, 30)
      // Should use female formula for non-male
      expect(bmr).toBeGreaterThan(0)
    })
  })

  describe('TDEE Calculation', () => {
    const bmr = 2000

    it('should calculate TDEE for sedentary activity', () => {
      const tdee = calculateTDEE(bmr, 'sedentary')
      expect(tdee).toBe(2400) // 2000 * 1.2
    })

    it('should calculate TDEE for light activity', () => {
      const tdee = calculateTDEE(bmr, 'light')
      expect(tdee).toBe(2750) // 2000 * 1.375
    })

    it('should calculate TDEE for moderate activity', () => {
      const tdee = calculateTDEE(bmr, 'moderate')
      expect(tdee).toBe(3100) // 2000 * 1.55
    })

    it('should calculate TDEE for active activity', () => {
      const tdee = calculateTDEE(bmr, 'active')
      expect(tdee).toBe(3450) // 2000 * 1.725
    })

    it('should calculate TDEE for very_active activity', () => {
      const tdee = calculateTDEE(bmr, 'very_active')
      expect(tdee).toBe(3800) // 2000 * 1.9
    })

    it('should use default multiplier for unknown activity level', () => {
      const tdee = calculateTDEE(bmr, 'unknown')
      expect(tdee).toBe(3100) // 2000 * 1.55 (default)
    })

    it('should handle zero BMR', () => {
      const tdee = calculateTDEE(0, 'moderate')
      expect(tdee).toBe(0)
    })
  })

  describe('Target Calories Calculation', () => {
    const tdee = 2000

    it('should calculate target calories for weight loss goal', () => {
      const target = calculateTargetCalories(tdee, 'lose')
      expect(target).toBe(1700) // 2000 * 0.85
    })

    it('should calculate target calories for weight gain goal', () => {
      const target = calculateTargetCalories(tdee, 'gain')
      expect(target).toBe(2200) // 2000 * 1.10
    })

    it('should calculate target calories for maintain goal', () => {
      const target = calculateTargetCalories(tdee, 'maintain')
      expect(target).toBe(2000) // 2000 * 1.0
    })

    it('should use maintain as default for unknown goal', () => {
      const target = calculateTargetCalories(tdee, 'unknown')
      expect(target).toBe(2000) // Default to maintain
    })

    it('should round target calories correctly', () => {
      const tdee = 1999
      const target = calculateTargetCalories(tdee, 'lose')
      expect(target).toBe(Math.round(1999 * 0.85))
    })
  })

  describe('Macros Calculation', () => {
    it('should calculate macros correctly for standard calories', () => {
      const calories = 2000
      const macros = calculateMacros(calories)

      // Protein: 2000 * 0.30 / 4 = 150g
      // Fats: 2000 * 0.25 / 9 = 55.56g ≈ 56g
      // Carbs: 2000 * 0.45 / 4 = 225g

      expect(macros.protein).toBe(150)
      expect(macros.fats).toBe(56)
      expect(macros.carbs).toBe(225)
    })

    it('should calculate macros correctly for weight loss calories', () => {
      const calories = 1700
      const macros = calculateMacros(calories)

      // Protein: 1700 * 0.30 / 4 = 127.5g ≈ 128g
      // Fats: 1700 * 0.25 / 9 = 47.22g ≈ 47g
      // Carbs: 1700 * 0.45 / 4 = 191.25g ≈ 191g

      expect(macros.protein).toBe(128)
      expect(macros.fats).toBe(47)
      expect(macros.carbs).toBe(191)
    })

    it('should calculate macros correctly for weight gain calories', () => {
      const calories = 2200
      const macros = calculateMacros(calories)

      // Protein: 2200 * 0.30 / 4 = 165g
      // Fats: 2200 * 0.25 / 9 = 61.11g ≈ 61g
      // Carbs: 2200 * 0.45 / 4 = 247.5g ≈ 248g

      expect(macros.protein).toBe(165)
      expect(macros.fats).toBe(61)
      expect(macros.carbs).toBe(248)
    })

    it('should handle zero calories', () => {
      const macros = calculateMacros(0)
      expect(macros.protein).toBe(0)
      expect(macros.fats).toBe(0)
      expect(macros.carbs).toBe(0)
    })

    it('should round macros correctly', () => {
      const calories = 1000
      const macros = calculateMacros(calories)

      // All values should be rounded
      expect(Number.isInteger(macros.protein)).toBe(true)
      expect(Number.isInteger(macros.fats)).toBe(true)
      expect(Number.isInteger(macros.carbs)).toBe(true)
    })

    it('should verify macros sum to approximately correct calories', () => {
      const calories = 2000
      const macros = calculateMacros(calories)

      // Verify: protein * 4 + fats * 9 + carbs * 4 ≈ calories
      // Note: Due to rounding, the sum may differ slightly
      const calculatedCalories = (macros.protein * 4) + (macros.fats * 9) + (macros.carbs * 4)
      expect(calculatedCalories).toBeCloseTo(calories, -1) // Allow ±10 calories difference
    })
  })

  describe('Full Calculation Flow', () => {
    it('should calculate complete nutrition targets for male weight loss', () => {
      // Male, 30 years, 80kg, 180cm, sedentary, lose weight
      const bmr = calculateBMR('male', 80, 180, 30)
      const tdee = calculateTDEE(bmr, 'sedentary')
      const targetCalories = calculateTargetCalories(tdee, 'lose')
      const macros = calculateMacros(targetCalories)

      expect(bmr).toBeGreaterThan(0)
      expect(tdee).toBeGreaterThan(bmr)
      expect(targetCalories).toBeLessThan(tdee) // Weight loss = deficit
      expect(macros.protein).toBeGreaterThan(0)
      expect(macros.fats).toBeGreaterThan(0)
      expect(macros.carbs).toBeGreaterThan(0)
    })

    it('should calculate complete nutrition targets for female weight gain', () => {
      // Female, 25 years, 65kg, 165cm, active, gain weight
      const bmr = calculateBMR('female', 65, 165, 25)
      const tdee = calculateTDEE(bmr, 'active')
      const targetCalories = calculateTargetCalories(tdee, 'gain')
      const macros = calculateMacros(targetCalories)

      expect(bmr).toBeGreaterThan(0)
      expect(tdee).toBeGreaterThan(bmr)
      expect(targetCalories).toBeGreaterThan(tdee) // Weight gain = surplus
      expect(macros.protein).toBeGreaterThan(0)
      expect(macros.fats).toBeGreaterThan(0)
      expect(macros.carbs).toBeGreaterThan(0)
    })

    it('should calculate training day targets (+200 kcal)', () => {
      const restDayCalories = 2000
      const trainingDayCalories = restDayCalories + 200

      const restMacros = calculateMacros(restDayCalories)
      const trainingMacros = calculateMacros(trainingDayCalories)

      expect(trainingDayCalories).toBe(2200)
      expect(trainingMacros.protein).toBeGreaterThanOrEqual(restMacros.protein)
      expect(trainingMacros.fats).toBeGreaterThanOrEqual(restMacros.fats)
      expect(trainingMacros.carbs).toBeGreaterThanOrEqual(restMacros.carbs)
    })
  })

  describe('Age Calculation from Birth Date', () => {
    it('should calculate age correctly', () => {
      const today = new Date('2024-01-15')
      const birthDate = new Date('1990-01-15')

      let age = today.getFullYear() - birthDate.getFullYear()
      const monthDiff = today.getMonth() - birthDate.getMonth()
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--
      }

      expect(age).toBe(34)
    })

    it('should handle birthday not yet occurred this year', () => {
      const today = new Date('2024-01-15')
      const birthDate = new Date('1990-06-15')

      let age = today.getFullYear() - birthDate.getFullYear()
      const monthDiff = today.getMonth() - birthDate.getMonth()
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--
      }

      expect(age).toBe(33)
    })

    it('should handle birthday already occurred this year', () => {
      const today = new Date('2024-12-15')
      const birthDate = new Date('1990-06-15')

      let age = today.getFullYear() - birthDate.getFullYear()
      const monthDiff = today.getMonth() - birthDate.getMonth()
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--
      }

      expect(age).toBe(34)
    })
  })
})
