'use client'

import { use } from 'react'
import { ArticleEditor } from '@/features/content/components/ArticleEditor'

import { t } from '@/shared/i18n'
export default function AdminEditArticlePage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = use(params)

    return (
        <div className="mx-auto w-full max-w-3xl px-screen-x py-5">
            <h1 className="type-title-1 mb-5 text-fg">
                {t('admin.navigation.editArticle')}
            </h1>
            <ArticleEditor articleId={id} returnPath="/admin/content" />
        </div>
    )
}
