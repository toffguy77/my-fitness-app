'use client'

import { cn } from '@/shared/utils/cn'
import type { CuratorLoad } from '../types'

export interface CuratorLoadCardProps {
    curator: CuratorLoad
}

export function CuratorLoadCard({ curator }: CuratorLoadCardProps) {
    const initials = curator.name
        .split(' ')
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()

    return (
        <div
            className={cn(
                'rounded-xl bg-white p-4 shadow-sm border border-gray-100',
                'transition-shadow hover:shadow-md'
            )}
            data-testid={`curator-load-card-${curator.id}`}
        >
            <div className="flex items-center gap-3">
                {curator.avatar_url ? (
                    <img
                        src={curator.avatar_url}
                        alt={curator.name}
                        className="h-10 w-10 rounded-full object-cover"
                    />
                ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-600">
                        {initials}
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{curator.name}</p>
                    <p className="text-xs text-gray-500 truncate">{curator.email}</p>
                </div>
                <div className="text-right">
                    <p className="text-lg font-bold text-blue-600">{curator.client_count}</p>
                    <p className="text-xs text-gray-500">клиентов</p>
                </div>
            </div>
        </div>
    )
}
