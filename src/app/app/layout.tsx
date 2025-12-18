'use client'

import SubscriptionBanner from '@/components/SubscriptionBanner'

export const dynamic = 'force-dynamic'

export default function AppLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <>
            <SubscriptionBanner />
            {children}
        </>
    )
}


