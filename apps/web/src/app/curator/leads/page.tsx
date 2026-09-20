'use client'

import { LeadList } from '@/features/curator/components/LeadList'

import { t } from '@/shared/i18n'
export default function CuratorLeadsPage() {
    return (
        <div className="px-4 py-6 pb-20">
            <h1 className="text-xl font-semibold text-gray-900 mb-4">{t('curator.leads.heading')}</h1>
            <LeadList />
        </div>
    )
}
