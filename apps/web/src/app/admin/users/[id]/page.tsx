'use client'

import { useParams } from 'next/navigation'
import { UserDetail } from '@/features/admin/components/UserDetail'

export default function AdminUserDetailPage() {
    const params = useParams()
    const userId = Number(params.id)

    return (
        <div className="mx-auto w-full max-w-3xl px-screen-x py-5">
            <UserDetail userId={userId} />
        </div>
    )
}
