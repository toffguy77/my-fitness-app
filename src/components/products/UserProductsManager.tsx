'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Search } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import type { UserProduct } from '@/types/products'
import { logger } from '@/utils/logger'
import toast from 'react-hot-toast'
import ConfirmModal from '@/components/modals/ConfirmModal'

interface UserProductsManagerProps {
  userId: string
}

export default function UserProductsManager({ userId }: UserProductsManagerProps) {
  const supabase = createClient()
  const [products, setProducts] = useState<UserProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<UserProduct | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; productId: string | null }>({ isOpen: false, productId: null })

  // Форма для добавления/редактирования продукта
  const [formData, setFormData] = useState({
    name: '',
    calories_per_100g: 0,
    protein_per_100g: 0,
    fats_per_100g: 0,
    carbs_per_100g: 0,
    category: '',
    notes: '',
  })

  // Загрузка пользовательских продуктов
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const { data, error } = await supabase
          .from('user_products')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })

        if (error) {
          throw error
        }

        setProducts((data || []) as UserProduct[])
      } catch (error) {
        logger.error('UserProductsManager: ошибка загрузки продуктов', error, { userId })
        toast.error('Ошибка загрузки продуктов')
      } finally {
        setLoading(false)
      }
    }

    if (userId) {
      loadProducts()
    }
  }, [supabase, userId])

  // Фильтрация продуктов по поисковому запросу
  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.category?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Открытие модалки добавления
  const handleAdd = () => {
    setFormData({
      name: '',
      calories_per_100g: 0,
      protein_per_100g: 0,
      fats_per_100g: 0,
      carbs_per_100g: 0,
      category: '',
      notes: '',
    })
    setEditingProduct(null)
    setShowAddModal(true)
  }

  // Открытие модалки редактирования
  const handleEdit = (product: UserProduct) => {
    setFormData({
      name: product.name,
      calories_per_100g: product.calories_per_100g,
      protein_per_100g: product.protein_per_100g,
      fats_per_100g: product.fats_per_100g,
      carbs_per_100g: product.carbs_per_100g,
      category: product.category || '',
      notes: product.notes || '',
    })
    setEditingProduct(product)
    setShowAddModal(true)
  }

  // Сохранение продукта
  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Введите название продукта')
      return
    }

    if (formData.calories_per_100g < 0 || formData.protein_per_100g < 0 ||
        formData.fats_per_100g < 0 || formData.carbs_per_100g < 0) {
      toast.error('Значения КБЖУ не могут быть отрицательными')
      return
    }

    setSaving(true)
    try {
      if (editingProduct) {
        // Обновление существующего продукта
        const { error } = await supabase
          .from('user_products')
          .update({
            name: formData.name.trim(),
            calories_per_100g: formData.calories_per_100g,
            protein_per_100g: formData.protein_per_100g,
            fats_per_100g: formData.fats_per_100g,
            carbs_per_100g: formData.carbs_per_100g,
            category: formData.category.trim() || null,
            notes: formData.notes.trim() || null,
          })
          .eq('id', editingProduct.id)
          .eq('user_id', userId)

        if (error) {
          throw error
        }

        toast.success('Продукт обновлен')
      } else {
        // Создание нового продукта
        const { error } = await supabase
          .from('user_products')
          .insert({
            user_id: userId,
            name: formData.name.trim(),
            calories_per_100g: formData.calories_per_100g,
            protein_per_100g: formData.protein_per_100g,
            fats_per_100g: formData.fats_per_100g,
            carbs_per_100g: formData.carbs_per_100g,
            category: formData.category.trim() || null,
            notes: formData.notes.trim() || null,
          })

        if (error) {
          throw error
        }

        toast.success('Продукт добавлен')
      }

      // Перезагружаем список продуктов
      const { data, error } = await supabase
        .from('user_products')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (!error && data) {
        setProducts(data as UserProduct[])
      }

      setShowAddModal(false)
      setEditingProduct(null)
    } catch (error) {
      logger.error('UserProductsManager: ошибка сохранения продукта', error, { userId })
      toast.error('Ошибка сохранения продукта')
    } finally {
      setSaving(false)
    }
  }

  // Удаление продукта
  const handleDelete = (productId: string) => {
    setDeleteModal({ isOpen: true, productId })
  }

  const confirmDelete = async () => {
    if (!deleteModal.productId) return

    try {
      const { error } = await supabase
        .from('user_products')
        .delete()
        .eq('id', deleteModal.productId)
        .eq('user_id', userId)

      if (error) {
        throw error
      }

      setProducts(prev => prev.filter(p => p.id !== deleteModal.productId))
      toast.success('Продукт удален')
      setDeleteModal({ isOpen: false, productId: null })
    } catch (error) {
      logger.error('UserProductsManager: ошибка удаления продукта', error, { userId, productId: deleteModal.productId })
      toast.error('Ошибка удаления продукта')
    }
  }

  if (loading) {
    return <div className="p-4 text-center text-zinc-400">Загрузка...</div>
  }

  return (
    <div className="space-y-4">
      {/* Поиск и кнопка добавления */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-500" size={18} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск продуктов..."
            className="w-full pl-10 pr-4 py-2 border border-zinc-800 rounded-lg focus:ring-2 focus:ring-white outline-none text-sm text-zinc-100 bg-zinc-900 placeholder:text-zinc-600"
          />
        </div>
        <button
          onClick={handleAdd}
          className="px-4 py-2 bg-white text-zinc-950 rounded-lg font-medium text-sm hover:bg-zinc-200 transition-colors flex items-center gap-2"
        >
          <Plus size={16} />
          Добавить
        </button>
      </div>

      {/* Список продуктов */}
      {filteredProducts.length === 0 ? (
        <div className="p-8 text-center text-zinc-400 text-sm">
          {searchQuery ? 'Продукты не найдены' : 'У вас пока нет пользовательских продуктов'}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className="p-4 bg-zinc-800 rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h4 className="font-medium text-zinc-100">{product.name}</h4>
                  {product.category && (
                    <p className="text-xs text-zinc-500 mt-1">{product.category}</p>
                  )}
                  <div className="mt-2 grid grid-cols-4 gap-2 text-xs tabular-nums">
                    <div>
                      <span className="text-zinc-500">К:</span>
                      <span className="ml-1 font-medium text-zinc-100">{product.calories_per_100g}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Б:</span>
                      <span className="ml-1 font-medium text-zinc-100">{product.protein_per_100g}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Ж:</span>
                      <span className="ml-1 font-medium text-zinc-100">{product.fats_per_100g}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">У:</span>
                      <span className="ml-1 font-medium text-zinc-100">{product.carbs_per_100g}</span>
                    </div>
                  </div>
                  {product.notes && (
                    <p className="text-xs text-zinc-500 mt-2">{product.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEdit(product)}
                    className="p-2 text-zinc-400 hover:text-zinc-100 transition-colors"
                    title="Редактировать"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(product.id)}
                    className="p-2 text-red-400 hover:text-red-300 transition-colors"
                    title="Удалить"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Модалка добавления/редактирования */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-xl shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-lg font-bold text-zinc-100 mb-4">
              {editingProduct ? 'Редактировать продукт' : 'Добавить продукт'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-100 mb-1">
                  Название продукта *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2 border border-zinc-800 rounded-lg focus:ring-2 focus:ring-white outline-none text-sm text-zinc-100 bg-zinc-900 placeholder:text-zinc-600"
                  placeholder="Например: Куриная грудка"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-100 mb-1">
                    Калории (на 100г) *
                  </label>
                  <input
                    type="number"
                    value={formData.calories_per_100g || ''}
                    onChange={(e) => setFormData({ ...formData, calories_per_100g: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 border border-zinc-800 rounded-lg focus:ring-2 focus:ring-white outline-none text-sm text-zinc-100 bg-zinc-900 placeholder:text-zinc-600 tabular-nums"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-100 mb-1">
                    Белки (г на 100г) *
                  </label>
                  <input
                    type="number"
                    value={formData.protein_per_100g || ''}
                    onChange={(e) => setFormData({ ...formData, protein_per_100g: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 border border-zinc-800 rounded-lg focus:ring-2 focus:ring-white outline-none text-sm text-zinc-100 bg-zinc-900 placeholder:text-zinc-600 tabular-nums"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-100 mb-1">
                    Жиры (г на 100г) *
                  </label>
                  <input
                    type="number"
                    value={formData.fats_per_100g || ''}
                    onChange={(e) => setFormData({ ...formData, fats_per_100g: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 border border-zinc-800 rounded-lg focus:ring-2 focus:ring-white outline-none text-sm text-zinc-100 bg-zinc-900 placeholder:text-zinc-600 tabular-nums"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-100 mb-1">
                    Углеводы (г на 100г) *
                  </label>
                  <input
                    type="number"
                    value={formData.carbs_per_100g || ''}
                    onChange={(e) => setFormData({ ...formData, carbs_per_100g: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 border border-zinc-800 rounded-lg focus:ring-2 focus:ring-white outline-none text-sm text-zinc-100 bg-zinc-900 placeholder:text-zinc-600 tabular-nums"
                    min="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-100 mb-1">
                  Категория (опционально)
                </label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full p-2 border border-zinc-800 rounded-lg focus:ring-2 focus:ring-white outline-none text-sm text-zinc-100 bg-zinc-900 placeholder:text-zinc-600"
                  placeholder="Например: Мясо, Молочные продукты"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-100 mb-1">
                  Заметки (опционально)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full p-2 border border-zinc-800 rounded-lg focus:ring-2 focus:ring-white outline-none text-sm text-zinc-100 bg-zinc-900 placeholder:text-zinc-600 resize-none"
                  rows={3}
                  placeholder="Дополнительная информация о продукте"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddModal(false)
                  setEditingProduct(null)
                }}
                className="flex-1 px-4 py-2 border border-zinc-800 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-white text-zinc-950 rounded-lg text-sm font-medium hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Сохранение...' : editingProduct ? 'Сохранить' : 'Добавить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно подтверждения удаления */}
      {deleteModal.isOpen && (
        <ConfirmModal
          isOpen={deleteModal.isOpen}
          onClose={() => setDeleteModal({ isOpen: false, productId: null })}
          onConfirm={confirmDelete}
          title="Удалить продукт"
          message={`Вы уверены, что хотите удалить "${products.find(p => p.id === deleteModal.productId)?.name || 'этот продукт'}"? Это действие нельзя отменить.`}
          variant="danger"
          confirmText="Удалить"
          cancelText="Отмена"
        />
      )}
    </div>
  )
}
