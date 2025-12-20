'use client'

import { useState } from 'react'
import { Copy, Trash2, Power, PowerOff, Calendar, Users, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'
import type { InviteCode } from '@/types/invites'

interface InviteCodeCardProps {
    code: InviteCode
    onCopy?: (code: string, link: string) => void
    onDeactivate?: (id: string) => void
    onDelete?: (id: string) => void
}

export default function InviteCodeCard({
    code,
    onCopy,
    onDeactivate,
    onDelete,
}: InviteCodeCardProps) {
    const [deleting, setDeleting] = useState(false)
    const [deactivating, setDeactivating] = useState(false)

    const handleCopy = () => {
        navigator.clipboard.writeText(code.link)
        toast.success('Ссылка скопирована!')
        onCopy?.(code.code, code.link)
    }

    const handleDeactivate = async () => {
        if (!confirm('Вы уверены, что хотите деактивировать этот код?')) {
            return
        }

        setDeactivating(true)
        try {
            const response = await fetch(`/api/invite-codes/${code.id}/deactivate`, {
                method: 'POST',
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to deactivate code')
            }

            toast.success('Код деактивирован')
            onDeactivate?.(code.id)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Ошибка деактивации')
        } finally {
            setDeactivating(false)
        }
    }

    const handleDelete = async () => {
        if (!confirm('Вы уверены, что хотите удалить этот код? Это действие нельзя отменить.')) {
            return
        }

        setDeleting(true)
        try {
            const response = await fetch(`/api/invite-codes/${code.id}`, {
                method: 'DELETE',
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to delete code')
            }

            toast.success('Код удален')
            onDelete?.(code.id)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Ошибка удаления')
        } finally {
            setDeleting(false)
        }
    }

    const isExpired = code.expires_at && new Date(code.expires_at) < new Date()
    const isLimitReached = code.max_uses && code.used_count >= code.max_uses
    const isActive = code.is_active && !isExpired && !isLimitReached

    return (
        <div className={`bg-white p-6 rounded-xl border ${isActive ? 'border-gray-200' : 'border-gray-300 bg-gray-50'
            }`}>
            <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                        <code className="text-2xl font-bold text-gray-900 font-mono">
                            {code.code}
                        </code>
                        {!isActive && (
                            <span className="px-2 py-1 bg-gray-200 text-gray-600 text-xs rounded font-medium">
                                {isExpired ? 'Истек' : isLimitReached ? 'Лимит' : 'Неактивен'}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={handleCopy}
                        className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1 transition-colors"
                    >
                        <Copy size={14} />
                        Копировать ссылку
                    </button>
                </div>
                <div className="flex gap-2">
                    {code.is_active ? (
                        <button
                            onClick={handleDeactivate}
                            disabled={deactivating}
                            className="p-2 text-gray-600 hover:text-orange-600 transition-colors disabled:opacity-50"
                            title="Деактивировать"
                        >
                            <PowerOff size={18} />
                        </button>
                    ) : (
                        <button
                            onClick={handleDeactivate}
                            disabled={deactivating}
                            className="p-2 text-gray-400 hover:text-green-600 transition-colors disabled:opacity-50"
                            title="Активировать"
                        >
                            <Power size={18} />
                        </button>
                    )}
                    <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="p-2 text-gray-600 hover:text-red-600 transition-colors disabled:opacity-50"
                        title="Удалить"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>
            </div>

            <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                    <Users size={16} />
                    <span>
                        Использовано: <strong>{code.used_count}</strong>
                        {code.max_uses ? ` / ${code.max_uses}` : ' (безлимит)'}
                    </span>
                </div>

                {code.statistics && (
                    <div className="flex items-center gap-2 text-gray-600">
                        <TrendingUp size={16} />
                        <span>
                            Всего регистраций: <strong>{code.statistics.total_registrations}</strong>
                            {code.statistics.recent_registrations > 0 && (
                                <span className="text-green-600 ml-1">
                                    (+{code.statistics.recent_registrations} за 7 дней)
                                </span>
                            )}
                        </span>
                    </div>
                )}

                {code.expires_at && (
                    <div className="flex items-center gap-2 text-gray-600">
                        <Calendar size={16} />
                        <span>
                            Истекает: <strong>{new Date(code.expires_at).toLocaleDateString('ru-RU')}</strong>
                        </span>
                    </div>
                )}

                <div className="text-gray-500 text-xs pt-2 border-t border-gray-200">
                    Создан: {new Date(code.created_at).toLocaleDateString('ru-RU')}
                    {code.last_used_at && (
                        <span className="ml-2">
                            • Последнее использование: {new Date(code.last_used_at).toLocaleDateString('ru-RU')}
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}

