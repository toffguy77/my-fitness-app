'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { RoleShell } from '@/shared/components/RoleShell'
import { apiClient } from '@/shared/utils/api-client'
import { getProfile } from '@/features/settings/api/settings'
import type { FullProfile } from '@/features/settings/api/settings'
import { SettingsAppearance } from '@/features/settings/components/SettingsAppearance'
import { Button } from '@/shared/components/ui/Button'
import { ChevronRight } from 'lucide-react'

const menuItems = [
    { label: 'Настройки профиля', href: '/settings/profile' },
    { label: 'Тело и цели', href: '/settings/body' },
    { label: 'Ограничения в питании', href: '/settings/food-restrictions' },
    { label: 'Аккаунты социальных сетей', href: '/settings/social' },
    { label: 'Apple Health', href: '/settings/apple-health' },
    { label: 'Уведомления', href: '/settings/notifications' },
    { label: 'Изменить пароль', href: '/settings/password' },
    { label: 'Вход через сервисы', href: '/settings/security' },
]

export default function ProfilePage() {
    const router = useRouter()
    const [profile, setProfile] = useState<FullProfile | null>(null)
    const [loading, setLoading] = useState(true)

    // Роль здесь не читается: её знает RoleShell, и знает от сервера.
    useEffect(() => {
        getProfile()
            .then(setProfile)
            .catch(() => {
                router.push('/auth')
            })
            .finally(() => setLoading(false))
    }, [router])

    const handleLogout = () => {
        apiClient.clearToken()
        if (typeof window !== 'undefined') {
            localStorage.removeItem('user')
        }
        router.push('/auth')
    }

    if (loading || !profile) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-canvas">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-line border-t-primary" />
            </div>
        )
    }

    const initial = (profile.name || profile.email || '?')[0].toUpperCase()

    const content = (
        <div className="mx-auto flex w-full max-w-content flex-col gap-8 px-screen-x py-6">
            <div className="flex flex-col items-center text-center">
                {profile.avatar_url ? (
                    <Image
                        src={profile.avatar_url}
                        alt={profile.name || 'Avatar'}
                        width={96}
                        height={96}
                        className="h-24 w-24 rounded-full object-cover"
                    />
                ) : (
                    <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary text-3xl font-semibold text-on-primary">
                        {initial}
                    </div>
                )}
                {profile.name && (
                    <p className="mt-4 type-title-2 text-fg">{profile.name}</p>
                )}
                <p className="mt-1 text-sm text-fg-muted">{profile.email}</p>
            </div>

            <nav aria-label="Настройки" className="overflow-hidden rounded-card border border-line bg-surface">
                {menuItems.map((item, index) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`flex min-h-14 items-center justify-between px-4 transition-colors hover:bg-subtle/60${
                            index < menuItems.length - 1 ? ' border-b border-line' : ''
                        }`}
                    >
                        <span className="text-base text-fg">{item.label}</span>
                        <ChevronRight className="h-5 w-5 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                    </Link>
                ))}
            </nav>

            <SettingsAppearance />

            <Button variant="ghost" size="lg" block onClick={handleLogout} className="text-danger-fg hover:bg-danger-soft">
                Выйти из аккаунта
            </Button>
        </div>
    )

    return (
        <RoleShell
            userName={profile.name || profile.email}
            avatarUrl={profile.avatar_url || undefined}
        >
            {content}
        </RoleShell>
    )
}
