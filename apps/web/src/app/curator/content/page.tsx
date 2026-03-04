'use client'

import { ArticleList } from '@/features/content/components/ArticleList'

export default function CuratorContentPage() {
    return (
        <div className="px-4 py-6 pb-20">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-xl font-semibold text-gray-900">Мой контент</h1>
            </div>
            <ArticleList />
        </div>
    )
}
