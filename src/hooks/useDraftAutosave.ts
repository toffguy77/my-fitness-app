'use client'

import { useEffect, useRef } from 'react'
import { saveDraft, loadDraft, deleteDraft, getAutosaveInterval, type DraftData } from '@/utils/draft/autosave'
import toast from 'react-hot-toast'

interface UseDraftAutosaveOptions {
  date: string
  meals: any[]
  weight?: number | null
  hungerLevel?: number | null
  energyLevel?: number | null
  comments?: string | null
  enabled?: boolean
  onRestore?: (draft: DraftData) => void
}

export function useDraftAutosave({
  date,
  meals,
  weight,
  hungerLevel,
  energyLevel,
  comments,
  enabled = true,
  onRestore,
}: UseDraftAutosaveOptions) {
  const autosaveIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastSavedRef = useRef<number>(0)
  const hasRestoredRef = useRef(false)

  // Загрузка черновика при монтировании
  useEffect(() => {
    if (!enabled || hasRestoredRef.current) return

    const draft = loadDraft(date)
    if (draft && onRestore) {
      hasRestoredRef.current = true
      onRestore(draft)
    }
  }, [date, enabled, onRestore])

  // Автосохранение каждые 30 секунд
  useEffect(() => {
    if (!enabled) {
      if (autosaveIntervalRef.current) {
        clearInterval(autosaveIntervalRef.current)
        autosaveIntervalRef.current = null
      }
      return
    }

    const interval = getAutosaveInterval()
    
    autosaveIntervalRef.current = setInterval(() => {
      // Сохраняем только если есть данные для сохранения
      const hasData = meals.length > 0 || weight !== null || hungerLevel !== null || energyLevel !== null || comments
      
      if (hasData) {
        saveDraft(date, {
          meals,
          weight,
          hungerLevel,
          energyLevel,
          comments,
        })
        
        const now = Date.now()
        // Показываем уведомление не чаще раза в 2 минуты и только если есть значительные изменения
        const hasSignificantChanges = meals.length > 0 || weight !== null || hungerLevel !== null || energyLevel !== null || comments
        if (hasSignificantChanges && now - lastSavedRef.current > 120000) {
          lastSavedRef.current = now
          toast.success('Черновик сохранен', { duration: 2000, icon: '💾' })
        }
      }
    }, interval)

    return () => {
      if (autosaveIntervalRef.current) {
        clearInterval(autosaveIntervalRef.current)
        autosaveIntervalRef.current = null
      }
    }
  }, [date, meals, weight, hungerLevel, energyLevel, comments, enabled])

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      if (autosaveIntervalRef.current) {
        clearInterval(autosaveIntervalRef.current)
        autosaveIntervalRef.current = null
      }
    }
  }, [])

  return {
    clearDraft: () => deleteDraft(date),
    hasDraft: () => loadDraft(date) !== null,
  }
}

