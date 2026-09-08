'use client'

import { LeadList } from '@/features/admin/components/LeadList'

import { t } from '@/shared/i18n'
export default function AdminLeadsPage() {
    return (
        <div className="px-4 py-6">
            <h1 className="text-xl font-semibold text-gray-900 mb-4">{t('admin.leads.heading')}</h1>
            <LeadList />
        </div>
    )
}
