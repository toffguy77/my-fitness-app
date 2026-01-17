'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import type { Product } from '@/types/products'

interface ProductCardProps {
  product: Product
  onSelect: () => void
  selectedWeight?: number
  onWeightChange?: (weight: number) => void
  showFavorite?: boolean
  isFavorite?: boolean
  onFavorite?: () => void
}

export default function ProductCard({
  product,
  onSelect,
  selectedWeight = 100,
  onWeightChange,
  showFavorite = false,
  isFavorite = false,
  onFavorite,
}: ProductCardProps) {
  const [weight, setWeight] = useState(selectedWeight)

  const handleWeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newWeight = parseInt(e.target.value) || 100
    setWeight(newWeight)
    onWeightChange?.(newWeight)
  }

  // Пересчет КБЖУ на основе веса
  const calculateMacros = (baseValue: number, weight: number) => {
    return Math.round((baseValue * weight) / 100)
  }

  const calories = calculateMacros(product.calories_per_100g, weight)
  const protein = calculateMacros(product.protein_per_100g, weight)
  const fats = calculateMacros(product.fats_per_100g, weight)
  const carbs = calculateMacros(product.carbs_per_100g, weight)

  return (
    <div className="p-3 hover:bg-zinc-800 transition-colors">
      <div className="flex items-start gap-3">
        {product.image_url && (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-16 h-16 object-cover rounded-lg"
            onError={(e) => {
              // Скрываем изображение при ошибке загрузки
              e.currentTarget.style.display = 'none'
            }}
          />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-zinc-100 text-sm truncate">{product.name}</h4>
                {product.source && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${product.source === 'fatsecret' ? 'bg-green-900/30 text-green-400' :
                      product.source === 'openfoodfacts' ? 'bg-blue-900/30 text-blue-400' :
                        product.source === 'usda' ? 'bg-purple-900/30 text-purple-400' :
                          'bg-zinc-800 text-zinc-400'
                    }`}>
                    {product.source === 'fatsecret' ? 'FS' :
                      product.source === 'openfoodfacts' ? 'OFF' :
                        product.source === 'usda' ? 'USDA' :
                          'USER'}
                  </span>
                )}
              </div>
              {product.brand && (
                <p className="text-xs text-zinc-500 truncate">{product.brand}</p>
              )}
            </div>
            {showFavorite && onFavorite && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onFavorite()
                }}
                className={`p-1 ${isFavorite ? 'text-amber-400' : 'text-zinc-500'} hover:text-amber-400 transition-colors`}
                title={isFavorite ? 'Удалить из избранного' : 'Добавить в избранное'}
              >
                ⭐
              </button>
            )}
          </div>

          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-400">Вес (г):</label>
              <input
                type="number"
                value={weight}
                onChange={handleWeightChange}
                min="1"
                max="10000"
                className="w-20 px-2 py-1 border border-zinc-800 rounded text-xs text-zinc-100 bg-zinc-900 focus:ring-1 focus:ring-white outline-none placeholder:text-zinc-600 tabular-nums"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            <div className="grid grid-cols-4 gap-2 text-xs tabular-nums">
              <div>
                <span className="text-zinc-500">К:</span>
                <span className="ml-1 font-medium text-zinc-100">{calories}</span>
              </div>
              <div>
                <span className="text-zinc-500">Б:</span>
                <span className="ml-1 font-medium text-zinc-100">{protein}</span>
              </div>
              <div>
                <span className="text-zinc-500">Ж:</span>
                <span className="ml-1 font-medium text-zinc-100">{fats}</span>
              </div>
              <div>
                <span className="text-zinc-500">У:</span>
                <span className="ml-1 font-medium text-zinc-100">{carbs}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onSelect}
            className="mt-2 w-full px-3 py-1.5 bg-white text-zinc-950 rounded-lg text-xs font-medium hover:bg-zinc-200 transition-colors flex items-center justify-center gap-1"
          >
            <Check size={14} />
            Выбрать
          </button>
        </div>
      </div>
    </div>
  )
}
