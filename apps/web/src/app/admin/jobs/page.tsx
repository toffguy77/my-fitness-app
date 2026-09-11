'use client'

import { JobList } from '@/features/admin/components/JobList'
import { t } from '@/shared/i18n'

export default function AdminJobsPage() {
    return (
        <div className="px-4 py-6">
            <h1 className="mb-4 text-xl font-semibold text-gray-900">{t('admin.jobs.heading')}</h1>
            <JobList />
        </div>
    )
}
