'use client'

import { ArticleList } from '@/features/content/components/ArticleList'

export default function AdminContentPage() {
    return (
        <div className="px-4 py-6 pb-20">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-xl font-semibold text-gray-900">Контент</h1>
            </div>
            <ArticleList basePath="/admin/content" />
        </div>
    )
}
