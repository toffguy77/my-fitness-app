'use client'

/**
 * Оболочка экрана по роли из сессии.
 *
 * Роль спрашивается у сервера. Слепок в localStorage — кэш первой отрисовки, а не
 * источник истины: сессия, поднятая из cookie в браузере с очищенным хранилищем,
 * кэша не имеет вовсе. Экраны, читавшие роль оттуда, показывали куратору и
 * администратору клиентскую навигацию — `/curator` и `/admin` от этого уже
 * вылечены, `/profile` и `/settings/*` нет.
 *
 * Пока роль неизвестна, не показывается ничего. Клиентская оболочка как значение
 * по умолчанию — это и есть то, что в обращении названо «роль меняется на
 * пользователя»: мигание из кураторской навигации в клиентскую и обратно хуже
 * мгновения пустоты.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { AdminLayout } from '@/features/admin'
import { CuratorLayout } from '@/features/curator'
import { DashboardLayout } from '@/features/dashboard/components/DashboardLayout'
import { useCurrentUser } from '@/shared/hooks/useCurrentUser'
import type { NavigationItemId } from '@/features/dashboard/types'

interface RoleShellProps {
    children: React.ReactNode
    /**
     * Имя для заголовка, если вызывающий экран уже знает его точнее — например
     * из профиля, который он и так грузит. Пусто или не задано — берётся из
     * сессии, того же ответа, что и роль.
     */
    userName?: string
    /** Аватар, если вызывающий экран знает его свежее сессии. */
    avatarUrl?: string
    /**
     * Подсвеченный пункт клиентской навигации. Кураторской и административной
     * оболочке не передаётся: у них свои разделы, и пункт клиента в них не
     * существует.
     */
    activeNavItem?: NavigationItemId
}

export function RoleShell({ children, userName, avatarUrl, activeNavItem }: RoleShellProps) {
    const router = useRouter()
    const { user, state } = useCurrentUser()

    useEffect(() => {
        // Одна неудачная сеть не повод выкидывать человека из интерфейса:
        // `anonymous` приходит, когда сессия действительно закончилась — это
        // решает api-клиент, снимая токен.
        if (state === 'anonymous') router.push('/auth')
    }, [state, router])

    if (state !== 'ready' || !user) return null

    const name = userName || user.full_name || user.name || user.email
    const avatar = avatarUrl || user.avatar_url || undefined

    if (user.role === 'coordinator') {
        return (
            <CuratorLayout userName={name} avatarUrl={avatar}>
                {children}
            </CuratorLayout>
        )
    }

    if (user.role === 'super_admin') {
        return (
            <AdminLayout userName={name} avatarUrl={avatar}>
                {children}
            </AdminLayout>
        )
    }

    return (
        <DashboardLayout userName={name} avatarUrl={avatar} activeNavItem={activeNavItem}>
            {children}
        </DashboardLayout>
    )
}

RoleShell.displayName = 'RoleShell'
