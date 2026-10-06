'use client'

import { Suspense } from 'react'
import { SupportQueue } from '@/features/curator/components/SupportQueue'

import { t } from '@/shared/i18n'
export default function CuratorSupportPage() {
    return (
        <div className="mx-auto w-full max-w-5xl px-screen-x py-5">
            <h1 className="type-title-1 mb-5 text-fg">{t('curator.support.heading')}</h1>
            {/* SupportQueue reads ?conversation= via useSearchParams, which
                Next.js requires a Suspense boundary for — same pattern as
                /onboarding around GuestOnboarding. */}
            <Suspense fallback={null}>
                <SupportQueue />
            </Suspense>
        </div>
    )
}
