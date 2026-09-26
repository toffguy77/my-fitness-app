/**
 * Dashboard Page
 *
 * Main landing page for authenticated users.
 * Displays the complete dashboard with all sections:
 * - Calendar Navigator (eager-loaded, above the fold)
 * - Daily Tracking Grid (eager-loaded, above the fold)
 * - Weight Section (eager-loaded, above the fold)
 * - Progress Section (lazy-loaded, below the fold)
 * - Photo Upload Section (lazy-loaded, below the fold)
 * - Weekly Plan Section (lazy-loaded, below the fold)
 * - Tasks Section (lazy-loaded, below the fold)
 *
 * Code Splitting Strategy:
 * - Above-the-fold components (CalendarNavigator, DailyTrackingGrid, WeightSection) are eager-loaded
 *   for immediate rendering and optimal LCP (Largest Contentful Paint)
 * - Below-the-fold components are lazy-loaded with React.lazy() and Suspense
 *   to reduce initial bundle size and improve TTI (Time to Interactive)
 */

'use client'

import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { DashboardLayout } from '@/features/dashboard/components/DashboardLayout'
import { getProfile } from '@/features/settings/api/settings'
import { CalendarNavigator } from '@/features/dashboard/components/CalendarNavigator'
import { DailyTrackingGrid } from '@/features/dashboard/components/DailyTrackingGrid'
import { WeightSection } from '@/features/dashboard/components/WeightSection'
import {
    LazyProgressSection,
    LazyPhotoUploadSection,
    LazyWeeklyPlanSection,
    ProgressSectionSkeleton,
    PhotoUploadSectionSkeleton,
    WeeklyPlanSectionSkeleton,
} from '@/features/dashboard'
import { ClientTasksSection } from '@/features/dashboard/components/ClientTasksSection'
import { CuratorFeedbackSection } from '@/features/dashboard/components/CuratorFeedbackSection'
import { useDashboardStore } from '@/features/dashboard/store/dashboardStore'
import { dashboardApi } from '@/features/dashboard/api/dashboardApi'
import { messageForOr } from '@/shared/errors/apiErrors'
import toast from 'react-hot-toast'
import { KBJUWeeklyChart } from '@/features/nutrition-calc/components/KBJUWeeklyChart'
import { ProfileCompletionBanner } from '@/features/nutrition-calc/components/ProfileCompletionBanner'
import { getHistory } from '@/features/nutrition-calc/api/nutritionCalc'
import type { TargetVsActual } from '@/features/nutrition-calc/types'
import { useCurrentUser } from '@/shared/hooks/useCurrentUser'
import { t } from '@/shared/i18n'

interface UserData {
    id: string
    email: string
    name?: string
    role: 'client' | 'coordinator' | 'super_admin'
}

