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
      ? 'text-green-600'
      : result.confidence >= 60
      ? 'text-yellow-600'
      : 'text-red-600'

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      {/* Информация о распознавании */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Уверенность распознавания</span>
          <span className={`text-sm font-bold ${confidenceColor}`}>
            {result.confidence.toFixed(1)}%
          </span>
        </div>
        {result.provider && (
          <p className="text-xs text-gray-500">
            Провайдер: {result.provider}
            {result.processingTimeMs && ` (${result.processingTimeMs}ms)`}
          </p>
        )}
      </div>

      {/* Распознанный текст (сворачиваемый) */}
      <details className="bg-gray-50 rounded-lg p-4">
        <summary className="text-sm font-medium text-gray-700 cursor-pointer">
          Распознанный текст
        </summary>
        <pre className="mt-2 text-xs text-gray-600 whitespace-pre-wrap max-h-40 overflow-y-auto">
          {result.text}
        </pre>
      </details>

      {/* Извлеченные данные */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Извлеченные данные</h3>
          {!isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1"
            >
              <Edit2 size={14} />
              Редактировать
            </button>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-600">Название продукта</label>
              <input
                type="text"
                value={editedData.productName || ''}
                onChange={(e) =>
                  setEditedData({ ...editedData, productName: e.target.value })
                }
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded text-sm"
                placeholder="Название продукта"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600">Калории (ккал)</label>
                <input
                  type="number"
                  value={editedData.calories || ''}
                  onChange={(e) =>
                    setEditedData({
                      ...editedData,
                      calories: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded text-sm"
                  placeholder="0"
                  step="0.1"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Вес порции (г)</label>
                <input
                  type="number"
                  value={editedData.weight || ''}
                  onChange={(e) =>
                    setEditedData({
                      ...editedData,
                      weight: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded text-sm"
                  placeholder="100"
                  step="0.1"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-gray-600">Белки (г)</label>
                <input
                  type="number"
                  value={editedData.protein || ''}
                  onChange={(e) =>
                    setEditedData({
                      ...editedData,
                      protein: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded text-sm"
                  placeholder="0"
                  step="0.1"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Жиры (г)</label>
                <input
                  type="number"
                  value={editedData.fats || ''}
                  onChange={(e) =>
                    setEditedData({
                      ...editedData,
                      fats: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded text-sm"
                  placeholder="0"
                  step="0.1"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Углеводы (г)</label>
                <input
                  type="number"
                  value={editedData.carbs || ''}
                  onChange={(e) =>
                    setEditedData({
                      ...editedData,
                      carbs: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded text-sm"
                  placeholder="0"
                  step="0.1"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleEdit}
                className="flex-1 px-4 py-2 bg-black text-white rounded hover:bg-gray-800 transition-colors text-sm"
              >
                Сохранить
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false)
                  setEditedData(result.extractedData)
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-sm"
              >
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {editedData.productName && (
              <div>
                <span className="text-xs text-gray-600">Название:</span>
                <p className="text-sm font-medium">{editedData.productName}</p>
              </div>
            )}
            <div className="grid grid-cols-4 gap-2">
              {editedData.calories !== undefined && (
                <div>
                  <span className="text-xs text-gray-600">Калории</span>
                  <p className="text-sm font-medium">{editedData.calories.toFixed(1)} ккал</p>
                </div>
              )}
              {editedData.protein !== undefined && (
                <div>
                  <span className="text-xs text-gray-600">Белки</span>
                  <p className="text-sm font-medium">{editedData.protein.toFixed(1)} г</p>
                </div>
              )}
              {editedData.fats !== undefined && (
                <div>
                  <span className="text-xs text-gray-600">Жиры</span>
                  <p className="text-sm font-medium">{editedData.fats.toFixed(1)} г</p>
                </div>
              )}
              {editedData.carbs !== undefined && (
                <div>
                  <span className="text-xs text-gray-600">Углеводы</span>
                  <p className="text-sm font-medium">{editedData.carbs.toFixed(1)} г</p>
                </div>
              )}
            </div>
            {editedData.weight && (
              <div>
                <span className="text-xs text-gray-600">Вес порции:</span>
                <p className="text-sm font-medium">{editedData.weight} г</p>
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
            className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50"
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
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs font-medium text-blue-900 mb-2">
                Найдено похожих продуктов: {matchedProducts.length}
              </p>
              <div className="space-y-1">
                {matchedProducts.map((product) => (
                  <div key={product.id} className="text-xs text-blue-700">
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
          className="flex-1 px-4 py-2 bg-black text-white rounded hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
        >
          <Check size={18} />
          Использовать
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
        >
          <X size={18} />
          Отмена
        </button>
      </div>
    </div>
  )
}

