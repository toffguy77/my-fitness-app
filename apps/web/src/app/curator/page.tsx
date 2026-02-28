'use client'

import { ClientList } from '@/features/curator/components/ClientList'

export default function CuratorDashboardPage() {
    return (
        <div className="px-4 py-6">
            <h1 className="text-xl font-semibold text-gray-900 mb-4">Мои клиенты</h1>
            <ClientList />
        </div>
    )
}
