'use client'

import { ArticleList } from '@/features/content/components/ArticleList'

import { t } from '@/shared/i18n'
export default function AdminContentPage() {
    return (
        <div className="mx-auto w-full max-w-5xl px-screen-x py-5">
            <div className="mb-5 flex items-center justify-between">
                <h1 className="type-title-1 text-fg">{t('admin.dashboard.contentHeading')}</h1>
            </div>
            <ArticleList basePath="/admin/content" />
        </div>
    )
}
