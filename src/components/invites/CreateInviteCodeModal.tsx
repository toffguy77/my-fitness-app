'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import type { InviteCode } from '@/types/invites'

interface CreateInviteCodeModalProps {
    coachId: string
    onClose: () => void
    onSuccess: (code: InviteCode) => void
}

export default function CreateInviteCodeModal({
    coachId,
    onClose,
    onSuccess,
}: CreateInviteCodeModalProps) {
    const [maxUses, setMaxUses] = useState<string>('')
    const [expiresAt, setExpiresAt] = useState<string>('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const response = await fetch('/api/invite-codes/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    max_uses: maxUses ? parseInt(maxUses, 10) : null,
                    expires_at: expiresAt || null,
                }),
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to create invite code')
            }

            const newCode = await response.json()
            toast.success('Инвайт-код создан!')
            onSuccess(newCode)
            onClose()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Ошибка создания кода')
        } finally {
            setLoading(false)
        }
    }

    // Устанавливаем минимальную дату на сегодня
    const today = new Date().toISOString().split('T')[0]

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-gray-900">Создать инвайт-код</h2>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Лимит использований (опционально)
                            </label>
                            <input
                                type="number"
                                min="1"
                                value={maxUses}
                                onChange={(e) => setMaxUses(e.target.value)}
                                placeholder="Безлимит"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                Оставьте пустым для безлимитного использования
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Срок действия (опционально)
                            </label>
                            <input
                                type="date"
                                min={today}
                                value={expiresAt}
                                onChange={(e) => setExpiresAt(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                Оставьте пустым для бессрочного кода
                            </p>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                            >
                                Отмена
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex-1 px-4 py-2 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? 'Создание...' : 'Создать код'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}