export default function DashboardPage() {
    const searchParams = useSearchParams()
    const highlightTaskId = searchParams.get('task')
    // Who is looking at this page. The cache paints the first frame; the
    // server settles it.
    const { user: currentUser, state: userState } = useCurrentUser()
    const userData = currentUser as UserData | null
    const isLoading = userState === 'loading'
    const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined)
    const [kbjuHistory, setKbjuHistory] = useState<TargetVsActual[]>([])

    const {
        selectedDate,
        selectedWeek,
        fetchWeekData,
        fetchWeeklyPlan,
        fetchTasks,
        startPolling,
        stopPolling,
        setOfflineStatus,
        loadFromCache,
        targetsVersion,
    } = useDashboardStore()

    // The profile carries the avatar and the display name; the identity itself
    // comes from the session above.
    const [profileName, setProfileName] = useState<string | undefined>(undefined)
    useEffect(() => {
        if (!userData) return
        getProfile()
            .then((profile) => {
                if (profile.avatar_url) setAvatarUrl(profile.avatar_url)
                if (profile.name) setProfileName(profile.name)
            })
            .catch(() => {})
    }, [userData?.id])

    // Fetch KBJU weekly history (re-fetch after metric saves via targetsVersion)
    useEffect(() => {
        if (!userData) return
        getHistory(7)
            .then(res => setKbjuHistory(res.days))
            .catch(() => {})
    }, [userData?.id, targetsVersion])

    // Fetch dashboard data on mount
    useEffect(() => {
        if (!userData) return

        const fetchData = async () => {
            try {
                // Load cached data first for faster initial render
                loadFromCache()

                // Fetch fresh data
                await Promise.all([
                    fetchWeekData(selectedWeek.start, selectedWeek.end),
                    fetchWeeklyPlan(),
                    fetchTasks(),
                ])

                // Start polling for real-time updates
                startPolling(30000) // Poll every 30 seconds
            } catch (error) {
                console.error('Failed to fetch dashboard data:', error)
            }
        }

        fetchData()

        // Cleanup on unmount
        return () => {
            stopPolling()
        }
    }, [
        userData,
        selectedWeek,
        fetchWeekData,
        fetchWeeklyPlan,
        fetchTasks,
        startPolling,
        stopPolling,
        loadFromCache,
    ])

    // Handle online/offline status
    useEffect(() => {
        const handleOnline = () => setOfflineStatus(false)
        const handleOffline = () => setOfflineStatus(true)

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [setOfflineStatus])

    const [submittingReport, setSubmittingReport] = useState(false)

    /**
     * Отправка недельного отчёта куратору.
     *
     * Кнопка существовала с самого начала — заметная, пульсирующая, по
     * воскресеньям, — и вызывала обработчик, который писал в консоль. Человек
     * жал, ничего не происходило, и понять это было нельзя: ни ошибки, ни
     * подтверждения. При этом сервер умел принимать отчёт, а служба дашборда
     * умела уведомлять куратора: не хватало ровно этого вызова.
     *
     * Сервер сам проверяет, что неделя заполнена, и отказывает с перечнем
     * недостающего — показываем этот перечень, а не общую фразу: человеку
     * нужно знать, что именно дозаполнить.
     */
    const handleSubmitReport = async () => {
        if (submittingReport) return
        setSubmittingReport(true)
        try {
            // Сервер принимает дату недели, не момент времени.
            const asDate = (d: Date) => d.toISOString().slice(0, 10)
            await dashboardApi.submitWeeklyReport(asDate(selectedWeek.start), asDate(selectedWeek.end))
            toast.success(t('dashboard.calendar.reportSent'))
        } catch (error) {
            toast.error(messageForOr(error, t('dashboard.calendar.reportFailed')))
        } finally {
            setSubmittingReport(false)
        }
    }

    // Show loading state while checking authentication
    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
                    <p className="text-gray-600">{t('common.loading')}</p>
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
            userName={profileName || userData.name || userData.email}
            avatarUrl={avatarUrl}
            activeNavItem="dashboard"
        >
            <div className="w-full max-w-7xl mx-auto space-y-4 sm:space-y-5 md:space-y-6 p-3 sm:p-4 md:p-6">
                {/* Profile Completion Banner */}
                <ProfileCompletionBanner />

                {/* Calendar Navigator */}
                <CalendarNavigator
                    onSubmitReport={handleSubmitReport}
                    className="w-full"
                />

                {/* Progress Section — adherence */}
                <Suspense fallback={<ProgressSectionSkeleton className="w-full" />}>
                    <LazyProgressSection className="w-full" />
                </Suspense>

                {/* Daily Tracking Grid: Питание | Шаги | Тренировки */}
                <DailyTrackingGrid
                    date={selectedDate}
                    className="w-full"
                />

                {/* Weight Section: ввод веса + тренд + цель — единый блок */}
                <WeightSection
                    date={selectedDate}
                    className="w-full"
                />

                {/* KBJU Weekly Chart */}
                <ErrorBoundary variant="inline" label="dashboard-kbju-chart">
                    <KBJUWeeklyChart data={kbjuHistory} className="w-full" />
                </ErrorBoundary>

                {/* Curator-assigned tasks (renders nothing when empty) */}
                <ErrorBoundary variant="inline" label="dashboard-tasks">
                    <ClientTasksSection className="w-full" highlightTaskId={highlightTaskId} />
                </ErrorBoundary>

                {/* Below-the-fold sections */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 md:gap-6">
                    {/* Photo Upload Section */}
                    <div>
                        <Suspense fallback={<PhotoUploadSectionSkeleton className="w-full h-full" />}>
                            <LazyPhotoUploadSection
                                weekStart={selectedWeek.start}
                                weekEnd={selectedWeek.end}
                                className="w-full h-full"
                            />
                        </Suspense>
                    </div>

                    {/* Weekly Plan Section */}
                    <div>
                        <Suspense fallback={<WeeklyPlanSectionSkeleton className="w-full h-full" />}>
                            <LazyWeeklyPlanSection className="w-full h-full" />
                        </Suspense>
                    </div>
                </div>

                {/* Curator feedback on weekly reports */}
                <ErrorBoundary variant="inline" label="dashboard-curator-feedback">
                    <CuratorFeedbackSection className="w-full" />
                </ErrorBoundary>
            </div>
        </DashboardLayout>
    )
}
