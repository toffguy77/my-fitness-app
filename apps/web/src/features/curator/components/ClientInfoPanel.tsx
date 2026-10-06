'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Send, Instagram } from 'lucide-react'
import type { ClientDetail } from '../types'

import { t } from '@/shared/i18n'
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
                className="flex items-center gap-1 text-xs text-fg-muted hover:text-fg transition-colors"
            >
                {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {t('curator.info.more')}
            </button>

            {open && (
                <div className="mt-2 rounded-lg bg-canvas p-3 text-xs text-fg-muted space-y-1.5">
                    <div className="flex flex-wrap gap-x-6 gap-y-1">
                        <span><span className="text-fg-subtle">ID:</span> {detail.id}</span>
                        {detail.email && (
                            <span>
                                <span className="text-fg-subtle">Email:</span>{' '}
                                <a href={`mailto:${detail.email}`} className="text-primary hover:underline">
                                    {detail.email}
                                </a>
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1">
                        {hasHeight && (
                            <span><span className="text-fg-subtle">{t('curator.info.height')}</span> {t('curator.info.heightValue', { value: detail.height ?? '' })}</span>
                        )}
                        {hasWeight && (
                            <span><span className="text-fg-subtle">{t('curator.info.weight')}</span> {t('curator.card.kilograms', { value: detail.last_weight ?? '' })}</span>
                        )}
                    </div>
                    {hasTimezone && (
                        <div>
                            <span className="text-fg-subtle">{t('curator.info.timezone')}</span> {detail.timezone}
                        </div>
                    )}
                    {(hasTelegram || hasInstagram) && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                            {hasTelegram && (
                                <a
                                    href={`https://t.me/${detail.telegram_username}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-primary hover:underline"
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
                                    className="inline-flex items-center gap-1 text-danger-fg hover:underline"
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
