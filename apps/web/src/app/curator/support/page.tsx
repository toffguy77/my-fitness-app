'use client'

import { SupportQueue } from '@/features/curator/components/SupportQueue'

import { t } from '@/shared/i18n'
export default function CuratorSupportPage() {
    return (
        <div className="px-4 py-6 pb-20">
            <h1 className="text-xl font-semibold text-gray-900 mb-4">{t('curator.support.heading')}</h1>
            <SupportQueue />
        </div>
    )
}
