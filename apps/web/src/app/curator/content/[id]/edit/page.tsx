'use client'

import { use } from 'react'
import { ArticleEditor } from '@/features/content/components/ArticleEditor'
import { articleReturnPath } from '@/features/content/utils/articlePath'

import { t } from '@/shared/i18n'
export default function EditArticlePage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>
    searchParams: Promise<{ from?: string }>
}) {
    const { id } = use(params)
    // Opened from the article's page: return there after saving.
    const from = articleReturnPath(use(searchParams).from)

    return (
        <div className="mx-auto w-full max-w-3xl px-screen-x py-5">
            <h1 className="type-title-1 mb-5 text-fg">
                {t('curator.navigation.editArticle')}
            </h1>
            <ArticleEditor articleId={id} returnPath={from ?? undefined} />
        </div>
    )
}
