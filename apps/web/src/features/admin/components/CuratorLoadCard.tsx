'use client'

import Image from 'next/image'
import { cn } from '@/shared/utils/cn'
import type { CuratorLoad } from '../types'

import { t } from '@/shared/i18n'
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
                'rounded-xl bg-surface p-4 shadow-sm border border-line',
                'transition-shadow hover:shadow-md'
            )}
            data-testid={`curator-load-card-${curator.id}`}
        >
            <div className="flex items-center gap-3">
                {curator.avatar_url ? (
                    <Image
                        src={curator.avatar_url}
                        alt={curator.name}
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-full object-cover"
                    />
                ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
                        {initials}
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-fg truncate">{curator.name}</p>
                    <p className="text-xs text-fg-muted truncate">{curator.email}</p>
                </div>
                <div className="text-right">
                    <p className="text-lg font-bold text-primary">{curator.client_count}</p>
                    <p className="text-xs text-fg-muted">{t('admin.dashboard.clientsWord')}</p>
                </div>
            </div>
        </div>
    )
}
