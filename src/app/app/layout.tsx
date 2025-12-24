'use client'

import SubscriptionBanner from '@/components/SubscriptionBanner'
import GlobalChatWidget from '@/components/chat/GlobalChatWidget'

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
            <GlobalChatWidget />
        </>
    )
}


