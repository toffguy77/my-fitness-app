'use client'

import { ArticleEditor } from '@/features/content/components/ArticleEditor'

import { t } from '@/shared/i18n'
export default function AdminNewArticlePage() {
    return (
        <div className="px-4 py-6 pb-20">
            <h1 className="text-xl font-semibold text-gray-900 mb-4">
                {t('admin.navigation.newArticle')}
            </h1>
            <ArticleEditor returnPath="/admin/content" />
        </div>
    )
}
