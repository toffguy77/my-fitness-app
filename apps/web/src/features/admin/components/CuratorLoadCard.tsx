'use client'

import Image from 'next/image'
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
            className="rounded-card border border-line bg-surface p-4"
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
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-subtle text-sm font-semibold text-fg-muted">
                        {initials}
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <p className="type-headline truncate text-fg">{curator.name}</p>
                    <p className="truncate text-sm text-fg-muted">{curator.email}</p>
                </div>
                <div className="text-right">
                    <p className="type-num-l tabular-nums text-fg">{curator.client_count}</p>
                    <p className="text-[13px] text-fg-muted">{t('admin.dashboard.clientsWord')}</p>
                </div>
            </div>
        </div>
    )
}
