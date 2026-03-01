'use client'

import { useParams } from 'next/navigation'
import { UserDetail } from '@/features/admin/components/UserDetail'

export default function AdminUserDetailPage() {
    const params = useParams()
    const userId = Number(params.id)

    return (
        <div className="px-4 py-6">
            <UserDetail userId={userId} />
        </div>
    )
}
