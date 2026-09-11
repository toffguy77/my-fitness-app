'use client'

import { SupportQueue } from '@/features/admin/components/SupportQueue'

import { t } from '@/shared/i18n'
export default function AdminSupportPage() {
    return (
        <div className="px-4 py-6">
            <h1 className="text-xl font-semibold text-gray-900 mb-4">{t('admin.support.heading')}</h1>
            <SupportQueue />
        </div>
    )
}
