'use client'

import { useEffect, useState } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import CreateInviteCodeModal from './CreateInviteCodeModal'
import InviteCodeCard from './InviteCodeCard'
import type { InviteCode } from '@/types/invites'

interface InviteCodeManagerProps {
    curatorId: string
}

export default function InviteCodeManager({ curatorId }: InviteCodeManagerProps) {
    const [codes, setCodes] = useState<InviteCode[]>([])
    const [loading, setLoading] = useState(true)
    const [showCreateModal, setShowCreateModal] = useState(false)

    const fetchCodes = async () => {
        setLoading(true)
        try {
            const response = await fetch('/api/invite-codes')
            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to fetch invite codes')
            }

            const data = await response.json()
            setCodes(data.codes || [])
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Ошибка загрузки кодов')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchCodes()
    }, [])

    const handleCodeCreated = (newCode: InviteCode) => {
        setCodes((prev) => [newCode, ...prev])
    }

    const handleCodeDeleted = (id: string) => {
        setCodes((prev) => prev.filter((code) => code.id !== id))
    }

    const handleCodeDeactivated = (id: string) => {
        setCodes((prev) =>
            prev.map((code) =>
                code.id === id ? { ...code, is_active: !code.is_active } : code
            )
        )
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 size={32} className="animate-spin text-zinc-500" />
            </div>
        )
    }

    return (
        <>
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-zinc-100 mb-1">Инвайт-коды</h2>
                    <p className="text-sm text-zinc-400">
                        Создавайте коды для приглашения клиентов. Они автоматически будут назначены вам как куратору.
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-4 py-2 bg-white text-zinc-950 rounded-lg font-medium hover:bg-zinc-200 transition-colors flex items-center gap-2"
                >
                    <Plus size={20} />
                    Создать код
                </button>
            </div>

            {codes.length === 0 ? (
                <div className="bg-zinc-900 p-12 rounded-xl border border-zinc-800 text-center">
                    <p className="text-zinc-400 mb-4">У вас пока нет инвайт-кодов</p>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="px-4 py-2 bg-white text-zinc-950 rounded-lg font-medium hover:bg-zinc-200 transition-colors"
                    >
                        Создать первый код
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    {codes.map((code) => (
                        <InviteCodeCard
                            key={code.id}
                            code={code}
                            onDelete={handleCodeDeleted}
                            onDeactivate={handleCodeDeactivated}
                        />
                    ))}
                </div>
            )}

            {showCreateModal && (
                <CreateInviteCodeModal
                    curatorId={curatorId}
                    onClose={() => setShowCreateModal(false)}
                    onSuccess={(newCode) => {
                        handleCodeCreated(newCode)
                        setShowCreateModal(false)
                    }}
                />
            )}
        </>
    )
}

