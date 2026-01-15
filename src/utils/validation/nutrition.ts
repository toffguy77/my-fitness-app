// Валидация данных питания для безопасности

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Валидация одного приема пищи
 */
export function validateMeal(meal: {
  calories?: number | null
  protein?: number | null
  fats?: number | null
  carbs?: number | null
  weight?: number | null
}): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Проверка веса
  if (meal.weight !== null && meal.weight !== undefined) {
    if (meal.weight <= 0) {
      errors.push('Вес порции должен быть больше 0 грамм')
    } else if (meal.weight > 10000) {
      warnings.push('Вес порции очень большой (>10 кг). Проверьте правильность ввода.')
    } else if (meal.weight < 10) {
      warnings.push('Вес порции очень маленький (<10 г). Убедитесь, что это правильно.')
    }
  }

  // Проверка калорий
  if (meal.calories !== null && meal.calories !== undefined) {
    if (meal.calories < 0) {
      errors.push('Калории не могут быть отрицательными. Введите положительное число или 0.')
    } else if (meal.calories > 5000) {
      warnings.push('Калорийность порции очень высокая (>5000 ккал). Проверьте правильность ввода.')
    }
  }

  // Проверка белков
  if (meal.protein !== null && meal.protein !== undefined) {
    if (meal.protein < 0) {
      errors.push('Белки не могут быть отрицательными. Введите положительное число или 0.')
    } else if (meal.protein > 500) {
      warnings.push('Содержание белков очень высокое (>500 г). Проверьте правильность ввода.')
    }
  }

  // Проверка жиров
  if (meal.fats !== null && meal.fats !== undefined) {
    if (meal.fats < 0) {
      errors.push('Жиры не могут быть отрицательными. Введите положительное число или 0.')
    } else if (meal.fats > 500) {
      warnings.push('Содержание жиров очень высокое (>500 г). Проверьте правильность ввода.')
    }
  }

  // Проверка углеводов
  if (meal.carbs !== null && meal.carbs !== undefined) {
    if (meal.carbs < 0) {
      errors.push('Углеводы не могут быть отрицательными. Введите положительное число или 0.')
    } else if (meal.carbs > 1000) {
      warnings.push('Содержание углеводов очень высокое (>1000 г). Проверьте правильность ввода.')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Валидация дневных totals (более строгие ограничения)
 */
export function validateDailyTotals(
  calories: number,
  protein: number,
  fats: number,
  carbs: number
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Проверка калорий (более строгие лимиты для дневной нормы)
  if (calories < 1000) {
    errors.push('Дневная норма калорий слишком низкая. Минимум: 1000 ккал в день для безопасного функционирования организма.')
  } else if (calories > 6000) {
    errors.push('Дневная норма калорий слишком высокая. Максимум: 6000 ккал в день. Проверьте правильность расчета.')
  } else if (calories < 1200) {
    warnings.push('Дневная норма калорий очень низкая (<1200 ккал). Убедитесь, что это безопасно для вашего здоровья.')
  } else if (calories > 5000) {
    warnings.push('Дневная норма калорий очень высокая (>5000 ккал). Проверьте правильность расчета или проконсультируйтесь с куратором.')
  }

  // Проверка белков
  if (protein < 20) {
    errors.push('Дневная норма белков слишком низкая. Минимум: 20 г в день для нормального функционирования организма.')
  } else if (protein > 500) {
    errors.push('Дневная норма белков слишком высокая. Максимум: 500 г в день. Проверьте правильность расчета.')
  } else if (protein < 50) {
    warnings.push('Дневная норма белков низкая (<50 г). Рекомендуется минимум 50-60 г для поддержания мышечной массы.')
  } else if (protein > 300) {
    warnings.push('Дневная норма белков очень высокая (>300 г). Проверьте правильность расчета или проконсультируйтесь с куратором.')
  }

  // Проверка жиров
  if (fats < 20) {
    errors.push('Дневная норма жиров слишком низкая. Минимум: 20 г в день для нормального метаболизма.')
  } else if (fats > 200) {
    errors.push('Дневная норма жиров слишком высокая. Максимум: 200 г в день. Проверьте правильность расчета.')
  } else if (fats < 30) {
    warnings.push('Дневная норма жиров низкая (<30 г). Рекомендуется минимум 30-40 г для поддержания гормонального баланса.')
  } else if (fats > 150) {
    warnings.push('Дневная норма жиров очень высокая (>150 г). Проверьте правильность расчета или проконсультируйтесь с куратором.')
  }

  // Проверка углеводов
  if (carbs < 20) {
    errors.push('Дневная норма углеводов слишком низкая. Минимум: 20 г в день. Если это кето-диета, проконсультируйтесь с врачом.')
  } else if (carbs > 500) {
    errors.push('Дневная норма углеводов слишком высокая. Максимум: 500 г в день. Проверьте правильность расчета.')
  } else if (carbs < 50) {
    warnings.push('Дневная норма углеводов низкая (<50 г). Возможно, это кето-диета. Убедитесь, что это безопасно для вас.')
  } else if (carbs > 400) {
    warnings.push('Дневная норма углеводов очень высокая (>400 г). Проверьте правильность расчета или проконсультируйтесь с куратором.')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Валидация nutrition_targets для куратора (используется в Server Actions)
 */
export function validateNutritionTargets(input: {
  calories: number
  protein: number
  fats: number
  carbs: number
}): ValidationResult {
  return validateDailyTotals(input.calories, input.protein, input.fats, input.carbs)
}
