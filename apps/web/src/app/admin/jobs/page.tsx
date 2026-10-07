'use client'

import { JobList } from '@/features/admin/components/JobList'
import { t } from '@/shared/i18n'

export default function AdminJobsPage() {
    return (
        <div className="mx-auto w-full max-w-5xl px-screen-x py-5">
            <h1 className="type-title-1 mb-5 text-fg">{t('admin.jobs.heading')}</h1>
            <JobList />
        </div>
    )
}
