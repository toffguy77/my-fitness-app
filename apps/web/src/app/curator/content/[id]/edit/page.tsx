'use client'

import { use } from 'react'
import { ArticleEditor } from '@/features/content/components/ArticleEditor'

export default function EditArticlePage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = use(params)

    return (
        <div className="px-4 py-6 pb-20">
            <h1 className="text-xl font-semibold text-gray-900 mb-4">
                Редактирование статьи
            </h1>
            <ArticleEditor articleId={id} />
        </div>
    )
}
