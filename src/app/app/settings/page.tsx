// Страница настроек профиля
'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { LogOut, Settings, User as UserIcon, Shield, Mail, Phone, Lock, ArrowLeft, Target, Calculator } from 'lucide-react'
import { getUserProfile, hasActiveSubscription, type UserProfile } from '@/utils/supabase/profile'
import NotificationSettings from '@/components/NotificationSettings'
import UserProductsManager from '@/components/products/UserProductsManager'
import { checkSubscriptionStatus } from '@/utils/supabase/subscription'
import { logger } from '@/utils/logger'
import toast from 'react-hot-toast'
import SkeletonLoader from '@/components/SkeletonLoader'

function SettingsPageContent() {
    const supabase = createClient()
    const router = useRouter()
    const searchParams = useSearchParams()
    const subscriptionSectionRef = useRef<HTMLDivElement>(null)
    const [user, setUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<UserProfile | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)

    // Форма редактирования профиля
    const [fullName, setFullName] = useState('')
    const [phone, setPhone] = useState('')
    const [profileVisibility, setProfileVisibility] = useState<'private' | 'public'>('private')

    // Форма смены пароля
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [changingPassword, setChangingPassword] = useState(false)
    const [passwordError, setPasswordError] = useState<string | null>(null)
    const [passwordMessage, setPasswordMessage] = useState<string | null>(null)

    // Данные куратора (для Premium)
    const [curator, setCurator] = useState<UserProfile | null>(null)

    // Статус подписки
    const [subscriptionInfo, setSubscriptionInfo] = useState<{ status: string; isExpired: boolean; endDate: string | null } | null>(null)

    // Цели питания
    const [targets, setTargets] = useState<{ rest: { calories: number; protein: number; fats: number; carbs: number } | null; training: { calories: number; protein: number; fats: number; carbs: number } | null }>({ rest: null, training: null })
    const [recalculating, setRecalculating] = useState(false)

    // Автоматический скролл к секции подписки при переходе с tab=subscription
    useEffect(() => {
        const tab = searchParams.get('tab')
        if (tab === 'subscription' && subscriptionSectionRef.current && !loading) {
            setTimeout(() => {
                subscriptionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }, 100)
        }
    }, [searchParams, loading])

    useEffect(() => {
        const fetchData = async () => {
            logger.debug('Settings: начало загрузки данных')
            try {
                const { data: { user }, error: userError } = await supabase.auth.getUser()
                if (userError || !user) {
                    logger.warn('Settings: пользователь не авторизован', { error: userError?.message })
                    router.push('/login')
                    return
                }
                logger.debug('Settings: пользователь авторизован', { userId: user.id })
                setUser(user)

                // Загружаем профиль
                const userProfile = await getUserProfile(user)
                if (!userProfile) {
                    logger.error('Settings: не удалось загрузить профиль', null, { userId: user.id })
                    setError('Не удалось загрузить профиль')
                    setLoading(false)
                    return
                }

                setProfile(userProfile)
                setFullName(userProfile.full_name || '')
                setPhone((userProfile as { phone?: string })?.phone || '')
                setProfileVisibility(userProfile.profile_visibility || 'private')
                logger.debug('Settings: профиль загружен', { userId: user.id, role: userProfile.role })

                // Если Premium и есть куратор, загружаем данные куратора
                if (hasActiveSubscription(userProfile) && userProfile.curator_id) {
                    const { data: curatorData, error: curatorError } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', userProfile.curator_id)
                        .single()

                    if (!curatorError && curatorData) {
                        setCurator(curatorData as UserProfile)
                        logger.debug('Settings: данные куратора загружены', { curatorId: userProfile.curator_id })
                    }
                }

                // Проверяем статус подписки
                const subInfo = await checkSubscriptionStatus(user.id)
                setSubscriptionInfo({
                    status: subInfo.status,
                    isExpired: subInfo.isExpired,
                    endDate: subInfo.endDate
                })

                // Загружаем текущие цели питания
                const [restResult, trainingResult] = await Promise.all([
                    supabase
                        .from('nutrition_targets')
                        .select('calories, protein, fats, carbs')
                        .eq('user_id', user.id)
                        .eq('is_active', true)
                        .eq('day_type', 'rest')
                        .single(),
                    supabase
                        .from('nutrition_targets')
                        .select('calories, protein, fats, carbs')
                        .eq('user_id', user.id)
                        .eq('is_active', true)
                        .eq('day_type', 'training')
                        .single()
                ])

                if (restResult.data) {
                    setTargets(prev => ({ ...prev, rest: restResult.data }))
                }
                if (trainingResult.data) {
                    setTargets(prev => ({ ...prev, training: trainingResult.data }))
                }
            } catch (err) {
                logger.error('Settings: ошибка загрузки данных', err, {})
                setError('Ошибка загрузки данных')
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [router, supabase])

    const handleSaveProfile = async () => {
        if (!user || !profile) return

        setSaving(true)
        setError(null)
        setMessage(null)

        logger.info('Settings: сохранение профиля', { userId: user.id })
        logger.userAction('Settings: обновление профиля', {
            userId: user.id,
            hasFullName: !!fullName,
            hasPhone: !!phone,
            profileVisibility
        })

        try {
            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    full_name: fullName || null,
                    phone: phone || null,
                    profile_visibility: profileVisibility,
                })
                .eq('id', user.id)

            if (updateError) {
                logger.error('Settings: ошибка сохранения профиля', updateError, { userId: user.id })
                logger.userAction('Settings: ошибка обновления профиля', {
                    userId: user.id,
                    error: updateError.message
                })
                setError('Ошибка сохранения: ' + updateError.message)
            } else {
                logger.info('Settings: профиль успешно сохранен', { userId: user.id })
                logger.userAction('Settings: профиль успешно обновлен', {
                    userId: user.id,
                    hasFullName: !!fullName,
                    hasPhone: !!phone
                })
                setMessage('Профиль успешно обновлен')
                // Обновляем локальный профиль
                setProfile({
                    ...profile,
                    full_name: fullName || null,
                    phone: phone || null,
                    profile_visibility: profileVisibility as any
                })
                setTimeout(() => setMessage(null), 3000)
            }
        } catch (err) {
            logger.error('Settings: исключение при сохранении профиля', err, { userId: user.id })
            setError('Произошла ошибка')
        } finally {
            setSaving(false)
        }
    }

    const handleChangePassword = async () => {
        if (!user) return

        setPasswordError(null)
        setPasswordMessage(null)

        // Валидация
        if (!currentPassword || !newPassword || !confirmPassword) {
            setPasswordError('Заполните все поля')
            return
        }

        if (newPassword.length < 6) {
            setPasswordError('Новый пароль должен быть не менее 6 символов')
            return
        }

        if (newPassword !== confirmPassword) {
            setPasswordError('Пароли не совпадают')
            return
        }

        setChangingPassword(true)
        logger.info('Settings: смена пароля', { userId: user.id })
        logger.userAction('Settings: попытка смены пароля', { userId: user.id })

        try {
            // В Supabase нет прямого API для проверки текущего пароля
            // Поэтому сначала пытаемся обновить пароль
            // Если текущий пароль неверный, Supabase вернет ошибку
            const { error: updateError } = await supabase.auth.updateUser({
                password: newPassword
            })

            if (updateError) {
                logger.error('Settings: ошибка смены пароля', updateError, { userId: user.id })
                logger.userAction('Settings: ошибка смены пароля', {
                    userId: user.id,
                    error: updateError.message
                })
                setPasswordError('Ошибка смены пароля: ' + updateError.message)
            } else {
                logger.info('Settings: пароль успешно изменен', { userId: user.id })
                logger.userAction('Settings: пароль успешно изменен', { userId: user.id })
                setPasswordMessage('Пароль успешно изменен')
                setCurrentPassword('')
                setNewPassword('')
                setConfirmPassword('')
                setTimeout(() => setPasswordMessage(null), 3000)
            }
        } catch (err) {
            logger.error('Settings: исключение при смене пароля', err, { userId: user.id })
            setPasswordError('Произошла ошибка')
        } finally {
            setChangingPassword(false)
        }
    }

    const handleLogout = async () => {
        logger.info('Settings: выход из системы')
        logger.userAction('Settings: выход из системы', { userId: user?.id })
        const { error } = await supabase.auth.signOut()
        if (error) {
            logger.error('Settings: ошибка выхода', error, { userId: user?.id })
            logger.userAction('Settings: ошибка выхода из системы', {
                userId: user?.id,
                error: error.message
            })
        } else {
            logger.info('Settings: успешный выход', { userId: user?.id })
            logger.authentication('Settings: пользователь вышел из системы', { userId: user?.id })
        }
        router.push('/login')
        router.refresh()
    }

    if (loading) {
        return (
            <main className="w-full min-h-screen bg-zinc-950 p-4 sm:p-6 lg:max-w-4xl lg:mx-auto font-sans">
                <div className="space-y-6">
                    <SkeletonLoader variant="card" count={3} />
                </div>
            </main>
        )
    }

    if (!user || !profile) {
        return null
    }

    const isPremium = hasActiveSubscription(profile) && !subscriptionInfo?.isExpired

    return (
        <main className="w-full min-h-screen bg-zinc-950 p-4 sm:p-6 lg:max-w-4xl lg:mx-auto font-sans">
            {/* HEADER */}
            <header className="mb-6">
                <h1 className="text-2xl font-bold text-zinc-100">Настройки</h1>
                <p className="text-sm text-zinc-400">Управление профилем</p>
            </header>

            {/* PROFILE SECTION */}
            <section className="bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-800 mb-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="h-12 w-12 bg-zinc-800 rounded-full flex items-center justify-center">
                        <UserIcon size={24} className="text-zinc-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-zinc-100">Профиль</h2>
                        <p className="text-sm text-zinc-400">{profile.email}</p>
                    </div>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-rose-950/20 border border-rose-800/50 rounded-lg text-sm text-rose-300">
                        {error}
                    </div>
                )}

                {message && (
                    <div className="mb-4 p-3 bg-emerald-950/20 border border-emerald-800/50 rounded-lg text-sm text-emerald-300">
                        {message}
                    </div>
                )}

                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-medium text-zinc-300 mb-1 block">Имя</label>
                        <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="w-full p-3 bg-zinc-800 rounded-xl border border-zinc-700 text-zinc-100 focus:ring-2 focus:ring-white outline-none placeholder:text-zinc-500"
                            placeholder="Ваше имя"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium text-zinc-300 mb-1 block">Телефон</label>
                        <input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="w-full p-3 bg-zinc-800 rounded-xl border border-zinc-700 text-zinc-100 focus:ring-2 focus:ring-white outline-none placeholder:text-zinc-500"
                            placeholder="+7 (999) 123-45-67"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium text-zinc-300 mb-2 block">Приватность профиля</label>
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-zinc-800">
                                <input
                                    type="radio"
                                    name="profileVisibility"
                                    value="private"
                                    checked={profileVisibility === 'private'}
                                    onChange={(e) => setProfileVisibility(e.target.value as 'private' | 'public')}
                                    className="w-4 h-4 text-white focus:ring-2 focus:ring-white bg-zinc-800 border-zinc-700"
                                />
                                <div>
                                    <span className="text-sm font-medium text-zinc-100">Приватный</span>
                                    <p className="text-xs text-zinc-400">Только вы и ваш куратор могут видеть ваш профиль</p>
                                </div>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-zinc-800">
                                <input
                                    type="radio"
                                    name="profileVisibility"
                                    value="public"
                                    checked={profileVisibility === 'public'}
                                    onChange={(e) => setProfileVisibility(e.target.value as 'private' | 'public')}
                                    className="w-4 h-4 text-white focus:ring-2 focus:ring-white bg-zinc-800 border-zinc-700"
                                />
                                <div>
                                    <span className="text-sm font-medium text-zinc-100">Публичный</span>
                                    <p className="text-xs text-zinc-400">Ваши достижения видны всем по ссылке</p>
                                    {profileVisibility === 'public' && user && (
                                        <p className="text-xs text-zinc-500 mt-1 font-mono break-all">
                                            {typeof window !== 'undefined' ? `${window.location.origin}/profile/${user.id}` : '/profile/[userId]'}
                                        </p>
                                    )}
                                </div>
                            </label>
                        </div>
                    </div>

                    <button
                        onClick={handleSaveProfile}
                        disabled={saving}
                        className="w-full py-3 bg-white text-zinc-950 rounded-xl font-medium hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? 'Сохранение...' : 'Сохранить изменения'}
                    </button>
                </div>
            </section>

            {/* SUBSCRIPTION SECTION (только для клиентов) */}
            {profile?.role === 'client' && (
                <section ref={subscriptionSectionRef} className="bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 rounded-2xl shadow-lg border-2 border-zinc-800 mb-6 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none"></div>
                    <div className="relative">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="h-10 w-10 bg-white/10 rounded-lg flex items-center justify-center backdrop-blur-sm">
                                <Shield size={20} className="text-white" />
                            </div>
                            <h2 className="text-lg font-bold text-zinc-100">Подписка</h2>
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-zinc-400">Тариф:</span>
                                <span className={`text-sm font-semibold ${isPremium ? 'text-emerald-300' : 'text-zinc-400'}`}>
                                    {isPremium ? 'Premium' : 'Free'}
                                </span>
                            </div>

                            {profile.subscription_start_date && (
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-zinc-400">Начало подписки:</span>
                                    <span className="text-sm text-zinc-100">
                                        {new Date(profile.subscription_start_date).toLocaleDateString('ru-RU')}
                                    </span>
                                </div>
                            )}

                            {profile.subscription_end_date && (
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-zinc-400">Окончание подписки:</span>
                                    <span className={`text-sm font-semibold tabular-nums ${subscriptionInfo?.isExpired ? 'text-rose-300' : 'text-zinc-100'
                                        }`}>
                                        {new Date(profile.subscription_end_date).toLocaleDateString('ru-RU')}
                                        {subscriptionInfo?.isExpired && ' (Истекла)'}
                                    </span>
                                </div>
                            )}

                            {subscriptionInfo?.isExpired && (
                                <div className="mt-4 p-3 bg-rose-950/20 border border-rose-800/50 rounded-lg text-sm text-rose-300">
                                    Подписка истекла. Доступ к Premium функциям ограничен.
                                </div>
                            )}

                            {!isPremium && !subscriptionInfo?.isExpired && (
                                <div className="mt-4 p-3 bg-amber-950/20 border border-amber-800/50 rounded-lg text-sm text-amber-300">
                                    Для активации Premium подписки обратитесь к администратору или вашему куратору.
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            )}

            {/* CURATOR SECTION (Premium only) */}
            {isPremium && curator && (
                <section className="bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-800 mb-6">
                    <div className="flex items-center gap-3 mb-4">
                        <UserIcon size={20} className="text-zinc-400" />
                        <h2 className="text-lg font-bold text-zinc-100">Мой куратор</h2>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <span className="text-sm text-zinc-400">Имя:</span>
                            <p className="text-sm font-medium text-zinc-100">{curator.full_name || 'Не указано'}</p>
                        </div>
                        <div>
                            <span className="text-sm text-zinc-400">Email:</span>
                            <p className="text-sm font-medium text-zinc-100">{curator.email || 'Не указано'}</p>
                        </div>
                        <button
                            onClick={() => {
                                window.location.href = `mailto:${curator.email}`
                            }}
                            className="w-full mt-4 py-2 bg-zinc-800 text-zinc-300 rounded-xl font-medium hover:bg-zinc-700 transition-colors"
                        >
                            Написать куратору
                        </button>
                    </div>
                </section>
            )}

            {/* PASSWORD SECTION */}
            <section className="bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-800 mb-6">
                <div className="flex items-center gap-3 mb-4">
                    <Lock size={20} className="text-zinc-400" />
                    <h2 className="text-lg font-bold text-zinc-100">Безопасность</h2>
                </div>

                {passwordError && (
                    <div className="mb-4 p-3 bg-rose-950/20 border border-rose-800/50 rounded-lg text-sm text-rose-300">
                        {passwordError}
                    </div>
                )}

                {passwordMessage && (
                    <div className="mb-4 p-3 bg-emerald-950/20 border border-emerald-800/50 rounded-lg text-sm text-emerald-300">
                        {passwordMessage}
                    </div>
                )}

                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-medium text-zinc-300 mb-1 block">Текущий пароль</label>
                        <input
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            className="w-full p-3 bg-zinc-800 rounded-xl border border-zinc-700 text-zinc-100 focus:ring-2 focus:ring-white outline-none placeholder:text-zinc-500"
                            placeholder="Введите текущий пароль"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium text-zinc-300 mb-1 block">Новый пароль</label>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full p-3 bg-zinc-800 rounded-xl border border-zinc-700 text-zinc-100 focus:ring-2 focus:ring-white outline-none placeholder:text-zinc-500"
                            placeholder="Минимум 6 символов"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium text-zinc-300 mb-1 block">Подтвердите новый пароль</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full p-3 bg-zinc-800 rounded-xl border border-zinc-700 text-zinc-100 focus:ring-2 focus:ring-white outline-none placeholder:text-zinc-500"
                            placeholder="Повторите новый пароль"
                        />
                    </div>

                    <button
                        onClick={handleChangePassword}
                        disabled={changingPassword}
                        className="w-full py-3 bg-white text-zinc-950 rounded-xl font-medium hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {changingPassword ? 'Изменение...' : 'Изменить пароль'}
                    </button>
                </div>
            </section>

            {/* NUTRITION TARGETS SECTION */}
            <section className="bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-800 mb-6">
                <div className="flex items-center gap-3 mb-4">
                    <Target size={20} className="text-zinc-400" />
                    <h2 className="text-lg font-bold text-zinc-100">Мои цели</h2>
                </div>

                {targets.rest && targets.training ? (
                    <div className="space-y-4">
                        <div className="p-4 bg-zinc-800 rounded-xl border border-zinc-700">
                            <div className="text-sm font-semibold text-zinc-100 mb-2">День отдыха</div>
                            <div className="grid grid-cols-2 gap-2 text-sm text-zinc-100 tabular-nums">
                                <div><span className="text-zinc-400">Калории:</span> <span className="font-bold text-zinc-100">{targets.rest.calories}</span></div>
                                <div><span className="text-zinc-400">Белки:</span> <span className="font-bold text-zinc-100">{targets.rest.protein}г</span></div>
                                <div><span className="text-zinc-400">Жиры:</span> <span className="font-bold text-zinc-100">{targets.rest.fats}г</span></div>
                                <div><span className="text-zinc-400">Углеводы:</span> <span className="font-bold text-zinc-100">{targets.rest.carbs}г</span></div>
                            </div>
                        </div>
                        <div className="p-4 bg-zinc-800 rounded-xl border border-zinc-700">
                            <div className="text-sm font-semibold text-zinc-100 mb-2">Тренировочный день</div>
                            <div className="grid grid-cols-2 gap-2 text-sm text-zinc-100 tabular-nums">
                                <div><span className="text-zinc-400">Калории:</span> <span className="font-bold text-zinc-100">{targets.training.calories}</span></div>
                                <div><span className="text-zinc-400">Белки:</span> <span className="font-bold text-zinc-100">{targets.training.protein}г</span></div>
                                <div><span className="text-zinc-400">Жиры:</span> <span className="font-bold text-zinc-100">{targets.training.fats}г</span></div>
                                <div><span className="text-zinc-400">Углеводы:</span> <span className="font-bold text-zinc-100">{targets.training.carbs}г</span></div>
                            </div>
                        </div>
                        <button
                            onClick={async () => {
                                if (!user || !profile) return

                                // Проверяем наличие биометрических данных
                                if (!profile.height || !profile.birth_date || !profile.gender || !profile.activity_level) {
                                    toast.error('Для пересчета целей необходимо заполнить биометрические данные. Пройдите onboarding.')
                                    router.push('/onboarding')
                                    return
                                }

                                setRecalculating(true)
                                try {
                                    // Получаем последний вес из daily_logs
                                    const { data: lastLog } = await supabase
                                        .from('daily_logs')
                                        .select('weight')
                                        .eq('user_id', user.id)
                                        .not('weight', 'is', null)
                                        .order('date', { ascending: false })
                                        .limit(1)
                                        .single()

                                    if (!lastLog?.weight) {
                                        toast.error('Не найден вес в дневнике. Введите вес перед пересчетом.')
                                        setRecalculating(false)
                                        return
                                    }

                                    const weight = lastLog.weight

                                    // Рассчитываем возраст
                                    const birth = new Date(profile.birth_date)
                                    const today = new Date()
                                    const age = today.getFullYear() - birth.getFullYear() -
                                        (today.getMonth() < birth.getMonth() ||
                                            (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate()) ? 1 : 0)

                                    // Функции расчета (из onboarding)
                                    const calculateBMR = (gender: string, weight: number, height: number, age: number): number => {
                                        if (gender === 'male') {
                                            return 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age)
                                        } else {
                                            return 447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age)
                                        }
                                    }

                                    const calculateTDEE = (bmr: number, activityLevel: string): number => {
                                        const multipliers: Record<string, number> = {
                                            sedentary: 1.2,
                                            light: 1.375,
                                            moderate: 1.55,
                                            active: 1.725,
                                            very_active: 1.9
                                        }
                                        return bmr * (multipliers[activityLevel] || 1.55)
                                    }

                                    const calculateMacros = (calories: number) => {
                                        const protein = Math.round((calories * 0.30) / 4)
                                        const fats = Math.round((calories * 0.25) / 9)
                                        const carbs = Math.round((calories * 0.45) / 4)
                                        return { protein, fats, carbs }
                                    }

                                    // Получаем цель из текущих целей (предполагаем maintain, если нет)
                                    const bmr = calculateBMR(profile.gender, weight, profile.height, age)
                                    const tdee = calculateTDEE(bmr, profile.activity_level || 'moderate')

                                    // Используем текущие калории для определения цели
                                    const currentCalories = targets.rest?.calories || tdee
                                    const goalMultiplier = currentCalories / tdee
                                    const targetCalories = Math.round(tdee * goalMultiplier)
                                    const macros = calculateMacros(targetCalories)

                                    // Обновляем цели для rest
                                    const { error: restError } = await supabase
                                        .from('nutrition_targets')
                                        .update({
                                            calories: targetCalories,
                                            protein: macros.protein,
                                            fats: macros.fats,
                                            carbs: macros.carbs
                                        })
                                        .eq('user_id', user.id)
                                        .eq('is_active', true)
                                        .eq('day_type', 'rest')

                                    if (restError) throw restError

                                    // Обновляем цели для training (+200 ккал)
                                    const trainingCalories = targetCalories + 200
                                    const trainingMacros = calculateMacros(trainingCalories)

                                    const { error: trainingError } = await supabase
                                        .from('nutrition_targets')
                                        .update({
                                            calories: trainingCalories,
                                            protein: trainingMacros.protein,
                                            fats: trainingMacros.fats,
                                            carbs: trainingMacros.carbs
                                        })
                                        .eq('user_id', user.id)
                                        .eq('is_active', true)
                                        .eq('day_type', 'training')

                                    if (trainingError) throw trainingError

                                    // Обновляем локальное состояние
                                    setTargets({
                                        rest: { calories: targetCalories, protein: macros.protein, fats: macros.fats, carbs: macros.carbs },
                                        training: { calories: trainingCalories, protein: trainingMacros.protein, fats: trainingMacros.fats, carbs: trainingMacros.carbs }
                                    })

                                    setMessage('Цели успешно пересчитаны!')
                                    setTimeout(() => setMessage(null), 3000)
                                    logger.info('Settings: цели пересчитаны', { userId: user.id, weight, targetCalories })
                                } catch (error) {
                                    logger.error('Settings: ошибка пересчета целей', error, { userId: user.id })
                                    setError('Ошибка пересчета целей. Попробуйте еще раз.')
                                } finally {
                                    setRecalculating(false)
                                }
                            }}
                            disabled={recalculating || !targets.rest || !targets.training}
                            className="w-full py-3 bg-white text-zinc-950 rounded-xl font-medium hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <Calculator size={16} />
                            {recalculating ? 'Пересчет...' : 'Пересчитать по текущему весу'}
                        </button>
                    </div>
                ) : (
                    <div className="text-center py-4 text-zinc-500 text-sm">
                        Цели не найдены. Пройдите onboarding для их создания.
                    </div>
                )}
            </section>

            {/* USER PRODUCTS SECTION */}
            <section className="bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-800 mb-6">
                <div className="flex items-center gap-3 mb-4">
                    <Target size={20} className="text-zinc-400" />
                    <h2 className="text-lg font-bold text-zinc-100">Мои продукты</h2>
                </div>
                <p className="text-sm text-zinc-400 mb-4">
                    Управляйте своими пользовательскими продуктами. Они будут доступны в поиске при вводе питания.
                </p>
                {user && <UserProductsManager userId={user.id} />}
            </section>

            {/* LOGOUT SECTION */}
            <section className="bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-800">
                <button
                    onClick={handleLogout}
                    className="w-full py-3 bg-rose-950/20 text-rose-400 rounded-xl font-medium hover:bg-rose-950/30 transition-colors flex items-center justify-center gap-2 border border-rose-800/50"
                >
                    <LogOut size={16} />
                    Выйти из системы
                </button>
            </section>
        </main>
    )
}

export default function SettingsPage() {
    return (
        <Suspense fallback={
            <main className="w-full min-h-screen bg-zinc-950 p-4 sm:p-6 lg:max-w-4xl lg:mx-auto font-sans">
                <div className="space-y-6 p-4 sm:p-6">
                    <SkeletonLoader variant="card" count={3} />
                </div>
            </main>
        }>
            <SettingsPageContent />
        </Suspense>
    )
}
