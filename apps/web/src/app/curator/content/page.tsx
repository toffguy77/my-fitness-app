'use client'

import { ArticleList } from '@/features/content/components/ArticleList'

import { t } from '@/shared/i18n'
export default function CuratorContentPage() {
    return (
        <div className="mx-auto w-full max-w-5xl px-screen-x py-5">
            <div className="mb-5 flex items-center justify-between">
                <h1 className="type-title-1 text-fg">{t('curator.navigation.myContent')}</h1>
            </div>
            <ArticleList />
        </div>
    )
}
