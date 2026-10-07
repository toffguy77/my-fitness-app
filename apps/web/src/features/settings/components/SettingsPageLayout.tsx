'use client'

import Link from 'next/link'
import { RoleShell } from '@/shared/components/RoleShell'
import { useSettings } from '../hooks/useSettings'
import { ArrowLeft } from 'lucide-react'
import { t } from '@/shared/i18n'

interface SettingsPageLayoutProps {
    title: string
    children: (props: ReturnType<typeof useSettings>) => React.ReactNode
}

export function SettingsPageLayout({ title, children }: SettingsPageLayoutProps) {
    const settingsHook = useSettings()
    const { profile, isLoading } = settingsHook

    // The guard lives in proxy.ts now, before the page renders.

    // Имя берётся из профиля, когда он приехал, иначе его подставит RoleShell
    // из сессии. Локальный слепок здесь больше не читается: в браузере с
    // очищенным хранилищем он давал пустой заголовок.
    const userName = profile ? profile.name || profile.email : undefined

    if (isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-canvas" role="status">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-primary" aria-hidden="true" />
                <span className="sr-only">{t('settings.loading')}</span>
            </div>
        )
    }

    return (
        <RoleShell
            userName={userName}
            avatarUrl={profile?.avatar_url || undefined}
        >
            <div className="mx-auto flex w-full max-w-content flex-col gap-6 px-screen-x py-5">
                {/* Заголовок экрана: назад к профилю — круглая кнопка 44 px, ниже
                    название засечками, как у остальных экранов. */}
                <header className="flex flex-col items-start gap-2">
                    <Link
                        href="/profile"
                        aria-label={t('settings.backToProfile')}
                        className="-ml-2.5 inline-flex h-11 w-11 items-center justify-center rounded-full text-fg transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                        <ArrowLeft className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                    </Link>
                    <h1 className="type-title-1 text-fg">{title}</h1>
                </header>

                {children(settingsHook)}
            </div>
        </RoleShell>
    )
}

SettingsPageLayout.displayName = 'SettingsPageLayout'
