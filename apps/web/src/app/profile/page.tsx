'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DashboardLayout } from '@/features/dashboard/components/DashboardLayout'
import { CuratorLayout } from '@/features/curator'
import { AdminLayout } from '@/features/admin'
import { apiClient } from '@/shared/utils/api-client'
import { getProfile } from '@/features/settings/api/settings'
import type { FullProfile } from '@/features/settings/api/settings'

const menuItems = [
    { label: 'Настройки профиля', href: '/settings/profile' },
    { label: 'Аккаунты социальных сетей', href: '/settings/social' },
    { label: 'Apple Health', href: '/settings/apple-health' },
]

export default function ProfilePage() {
    const router = useRouter()
    const [profile, setProfile] = useState<FullProfile | null>(null)
    const [loading, setLoading] = useState(true)
    const [userRole, setUserRole] = useState<string>('client')

    useEffect(() => {
        const token = localStorage.getItem('auth_token')
        if (!token) {
            router.push('/auth')
            return
        }

        try {
            const role = JSON.parse(localStorage.getItem('user') || '{}').role
            if (role) setUserRole(role)
        } catch { /* use default */ }

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
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
            </div>
        )
    }

    const initial = (profile.name || profile.email || '?')[0].toUpperCase()

    const content = (
        <div className="w-full max-w-md mx-auto px-4 py-6">
            {/* Avatar section */}
            <div className="flex flex-col items-center mb-8">
                {profile.avatar_url ? (
                    <img
                        src={profile.avatar_url}
                        alt={profile.name || 'Avatar'}
                        className="w-24 h-24 rounded-full object-cover"
                    />
                ) : (
                    <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-3xl font-semibold">
                        {initial}
                    </div>
                )}
                {profile.name && (
                    <p className="mt-3 text-xl font-semibold text-gray-900">{profile.name}</p>
                )}
                <p className="mt-1 text-sm text-gray-500">{profile.email}</p>
            </div>

            {/* Menu list */}
            <div className="bg-white rounded-2xl shadow-sm p-2 mb-8">
                {menuItems.map((item, index) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center justify-between py-3 px-4${
                            index < menuItems.length - 1 ? ' border-b border-gray-100' : ''
                        }`}
                    >
                        <span className="text-gray-900">{item.label}</span>
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-gray-400">
                            <path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </Link>
                ))}
            </div>

            {/* Logout button */}
            <button
                onClick={handleLogout}
                className="w-full py-3 text-red-500 text-center font-medium"
            >
                Выйти из аккаунта
            </button>
        </div>
    )

    if (userRole === 'coordinator') {
        return <CuratorLayout userName={profile.name || profile.email}>{content}</CuratorLayout>
    }

    if (userRole === 'super_admin') {
        return <AdminLayout userName={profile.name || profile.email}>{content}</AdminLayout>
    }

    return (
        <DashboardLayout
            userName={profile.name || profile.email}
            avatarUrl={profile.avatar_url || undefined}
        >
            {content}
        </DashboardLayout>
    )
}
