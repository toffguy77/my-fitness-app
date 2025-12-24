'use client'

import { useEffect, useState } from 'react'
import { useAnalytics } from '@/hooks/useAnalytics'
import SubscriptionBanner from '@/components/SubscriptionBanner'
import GlobalChatWidget from '@/components/chat/GlobalChatWidget'
import { createClient } from '@/utils/supabase/client'

export const dynamic = 'force-dynamic'

export default function AppLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const [userId, setUserId] = useState<string | undefined>(undefined)
    
    // Инициализация аналитики
    useEffect(() => {
        const initAnalytics = async () => {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            setUserId(user?.id)
        }
        initAnalytics()
    }, [])
    
    // Используем хук аналитики
    useAnalytics(userId)

    return (
        <>
            <SubscriptionBanner />
            {children}
            <GlobalChatWidget />
        </>
    )
}


