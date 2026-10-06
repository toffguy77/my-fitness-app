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

    // The guard lives in middleware.ts now, before the page renders.

    // Имя берётся из профиля, когда он приехал, иначе его подставит RoleShell
    // из сессии. Локальный слепок здесь больше не читается: в браузере с
    // очищенным хранилищем он давал пустой заголовок.
    const userName = profile ? profile.name || profile.email : undefined

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-canvas">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        )
    }

    return (
        <RoleShell
            userName={userName}
            avatarUrl={profile?.avatar_url || undefined}
        >
            <div className="w-full max-w-md mx-auto px-4 py-6">
                {/* Back to profile */}
                <Link
                    href="/profile"
                    className="mb-6 inline-flex items-center gap-1 text-sm text-fg-muted transition-colors hover:text-fg"
                >
                    <ArrowLeft className="h-4 w-4" />
                    {t('settings.backToProfile')}
                </Link>

                {/* Page title */}
                <h1 className="mb-8 text-2xl font-bold text-fg">{title}</h1>

                {/* Page content */}
                {children(settingsHook)}
            </div>
        </RoleShell>
    )
}

SettingsPageLayout.displayName = 'SettingsPageLayout'
