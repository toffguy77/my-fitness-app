'use client'

import { ArticleEditor } from '@/features/content/components/ArticleEditor'

import { t } from '@/shared/i18n'
export default function NewArticlePage() {
    return (
        <div className="mx-auto w-full max-w-3xl px-screen-x py-5">
            <h1 className="type-title-1 mb-5 text-fg">
                {t('curator.navigation.newArticle')}
            </h1>
            <ArticleEditor />
        </div>
    )
}
