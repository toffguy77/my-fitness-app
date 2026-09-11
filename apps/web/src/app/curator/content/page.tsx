'use client'

import { ArticleList } from '@/features/content/components/ArticleList'

import { t } from '@/shared/i18n'
export default function CuratorContentPage() {
    return (
        <div className="px-4 py-6 pb-20">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-xl font-semibold text-gray-900">{t('curator.navigation.myContent')}</h1>
            </div>
            <ArticleList />
        </div>
    )
}
