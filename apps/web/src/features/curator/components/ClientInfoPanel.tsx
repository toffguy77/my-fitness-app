'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Send, Instagram } from 'lucide-react'
import type { ClientDetail } from '../types'

interface ClientInfoPanelProps {
    detail: ClientDetail
}

export function ClientInfoPanel({ detail }: ClientInfoPanelProps) {
    const [open, setOpen] = useState(false)

    const hasHeight = detail.height != null
    const hasWeight = detail.last_weight != null
    const hasTelegram = !!detail.telegram_username
    const hasInstagram = !!detail.instagram_username
    const hasTimezone = !!detail.timezone

    return (
        <div>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
                {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                Подробнее
            </button>

            {open && (
                <div className="mt-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-600 space-y-1.5">
                    <div className="flex flex-wrap gap-x-6 gap-y-1">
                        <span><span className="text-gray-400">ID:</span> {detail.id}</span>
                        {detail.email && (
                            <span>
                                <span className="text-gray-400">Email:</span>{' '}
                                <a href={`mailto:${detail.email}`} className="text-blue-600 hover:underline">
                                    {detail.email}
                                </a>
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1">
                        {hasHeight && (
                            <span><span className="text-gray-400">Рост:</span> {detail.height} см</span>
                        )}
                        {hasWeight && (
                            <span><span className="text-gray-400">Вес:</span> {detail.last_weight} кг</span>
                        )}
                    </div>
                    {hasTimezone && (
                        <div>
                            <span className="text-gray-400">Часовой пояс:</span> {detail.timezone}
                        </div>
                    )}
                    {(hasTelegram || hasInstagram) && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                            {hasTelegram && (
                                <a
                                    href={`https://t.me/${detail.telegram_username}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                                >
                                    <Send className="h-3 w-3" />
                                    @{detail.telegram_username}
                                </a>
                            )}
                            {hasInstagram && (
                                <a
                                    href={`https://instagram.com/${detail.instagram_username}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-pink-600 hover:underline"
                                >
                                    <Instagram className="h-3 w-3" />
                                    @{detail.instagram_username}
                                </a>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
