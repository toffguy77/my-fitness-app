'use client'

import { useState, useEffect } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { loadMealTemplates, deleteMealTemplate, getDefaultTemplates, type MealTemplate } from '@/utils/meals/templates'
import type { Meal } from '@/app/app/nutrition/page'

interface MealTemplatesProps {
  onSelect: (template: MealTemplate) => void
  userId?: string
  onClose: () => void
}

export default function MealTemplates({ onSelect, userId, onClose }: MealTemplatesProps) {
  const [templates, setTemplates] = useState<MealTemplate[]>([])
  const [defaultTemplates] = useState<MealTemplate[]>(getDefaultTemplates())

  useEffect(() => {
    const userTemplates = loadMealTemplates(userId)
    // Используем setTimeout для асинхронного обновления состояния
    setTimeout(() => {
      setTemplates(userTemplates)
    }, 0)
  }, [userId])

  const handleDelete = (templateId: string) => {
    deleteMealTemplate(templateId)
    setTemplates(prev => prev.filter(t => t.id !== templateId))
  }

  const allTemplates = [...defaultTemplates, ...templates]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Шаблоны блюд</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Закрыть"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {allTemplates.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>Нет сохраненных шаблонов</p>
              <p className="text-sm mt-2">Создайте шаблон из часто используемых блюд</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {allTemplates.map((template) => {
                const isUserTemplate = template.userId === userId
                return (
                  <div
                    key={template.id}
                    className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-md transition-all cursor-pointer"
                    onClick={() => {
                      onSelect(template)
                      onClose()
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{template.name}</h3>
                        {template.category && (
                          <p className="text-xs text-gray-500 mt-1">{template.category}</p>
                        )}
                      </div>
                      {isUserTemplate && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(template.id)
                          }}
                          className="text-red-600 hover:text-red-800 transition-colors p-1"
                          title="Удалить шаблон"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-gray-600 space-y-1">
                      <div>Вес: {template.weight} г</div>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div>К: {template.per100.calories}</div>
                        <div>Б: {template.per100.protein} г</div>
                        <div>Ж: {template.per100.fats} г</div>
                        <div>У: {template.per100.carbs} г</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}

