'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { cn } from '@/shared/utils/cn'

const TABS = [
    { id: 'overview', label: 'Обзор' },
    { id: 'plan', label: 'План' },
    { id: 'tasks', label: 'Задачи' },
    { id: 'reports', label: 'Отчёты' },
] as const

export type TabId = (typeof TABS)[number]['id']

interface ClientDetailTabsProps {
    activeTab?: TabId
}

export function ClientDetailTabs({ activeTab }: ClientDetailTabsProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const current = activeTab || (searchParams.get('tab') as TabId) || 'overview'

    const handleTabClick = (tabId: string) => {
        const params = new URLSearchParams(searchParams.toString())
        if (tabId === 'overview') {
            params.delete('tab')
        } else {
            params.set('tab', tabId)
        }
        const qs = params.toString()
        router.push(qs ? `${pathname}?${qs}` : pathname)
    }

    return (
        <div className="flex gap-1 overflow-x-auto border-b border-gray-200 px-4 -mx-4">
            {TABS.map((tab) => (
                <button
                    key={tab.id}
                    onClick={() => handleTabClick(tab.id)}
                    className={cn(
                        'whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors',
                        current === tab.id
                            ? 'border-b-2 border-blue-600 text-blue-600'
                            : 'text-gray-500 hover:text-gray-700',
                    )}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    )
}
