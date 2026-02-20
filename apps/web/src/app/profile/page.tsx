'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/shared/utils/api-client'

interface UserData {
    id: string
    email: string
    name?: string
    role: string
}

export default function ProfilePage() {
    const router = useRouter()
    const [userData, setUserData] = useState<UserData | null>(null)

    useEffect(() => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
        if (!token) {
            router.push('/auth')
            return
        }
        const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null
        if (userStr) {
            try {
                setUserData(JSON.parse(userStr))
            } catch {
                router.push('/auth')
            }
        }
    }, [router])

    const handleLogout = () => {
        apiClient.clearToken()
        if (typeof window !== 'undefined') {
            localStorage.removeItem('user')
        }
        router.push('/auth')
    }

    if (!userData) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-md mx-auto px-4 pt-12 pb-8">
                <button
                    onClick={() => router.back()}
                    className="mb-6 text-gray-500 text-sm flex items-center gap-1"
                >
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Назад
                </button>

                <h1 className="text-2xl font-bold text-gray-900 mb-8">Профиль</h1>

                <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-2xl font-semibold">
                            {(userData.name || userData.email)[0].toUpperCase()}
                        </div>
                        <div>
                            {userData.name && (
                                <p className="text-lg font-semibold text-gray-900">{userData.name}</p>
                            )}
                            <p className="text-sm text-gray-500">{userData.email}</p>
                        </div>
                    </div>

                    <div className="border-t border-gray-100 pt-4 space-y-3">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">ID</span>
                            <span className="text-gray-900">{userData.id}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Роль</span>
                            <span className="text-gray-900">{userData.role}</span>
                        </div>
                    </div>
                </div>

                <Link
                    href="/forgot-password"
                    className="block w-full py-3 px-4 rounded-2xl bg-gray-100 text-gray-700 font-medium text-center hover:bg-gray-200 transition-colors mb-3"
                >
                    Сбросить пароль
                </Link>

                <button
                    onClick={handleLogout}
                    className="w-full py-3 px-4 rounded-2xl bg-red-50 text-red-600 font-medium text-center hover:bg-red-100 transition-colors"
                >
                    Выйти из аккаунта
                </button>
            </div>
        </div>
    )
}
