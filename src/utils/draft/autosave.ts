/**
 * Утилиты для автосохранения черновиков в localStorage
 */

const DRAFT_PREFIX = 'fitness_app_draft_'
const AUTOSAVE_INTERVAL = 30000 // 30 секунд

export interface DraftData {
  meals: any[]
  weight?: number | null
  hungerLevel?: number | null
  energyLevel?: number | null
  comments?: string | null
  date: string
  timestamp: number
}

/**
 * Получить ключ для хранения черновика
 */
function getDraftKey(date: string): string {
  return `${DRAFT_PREFIX}${date}`
}

/**
 * Сохранить черновик в localStorage
 */
export function saveDraft(date: string, data: Partial<DraftData>): void {
  try {
    const draft: DraftData = {
      ...data,
      date,
      timestamp: Date.now(),
    } as DraftData

    const key = getDraftKey(date)
    localStorage.setItem(key, JSON.stringify(draft))
  } catch (error) {
    console.error('Ошибка сохранения черновика:', error)
  }
}

/**
 * Загрузить черновик из localStorage
 */
export function loadDraft(date: string): DraftData | null {
  try {
    const key = getDraftKey(date)
    const stored = localStorage.getItem(key)
    
    if (!stored) {
      return null
    }

    const draft: DraftData = JSON.parse(stored)
    
    // Проверяем, не устарел ли черновик (старше 7 дней)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    if (draft.timestamp < sevenDaysAgo) {
      deleteDraft(date)
      return null
    }

    return draft
  } catch (error) {
    console.error('Ошибка загрузки черновика:', error)
    return null
  }
}

/**
 * Удалить черновик
 */
export function deleteDraft(date: string): void {
  try {
    const key = getDraftKey(date)
    localStorage.removeItem(key)
  } catch (error) {
    console.error('Ошибка удаления черновика:', error)
  }
}

/**
 * Очистить все черновики
 */
export function clearAllDrafts(): void {
  try {
    const keys = Object.keys(localStorage)
    keys.forEach(key => {
      if (key.startsWith(DRAFT_PREFIX)) {
        localStorage.removeItem(key)
      }
    })
  } catch (error) {
    console.error('Ошибка очистки черновиков:', error)
  }
}

/**
 * Получить интервал автосохранения
 */
export function getAutosaveInterval(): number {
  return AUTOSAVE_INTERVAL
}

