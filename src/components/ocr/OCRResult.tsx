'use client'

import { useState } from 'react'
import { Check, X, Edit2, Search, Loader2 } from 'lucide-react'
import type { OCRResult, ExtractedNutritionData } from '@/types/ocr'
import type { Product } from '@/types/products'
import { searchProducts } from '@/utils/products/api'
import { validateExtractedData } from '@/utils/ocr/extract'
import toast from 'react-hot-toast'

interface OCRResultProps {
  result: OCRResult
  onConfirm: (data: ExtractedNutritionData) => void
  onEdit: (data: ExtractedNutritionData) => void
  onCancel: () => void
  onSearchProducts?: (query: string) => Promise<Product[]>
}

export default function OCRResultComponent({
  result,
  onConfirm,
  onEdit,
  onCancel,
  onSearchProducts,
}: OCRResultProps) {
  const [editedData, setEditedData] = useState<ExtractedNutritionData>(result.extractedData)
  const [isEditing, setIsEditing] = useState(false)
  const [searchingProducts, setSearchingProducts] = useState(false)
  const [matchedProducts, setMatchedProducts] = useState<Product[]>([])

  const handleSearchProducts = async () => {
    if (!result.extractedData.productName) {
      toast.error('Название продукта не найдено')
      return
    }

    setSearchingProducts(true)
    try {
      const products = await searchProducts(result.extractedData.productName)
      setMatchedProducts(products.slice(0, 5)) // Показываем первые 5
      if (products.length === 0) {
        toast('Продукты не найдены', { icon: 'ℹ️' })
      }
    } catch (error) {
      toast.error('Ошибка поиска продуктов')
    } finally {
      setSearchingProducts(false)
    }
  }

  const handleConfirm = () => {
    const validation = validateExtractedData(editedData)
    if (!validation.valid) {
      toast.error(validation.errors.join(', '))
      return
    }

    onConfirm(editedData)
  }

  const handleEdit = () => {
    const validation = validateExtractedData(editedData)
    if (!validation.valid) {
      toast.error(validation.errors.join(', '))
      return
    }

    setIsEditing(false)
    onEdit(editedData)
  }

  const confidenceColor =
    result.confidence >= 80
      ? 'text-emerald-400'
      : result.confidence >= 60
      ? 'text-amber-400'
      : 'text-red-400'

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      {/* Информация о распознавании */}
      <div className="bg-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-zinc-300">Уверенность распознавания</span>
          <span className={`text-sm font-bold tabular-nums ${confidenceColor}`}>
            {result.confidence.toFixed(1)}%
          </span>
        </div>
        {result.provider && (
          <p className="text-xs text-zinc-500">
            Провайдер: {result.provider}
            {result.processingTimeMs && ` (${result.processingTimeMs}ms)`}
          </p>
        )}
      </div>

      {/* Распознанный текст (сворачиваемый) */}
      <details className="bg-zinc-800 rounded-lg p-4">
        <summary className="text-sm font-medium text-zinc-300 cursor-pointer">
          Распознанный текст
        </summary>
        <pre className="mt-2 text-xs text-zinc-400 whitespace-pre-wrap max-h-40 overflow-y-auto">
          {result.text}
        </pre>
      </details>

      {/* Извлеченные данные */}
      <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-100">Извлеченные данные</h3>
          {!isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="text-xs text-zinc-400 hover:text-zinc-100 flex items-center gap-1"
            >
              <Edit2 size={14} />
              Редактировать
            </button>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-400">Название продукта</label>
              <input
                type="text"
                value={editedData.productName || ''}
                onChange={(e) =>
                  setEditedData({ ...editedData, productName: e.target.value })
                }
                className="w-full mt-1 px-3 py-2 border border-zinc-700 rounded text-sm text-zinc-100 bg-zinc-900 focus:ring-2 focus:ring-white outline-none placeholder:text-zinc-600"
                placeholder="Название продукта"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-zinc-400">Калории (ккал)</label>
                <input
                  type="number"
                  value={editedData.calories || ''}
                  onChange={(e) =>
                    setEditedData({
                      ...editedData,
                      calories: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                  className="w-full mt-1 px-3 py-2 border border-zinc-700 rounded text-sm text-zinc-100 bg-zinc-900 focus:ring-2 focus:ring-white outline-none placeholder:text-zinc-600 tabular-nums"
                  placeholder="0"
                  step="0.1"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400">Вес порции (г)</label>
                <input
                  type="number"
                  value={editedData.weight || ''}
                  onChange={(e) =>
                    setEditedData({
                      ...editedData,
                      weight: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                  className="w-full mt-1 px-3 py-2 border border-zinc-700 rounded text-sm text-zinc-100 bg-zinc-900 focus:ring-2 focus:ring-white outline-none placeholder:text-zinc-600 tabular-nums"
                  placeholder="100"
                  step="0.1"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-zinc-400">Белки (г)</label>
                <input
                  type="number"
                  value={editedData.protein || ''}
                  onChange={(e) =>
                    setEditedData({
                      ...editedData,
                      protein: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                  className="w-full mt-1 px-3 py-2 border border-zinc-700 rounded text-sm text-zinc-100 bg-zinc-900 focus:ring-2 focus:ring-white outline-none placeholder:text-zinc-600 tabular-nums"
                  placeholder="0"
                  step="0.1"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400">Жиры (г)</label>
                <input
                  type="number"
                  value={editedData.fats || ''}
                  onChange={(e) =>
                    setEditedData({
                      ...editedData,
                      fats: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                  className="w-full mt-1 px-3 py-2 border border-zinc-700 rounded text-sm text-zinc-100 bg-zinc-900 focus:ring-2 focus:ring-white outline-none placeholder:text-zinc-600 tabular-nums"
                  placeholder="0"
                  step="0.1"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400">Углеводы (г)</label>
                <input
                  type="number"
                  value={editedData.carbs || ''}
                  onChange={(e) =>
                    setEditedData({
                      ...editedData,
                      carbs: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                  className="w-full mt-1 px-3 py-2 border border-zinc-700 rounded text-sm text-zinc-100 bg-zinc-900 focus:ring-2 focus:ring-white outline-none placeholder:text-zinc-600 tabular-nums"
                  placeholder="0"
                  step="0.1"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleEdit}
                className="flex-1 px-4 py-2 bg-white text-zinc-950 rounded hover:bg-zinc-200 transition-colors text-sm"
              >
                Сохранить
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false)
                  setEditedData(result.extractedData)
                }}
                className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded hover:bg-zinc-700 transition-colors text-sm"
              >
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {editedData.productName && (
              <div>
                <span className="text-xs text-zinc-400">Название:</span>
                <p className="text-sm font-medium text-zinc-100">{editedData.productName}</p>
              </div>
            )}
            <div className="grid grid-cols-4 gap-2 tabular-nums">
              {editedData.calories !== undefined && (
                <div>
                  <span className="text-xs text-zinc-400">Калории</span>
                  <p className="text-sm font-medium text-zinc-100">{editedData.calories.toFixed(1)} ккал</p>
                </div>
              )}
              {editedData.protein !== undefined && (
                <div>
                  <span className="text-xs text-zinc-400">Белки</span>
                  <p className="text-sm font-medium text-zinc-100">{editedData.protein.toFixed(1)} г</p>
                </div>
              )}
              {editedData.fats !== undefined && (
                <div>
                  <span className="text-xs text-zinc-400">Жиры</span>
                  <p className="text-sm font-medium text-zinc-100">{editedData.fats.toFixed(1)} г</p>
                </div>
              )}
              {editedData.carbs !== undefined && (
                <div>
                  <span className="text-xs text-zinc-400">Углеводы</span>
                  <p className="text-sm font-medium text-zinc-100">{editedData.carbs.toFixed(1)} г</p>
                </div>
              )}
            </div>
            {editedData.weight && (
              <div>
                <span className="text-xs text-zinc-400">Вес порции:</span>
                <p className="text-sm font-medium text-zinc-100 tabular-nums">{editedData.weight} г</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Поиск совпадений в базе продуктов */}
      {result.extractedData.productName && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleSearchProducts}
            disabled={searchingProducts}
            className="w-full px-4 py-2 bg-zinc-800 text-zinc-300 rounded hover:bg-zinc-700 transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {searchingProducts ? (
              <>
                <Loader2 className="animate-spin" size={14} />
                Поиск...
              </>
            ) : (
              <>
                <Search size={14} />
                Найти похожие продукты
              </>
            )}
          </button>
          {matchedProducts.length > 0 && (
            <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-3">
              <p className="text-xs font-medium text-zinc-100 mb-2 tabular-nums">
                Найдено похожих продуктов: {matchedProducts.length}
              </p>
              <div className="space-y-1">
                {matchedProducts.map((product) => (
                  <div key={product.id} className="text-xs text-zinc-400">
                    • {product.name}
                    {product.brand && ` (${product.brand})`}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Кнопки действий */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleConfirm}
          className="flex-1 px-4 py-2 bg-white text-zinc-950 rounded hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
        >
          <Check size={18} />
          Использовать
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2"
        >
          <X size={18} />
          Отмена
        </button>
      </div>
    </div>
  )
}

