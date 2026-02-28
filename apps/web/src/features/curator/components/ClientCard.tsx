'use client'

import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { cn } from '@/shared/utils/cn'
import { KBZHUProgress } from './KBZHUProgress'
import { AlertBadge } from './AlertBadge'
import type { ClientCard as ClientCardType } from '../types'

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

    const hasPlan = client.plan !== null
    const kbzhu = client.today_kbzhu

    return (
        <button
            type="button"
            onClick={handleClick}
            className={cn(
                'w-full rounded-xl bg-white p-4 shadow-sm border border-gray-100',
                'text-left transition-shadow hover:shadow-md',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2'
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
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-600">
                        {initials}
                    </div>
                )}
                <span className="flex-1 text-sm font-semibold text-gray-900 truncate">
                    {client.name}
                </span>
                {client.unread_count > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                        {client.unread_count}
                    </span>
                )}
            </div>

            {hasPlan && kbzhu ? (
                <div className="space-y-1.5">
                    <KBZHUProgress label="Ккал" value={kbzhu.calories} target={client.plan!.calories} compact />
                    <KBZHUProgress label="Белки" value={kbzhu.protein} target={client.plan!.protein} compact />
                    <KBZHUProgress label="Жиры" value={kbzhu.fat} target={client.plan!.fat} compact />
                    <KBZHUProgress label="Углеводы" value={kbzhu.carbs} target={client.plan!.carbs} compact />
                </div>
            ) : kbzhu ? (
                <div className="text-xs text-gray-500 space-y-0.5">
                    <p>Ккал: {Math.round(kbzhu.calories)} | Б: {Math.round(kbzhu.protein)} | Ж: {Math.round(kbzhu.fat)} | У: {Math.round(kbzhu.carbs)}</p>
                    <p className="text-gray-400">План не задан</p>
                </div>
            ) : (
                <p className="text-xs text-gray-400">Нет данных за сегодня</p>
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
