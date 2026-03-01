'use client'

import { AdminConversationList } from '@/features/admin/components/AdminConversationList'

export default function AdminChatsPage() {
    return (
        <div className="px-4 py-6">
            <h1 className="text-xl font-semibold text-gray-900 mb-4">Все чаты</h1>
            <AdminConversationList />
        </div>
    )
}
