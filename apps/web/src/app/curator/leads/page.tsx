'use client'

import { LeadList } from '@/features/curator/components/LeadList'

import { t } from '@/shared/i18n'
export default function CuratorLeadsPage() {
    return (
        <div className="mx-auto w-full max-w-5xl px-screen-x py-5">
            <h1 className="type-title-1 mb-5 text-fg">{t('curator.leads.heading')}</h1>
            <LeadList />
        </div>
    )
}
