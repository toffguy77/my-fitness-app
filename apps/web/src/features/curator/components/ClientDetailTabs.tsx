'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { cn } from '@/shared/utils/cn'

import { t } from '@/shared/i18n'
const TABS = [
    { id: 'overview', label: t('curator.tabs.overview') },
    { id: 'plan', label: t('curator.tabs.plan') },
    { id: 'tasks', label: t('curator.tabs.tasks') },
    { id: 'reports', label: t('curator.tabs.reports') },
    { id: 'nutrition', label: t('curator.tabs.nutrition') },
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

    // Вкладки — подчёркиванием чернилами: терракота на экране только у
    // главного действия. Каждая вкладка меняет адрес, поэтому активная
    // отмечена как текущая страница.
    return (
        <div className="-mx-screen-x flex gap-1 overflow-x-auto border-b border-line px-screen-x">
            {TABS.map((tab) => (
                <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleTabClick(tab.id)}
                    aria-current={current === tab.id ? 'page' : undefined}
                    className={cn(
                        '-mb-px min-h-11 whitespace-nowrap border-b-2 px-4 py-2.5 text-[15px] font-medium transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus',
                        current === tab.id
                            ? 'border-line-strong text-fg'
                            : 'border-transparent text-fg-subtle hover:text-fg',
                    )}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    )
}
