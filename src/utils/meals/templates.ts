/**
 * Утилиты для работы с шаблонами блюд
 */

export interface MealTemplate {
  id: string
  name: string
  weight: number
  per100: {
    calories: number
    protein: number
    fats: number
    carbs: number
  }
  category?: string
  userId?: string // Если null, то это общий шаблон
}

const TEMPLATE_STORAGE_KEY = 'fitness_app_meal_templates'

/**
 * Сохранить шаблон в localStorage
 */
export function saveMealTemplate(template: Omit<MealTemplate, 'id'>): string {
  const templates = loadMealTemplates()
  const newTemplate: MealTemplate = {
    ...template,
    id: crypto.randomUUID(),
  }
  templates.push(newTemplate)
  localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates))
  return newTemplate.id
}

/**
 * Загрузить все шаблоны из localStorage
 */
export function loadMealTemplates(userId?: string): MealTemplate[] {
  try {
    const stored = localStorage.getItem(TEMPLATE_STORAGE_KEY)
    if (!stored) return []

    const templates: MealTemplate[] = JSON.parse(stored)

    // Фильтруем по userId, если указан
    if (userId) {
      return templates.filter(t => t.userId === userId || !t.userId)
    }

    return templates
  } catch (error) {
    console.error('Ошибка загрузки шаблонов:', error)
    return []
  }
}

/**
 * Удалить шаблон
 */
export function deleteMealTemplate(templateId: string): void {
  const templates = loadMealTemplates()
  const filtered = templates.filter(t => t.id !== templateId)
  localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(filtered))
}

/**
 * Получить предустановленные шаблоны (общие для всех)
 */
export function getDefaultTemplates(): MealTemplate[] {
  return [
    {
      id: 'default-1',
      name: 'Куриная грудка',
      weight: 200,
      per100: {
        calories: 165,
        protein: 31,
        fats: 3.6,
        carbs: 0,
      },
      category: 'Мясо',
    },
    {
      id: 'default-2',
      name: 'Рис отварной',
      weight: 150,
      per100: {
        calories: 130,
        protein: 2.7,
        fats: 0.3,
        carbs: 28,
      },
      category: 'Крупы',
    },
    {
      id: 'default-3',
      name: 'Овсянка на воде',
      weight: 100,
      per100: {
        calories: 88,
        protein: 3,
        fats: 1.7,
        carbs: 15,
      },
      category: 'Крупы',
    },
    {
      id: 'default-4',
      name: 'Яйцо куриное',
      weight: 60,
      per100: {
        calories: 157,
        protein: 12.7,
        fats: 11.5,
        carbs: 0.7,
      },
      category: 'Яйца',
    },
    {
      id: 'default-5',
      name: 'Творог 5%',
      weight: 200,
      per100: {
        calories: 121,
        protein: 16,
        fats: 5,
        carbs: 3,
      },
      category: 'Молочные продукты',
    },
  ]
}
