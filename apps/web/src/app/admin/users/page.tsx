'use client'

import { UserList } from '@/features/admin/components/UserList'

import { t } from '@/shared/i18n'
export default function AdminUsersPage() {
    return (
        <div className="mx-auto w-full max-w-5xl px-screen-x py-5">
            <h1 className="type-title-1 mb-5 text-fg">{t('admin.users.heading')}</h1>
            <UserList />
        </div>
    )
}
