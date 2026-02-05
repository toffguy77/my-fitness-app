/**
 * Dashboard Page
 *
 * Main landing page for authenticated users.
 * Displays the dashboard layout with header, main content, and footer navigation.
 *
 * Requirements: 1.1, 1.4
 */

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/features/dashboard/components/DashboardLayout'
import type { NavigationItemId } from '@/features/dashboard/types'

interface UserData {
    id: string
    email: string
    name?: string
    role: 'client' | 'coordinator' | 'super_admin'
}

export default function DashboardPage() {
    const router = useRouter()
    const [userData, setUserData] = useState<UserData | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        // Check authentication and fetch user data
        const checkAuth = () => {
            // Check if token exists
            const token = typeof window !== 'undefined'
                ? localStorage.getItem('auth_token')
                : null

            // Redirect to login if not authenticated (Requirement 1.1)
            if (!token) {
                router.push('/auth')
                return
            }

            // Get user data from localStorage (Requirement 1.1, 1.4)
            const userDataStr = typeof window !== 'undefined'
                ? localStorage.getItem('user')
                : null

            if (userDataStr) {
                try {
                    const user = JSON.parse(userDataStr) as UserData
                    setUserData(user)
                } catch (error) {
                    console.error('Failed to parse user data:', error)
                    // If user data is corrupted, redirect to login
                    router.push('/auth')
                    return
                }
            } else {
                // If no user data, redirect to login
                router.push('/auth')
                return
            }

            setIsLoading(false)
        }

        checkAuth()
    }, [router])

    const handleNavigate = (itemId: NavigationItemId) => {
        // Navigation is handled by the FooterNavigation component
        // This callback can be used for analytics or other side effects
    }

    // Show loading state while checking authentication
    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
                    <p className="text-gray-600">Загрузка...</p>
                </div>
            </div>
        )
    }

    // Don't render if no user data (will redirect)
    if (!userData) {
        return null
    }

    return (
        <DashboardLayout
            userName={userData.name || userData.email}
            avatarUrl={undefined} // Avatar URL not yet implemented in backend
            notificationCount={0} // Notification count not yet implemented
            activeNavItem="dashboard"
            onNavigate={handleNavigate}
        >
            {/* Main dashboard content - placeholder for now (Requirement 3.2) */}
            <div className="space-y-6">
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">
                        Добро пожаловать, {userData.name || 'пользователь'}!
                    </h1>
                    <p className="text-gray-600">
                        Это ваш дашборд. Здесь будет отображаться информация о вашем прогрессе.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">
                            Сегодняшняя статистика
                        </h2>
                        <p className="text-gray-600 text-sm">
                            Данные о питании и тренировках появятся здесь
                        </p>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">
                            Недельный прогресс
                        </h2>
                        <p className="text-gray-600 text-sm">
                            График прогресса появится здесь
                        </p>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-2">
                        Быстрые действия
                    </h2>
                    <div className="grid grid-cols-2 gap-3 mt-4">
                        <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                            <span className="text-sm font-medium text-gray-900">
                                Добавить прием пищи
                            </span>
                        </button>
                        <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                            <span className="text-sm font-medium text-gray-900">
                                Записать вес
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    )
}
