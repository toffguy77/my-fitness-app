'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, Loader2, Plus, Clock, Star, Scan } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { searchProducts, getProductByBarcode } from '@/utils/products/actions'
import { getFavoriteProducts, addToFavorites, removeFromFavorites, isFavorite } from '@/utils/products/favorites'
import { productSearchCache } from '@/utils/products/cache'
import ProductCard from './ProductCard'
import type { Product, UserProduct } from '@/types/products'
import { logger } from '@/utils/logger'
import toast from 'react-hot-toast'
import { ProductCardSkeleton } from '@/components/ui/Skeleton'

interface ProductSearchProps {
  onSelect: (product: Product, weight: number) => void
  placeholder?: string
  className?: string
  showAddCustom?: boolean
  onAddCustom?: () => void
  userId?: string
}

export default function ProductSearch({
  onSelect,
  placeholder = 'Поиск продуктов...',
  className = '',
  showAddCustom = true,
  onAddCustom,
  userId,
}: ProductSearchProps) {
  const supabase = createClient()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedWeight, setSelectedWeight] = useState<Record<string, number>>({})
  const [showResults, setShowResults] = useState(false)
  const [activeTab, setActiveTab] = useState<'search' | 'history' | 'favorites'>('search')
  const [historyProducts, setHistoryProducts] = useState<Product[]>([])
  const [favoriteProducts, setFavoriteProducts] = useState<Product[]>([])
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [showBarcodeInput, setShowBarcodeInput] = useState(false)
  const [barcodeValue, setBarcodeValue] = useState('')
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const barcodeInputRef = useRef<HTMLInputElement>(null)

  // Загрузка истории использования продуктов
  useEffect(() => {
    if (!userId || activeTab !== 'history') return

    const loadHistory = async () => {
      setLoadingHistory(true)
      try {
        // Загружаем последние 20 использованных продуктов
        const { data: historyData, error } = await supabase
          .from('product_usage_history')
          .select(`
            product_id,
            user_product_id,
            products (*),
            user_products (*)
          `)
          .eq('user_id', userId)
          .order('used_at', { ascending: false })
          .limit(20)

        if (error) {
          throw error
        }

        // Преобразуем в формат Product
        const products: Product[] = []
        const seenIds = new Set<string>()

        for (const item of historyData || []) {
          if (item.product_id && item.products && !seenIds.has(item.product_id)) {
            const p = item.products as any
            products.push({
              id: p.id,
              name: p.name,
              brand: p.brand,
              barcode: p.barcode,
              calories_per_100g: p.calories_per_100g,
              protein_per_100g: p.protein_per_100g,
              fats_per_100g: p.fats_per_100g,
              carbs_per_100g: p.carbs_per_100g,
              source: p.source,
              source_id: p.source_id,
              image_url: p.image_url,
            })
            seenIds.add(p.id)
          } else if (item.user_product_id && item.user_products && !seenIds.has(item.user_product_id)) {
            const up = item.user_products as any
            products.push({
              id: up.id,
              name: up.name,
              calories_per_100g: up.calories_per_100g,
              protein_per_100g: up.protein_per_100g,
              fats_per_100g: up.fats_per_100g,
              carbs_per_100g: up.carbs_per_100g,
              source: 'user',
            })
            seenIds.add(up.id)
          }
        }

        setHistoryProducts(products)
      } catch (error) {
        logger.error('ProductSearch: ошибка загрузки истории', error, { userId })
      } finally {
        setLoadingHistory(false)
      }
    }

    loadHistory()
  }, [supabase, userId, activeTab])

  // Загрузка избранных продуктов
  useEffect(() => {
    if (!userId || activeTab !== 'favorites') return

    const loadFavorites = async () => {
      setLoadingHistory(true)
      try {
        const products = await getFavoriteProducts(userId)
        setFavoriteProducts(products)
        // Обновляем множество ID избранных продуктов для быстрой проверки
        setFavoriteIds(new Set(products.map(p => p.id || '').filter(Boolean)))
      } catch (error) {
        logger.error('ProductSearch: ошибка загрузки избранного', error, { userId })
        toast.error('Ошибка загрузки избранных продуктов')
      } finally {
        setLoadingHistory(false)
      }
    }

    loadFavorites()
  }, [userId, activeTab])

  // Загрузка избранных ID при монтировании (для отображения иконок в результатах поиска)
  useEffect(() => {
    if (!userId) return

    const loadFavoriteIds = async () => {
      try {
        const products = await getFavoriteProducts(userId)
        setFavoriteIds(new Set(products.map(p => p.id || '').filter(Boolean)))
      } catch (error) {
        logger.debug('ProductSearch: ошибка загрузки ID избранных продуктов', { error })
      }
    }

    loadFavoriteIds()
  }, [userId])

  // Закрытие результатов при клике вне компонента
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Поиск продуктов
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([])
      setShowResults(false)
      return
    }

    // Очищаем предыдущий таймаут
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // Debounce поиска
    searchTimeoutRef.current = setTimeout(async () => {
      setLoading(true)
      setShowResults(true)

      try {
        // Проверяем кэш
        const cachedResults = productSearchCache.get(query)
        if (cachedResults) {
          setResults(cachedResults)
          setLoading(false)
          return
        }

        // Поиск через API
        const apiResults = await searchProducts(query, 20)

        // Сохраняем в кэш
        productSearchCache.set(query, apiResults)

        setResults(apiResults)
      } catch (error) {
        logger.error('ProductSearch: ошибка поиска продуктов', error, { query })
        toast.error('Ошибка поиска продуктов')
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [query])

  const handleSelect = (product: Product) => {
    const weight = selectedWeight[product.id || ''] || 100
    onSelect(product, weight)
    setQuery('')
    setResults([])
    setShowResults(false)
    setSelectedWeight({})
  }

  const handleWeightChange = (productId: string | undefined, weight: number) => {
    if (!productId) return
    setSelectedWeight((prev) => ({
      ...prev,
      [productId]: weight,
    }))
  }

  // Обработка сканирования штрих-кода
  const handleBarcodeScan = async () => {
    if (!barcodeValue.trim()) {
      toast.error('Введите штрих-код')
      return
    }

    setScanning(true)
    setLoading(true)
    setShowResults(true)
    setActiveTab('search')

    try {
      // Ищем продукт по штрих-коду
      const product = await getProductByBarcode(barcodeValue.trim())

      if (product) {
        setResults([product])
        toast.success('Продукт найден по штрих-коду')
      } else {
        setResults([])
        toast.error('Продукт не найден по штрих-коду')
      }
    } catch (error) {
      logger.error('ProductSearch: ошибка поиска по штрих-коду', error, { barcode: barcodeValue })
      toast.error('Ошибка поиска по штрих-коду')
      setResults([])
    } finally {
      setScanning(false)
      setLoading(false)
      setBarcodeValue('')
      setShowBarcodeInput(false)
    }
  }

  // Обработка открытия камеры для сканирования (если доступно)
  const handleOpenCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      // Если камера недоступна, показываем поле ввода штрих-кода
      setShowBarcodeInput(true)
      setTimeout(() => barcodeInputRef.current?.focus(), 100)
      return
    }

    try {
      // Показываем поле ввода штрих-кода (полная интеграция с камерой требует дополнительных библиотек)
      setShowBarcodeInput(true)
      setTimeout(() => barcodeInputRef.current?.focus(), 100)
      toast('Введите штрих-код вручную или используйте камеру (требуется дополнительная настройка)', { icon: 'ℹ️' })
    } catch (error) {
      logger.error('ProductSearch: ошибка доступа к камере', error)
      setShowBarcodeInput(true)
      setTimeout(() => barcodeInputRef.current?.focus(), 100)
    }
  }

  return (
    <div ref={searchRef} className={`relative ${className}`}>
      {/* Вкладки для поиска, истории и избранного */}
      {userId && (
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => {
              setActiveTab('search')
              setShowResults(query.length >= 2)
            }}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeTab === 'search'
                ? 'bg-white text-zinc-950'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
          >
            <Search size={14} className="inline mr-1" />
            Поиск
          </button>
          <button
            onClick={() => {
              setActiveTab('history')
              setShowResults(true)
            }}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeTab === 'history'
                ? 'bg-white text-zinc-950'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
          >
            <Clock size={14} className="inline mr-1" />
            Недавние
          </button>
          <button
            onClick={() => {
              setActiveTab('favorites')
              setShowResults(true)
            }}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeTab === 'favorites'
                ? 'bg-white text-zinc-950'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
          >
            <Star size={14} className="inline mr-1" />
            Избранное
          </button>
        </div>
      )}

      {/* Поле поиска (только для вкладки поиска) */}
      {activeTab === 'search' && (
        <div className="space-y-2">
          {showBarcodeInput ? (
            <div className="relative">
              <Scan className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-500" size={18} />
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeValue}
                onChange={(e) => setBarcodeValue(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleBarcodeScan()
                  }
                }}
                placeholder="Введите штрих-код..."
                className="w-full pl-10 pr-20 py-2 border border-zinc-800 rounded-lg focus:ring-2 focus:ring-white outline-none text-sm text-zinc-100 bg-zinc-900 placeholder:text-zinc-600"
              />
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex gap-1">
                <button
                  onClick={handleBarcodeScan}
                  disabled={scanning || !barcodeValue.trim()}
                  className="px-2 py-1 bg-white text-zinc-950 rounded text-xs font-medium hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {scanning ? <Loader2 className="animate-spin" size={14} /> : 'Найти'}
                </button>
                <button
                  onClick={() => {
                    setShowBarcodeInput(false)
                    setBarcodeValue('')
                  }}
                  className="px-2 py-1 bg-zinc-800 text-zinc-300 rounded text-xs font-medium hover:bg-zinc-700 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-500" size={18} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => query.length >= 2 && setShowResults(true)}
                placeholder={placeholder}
                className="w-full pl-10 pr-20 py-2 border border-zinc-800 rounded-lg focus:ring-2 focus:ring-white outline-none text-sm text-zinc-100 bg-zinc-900 placeholder:text-zinc-600 transition-all"
              />
              <button
                onClick={handleOpenCamera}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors rounded hover:bg-zinc-800"
                title="Сканировать штрих-код"
              >
                <Scan size={18} />
              </button>
              {loading && (
                <Loader2 className="absolute right-12 top-1/2 transform -translate-y-1/2 animate-spin text-zinc-500" size={18} />
              )}
            </div>
          )}
        </div>
      )}

      {showResults && (
        <div className="absolute z-10 w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-lg shadow-lg max-h-96 overflow-y-auto">
          {activeTab === 'search' && loading && (
            <div className="p-4">
              {[...Array(2)].map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          )}

          {activeTab === 'search' && results.length === 0 && !loading && query.length >= 2 && (
            <div className="p-4 text-center text-zinc-400">
              <p className="text-sm mb-2">Продукт не найден</p>
              {showAddCustom && onAddCustom && (
                <button
                  onClick={onAddCustom}
                  className="mt-2 px-4 py-2 text-sm text-zinc-950 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors flex items-center gap-2 mx-auto"
                >
                  <Plus size={16} />
                  Добавить свой продукт
                </button>
              )}
            </div>
          )}

          {activeTab === 'history' && loadingHistory && (
            <div className="p-4">
              {[...Array(3)].map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          )}

          {activeTab === 'favorites' && loadingHistory && (
            <div className="p-4">
              {[...Array(3)].map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          )}

          {/* Результаты поиска */}
          {activeTab === 'search' && results.map((product) => (
            <div key={product.id || product.name} className="border-b border-zinc-800 last:border-b-0">
              <ProductCard
                product={product}
                onSelect={() => handleSelect(product)}
                selectedWeight={selectedWeight[product.id || ''] || 100}
                onWeightChange={(weight) => handleWeightChange(product.id, weight)}
                showFavorite={!!userId}
                isFavorite={product.id ? favoriteIds.has(product.id) : false}
                onFavorite={async () => {
                  if (!userId || !product.id) return
                  try {
                    const isCurrentlyFavorite = favoriteIds.has(product.id)
                    if (isCurrentlyFavorite) {
                      await removeFromFavorites(userId, product.id)
                      setFavoriteIds(prev => {
                        const newSet = new Set(prev)
                        newSet.delete(product.id!)
                        return newSet
                      })
                      toast.success('Удалено из избранного')
                    } else {
                      await addToFavorites(userId, product.id)
                      setFavoriteIds(prev => new Set(prev).add(product.id!))
                      toast.success('Добавлено в избранное')
                    }
                  } catch (error) {
                    logger.error('ProductSearch: ошибка изменения избранного', error, { userId, productId: product.id })
                    toast.error('Ошибка изменения избранного')
                  }
                }}
              />
            </div>
          ))}

          {/* История использования */}
          {activeTab === 'history' && historyProducts.length === 0 && !loadingHistory && (
            <div className="p-4 text-center text-zinc-400 text-sm">
              Нет недавно использованных продуктов
            </div>
          )}
          {activeTab === 'history' && historyProducts.map((product) => (
            <div key={product.id || product.name} className="border-b border-zinc-800 last:border-b-0">
              <ProductCard
                product={product}
                onSelect={() => handleSelect(product)}
                selectedWeight={selectedWeight[product.id || ''] || 100}
                onWeightChange={(weight) => handleWeightChange(product.id, weight)}
                showFavorite={!!userId}
                isFavorite={product.id ? favoriteIds.has(product.id) : false}
                onFavorite={async () => {
                  if (!userId || !product.id) return
                  try {
                    const isCurrentlyFavorite = favoriteIds.has(product.id)
                    if (isCurrentlyFavorite) {
                      await removeFromFavorites(userId, product.id)
                      setFavoriteIds(prev => {
                        const newSet = new Set(prev)
                        newSet.delete(product.id!)
                        return newSet
                      })
                      toast.success('Удалено из избранного')
                    } else {
                      await addToFavorites(userId, product.id)
                      setFavoriteIds(prev => new Set(prev).add(product.id!))
                      toast.success('Добавлено в избранное')
                    }
                  } catch (error) {
                    logger.error('ProductSearch: ошибка изменения избранного', error, { userId, productId: product.id })
                    toast.error('Ошибка изменения избранного')
                  }
                }}
              />
            </div>
          ))}

          {/* Избранные продукты */}
          {activeTab === 'favorites' && favoriteProducts.length === 0 && !loadingHistory && (
            <div className="p-4 text-center text-zinc-400 text-sm">
              Нет избранных продуктов
            </div>
          )}
          {activeTab === 'favorites' && favoriteProducts.map((product) => (
            <div key={product.id || product.name} className="border-b border-zinc-800 last:border-b-0">
              <ProductCard
                product={product}
                onSelect={() => handleSelect(product)}
                selectedWeight={selectedWeight[product.id || ''] || 100}
                onWeightChange={(weight) => handleWeightChange(product.id, weight)}
                showFavorite={!!userId}
                isFavorite={true}
                onFavorite={async () => {
                  if (!userId || !product.id) return
                  try {
                    await removeFromFavorites(userId, product.id)
                    setFavoriteIds(prev => {
                      const newSet = new Set(prev)
                      newSet.delete(product.id!)
                      return newSet
                    })
                    setFavoriteProducts(prev => prev.filter(p => p.id !== product.id))
                    toast.success('Удалено из избранного')
                  } catch (error) {
                    logger.error('ProductSearch: ошибка удаления из избранного', error, { userId, productId: product.id })
                    toast.error('Ошибка удаления из избранного')
                  }
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
