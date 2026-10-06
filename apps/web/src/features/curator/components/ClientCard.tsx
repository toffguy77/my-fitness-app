'use client'

import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { TrendingUp, TrendingDown, Minus, Droplets } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { KBZHUProgress } from './KBZHUProgress'
import { AlertBadge } from './AlertBadge'
import type { ClientCard as ClientCardType } from '../types'

import { t } from '@/shared/i18n'
export interface ClientCardProps {
    client: ClientCardType
}

export function ClientCard({ client }: ClientCardProps) {
    const router = useRouter()

    const handleClick = () => {
        router.push(`/curator/clients/${client.id}`)
    }

    const initials = client.name
        .split(' ')
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()

    const hasPlan = client.plan != null
    const kbzhu = client.today_kbzhu

    return (
        <button
            type="button"
            onClick={handleClick}
            data-testid="client-card"
            className={cn(
                'w-full rounded-xl bg-surface p-4 shadow-sm border border-line',
                'text-left transition-shadow hover:shadow-md',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2'
            )}
        >
            <div className="flex items-center gap-3 mb-3">
                {client.avatar_url ? (
                    <Image
                        src={client.avatar_url}
                        alt={client.name}
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-full object-cover"
                        unoptimized
                    />
                ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
                        {initials}
                    </div>
                )}
                <span className="flex-1 text-sm font-semibold text-fg truncate">
                    {client.name}
                </span>
                {client.unread_count > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-xs font-bold text-on-primary">
                        {client.unread_count}
                    </span>
                )}
            </div>

            {hasPlan && kbzhu ? (
                <div className="space-y-1.5">
                    <KBZHUProgress label={t('macros.calories')} value={kbzhu.calories} target={client.plan!.calories} compact />
                    <KBZHUProgress label={t('macros.protein')} value={kbzhu.protein} target={client.plan!.protein} compact />
                    <KBZHUProgress label={t('macros.fat')} value={kbzhu.fat} target={client.plan!.fat} compact />
                    <KBZHUProgress label={t('macros.carbs')} value={kbzhu.carbs} target={client.plan!.carbs} compact />
                </div>
            ) : kbzhu ? (
                <div className="text-xs text-fg-muted space-y-0.5">
                    <p>{t('curator.card.macrosInline', { calories: Math.round(kbzhu.calories), protein: Math.round(kbzhu.protein), fat: Math.round(kbzhu.fat), carbs: Math.round(kbzhu.carbs) })}</p>
                    <p className="text-fg-subtle">{t('curator.card.noPlan')}</p>
                </div>
            ) : (
                <p className="text-xs text-fg-subtle">{t('curator.card.noDataToday')}</p>
            )}

            {client.last_weight != null && (
                <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="text-fg-muted">{t('curator.card.weightLabel')}</span>
                    <span className="font-semibold text-fg">{t('curator.card.kilograms', { value: client.last_weight })}</span>
                    {client.weight_trend === 'down' && (
                        <TrendingDown className="h-3.5 w-3.5 text-success-fg" />
                    )}
                    {client.weight_trend === 'up' && (
                        <TrendingUp className="h-3.5 w-3.5 text-danger-fg" />
                    )}
                    {client.weight_trend === 'stable' && (
                        <Minus className="h-3.5 w-3.5 text-fg-subtle" />
                    )}
                    {client.target_weight != null && (
                        <span className="ml-auto text-fg-subtle">
                            {t('curator.card.targetWeight', { weight: client.target_weight })}
                        </span>
                    )}
                </div>
            )}

            {client.today_water && client.today_water.glasses > 0 && (
                <div className="mt-2 flex items-center gap-2 text-xs">
                    <Droplets className="h-3.5 w-3.5 text-primary" />
                    <span className={client.today_water.glasses >= client.today_water.goal ? 'font-semibold text-success-fg' : 'text-fg-muted'}>
                        {t('curator.card.glasses', { glasses: client.today_water.glasses, goal: client.today_water.goal })}
                    </span>
                </div>
            )}

            {client.alerts.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                    {client.alerts.map((alert, idx) => (
                        <AlertBadge key={idx} level={alert.level} message={alert.message} />
                    ))}
                </div>
            )}
        </button>
    )
}
