'use client'

import { UserList } from '@/features/admin/components/UserList'

export default function AdminUsersPage() {
    return (
        <div className="px-4 py-6">
            <h1 className="text-xl font-semibold text-gray-900 mb-4">Пользователи</h1>
            <UserList />
        </div>
    )
}
